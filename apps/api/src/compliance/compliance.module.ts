import { Module } from '@nestjs/common';
import { CallingControlsService } from './calling-controls.service.js';
import { Clock } from './clock.js';
import {
  ComplianceController,
  ConsentController,
  PlatformComplianceController,
  TelecomIdentityController,
} from './compliance.controller.js';
import { ConsentService } from './consent.service.js';
import { EligibilityService } from './eligibility.service.js';
import { PREFERENCE_REGISTRY, SimulatedPreferenceRegistry } from './preference-registry.js';
import { RuleSetRegistry } from './rule-set-registry.js';
import { TelecomIdentityService } from './telecom-identity.service.js';

const EXPORTED = [
  Clock,
  RuleSetRegistry,
  EligibilityService,
  CallingControlsService,
  TelecomIdentityService,
];

/**
 * ComplianceEngine, eligibility, consent ledgers, telecom identity and calling controls
 * (PRD §8.2, §8.7; ADR-014, ADR-021).
 */
@Module({
  controllers: [
    ComplianceController,
    TelecomIdentityController,
    ConsentController,
    PlatformComplianceController,
  ],
  providers: [
    ...EXPORTED,
    ConsentService,
    // PREFERENCE_REGISTRY=simulated is the only option until Phase 4; production refuses it.
    { provide: PREFERENCE_REGISTRY, useValue: new SimulatedPreferenceRegistry() },
  ],
  exports: [...EXPORTED, PREFERENCE_REGISTRY],
})
export class ComplianceModule {}
