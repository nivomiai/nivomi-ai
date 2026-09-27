import { Module } from '@nestjs/common';
import { ComplianceModule } from '../compliance/compliance.module.js';
import { AgentsController } from './agents.controller.js';
import { AgentsService } from './agents.service.js';
import { LLM_PROVIDER, SimulatedLLMProvider } from './llm-provider.js';

/** AI Agents, versions and test chat (PRD §8.5, ADR-022). */
@Module({
  imports: [ComplianceModule],
  controllers: [AgentsController],
  providers: [
    AgentsService,
    // LLM_PROVIDER=simulated is the only option until an LLM vendor is chosen; production refuses it.
    { provide: LLM_PROVIDER, useValue: new SimulatedLLMProvider() },
  ],
  exports: [AgentsService, LLM_PROVIDER],
})
export class AgentsModule {}
