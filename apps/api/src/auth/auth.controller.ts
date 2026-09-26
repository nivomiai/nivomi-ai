import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { AppError } from '../common/errors.js';
import { clientContext } from '../common/request-context.js';
import { validate } from '../common/validation.js';
import { API_ENV } from '../config/config.module.js';
import type { ApiEnv } from '../config/env.js';
import { AuthService } from './auth.service.js';
import { REFRESH_COOKIE, clearAuthCookies, readCookie, setAuthCookies } from './cookies.js';
import {
  AllowUnverified,
  CurrentPrincipal,
  Public,
  type AuthenticatedRequest,
  type Principal,
} from './principal.js';

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));
const passwordInput = z.string().min(1).max(256);
const tokenInput = z.string().min(20).max(200);

const registerSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: emailSchema,
  password: passwordInput,
});
const loginSchema = z.object({ email: emailSchema, password: passwordInput });
const tokenSchema = z.object({ token: tokenInput });
const forgotSchema = z.object({ email: emailSchema });
const resetSchema = z.object({ token: tokenInput, password: passwordInput });
const changeSchema = z.object({ currentPassword: passwordInput, newPassword: passwordInput });

const ACCEPTED = { message: 'If the details are valid, we have sent an email.' };

@Controller({ path: 'auth' })
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {}

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.ACCEPTED)
  async register(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    await this.auth.register(validate(registerSchema, body), clientContext(request));
    return ACCEPTED;
  }

  @Public()
  @Post('verify-email')
  @HttpCode(HttpStatus.NO_CONTENT)
  async verifyEmail(@Body() body: unknown, @Req() request: AuthenticatedRequest): Promise<void> {
    await this.auth.verifyEmail(validate(tokenSchema, body).token, clientContext(request));
  }

  @AllowUnverified()
  @Post('resend-verification')
  @HttpCode(HttpStatus.ACCEPTED)
  async resendVerification(@CurrentPrincipal() principal: Principal) {
    await this.auth.resendVerification(principal);
    return ACCEPTED;
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.NO_CONTENT)
  async login(
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const tokens = await this.auth.login(validate(loginSchema, body), clientContext(request));
    setAuthCookies(response, this.env, tokens);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.NO_CONTENT)
  async refresh(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const token = readCookie(request, REFRESH_COOKIE);
    if (!token) {
      clearAuthCookies(response, this.env);
      throw new AppError('AUTHENTICATION_ERROR', 'Your session has ended. Please sign in again.');
    }
    try {
      setAuthCookies(response, this.env, await this.auth.refresh(token, clientContext(request)));
    } catch (error) {
      // A conflict means another tab already rotated the token: keep its fresh cookies.
      if (!(error instanceof AppError && error.code === 'REFRESH_CONFLICT')) {
        clearAuthCookies(response, this.env);
      }
      throw error;
    }
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.logout(
      request.principal,
      readCookie(request, REFRESH_COOKIE),
      clientContext(request),
    );
    clearAuthCookies(response, this.env);
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.ACCEPTED)
  async forgotPassword(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    await this.auth.forgotPassword(validate(forgotSchema, body).email, clientContext(request));
    return ACCEPTED;
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async resetPassword(
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const input = validate(resetSchema, body);
    await this.auth.resetPassword(input.token, input.password, clientContext(request));
    clearAuthCookies(response, this.env);
  }

  @Post('change-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async changePassword(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<void> {
    await this.auth.changePassword(principal, validate(changeSchema, body), clientContext(request));
  }

  @AllowUnverified()
  @Get('sessions')
  async sessions(@CurrentPrincipal() principal: Principal) {
    return { items: await this.auth.listSessions(principal) };
  }

  @AllowUnverified()
  @Delete('sessions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeSession(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<void> {
    await this.auth.revokeOwnSession(principal, id, clientContext(request));
  }
}
