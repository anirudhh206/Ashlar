/**
 * Fires the agent's /trigger endpoint once. Stands in for the "Friday" recurring cadence when
 * invoked from cron / Windows Task Scheduler on whatever interval you want — a real Helius
 * webhook can't produce a calendar-driven trigger (it's event-driven), so this script covers
 * that side while Helius (or any other event source) hits the same endpoint for event-driven
 * triggers. Requires `pnpm agent-server` to already be running.
 *
 * Usage: pnpm scheduled-trigger <workflowId> <invoiceId>
 */
const AGENT_URL = process.env.AGENT_TRIGGER_URL ?? 'http://localhost:8787/trigger';

async function main(): Promise<void> {
  const [workflowId, invoiceIdRaw] = process.argv.slice(2);
  if (!workflowId || !invoiceIdRaw) {
    console.error('Usage: pnpm scheduled-trigger <workflowId> <invoiceId>');
    process.exit(1);
  }

  const secret = process.env.HELIUS_WEBHOOK_SECRET;
  if (!secret) throw new Error('HELIUS_WEBHOOK_SECRET is not set — see .env.example');

  const response = await fetch(AGENT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
    body: JSON.stringify({ workflowId, invoiceId: Number(invoiceIdRaw) }),
  });
  console.log(`${response.status} ${await response.text()}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
