import { describe, expect, it } from 'vitest';
import { isOwnScoped, isPrivilegedRole, permissionsFor, roleHasPermission } from './permissions.js';

describe('permission matrix (PRD §8.1)', () => {
  it('gives OWNER and ADMIN full administration, data and integrations', () => {
    for (const role of ['OWNER', 'ADMIN'] as const) {
      expect(roleHasPermission(role, 'members.invite')).toBe(true);
      expect(roleHasPermission(role, 'audit.read')).toBe(true);
      expect(roleHasPermission(role, 'integrations.manage')).toBe(true);
      expect(roleHasPermission(role, 'imports.manage')).toBe(true);
    }
  });

  it('lets MANAGER manage leads and imports, read HubSpot and run an ingest', () => {
    expect(roleHasPermission('MANAGER', 'members.read')).toBe(true);
    expect(roleHasPermission('MANAGER', 'members.invite')).toBe(false);
    expect(roleHasPermission('MANAGER', 'audit.read')).toBe(false);
    expect(roleHasPermission('MANAGER', 'imports.manage')).toBe(true);
    expect(roleHasPermission('MANAGER', 'suppression.manage')).toBe(true);
    expect(roleHasPermission('MANAGER', 'integrations.read')).toBe(true);
    expect(roleHasPermission('MANAGER', 'integrations.sync')).toBe(true);
    expect(roleHasPermission('MANAGER', 'integrations.manage')).toBe(false);
  });

  it('limits AGENT to their own leads', () => {
    expect(roleHasPermission('AGENT', 'leads.read')).toBe(true);
    expect(roleHasPermission('AGENT', 'leads.write')).toBe(true);
    expect(isOwnScoped('AGENT', 'leads.read')).toBe(true);
    expect(roleHasPermission('AGENT', 'imports.manage')).toBe(false);
    expect(isOwnScoped('MANAGER', 'leads.read')).toBe(false);
  });

  it('makes ANALYST read-only and gives VIEWER no lead access', () => {
    expect(roleHasPermission('ANALYST', 'leads.read')).toBe(true);
    expect(roleHasPermission('ANALYST', 'leads.write')).toBe(false);
    expect(permissionsFor('VIEWER')).toEqual(['organization.read']);
  });

  it('maps campaigns, Emergency Stop, reviews and telecom identity to the matrix', () => {
    for (const role of ['OWNER', 'ADMIN', 'MANAGER'] as const) {
      expect(roleHasPermission(role, 'campaigns.manage')).toBe(true);
      expect(roleHasPermission(role, 'campaigns.emergency_stop')).toBe(true);
      expect(roleHasPermission(role, 'telecom.read')).toBe(true);
    }
    // Resolving REQUIRES_REVIEW, complaint records and telecom identity edits: OWNER and ADMIN.
    expect(roleHasPermission('ADMIN', 'compliance.review')).toBe(true);
    expect(roleHasPermission('MANAGER', 'compliance.review')).toBe(false);
    expect(roleHasPermission('MANAGER', 'telecom.manage')).toBe(false);
    // ANALYST reads campaigns; AGENT and VIEWER have no campaign access.
    expect(roleHasPermission('ANALYST', 'campaigns.read')).toBe(true);
    expect(roleHasPermission('ANALYST', 'campaigns.manage')).toBe(false);
    expect(roleHasPermission('ANALYST', 'campaigns.emergency_stop')).toBe(false);
    for (const role of ['AGENT', 'VIEWER'] as const) {
      expect(roleHasPermission(role, 'campaigns.read')).toBe(false);
      expect(roleHasPermission(role, 'campaigns.emergency_stop')).toBe(false);
    }
  });

  it('treats only OWNER and ADMIN as privileged', () => {
    expect(isPrivilegedRole('OWNER')).toBe(true);
    expect(isPrivilegedRole('ADMIN')).toBe(true);
    expect(isPrivilegedRole('MANAGER')).toBe(false);
  });
});
