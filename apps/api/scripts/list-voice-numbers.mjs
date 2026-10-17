// One-off diagnostic: lists every registered caller_number with its organization and any
// inbound_binding, by opening the dev PGlite directly. Read-only. Run with:
//   node apps/api/scripts/list-voice-numbers.mjs
// If your `npm run dev` is running, stop it first — PGlite is single-writer.

import { createDatabase } from '@nivomi/database';
import { callerNumbers, organizations, inboundBindings } from '@nivomi/database';
import { eq } from 'drizzle-orm';
import { resolve } from 'node:path';

const dataDir = resolve(process.cwd(), 'apps/api/.data/pglite');
const handle = await createDatabase({ kind: 'pglite', dataDir });

try {
  const rows = await handle.db
    .select({
      id: callerNumbers.id,
      phoneE164: callerNumbers.phoneE164,
      series: callerNumbers.series,
      purpose: callerNumbers.purpose,
      status: callerNumbers.status,
      createdAt: callerNumbers.createdAt,
      orgId: callerNumbers.organizationId,
      orgName: organizations.name,
      orgStatus: organizations.status,
    })
    .from(callerNumbers)
    .leftJoin(organizations, eq(callerNumbers.organizationId, organizations.id))
    .orderBy(callerNumbers.createdAt);

  if (rows.length === 0) {
    console.log('No caller_numbers rows. Register an ExoPhone via Super Admin → Voice numbers.');
  } else {
    console.log(`Registered ExoPhones (${rows.length}):\n`);
    for (const r of rows) {
      const [binding] = await handle.db
        .select({ agentVersionId: inboundBindings.agentVersionId })
        .from(inboundBindings)
        .where(eq(inboundBindings.callerNumberId, r.id));
      console.log(`  ${r.phoneE164}`);
      console.log(`    series:   ${r.series} (${r.purpose})`);
      console.log(`    status:   ${r.status}`);
      console.log(`    org:      ${r.orgName ?? '(missing)'} [${r.orgStatus ?? '?'}]`);
      console.log(`    binding:  ${binding ? `agent_version=${binding.agentVersionId}` : '(none — AI uses generic prompt)'}`);
      console.log('');
    }
  }
} finally {
  await handle.close();
}
