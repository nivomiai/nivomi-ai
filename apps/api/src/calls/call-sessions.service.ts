import { Inject, Injectable } from '@nestjs/common';
import {
  callSessions,
  type CallDirection,
  type ConversationOutcomePersisted,
  type Database,
} from '@nivomi/database';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { TenantPrincipal } from '../auth/principal.js';
import { encodeCursor, decodeCursor } from '../common/pagination.js';
import { DATABASE } from '../database/database.module.js';

/**
 * Persists call sessions (ADR-024, Phase 5). Writes are idempotent on (provider, providerCallId)
 * so a replayed provider status callback never duplicates a row. Reads are tenant-scoped by
 * default; the Super Admin platform surface uses a different service.
 */

export interface PersistCallSessionInput {
  readonly organizationId: string;
  readonly direction: CallDirection;
  readonly callAttemptId: string | null;
  readonly callerNumberId: string | null;
  readonly agentVersionId: string | null;
  readonly fromE164: string;
  readonly toE164: string;
  readonly provider: string;
  readonly providerCallId: string | null;
  readonly startedAt: Date;
  readonly endedAt: Date;
  readonly durationSeconds: number;
  readonly telephonyOutcome: string;
  readonly conversationOutcome: ConversationOutcomePersisted | null;
  readonly transcript: ReadonlyArray<{
    readonly role: 'agent' | 'caller';
    readonly text: string;
    readonly nodeId?: string;
    readonly atMs?: number;
  }>;
  readonly qualification: Record<string, unknown> | null;
  readonly usage: {
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly audioSeconds: number;
  };
}

export interface CallSessionsListQuery {
  readonly direction?: CallDirection;
  readonly outcome?: ConversationOutcomePersisted;
  readonly cursor?: string;
  readonly limit?: number;
}

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

@Injectable()
export class CallSessionsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async persist(input: PersistCallSessionInput): Promise<{ id: string; created: boolean }> {
    const [row] = await this.db
      .insert(callSessions)
      .values({
        organizationId: input.organizationId,
        direction: input.direction,
        callAttemptId: input.callAttemptId,
        callerNumberId: input.callerNumberId,
        agentVersionId: input.agentVersionId,
        fromE164: input.fromE164,
        toE164: input.toE164,
        provider: input.provider,
        providerCallId: input.providerCallId,
        startedAt: input.startedAt,
        endedAt: input.endedAt,
        durationSeconds: input.durationSeconds,
        telephonyOutcome: input.telephonyOutcome,
        conversationOutcome: input.conversationOutcome,
        transcript: input.transcript,
        qualification: input.qualification,
        usage: input.usage,
      })
      .onConflictDoNothing({ target: [callSessions.provider, callSessions.providerCallId] })
      .returning({ id: callSessions.id });
    if (row) return { id: row.id, created: true };
    // Replay: the existing row's id is returned.
    if (!input.providerCallId) {
      throw new Error('provider_call_id required to look up an existing session on replay');
    }
    const [existing] = await this.db
      .select({ id: callSessions.id })
      .from(callSessions)
      .where(
        and(
          eq(callSessions.provider, input.provider),
          eq(callSessions.providerCallId, input.providerCallId),
        ),
      );
    if (!existing) throw new Error('insert returned no row but no matching session exists');
    return { id: existing.id, created: false };
  }

  async list(
    principal: TenantPrincipal,
    query: CallSessionsListQuery,
  ): Promise<{
    items: Array<{
      id: string;
      direction: CallDirection;
      fromE164: string;
      toE164: string;
      startedAt: Date;
      durationSeconds: number;
      telephonyOutcome: string | null;
      conversationOutcome: ConversationOutcomePersisted | null;
    }>;
    nextCursor: string | null;
  }> {
    const limit = Math.min(Math.max(query.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
    const cursor = decodeCursor(query.cursor);
    const conditions = [eq(callSessions.organizationId, principal.membership.organizationId)];
    if (query.direction) conditions.push(eq(callSessions.direction, query.direction));
    if (query.outcome) conditions.push(eq(callSessions.conversationOutcome, query.outcome));
    if (cursor) {
      conditions.push(
        sql`(${callSessions.startedAt}, ${callSessions.id}) < (${cursor.createdAt.toISOString()}, ${cursor.id})`,
      );
    }
    const rows = await this.db
      .select({
        id: callSessions.id,
        direction: callSessions.direction,
        fromE164: callSessions.fromE164,
        toE164: callSessions.toE164,
        startedAt: callSessions.startedAt,
        durationSeconds: callSessions.durationSeconds,
        telephonyOutcome: callSessions.telephonyOutcome,
        conversationOutcome: callSessions.conversationOutcome,
      })
      .from(callSessions)
      .where(and(...conditions))
      .orderBy(desc(callSessions.startedAt), desc(callSessions.id))
      .limit(limit + 1);
    const items = rows.slice(0, limit);
    const last = items.at(-1);
    return {
      items,
      nextCursor: rows.length > limit && last ? encodeCursor(last.startedAt, last.id) : null,
    };
  }

  async get(
    principal: TenantPrincipal,
    id: string,
  ): Promise<{
    id: string;
    direction: CallDirection;
    fromE164: string;
    toE164: string;
    startedAt: Date;
    endedAt: Date | null;
    durationSeconds: number;
    telephonyOutcome: string | null;
    conversationOutcome: ConversationOutcomePersisted | null;
    transcript: ReadonlyArray<{
      role: 'agent' | 'caller';
      text: string;
      nodeId?: string;
      atMs?: number;
    }>;
    qualification: Record<string, unknown> | null;
    usage: { inputTokens: number; outputTokens: number; audioSeconds: number };
  } | null> {
    const [row] = await this.db
      .select()
      .from(callSessions)
      .where(
        and(
          eq(callSessions.id, id),
          eq(callSessions.organizationId, principal.membership.organizationId),
        ),
      );
    if (!row) return null;
    return {
      id: row.id,
      direction: row.direction,
      fromE164: row.fromE164,
      toE164: row.toE164,
      startedAt: row.startedAt,
      endedAt: row.endedAt,
      durationSeconds: row.durationSeconds,
      telephonyOutcome: row.telephonyOutcome,
      conversationOutcome: row.conversationOutcome,
      transcript: row.transcript,
      qualification: row.qualification,
      usage: row.usage,
    };
  }
}
