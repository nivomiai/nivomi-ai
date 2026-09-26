/**
 * `CRMProvider` (ADR-012): business code depends on this interface; vendor specifics live in
 * adapters. This phase covers connecting and reading (CRM → Nivomi ingestion, PRD FR-19,
 * FR-84–FR-86, FR-137). Writes back to the CRM (FR-88–FR-93) extend it in the CRM phase.
 */

export interface CrmTokens {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresAt: Date;
  readonly scopes: string[];
  /** The CRM account (HubSpot portal / hub ID). */
  readonly accountId: string;
}

export interface CrmPage<T> {
  readonly items: T[];
  /** Cursor for the next page; null when this was the last page. */
  readonly next: string | null;
}

export interface CrmContact {
  readonly id: string;
  readonly properties: Readonly<Record<string, string | null>>;
  readonly companyIds: string[];
  readonly updatedAt: Date | null;
}

export interface CrmCompany {
  readonly id: string;
  readonly name: string | null;
  readonly domain: string | null;
}

export interface CrmLead {
  readonly id: string;
  readonly name: string | null;
  readonly type: string | null;
  readonly label: string | null;
  readonly contactIds: string[];
}

/** The CRM rejected our credentials: the Organization must reconnect (TOKEN_INVALID). */
export class CrmAuthError extends Error {
  override readonly name = 'CrmAuthError';
}

/** Rate limited or temporarily unavailable; safe to retry later. */
export class CrmUnavailableError extends Error {
  override readonly name = 'CrmUnavailableError';
}

export interface CRMProvider {
  readonly provider: string;
  /** False when the app credentials are not configured on this deployment. */
  readonly configured: boolean;
  readonly requiredScopes: readonly string[];
  readonly optionalScopes: readonly string[];
  authorizeUrl(state: string, redirectUri: string): string;
  exchangeCode(code: string, redirectUri: string): Promise<CrmTokens>;
  refresh(refreshToken: string): Promise<CrmTokens>;
  /** Best effort: revoking must never block a disconnect. */
  revoke(refreshToken: string): Promise<void>;
  /** Only the fields Nivomi needs (FR-19: never copy the whole CRM). */
  listContacts(
    accessToken: string,
    properties: string[],
    after: string | null,
  ): Promise<CrmPage<CrmContact>>;
  contactsModifiedSince(
    accessToken: string,
    properties: string[],
    since: Date,
    after: string | null,
  ): Promise<CrmPage<CrmContact>>;
  getCompanies(accessToken: string, ids: string[]): Promise<CrmCompany[]>;
  listLeads(accessToken: string, after: string | null): Promise<CrmPage<CrmLead>>;
}

export const CRM_PROVIDER = Symbol('CRM_PROVIDER');
