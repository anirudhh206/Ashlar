/**
 * One-time setup: creates a real devnet Squads multisig (2-of-2: business-owner +
 * treasury-placeholder, the Phase 0 wallet roles) and funds its vault with pooled devnet SOL.
 * Persists the result to treasury/squads-treasury.json (pubkeys only, tracked in git — same
 * pattern as wallets/manifest.json).
 *
 * Usage: pnpm setup-squads-treasury
 */
import * as multisig from '@sqds/multisig';
import { Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { existsSync } from 'node:fs';
import { getConnection, loadTreasuryMembers, saveTreasuryConfig } from '../lib/squadsClient.js';
import { REPO_ROOT } from '../lib/policyEngineClient.js';
import path from 'node:path';

const VAULT_FUNDING_SOL = 0.5;
const TREASURY_CONFIG_PATH = path.join(REPO_ROOT, 'treasury', 'squads-treasury.json');

async function main(): Promise<void> {
  if (existsSync(TREASURY_CONFIG_PATH)) {
    console.log(`Treasury already set up at ${TREASURY_CONFIG_PATH} — delete it first to recreate.`);
    return;
  }

  const connection = getConnection();
  const { businessOwner, treasuryPlaceholder } = loadTreasuryMembers();

  const createKey = Keypair.generate();
  const [multisigPda] = multisig.getMultisigPda({ createKey: createKey.publicKey });

  const programConfigPda = multisig.getProgramConfigPda({})[0];
  const programConfig = await multisig.accounts.ProgramConfig.fromAccountAddress(
    connection,
    programConfigPda,
  );

  console.log('Creating 2-of-2 multisig...');
  const createSig = await multisig.rpc.multisigCreateV2({
    connection,
    createKey,
    creator: businessOwner,
    multisigPda,
    configAuthority: null,
    threshold: 2,
    members: [
      { key: businessOwner.publicKey, permissions: multisig.types.Permissions.all() },
      { key: treasuryPlaceholder.publicKey, permissions: multisig.types.Permissions.all() },
    ],
    timeLock: 0,
    rentCollector: null,
    treasury: programConfig.treasury,
  });
  await connection.confirmTransaction(createSig, 'confirmed');
  console.log(`Multisig created: ${multisigPda.toBase58()} (tx ${createSig})`);

  const [vaultPda] = multisig.getVaultPda({ multisigPda, index: 0 });

  console.log(`Funding vault ${vaultPda.toBase58()} with ${VAULT_FUNDING_SOL} SOL...`);
  const { SystemProgram, Transaction, sendAndConfirmTransaction } = await import('@solana/web3.js');
  const fundTx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: businessOwner.publicKey,
      toPubkey: vaultPda,
      lamports: Math.round(VAULT_FUNDING_SOL * LAMPORTS_PER_SOL),
    }),
  );
  const fundSig = await sendAndConfirmTransaction(connection, fundTx, [businessOwner], {
    commitment: 'confirmed',
  });
  console.log(`Vault funded (tx ${fundSig})`);

  saveTreasuryConfig({
    multisigPda: multisigPda.toBase58(),
    vaultPda: vaultPda.toBase58(),
    createKey: createKey.publicKey.toBase58(),
    threshold: 2,
    members: [businessOwner.publicKey.toBase58(), treasuryPlaceholder.publicKey.toBase58()],
  });
  console.log(`\nWrote ${TREASURY_CONFIG_PATH}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});

// keep PublicKey import used for type-only reference in case of future extension
void (0 as unknown as PublicKey);
