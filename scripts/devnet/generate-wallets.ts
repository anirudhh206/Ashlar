/**
 * Generates the four devnet keypairs used across Ashlar's Phase 0+ scripts
 * and tests, requests a devnet airdrop for each, and writes wallets/manifest.json
 * (pubkeys and roles only — the keypair files themselves are gitignored).
 *
 * Devnet faucets are commonly rate-limited; airdrop failures are reported,
 * not treated as fatal. Fund manually with `solana airdrop <amount> <pubkey>
 * --url devnet` if needed.
 *
 * Usage: pnpm generate-wallets [--force]
 */
import { Connection, Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { mkdirSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const WALLETS_DIR = path.join(REPO_ROOT, 'wallets');
const MANIFEST_PATH = path.join(WALLETS_DIR, 'manifest.json');
// Deliberately always the public endpoint, not HELIUS_RPC_URL like scripts/lib/constants.ts's
// DEVNET_URL — paid RPC providers (including Helius) generally don't implement requestAirdrop,
// since that's specifically the public faucet's job.
const DEVNET_URL = 'https://api.devnet.solana.com';
const AIRDROP_SOL = 2;

interface RoleDefinition {
  role: string;
  file: string;
  note?: string;
}

const ROLES: RoleDefinition[] = [
  { role: 'business-owner', file: 'business-owner.json' },
  {
    role: 'treasury-placeholder',
    file: 'treasury-placeholder.json',
    note: 'stand-in until Squads multisig (Phase 4)',
  },
  { role: 'test-vendor', file: 'test-vendor.json' },
  { role: 'adversarial', file: 'adversarial.json' },
  {
    role: 'tax-reserve-placeholder',
    file: 'tax-reserve-placeholder.json',
    note: 'stand-in destination for the tax-reserve leg of split settlement (Phase 5)',
  },
  {
    role: 'yield-pool-placeholder',
    file: 'yield-pool-placeholder.json',
    note: 'stand-in destination for the yield-pool leg of split settlement, not a real lending-protocol deposit (Phase 5)',
  },
  {
    role: 'agent-identity',
    file: 'agent-identity.json',
    note: 'registered on-chain via MPL Agent Registry to verify the agent has a real identity (Phase 5)',
  },
];

interface ManifestEntry {
  role: string;
  pubkey: string;
  file: string;
  createdAt: string;
  note?: string;
}

async function main(): Promise<void> {
  const force = process.argv.includes('--force');
  mkdirSync(WALLETS_DIR, { recursive: true });

  const connection = new Connection(DEVNET_URL, 'confirmed');
  const manifestEntries: ManifestEntry[] = [];

  for (const { role, file, note } of ROLES) {
    const keypairPath = path.join(WALLETS_DIR, file);
    let keypair: Keypair;
    let isNew = false;

    if (existsSync(keypairPath) && !force) {
      const secret = JSON.parse(readFileSync(keypairPath, 'utf8')) as number[];
      keypair = Keypair.fromSecretKey(Uint8Array.from(secret));
      console.log(`[skip] ${role}: existing keypair at ${file} (use --force to regenerate)`);
    } else {
      keypair = Keypair.generate();
      writeFileSync(keypairPath, JSON.stringify(Array.from(keypair.secretKey)));
      isNew = true;
      console.log(`[new]  ${role}: ${keypair.publicKey.toBase58()}`);
    }

    if (isNew || force) {
      try {
        const signature = await connection.requestAirdrop(
          keypair.publicKey,
          AIRDROP_SOL * LAMPORTS_PER_SOL,
        );
        await connection.confirmTransaction(signature, 'confirmed');
        console.log(`       airdropped ${AIRDROP_SOL} SOL (${signature})`);
      } catch (err) {
        console.warn(
          `       airdrop failed for ${role} (devnet faucet likely rate-limited) — fund manually with:\n` +
            `       solana airdrop ${AIRDROP_SOL} ${keypair.publicKey.toBase58()} --url devnet`,
        );
        console.warn(`       (${(err as Error).message})`);
      }
    }

    manifestEntries.push({
      role,
      pubkey: keypair.publicKey.toBase58(),
      file: `wallets/${file}`,
      createdAt: new Date().toISOString(),
      ...(note ? { note } : {}),
    });
  }

  writeFileSync(
    MANIFEST_PATH,
    JSON.stringify({ network: 'devnet', wallets: manifestEntries }, null, 2) + '\n',
  );
  console.log(`\nWrote ${MANIFEST_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
