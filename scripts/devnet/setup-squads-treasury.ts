/**
 * One-time setup: creates a real devnet Squads multisig (2-of-2: business-owner +
 * treasury-placeholder, the Phase 0 wallet roles) and funds its vault with pooled devnet SOL.
 * Persists the result to treasury/squads-treasury.json (pubkeys only, tracked in git — same
 * pattern as wallets/manifest.json).
 *
 * Usage: pnpm setup-squads-treasury
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { createTreasuryConfig } from '../lib/squadsClient.js';
import { REPO_ROOT } from '../lib/policyEngineClient.js';

const TREASURY_CONFIG_PATH = path.join(REPO_ROOT, 'treasury', 'squads-treasury.json');

async function main(): Promise<void> {
  if (existsSync(TREASURY_CONFIG_PATH)) {
    console.log(`Treasury already set up at ${TREASURY_CONFIG_PATH} — delete it first to recreate.`);
    return;
  }

  console.log('Creating 2-of-2 multisig and funding its vault...');
  const config = await createTreasuryConfig();
  console.log(`Multisig:  ${config.multisigPda}`);
  console.log(`Vault:     ${config.vaultPda}`);
  console.log(`Members:   ${config.members.join(', ')}`);
  console.log(`\nWrote ${TREASURY_CONFIG_PATH}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
