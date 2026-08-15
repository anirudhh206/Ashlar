/**
 * Real Squads multisig treasury client (Phase 4). Holds pooled devnet SOL in a 2-of-2 Squads
 * vault (business-owner + treasury-placeholder, the Phase 0 wallet roles), and executes
 * settlements through Squads' own propose -> approve -> execute flow. Our Policy Engine program
 * cannot sign for this vault itself — only the Squads program can, once enough members approve.
 */
import * as multisig from '@sqds/multisig';
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionMessage,
} from '@solana/web3.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from './policyEngineClient.js';

const TREASURY_DIR = path.join(REPO_ROOT, 'treasury');
const TREASURY_CONFIG_PATH = path.join(TREASURY_DIR, 'squads-treasury.json');
const DEVNET_URL = 'https://api.devnet.solana.com';

export interface TreasuryConfig {
  multisigPda: string;
  vaultPda: string;
  createKey: string;
  threshold: number;
  members: string[];
}

export function loadTreasuryConfig(): TreasuryConfig {
  if (!existsSync(TREASURY_CONFIG_PATH)) {
    throw new Error(
      `${TREASURY_CONFIG_PATH} not found — run \`pnpm setup-squads-treasury\` first`,
    );
  }
  return JSON.parse(readFileSync(TREASURY_CONFIG_PATH, 'utf8')) as TreasuryConfig;
}

export function saveTreasuryConfig(config: TreasuryConfig): void {
  mkdirSync(TREASURY_DIR, { recursive: true });
  writeFileSync(TREASURY_CONFIG_PATH, JSON.stringify(config, null, 2) + '\n');
}

function loadWalletKeypair(file: string): Keypair {
  const secret = JSON.parse(readFileSync(path.join(REPO_ROOT, 'wallets', file), 'utf8')) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

export function loadTreasuryMembers(): { businessOwner: Keypair; treasuryPlaceholder: Keypair } {
  return {
    businessOwner: loadWalletKeypair('business-owner.json'),
    treasuryPlaceholder: loadWalletKeypair('treasury-placeholder.json'),
  };
}

export function getConnection(): Connection {
  return new Connection(DEVNET_URL, 'confirmed');
}

/**
 * Creates, approves (as both members), and executes a Squads vault transaction that transfers
 * `amountLamports` from the pooled treasury vault to `recipient`. Returns the execution tx
 * signature. Used by both the agent's settlement tool and the manual resume script, so the
 * propose/approve/execute sequence lives in exactly one place.
 */
export async function completeSettlement(
  amountLamports: number,
  recipient: PublicKey,
): Promise<string> {
  const connection = getConnection();
  const config = loadTreasuryConfig();
  const { businessOwner, treasuryPlaceholder } = loadTreasuryMembers();
  const multisigPda = new PublicKey(config.multisigPda);
  const vaultPda = new PublicKey(config.vaultPda);

  const multisigAccount = await multisig.accounts.Multisig.fromAccountAddress(connection, multisigPda);
  const transactionIndex = BigInt(multisigAccount.transactionIndex.toString()) + 1n;

  const transferIx = SystemProgram.transfer({
    fromPubkey: vaultPda,
    toPubkey: recipient,
    lamports: amountLamports,
  });
  const transactionMessage = new TransactionMessage({
    payerKey: vaultPda,
    recentBlockhash: (await connection.getLatestBlockhash()).blockhash,
    instructions: [transferIx],
  });

  async function confirm(signature: string): Promise<string> {
    await connection.confirmTransaction(signature, 'confirmed');
    return signature;
  }

  await confirm(
    await multisig.rpc.vaultTransactionCreate({
      connection,
      feePayer: businessOwner,
      multisigPda,
      transactionIndex,
      creator: businessOwner.publicKey,
      vaultIndex: 0,
      ephemeralSigners: 0,
      transactionMessage,
    }),
  );

  await confirm(
    await multisig.rpc.proposalCreate({
      connection,
      feePayer: businessOwner,
      creator: businessOwner,
      multisigPda,
      transactionIndex,
    }),
  );

  await confirm(
    await multisig.rpc.proposalApprove({
      connection,
      feePayer: businessOwner,
      member: businessOwner,
      multisigPda,
      transactionIndex,
    }),
  );

  await confirm(
    await multisig.rpc.proposalApprove({
      connection,
      feePayer: treasuryPlaceholder,
      member: treasuryPlaceholder,
      multisigPda,
      transactionIndex,
    }),
  );

  const executeSignature = await multisig.rpc.vaultTransactionExecute({
    connection,
    feePayer: businessOwner,
    multisigPda,
    transactionIndex,
    member: businessOwner.publicKey,
  });
  await confirm(executeSignature);

  return executeSignature;
}
