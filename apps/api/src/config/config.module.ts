import { Global, Module, type DynamicModule } from '@nestjs/common';
import type { ApiEnv } from './env.js';

/** Injection token for the validated {@link ApiEnv}. */
export const API_ENV = Symbol('API_ENV');

/**
 * Exposes the configuration validated at startup to every module. Services
 * inject `API_ENV` instead of reading `process.env`, so configuration is
 * validated once and typed everywhere.
 */
@Global()
@Module({})
export class ConfigModule {
  static forRoot(env: ApiEnv): DynamicModule {
    return {
      module: ConfigModule,
      providers: [{ provide: API_ENV, useValue: env }],
      exports: [API_ENV],
    };
  }
}
