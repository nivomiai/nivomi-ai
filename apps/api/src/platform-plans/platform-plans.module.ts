import { Module } from '@nestjs/common';
import { PlansPublicController } from './plans-public.controller.js';
import { PlatformPlansController } from './platform-plans.controller.js';
import { PlatformPlansService } from './platform-plans.service.js';

/** Super-admin plans CRUD + public plans endpoint for the marketing site. */
@Module({
  controllers: [PlatformPlansController, PlansPublicController],
  providers: [PlatformPlansService],
  exports: [PlatformPlansService],
})
export class PlatformPlansModule {}
