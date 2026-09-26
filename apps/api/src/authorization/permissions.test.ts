import { describe, expect, it } from 'vitest';
import { isPrivilegedRole, permissionsFor, roleHasPermission } from './permissions.js';

describe('permission matrix (PRD §8.1)', () => {
  it('gives OWNER and ADMIN full administration', () => {
    for (const role of ['OWNER', 'ADMIN'] as const) {
      expect(roleHasPermission(role, 'members.invite')).toBe(true);
      expect(roleHasPermission(role, 'audit.read')).toBe(true);
    }
  });

  it('lets MANAGER see the team but not administer it', () => {
    expect(roleHasPermission('MANAGER', 'members.read')).toBe(true);
    expect(roleHasPermission('MANAGER', 'members.invite')).toBe(false);
    expect(roleHasPermission('MANAGER', 'audit.read')).toBe(false);
  });

  it('limits AGENT, ANALYST and VIEWER to reading the organization', () => {
    for (const role of ['AGENT', 'ANALYST', 'VIEWER'] as const) {
      expect(permissionsFor(role)).toEqual(['organization.read']);
    }
  });

  it('treats only OWNER and ADMIN as privileged', () => {
    expect(isPrivilegedRole('OWNER')).toBe(true);
    expect(isPrivilegedRole('ADMIN')).toBe(true);
    expect(isPrivilegedRole('MANAGER')).toBe(false);
  });
});
