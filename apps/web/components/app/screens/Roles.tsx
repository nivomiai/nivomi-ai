'use client';

import { Icon } from '@/components/marketing/primitives';
import { ROLE_DESCRIPTIONS, ROLE_LABELS, type RoleAccess } from '@/lib/api/types';
import { PERMISSION_LABELS, permissionsByArea } from '@/lib/app/access';
import { useSession } from '@/lib/app/session';
import { useResource } from '@/lib/app/use-resource';
import { cx } from '@/lib/site/cx';
import { ErrorBlock, LoadingBlock, PageHeader, Panel, RoleBadge } from '../ui';

/** What every role may do in this organization, read from the matrix the API enforces. */
export function Roles() {
  const { me } = useSession();
  const matrix = useResource<{ items: RoleAccess[] }>('/organizations/current/roles');
  const myRole = me?.activeOrganization?.role;
  const roles = matrix.data?.items ?? [];

  return (
    <div className="grid gap-8">
      <PageHeader
        title="Roles & access"
        description="Every member has one role per organization. The role decides which screens they see and what they can change; the API enforces the same rules."
      />

      {myRole ? (
        <Panel title="Your role">
          <div className="flex flex-wrap items-center gap-3">
            <RoleBadge role={myRole} />
            <span className="text-[15px] text-ink-2">{ROLE_DESCRIPTIONS[myRole]}</span>
          </div>
          <p className="mt-3 text-sm text-muted">
            Only an Owner or Admin can change roles, from the Team screen. Only an Owner can make
            someone an Owner or Admin.
          </p>
        </Panel>
      ) : null}

      <Panel
        title="Permission matrix"
        description="✓ allowed · Own = only leads assigned to that member · — not allowed"
      >
        {matrix.error ? (
          <ErrorBlock message={matrix.error} onRetry={matrix.reload} />
        ) : matrix.loading && !matrix.data ? (
          <LoadingBlock label="Loading roles" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs tracking-[0.08em] text-muted uppercase">
                  <th scope="col" className="py-3 pr-4 font-bold">
                    Capability
                  </th>
                  {roles.map(({ role }) => (
                    <th
                      key={role}
                      scope="col"
                      className={cx(
                        'px-2 py-3 text-center font-bold',
                        role === myRole && 'rounded-t-[10px] bg-accent-soft text-accent',
                      )}
                    >
                      {ROLE_LABELS[role]}
                      {role === myRole ? <span className="block normal-case">(you)</span> : null}
                    </th>
                  ))}
                </tr>
              </thead>
              {permissionsByArea().map(({ area, permissions }) => (
                <tbody key={area}>
                  <tr>
                    <th
                      scope="colgroup"
                      colSpan={roles.length + 1}
                      className="pt-5 pb-2 text-xs font-bold tracking-[0.08em] text-ink uppercase"
                    >
                      {area}
                    </th>
                  </tr>
                  {permissions.map((permission) => (
                    <tr key={permission} className="border-t border-line">
                      <th scope="row" className="py-2.5 pr-4 font-medium text-ink-2">
                        {PERMISSION_LABELS[permission].label}
                      </th>
                      {roles.map((access) => (
                        <td
                          key={access.role}
                          className={cx(
                            'px-2 py-2.5 text-center',
                            access.role === myRole && 'bg-accent-soft',
                          )}
                        >
                          <AccessCell access={access} permission={permission} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

function AccessCell({
  access,
  permission,
}: {
  readonly access: RoleAccess;
  readonly permission: RoleAccess['permissions'][number];
}) {
  if (!access.permissions.includes(permission)) {
    return (
      <span className="text-muted">
        <span aria-hidden="true">—</span>
        <span className="sr-only">Not allowed</span>
      </span>
    );
  }
  return (
    <span className="inline-grid text-live">
      <Icon name="i-check" className="size-4" />
      <span className="sr-only">Allowed</span>
    </span>
  );
}
