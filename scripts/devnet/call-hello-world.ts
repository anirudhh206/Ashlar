/**
 * Phase 0 completion check: connects to devnet as business-owner, sends the
 * hello-world `initialize` instruction, and prints the resulting Explorer link.
 *
 * Usage: pnpm hello-world
 */
import * as anchor from '@anchor-lang/core';
import { Program, AnchorProvider, Wallet } from '@anchor-lang/core';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type { Ashlar } from '../../target/types/ashlar.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const IDL_PATH = path.join(REPO_ROOT, 'target', 'idl', 'ashlar.json');
const WALLET_PATH = path.join(REPO_ROOT, 'wallets', 'business-owner.json');
const DEVNET_URL = 'https://api.devnet.solana.com';

async function main(): Promise<void> {
  const idl = JSON.parse(readFileSync(IDL_PATH, 'utf8'));
  const secret = JSON.parse(readFileSync(WALLET_PATH, 'utf8')) as number[];
  const payer = Keypair.fromSecretKey(Uint8Array.from(secret));

  const connection = new Connection(DEVNET_URL, 'confirmed');
  const provider = new AnchorProvider(connection, new Wallet(payer), {
    commitment: 'confirmed',
  });
  anchor.setProvider(provider);

  const program = new Program(idl, provider) as Program<Ashlar>;

  const [counter] = PublicKey.findProgramAddressSync(
    [Buffer.from('counter')],
    program.programId,
  );

  console.log(`Program ID: ${program.programId.toBase58()}`);
  console.log(`Payer:      ${payer.publicKey.toBase58()}`);
  console.log(`Counter PDA: ${counter.toBase58()}`);

  const signature = await program.methods
    .initialize()
    .accountsPartial({ payer: payer.publicKey, counter })
    .rpc();

  console.log(`\nInitialize transaction signature: ${signature}`);
  console.log(`Explorer: https://explorer.solana.com/tx/${signature}?cluster=devnet`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
