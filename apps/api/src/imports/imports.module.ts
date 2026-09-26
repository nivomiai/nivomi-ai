import { Module, type DynamicModule } from '@nestjs/common';
import type { ApiEnv } from '../config/env.js';
import { UploadsController } from '../storage/uploads.controller.js';
import { ImportsController } from './imports.controller.js';
import { ImportJobs } from './imports.jobs.js';
import { ImportsService } from './imports.service.js';

/** File import (PRD FR-14, FR-125–FR-128). */
@Module({})
export class ImportsModule {
  static forRoot(env: ApiEnv): DynamicModule {
    return {
      module: ImportsModule,
      // The upload endpoint exists only for the local storage adapter; S3 takes uploads itself.
      controllers: [
        ImportsController,
        ...(env.STORAGE_PROVIDER === 'local' ? [UploadsController] : []),
      ],
      providers: [ImportsService, ImportJobs],
    };
  }
}
