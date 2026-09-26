import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

export interface EmailMessage {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly html: string;
  /** Used for provider tagging and suppression rules. */
  readonly category: 'verify-email' | 'password-reset' | 'invitation';
}

/** Outbound email (ADR-015). Business code depends on this interface, never on a provider SDK. */
export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage, from: string): Promise<{ providerMessageId: string }>;
}

export const EMAIL_PROVIDER = Symbol('EMAIL_PROVIDER');

/**
 * Development-only provider: writes each email as JSON into a local, git-ignored folder so links
 * can be opened without a real email account. Configuration refuses it in production.
 */
export class DevMailboxEmailProvider implements EmailProvider {
  readonly name = 'dev-mailbox';

  constructor(private readonly directory: string) {}

  async send(message: EmailMessage, from: string): Promise<{ providerMessageId: string }> {
    await mkdir(this.directory, { recursive: true });
    const id = randomUUID();
    const file = `${new Date().toISOString().replace(/[:.]/g, '-')}-${message.category}-${id}.json`;
    await writeFile(
      join(this.directory, file),
      JSON.stringify({ id, from, ...message }, null, 2),
      'utf8',
    );
    return { providerMessageId: id };
  }
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function layout(title: string, intro: string, link: string, cta: string, outro: string) {
  const text = `${title}\n\n${intro}\n\n${cta}: ${link}\n\n${outro}\n\n— Nivomi AI`;
  const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#111827">
<h2 style="color:#CC007E">${escapeHtml(title)}</h2>
<p>${escapeHtml(intro)}</p>
<p><a href="${escapeHtml(link)}" style="background:#CC007E;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;display:inline-block">${escapeHtml(cta)}</a></p>
<p style="color:#657085;font-size:13px">${escapeHtml(outro)}</p>
<p style="color:#657085;font-size:13px">If the button does not work, copy this link: ${escapeHtml(link)}</p>
</body></html>`;
  return { text, html };
}

export function verificationEmail(to: string, name: string, link: string): EmailMessage {
  return {
    to,
    category: 'verify-email',
    subject: 'Verify your email for Nivomi AI',
    ...layout(
      `Hi ${name}, verify your email`,
      'Confirm this email address to finish setting up your Nivomi AI account.',
      link,
      'Verify email',
      'This link expires in 24 hours. If you did not create an account, ignore this email.',
    ),
  };
}

export function passwordResetEmail(to: string, name: string, link: string): EmailMessage {
  return {
    to,
    category: 'password-reset',
    subject: 'Reset your Nivomi AI password',
    ...layout(
      `Hi ${name}, reset your password`,
      'We received a request to reset the password for your Nivomi AI account.',
      link,
      'Reset password',
      'This link expires in 1 hour and signs you out of your other devices. If you did not ask for this, ignore this email.',
    ),
  };
}

export function invitationEmail(
  to: string,
  organizationName: string,
  inviterName: string,
  link: string,
): EmailMessage {
  return {
    to,
    category: 'invitation',
    subject: `${inviterName} invited you to ${organizationName} on Nivomi AI`,
    ...layout(
      `Join ${organizationName} on Nivomi AI`,
      `${inviterName} invited you to join ${organizationName}. Sign in or create an account with this email address to accept.`,
      link,
      'Accept invitation',
      'This invitation expires in 7 days.',
    ),
  };
}
