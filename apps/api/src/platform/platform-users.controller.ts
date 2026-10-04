import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { z } from 'zod';
import {
  CurrentPrincipal,
  RequireSuperAdmin,
  type AuthenticatedRequest,
  type Principal,
} from '../auth/principal.js';
import { clientContext } from '../common/request-context.js';
import { validate } from '../common/validation.js';
import { PlatformUsersService } from './platform-users.service.js';

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().max(200).optional(),
  q: z.string().max(120).optional(),
  superAdminsOnly: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
});

@RequireSuperAdmin()
@Controller({ path: 'platform/users' })
export class PlatformUsersController {
  constructor(private readonly users: PlatformUsersService) {}

  @Get()
  async list(@Query() query: unknown) {
    const { q, superAdminsOnly, ...rest } = validate(listQuerySchema, query);
    return this.users.list({ ...rest, query: q, superAdminsOnly });
  }

  @Post(':id/promote')
  @HttpCode(HttpStatus.NO_CONTENT)
  async promote(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<void> {
    await this.users.promote(id, principal.userId, clientContext(request));
  }

  @Post(':id/demote')
  @HttpCode(HttpStatus.NO_CONTENT)
  async demote(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() _body: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<void> {
    await this.users.demote(id, principal.userId, clientContext(request));
  }
}
