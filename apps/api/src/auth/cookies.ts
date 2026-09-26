import type { CookieOptions, Request, Response } from 'express';
import type { ApiEnv } from '../config/env.js';
import { ACCESS_TOKEN_TTL_SECONDS } from './tokens.js';

export const ACCESS_COOKIE = 'nv_access';
export const REFRESH_COOKIE = 'nv_refresh';
/** Non-secret hint the web app uses to route between site and app. Never trusted by the API. */
export const SIGNED_IN_COOKIE = 'nv_auth';
export const REFRESH_COOKIE_PATH = '/api/v1/auth';
export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

function base(env: ApiEnv): CookieOptions {
  return {
    secure: env.COOKIE_SECURE,
    ...(env.AUTH_COOKIE_DOMAIN ? { domain: env.AUTH_COOKIE_DOMAIN } : {}),
  };
}

export function setAuthCookies(
  response: Response,
  env: ApiEnv,
  tokens: { accessToken: string; refreshToken: string },
): void {
  response.cookie(ACCESS_COOKIE, tokens.accessToken, {
    ...base(env),
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: ACCESS_TOKEN_TTL_SECONDS * 1000,
  });
  response.cookie(REFRESH_COOKIE, tokens.refreshToken, {
    ...base(env),
    httpOnly: true,
    sameSite: 'strict',
    path: REFRESH_COOKIE_PATH,
    maxAge: SESSION_TTL_SECONDS * 1000,
  });
  response.cookie(SIGNED_IN_COOKIE, '1', {
    ...base(env),
    httpOnly: false,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS * 1000,
  });
}

export function clearAuthCookies(response: Response, env: ApiEnv): void {
  response.clearCookie(ACCESS_COOKIE, { ...base(env), path: '/' });
  response.clearCookie(REFRESH_COOKIE, { ...base(env), path: REFRESH_COOKIE_PATH });
  response.clearCookie(SIGNED_IN_COOKIE, { ...base(env), path: '/' });
}

export function readCookie(request: Request, name: string): string | undefined {
  const cookies = request.cookies as Record<string, unknown> | undefined;
  const value = cookies?.[name];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
