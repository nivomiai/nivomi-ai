import { Controller, HttpCode, HttpStatus, Inject, Param, Put, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../auth/principal.js';
import { AppError } from '../common/errors.js';
import { SignedTokens } from '../security/signed-tokens.js';
import { LocalStorageProvider, STORAGE_PROVIDER, type StorageProvider } from './storage.js';

interface UploadClaims extends Record<string, unknown> {
  readonly key: string;
  readonly maxBytes: number;
  readonly contentType: string;
}

/**
 * Receives uploads for the local storage adapter, mirroring an S3 presigned PUT: the signed,
 * expiring token in the URL is the authorization, and it names the only key it may write.
 * Registered only when STORAGE_PROVIDER=local.
 */
@Controller({ path: 'uploads' })
export class UploadsController {
  constructor(
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    private readonly tokens: SignedTokens,
  ) {}

  @Public()
  @Put(':token')
  @HttpCode(HttpStatus.NO_CONTENT)
  async upload(@Param('token') token: string, @Req() request: Request): Promise<void> {
    const claims = this.tokens.verify<UploadClaims>('upload', token);
    if (!claims || !(this.storage instanceof LocalStorageProvider)) {
      throw new AppError('AUTHORIZATION_ERROR', 'This upload link is invalid or has expired.');
    }
    const body: unknown = request.body;
    if (!Buffer.isBuffer(body) || body.length === 0) {
      throw new AppError('VALIDATION_ERROR', 'The file is empty.');
    }
    if (body.length > claims.maxBytes) {
      throw new AppError('PAYLOAD_TOO_LARGE', 'The file is larger than allowed.');
    }
    await this.storage.write(claims.key, body);
  }
}
