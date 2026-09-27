import {
  SetMetadata,
  createParamDecorator,
  type CustomDecorator,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';
import { AppError } from '../common/errors.js';
import type { OrganizationRole, Permission } from '../authorization/permissions.js';

/** The authenticated caller, resolved by {@link AuthGuard} from the session — never from input. */
export interface Principal {
  readonly userId: string;
  readonly sessionId: string;
  readonly email: string;
  readonly name: string;
  readonly emailVerified: boolean;
  readonly isSuperAdmin: boolean;
  /** Membership in the session's active organization, verified on this request. */
  readonly membership: { readonly organizationId: string; readonly role: OrganizationRole } | null;
}

/** Principal with a verified active-organization membership (tenant context). */
export interface TenantPrincipal extends Principal {
  readonly membership: { readonly organizationId: string; readonly role: OrganizationRole };
}

export interface AuthenticatedRequest extends Request {
  principal?: Principal;
}

export const IS_PUBLIC = 'nivomi:isPublic';
export const ALLOW_UNVERIFIED = 'nivomi:allowUnverified';
export const REQUIRED_PERMISSION = 'nivomi:requiredPermission';
export const REQUIRE_SUPER_ADMIN = 'nivomi:requireSuperAdmin';

/** No authentication required. */
export const Public = (): CustomDecorator => SetMetadata(IS_PUBLIC, true);
/** Signed-in users who have not verified their email may call this. */
export const AllowUnverified = (): CustomDecorator => SetMetadata(ALLOW_UNVERIFIED, true);
/** Requires an active organization membership whose role grants `permission`. */
export const RequirePermission = (permission: Permission): CustomDecorator =>
  SetMetadata(REQUIRED_PERMISSION, permission);

/**
 * Platform Super Admin only (granted in Nivomi's database, never through a tenant role). Every
 * such action must be audited by the handler.
 */
export const RequireSuperAdmin = (): CustomDecorator => SetMetadata(REQUIRE_SUPER_ADMIN, true);

export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, context: ExecutionContext): Principal => {
    const principal = context.switchToHttp().getRequest<AuthenticatedRequest>().principal;
    if (!principal) {
      throw new AppError('AUTHENTICATION_ERROR', 'Please sign in.');
    }
    return principal;
  },
);

/** Principal with verified tenant context; use on endpoints that declare a permission. */
export const CurrentTenant = createParamDecorator(
  (_data: unknown, context: ExecutionContext): TenantPrincipal => {
    const principal = context.switchToHttp().getRequest<AuthenticatedRequest>().principal;
    if (!principal?.membership) {
      throw new AppError('ORGANIZATION_REQUIRED', 'Select or create an organization first.');
    }
    return principal as TenantPrincipal;
  },
);
