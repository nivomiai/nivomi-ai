import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Put,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { consentBases } from '@nivomi/database';
import type { Response } from 'express';
import { z } from 'zod';
import {
  CurrentTenant,
  Public,
  RequirePermission,
  type AuthenticatedRequest,
  type TenantPrincipal,
} from '../auth/principal.js';
import { clientContext } from '../common/request-context.js';
import { validate } from '../common/validation.js';
import { API_ENV } from '../config/config.module.js';
import type { ApiEnv } from '../config/env.js';
import { CrmService } from './crm.service.js';

const authorizeSchema = z.object({ confirmAccountChange: z.boolean().default(false) });
const callbackSchema = z.object({
  code: z.string().max(2000).optional(),
  state: z.string().max(2000).optional(),
  error: z.string().max(200).optional(),
});
const settingsSchema = z.object({
  consentProperty: z
    .string()
    .trim()
    .regex(/^[a-z0-9_]{1,100}$/, 'must be a HubSpot internal property name')
    .nullable(),
  consentValueMap: z
    .record(z.string().max(200), z.enum([...consentBases, 'DND']))
    .refine((m) => Object.keys(m).length <= 50, 'at most 50 values')
    .default({}),
});
const syncSchema = z.object({ full: z.boolean().default(false) });

@Controller({ path: 'integrations/crm' })
export class CrmController {
  constructor(
    private readonly crm: CrmService,
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {}

  @RequirePermission('integrations.read')
  @Get()
  status(@CurrentTenant() tenant: TenantPrincipal) {
    return this.crm.status(tenant);
  }

  @RequirePermission('integrations.manage')
  @Post('hubspot/authorize')
  @HttpCode(HttpStatus.OK)
  authorize(@CurrentTenant() tenant: TenantPrincipal, @Body() body: unknown) {
    return this.crm.authorize(tenant, validate(authorizeSchema, body ?? {}));
  }

  /**
   * HubSpot redirects the browser here. The session cookie arrives with this top-level GET
   * (SameSite=Lax); the Member and their permission are re-checked against the signed state.
   */
  @Public()
  @Get('hubspot/callback')
  async callback(
    @Query() query: unknown,
    @Req() request: AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    const parsed = callbackSchema.safeParse(query);
    const principal = request.principal;
    const outcome = !principal
      ? 'signed_out'
      : parsed.success
        ? await this.crm.callback(principal, parsed.data, clientContext(request))
        : 'invalid_state';
    response.redirect(
      HttpStatus.SEE_OTHER,
      `${this.env.APP_WEB_URL}/app/data-sources?crm=${encodeURIComponent(outcome)}`,
    );
  }

  @RequirePermission('integrations.manage')
  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  async disconnect(
    @CurrentTenant() tenant: TenantPrincipal,
    @Req() request: AuthenticatedRequest,
  ): Promise<void> {
    await this.crm.disconnect(tenant, clientContext(request));
  }

  @RequirePermission('integrations.manage')
  @Put('settings')
  @HttpCode(HttpStatus.NO_CONTENT)
  async settings(
    @CurrentTenant() tenant: TenantPrincipal,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<void> {
    await this.crm.updateSettings(tenant, validate(settingsSchema, body), clientContext(request));
  }

  @RequirePermission('integrations.sync')
  @Post('sync')
  sync(
    @CurrentTenant() tenant: TenantPrincipal,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.crm.requestSync(tenant, validate(syncSchema, body ?? {}), clientContext(request));
  }
}
