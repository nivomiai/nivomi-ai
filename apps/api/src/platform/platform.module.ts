import { Global, Module, type DynamicModule } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { API_ENV } from '../config/config.module.js';
import type { ApiEnv } from '../config/env.js';
import { DevMailboxEmailProvider, EMAIL_PROVIDER } from '../email/email.js';
import { JobHandlerRegistry, JobQueue, JobWorker } from '../jobs/jobs.js';
import { CredentialsCipher } from '../security/credentials-cipher.js';
import { MemoryRateLimitStore, RATE_LIMIT_STORE, RateLimiter } from '../security/rate-limit.js';
import { SignedTokens } from '../security/signed-tokens.js';
import { LocalStorageProvider, STORAGE_PROVIDER } from '../storage/storage.js';

const SHARED = [
  AuditService,
  JobHandlerRegistry,
  JobQueue,
  JobWorker,
  RateLimiter,
  SignedTokens,
  CredentialsCipher,
];

/**
 * Cross-cutting infrastructure every domain module uses: audit, jobs, rate limiting, signed
 * tokens, credential encryption and the email and storage providers.
 */
@Global()
@Module({})
export class PlatformModule {
  static forRoot(env: ApiEnv): DynamicModule {
    return {
      module: PlatformModule,
      providers: [
        ...SHARED,
        // Single-instance store; swapped for Redis before running more than one task (ADR-019).
        { provide: RATE_LIMIT_STORE, useValue: new MemoryRateLimitStore() },
        {
          provide: EMAIL_PROVIDER,
          useValue: new DevMailboxEmailProvider(env.EMAIL_DEV_MAILBOX_DIR),
        },
        {
          provide: STORAGE_PROVIDER,
          inject: [API_ENV, SignedTokens],
          useFactory: (config: ApiEnv, tokens: SignedTokens) =>
            new LocalStorageProvider(config.STORAGE_LOCAL_DIR, (key, request) => {
              const token = tokens.sign(
                'upload',
                { key, maxBytes: request.maxBytes, contentType: request.contentType },
                request.expiresInSeconds,
              );
              return `${config.APP_WEB_URL}/api/v1/uploads/${token}`;
            }),
        },
      ],
      exports: [...SHARED, RATE_LIMIT_STORE, EMAIL_PROVIDER, STORAGE_PROVIDER],
    };
  }
}
