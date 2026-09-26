import {
  Global,
  Inject,
  Injectable,
  Module,
  type DynamicModule,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { createDatabase, type DatabaseHandle } from '@nivomi/database';
import { mkdirSync } from 'node:fs';
import { API_ENV } from '../config/config.module.js';
import { PGLITE_IN_MEMORY, type ApiEnv } from '../config/env.js';

/** Injection token for the Drizzle {@link Database} handle. */
export const DATABASE = Symbol('DATABASE');
/** Injection token for the {@link DatabaseHandle} (migrate, ping, close). */
export const DATABASE_HANDLE = Symbol('DATABASE_HANDLE');

export async function openDatabase(env: ApiEnv): Promise<DatabaseHandle> {
  let handle: DatabaseHandle;
  if (env.DATABASE_URL) {
    handle = await createDatabase({
      kind: 'postgres',
      url: env.DATABASE_URL,
      poolSize: env.DATABASE_POOL_SIZE,
    });
  } else if (env.DATABASE_PGLITE_DIR === PGLITE_IN_MEMORY) {
    handle = await createDatabase({ kind: 'pglite' });
  } else {
    mkdirSync(env.DATABASE_PGLITE_DIR, { recursive: true });
    handle = await createDatabase({ kind: 'pglite', dataDir: env.DATABASE_PGLITE_DIR });
  }
  if (env.DATABASE_AUTO_MIGRATE) {
    await handle.migrate();
  }
  return handle;
}

@Injectable()
class DatabaseLifecycle implements OnApplicationShutdown {
  constructor(@Inject(DATABASE_HANDLE) private readonly handle: DatabaseHandle) {}

  async onApplicationShutdown(): Promise<void> {
    await this.handle.close();
  }
}

@Global()
@Module({})
export class DatabaseModule {
  static forRoot(): DynamicModule {
    return {
      module: DatabaseModule,
      providers: [
        { provide: DATABASE_HANDLE, inject: [API_ENV], useFactory: openDatabase },
        {
          provide: DATABASE,
          inject: [DATABASE_HANDLE],
          useFactory: (handle: DatabaseHandle) => handle.db,
        },
        DatabaseLifecycle,
      ],
      exports: [DATABASE, DATABASE_HANDLE],
    };
  }
}
