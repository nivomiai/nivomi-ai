import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service.js';
import { emailSchema } from '../auth/auth.controller.js';
import {
  CurrentPrincipal,
  CurrentTenant,
  RequirePermission,
  type AuthenticatedRequest,
  type Principal,
  type TenantPrincipal,
} from '../auth/principal.js';
import { permissionsFor, roleMatrix } from '../authorization/permissions.js';
import { clientContext } from '../common/request-context.js';
import { validate } from '../common/validation.js';
import { OrganizationsService } from './organizations.service.js';

const createSchema = z.object({ name: z.string().trim().min(2).max(100) });
const switchSchema = z.object({ organizationId: z.uuid() });
const inviteSchema = z.object({ email: emailSchema });
const acceptSchema = z.object({ token: z.string().min(20).max(200) });
const auditQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().max(200).optional(),
});

/** The caller's identity and memberships — the web app's bootstrap call. */
@Controller({ path: 'me' })
export class MeController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Get()
  async me(@CurrentPrincipal() principal: Principal) {
    return {
      user: {
        id: principal.userId,
        email: principal.email,
        name: principal.name,
        emailVerified: principal.emailVerified,
        isSuperAdmin: principal.isSuperAdmin,
      },
      activeOrganization: principal.membership
        ? {
            id: principal.membership.organizationId,
            role: principal.membership.role,
            permissions: permissionsFor(principal.membership.role),
          }
        : null,
      organizations: await this.organizations.listForUser(principal.userId),
    };
  }

  @Put('active-organization')
  @HttpCode(HttpStatus.NO_CONTENT)
  async switchOrganization(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<void> {
    const { organizationId } = validate(switchSchema, body);
    await this.organizations.switchActive(principal, organizationId, clientContext(request));
  }
}

/**
 * Tenant endpoints act on the session's active organization (`current`); the tenant is never
 * taken from a client-supplied ID.
 */
@Controller({ path: 'organizations' })
export class OrganizationsController {
  constructor(
    private readonly organizations: OrganizationsService,
    private readonly audit: AuditService,
  ) {}

  @Post()
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const { name } = validate(createSchema, body);
    return this.organizations.create(principal, name, clientContext(request));
  }

  @RequirePermission('organization.read')
  @Get('current')
  current(@CurrentTenant() tenant: TenantPrincipal) {
    return this.organizations.getActive(tenant);
  }

  /** Role → permission matrix (not tenant data): every member may see what each role can do. */
  @RequirePermission('organization.read')
  @Get('current/roles')
  roles() {
    return { items: roleMatrix() };
  }

  @RequirePermission('members.read')
  @Get('current/members')
  async members(@CurrentTenant() tenant: TenantPrincipal) {
    return { items: await this.organizations.listMembers(tenant) };
  }

  @RequirePermission('members.remove')
  @Delete('current/members/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeMember(
    @CurrentTenant() tenant: TenantPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<void> {
    await this.organizations.removeMember(tenant, id, clientContext(request));
  }

  /** Any member may leave; the last owner cannot. */
  @RequirePermission('organization.read')
  @Post('current/leave')
  @HttpCode(HttpStatus.NO_CONTENT)
  async leave(
    @CurrentTenant() tenant: TenantPrincipal,
    @Req() request: AuthenticatedRequest,
  ): Promise<void> {
    await this.organizations.leave(tenant, clientContext(request));
  }

  @RequirePermission('members.invite')
  @Get('current/invitations')
  async invitations(@CurrentTenant() tenant: TenantPrincipal) {
    return { items: await this.organizations.listInvitations(tenant) };
  }

  @RequirePermission('members.invite')
  @Post('current/invitations')
  async invite(
    @CurrentTenant() tenant: TenantPrincipal,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.organizations.invite(tenant, validate(inviteSchema, body), clientContext(request));
  }

  @RequirePermission('members.invite')
  @Delete('current/invitations/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeInvitation(
    @CurrentTenant() tenant: TenantPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<void> {
    await this.organizations.revokeInvitation(tenant, id, clientContext(request));
  }

  /** Redeems an emailed invitation for the signed-in (verified) user. */
  @Post('invitations/accept')
  accept(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const { token } = validate(acceptSchema, body);
    return this.organizations.acceptInvitation(principal, token, clientContext(request));
  }

  @RequirePermission('audit.read')
  @Get('current/audit-logs')
  auditLogs(@CurrentTenant() tenant: TenantPrincipal, @Query() query: unknown) {
    const { limit, cursor } = validate(auditQuerySchema, query);
    return this.audit.listForOrganization(tenant.membership.organizationId, { limit, cursor });
  }
}
