import { describe, expect, it } from 'vitest';
import { ACCESS_AREAS, PERMISSION_LABELS, permissionsByArea } from './access';

describe('permissionsByArea', () => {
  it('lists every permission exactly once, in area order', () => {
    const groups = permissionsByArea();
    expect(groups.map((group) => group.area)).toEqual([...ACCESS_AREAS]);
    const listed = groups.flatMap((group) => group.permissions);
    expect([...listed].sort()).toEqual(Object.keys(PERMISSION_LABELS).sort());
    expect(new Set(listed).size).toBe(listed.length);
    for (const group of groups) expect(group.permissions.length).toBeGreaterThan(0);
  });
});
