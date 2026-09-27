import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { complianceRuleSets, type Database } from '@nivomi/database';
import { and, eq } from 'drizzle-orm';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { DATABASE } from '../database/database.module.js';
import { coversNumber } from './compliance-engine.js';
import { INDIA_RULE_SET_V1 } from './rule-sets/india-v1.js';
import {
  ruleSetChecksum,
  ruleSetDefinitionSchema,
  ruleSetRulesSchema,
  type LoadedRuleSet,
  type RuleSetDefinition,
} from './rule-set.schema.js';

/** Built-in versions, oldest first. A new version is appended; old ones are never edited. */
export const BUILT_IN_RULE_SETS: readonly RuleSetDefinition[] = [INDIA_RULE_SET_V1];

/**
 * Loads Rule Sets from `compliance_rule_sets` (ADR-021). On startup it inserts built-in versions
 * that are missing and refuses to start if a stored version differs from its definition.
 * Versions are immutable, so they are cached in memory.
 */
@Injectable()
export class RuleSetRegistry implements OnModuleInit {
  private cache: LoadedRuleSet[] | null = null;

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @InjectPinoLogger(RuleSetRegistry.name) private readonly logger: PinoLogger,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.syncBuiltIns();
  }

  async syncBuiltIns(): Promise<void> {
    for (const definition of BUILT_IN_RULE_SETS) {
      const valid = ruleSetDefinitionSchema.parse(definition);
      const checksum = ruleSetChecksum(valid);
      const [stored] = await this.db
        .select({ checksum: complianceRuleSets.checksum })
        .from(complianceRuleSets)
        .where(
          and(
            eq(complianceRuleSets.jurisdiction, valid.jurisdiction),
            eq(complianceRuleSets.version, valid.version),
          ),
        )
        .limit(1);
      if (stored) {
        if (stored.checksum !== checksum) {
          throw new Error(
            `Rule set ${valid.jurisdiction} v${valid.version} differs from the stored version. ` +
              'Published rule sets are immutable: add a new version instead (ADR-021).',
          );
        }
        continue;
      }
      await this.db
        .insert(complianceRuleSets)
        .values({
          jurisdiction: valid.jurisdiction,
          version: valid.version,
          status: valid.status,
          effectiveFrom: new Date(valid.effectiveFrom),
          effectiveTo: valid.effectiveTo ? new Date(valid.effectiveTo) : null,
          rules: valid.rules,
          sources: valid.sources,
          reviewNote: valid.reviewNote,
          checksum,
        })
        .onConflictDoNothing();
      this.logger.info(
        { jurisdiction: valid.jurisdiction, version: valid.version, status: valid.status },
        'Rule set installed',
      );
    }
    this.cache = null;
  }

  private async all(): Promise<LoadedRuleSet[]> {
    if (this.cache) return this.cache;
    const rows = await this.db.select().from(complianceRuleSets);
    this.cache = rows.map((row) => ({
      id: row.id,
      jurisdiction: row.jurisdiction,
      version: row.version,
      status: row.status,
      effectiveFrom: row.effectiveFrom,
      effectiveTo: row.effectiveTo,
      reviewNote: row.reviewNote,
      sources: row.sources,
      // Stored data is validated again: a malformed row fails closed instead of evaluating.
      rules: ruleSetRulesSchema.parse(row.rules),
    }));
    return this.cache;
  }

  /** The version in force for `jurisdiction` at `at`, or null (fail closed). */
  async active(jurisdiction: string, at: Date): Promise<LoadedRuleSet | null> {
    const candidates = (await this.all()).filter(
      (r) =>
        r.jurisdiction === jurisdiction &&
        r.status !== 'RETIRED' &&
        r.effectiveFrom <= at &&
        (r.effectiveTo === null || r.effectiveTo > at),
    );
    return candidates.sort((a, b) => b.version - a.version)[0] ?? null;
  }

  /** The Rule Set governing a recipient's number, resolved from its country code. */
  async forPhone(phoneE164: string, at: Date): Promise<LoadedRuleSet | null> {
    const jurisdictions = new Set((await this.all()).map((r) => r.jurisdiction));
    for (const jurisdiction of jurisdictions) {
      const ruleSet = await this.active(jurisdiction, at);
      if (ruleSet && coversNumber(ruleSet.rules, phoneE164)) return ruleSet;
    }
    return null;
  }

  async list(): Promise<LoadedRuleSet[]> {
    return [...(await this.all())].sort(
      (a, b) => a.jurisdiction.localeCompare(b.jurisdiction) || b.version - a.version,
    );
  }
}
