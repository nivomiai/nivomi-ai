import { Controller, Get, Header } from '@nestjs/common';
import { Public } from '../auth/principal.js';
import { PlatformPlansService } from './platform-plans.service.js';

/** Marketing-site reader. Unauthenticated; projects only the fields safe to publish. */
@Controller({ path: 'plans' })
export class PlansPublicController {
  constructor(private readonly svc: PlatformPlansService) {}

  @Public()
  @Get('public')
  @Header('Cache-Control', 'public, max-age=60, s-maxage=60')
  async list() {
    const items = await this.svc.listPublic();
    return { items };
  }
}
