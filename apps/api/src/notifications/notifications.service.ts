import { Inject, Injectable } from '@nestjs/common';
import {
  notificationDefinitions,
  notificationDispatches,
  type Database,
  type NotificationChannel,
} from '@nivomi/database';
import { and, eq } from 'drizzle-orm';
import { DATABASE } from '../database/database.module.js';

/**
 * Notifications pipe (ADR-028 §1). `send` renders a template, writes a dispatch row (queued) and
 * returns. A worker picks dispatches up to call the email/SMS adapter. Idempotent per
 * (organization, kind, channel, recipient, source_entity_id).
 */

export interface SendRequest {
  readonly organizationId: string | null;
  readonly kind: string;
  readonly channel: NotificationChannel;
  readonly recipient: string;
  readonly variables?: Record<string, string | number>;
  readonly sourceEntityId?: string | undefined;
}

export interface DefinitionInput {
  readonly kind: string;
  readonly channel: NotificationChannel;
  readonly audience: 'OWNERS' | 'ADMINS' | 'ALL_MEMBERS' | 'SPECIFIC_USER';
  readonly subjectTemplate: string;
  readonly bodyTemplate: string;
  readonly localeDefault?: string;
}

const render = (template: string, vars: Record<string, string | number>) =>
  template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) =>
    key in vars ? String(vars[key]) : '',
  );

@Injectable()
export class NotificationsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /** Upserts a template definition; platform-owned (Super Admin edits via API). */
  async upsertDefinition(input: DefinitionInput): Promise<void> {
    await this.db
      .insert(notificationDefinitions)
      .values({
        kind: input.kind,
        channel: input.channel,
        subjectTemplate: input.subjectTemplate,
        bodyTemplate: input.bodyTemplate,
        audience: input.audience,
        localeDefault: input.localeDefault ?? 'en',
      })
      .onConflictDoUpdate({
        target: [notificationDefinitions.kind, notificationDefinitions.channel],
        set: {
          subjectTemplate: input.subjectTemplate,
          bodyTemplate: input.bodyTemplate,
          audience: input.audience,
        },
      });
  }

  async send(request: SendRequest): Promise<{ dispatched: boolean; dispatchId: string | null }> {
    const [def] = await this.db
      .select({
        subjectTemplate: notificationDefinitions.subjectTemplate,
        bodyTemplate: notificationDefinitions.bodyTemplate,
      })
      .from(notificationDefinitions)
      .where(
        and(
          eq(notificationDefinitions.kind, request.kind),
          eq(notificationDefinitions.channel, request.channel),
        ),
      )
      .limit(1);
    if (!def) throw new Error(`no notification template for ${request.kind}/${request.channel}`);
    const vars = request.variables ?? {};
    const [row] = await this.db
      .insert(notificationDispatches)
      .values({
        organizationId: request.organizationId,
        kind: request.kind,
        channel: request.channel,
        recipient: request.recipient,
        subject: render(def.subjectTemplate, vars),
        body: render(def.bodyTemplate, vars),
        status: 'QUEUED',
        sourceEntityId: request.sourceEntityId ?? null,
      })
      .onConflictDoNothing()
      .returning({ id: notificationDispatches.id });
    return row ? { dispatched: true, dispatchId: row.id } : { dispatched: false, dispatchId: null };
  }
}
