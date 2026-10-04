import { describe, expect, it } from 'vitest';
import {
  isMultiMemberRole,
  isPlatformProvisionedRole,
  permissionsFor,
  roleHasPermission,
  roleMatrix,
} from './permissions.js';

describe('authorization/permissions', () => {
  it('every account role can see its own tenant and its leads', () => {
    for (const role of ['INDV_USER', 'ORGANIZATION', 'CUSTOM_PLAN'] as const) {
      expect(roleHasPermission(role, 'organization.read')).toBe(true);
      expect(roleHasPermission(role, 'leads.read')).toBe(true);
      expect(roleHasPermission(role, 'leads.write')).toBe(true);
      expect(roleHasPermission(role, 'campaigns.manage')).toBe(true);
      expect(roleHasPermission(role, 'compliance.review')).toBe(true);
      expect(roleHasPermission(role, 'telecom.manage')).toBe(true);
    }
  });

  it('solo INDV_USER accounts cannot invite or remove members', () => {
    expect(roleHasPermission('INDV_USER', 'members.invite')).toBe(false);
    expect(roleHasPermission('INDV_USER', 'members.remove')).toBe(false);
    expect(isMultiMemberRole('INDV_USER')).toBe(false);
  });

  it('multi-member accounts hold membership management', () => {
    for (const role of ['ORGANIZATION', 'CUSTOM_PLAN'] as const) {
      expect(roleHasPermission(role, 'members.invite')).toBe(true);
      expect(roleHasPermission(role, 'members.remove')).toBe(true);
      expect(isMultiMemberRole(role)).toBe(true);
    }
  });

  it('ORGANIZATION and CUSTOM_PLAN are platform-provisioned; INDV_USER is self-serve', () => {
    expect(isPlatformProvisionedRole('ORGANIZATION')).toBe(true);
    expect(isPlatformProvisionedRole('CUSTOM_PLAN')).toBe(true);
    expect(isPlatformProvisionedRole('INDV_USER')).toBe(false);
  });

  it('the matrix lists every role once with its permission set', () => {
    const matrix = roleMatrix();
    expect(matrix.map((row) => row.role)).toEqual(['INDV_USER', 'ORGANIZATION', 'CUSTOM_PLAN']);
    for (const row of matrix) {
      expect(new Set(row.permissions)).toEqual(new Set(permissionsFor(row.role)));
    }
  });
});
