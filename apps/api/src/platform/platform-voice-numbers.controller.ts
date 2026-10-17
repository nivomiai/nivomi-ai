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
import { PlatformVoiceNumbersService } from './platform-voice-numbers.service.js';

const registerSchema = z.object({
  phoneE164: z.string().trim().min(8).max(16),
  organizationId: z.uuid(),
});

/**
 * Super Admin control over the Nivomi-owned ExoPhone pool. Each number is a `caller_numbers` row
 * with `series = INBOUND`. Register one, hand it to an organization, release it when the
 * contract ends. Every action is audited. See ADR-024.
 */
@RequireSuperAdmin()
@Controller({ path: 'platform/voice-numbers' })
export class PlatformVoiceNumbersController {
  constructor(private readonly voiceNumbers: PlatformVoiceNumbersService) {}

  @Get()
  async list() {
    return { items: await this.voiceNumbers.list() };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async register(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const input = validate(registerSchema, body);
    return this.voiceNumbers.register(input, principal.userId, clientContext(request));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async release(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<void> {
    await this.voiceNumbers.release(id, principal.userId, clientContext(request));
  }
}
