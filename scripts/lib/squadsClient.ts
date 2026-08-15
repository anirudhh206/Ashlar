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
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionMessage,
  sendAndConfirmTransaction,
  type VersionedTransaction,
} from '@solana/web3.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from './policyEngineClient.js';
import { DEVNET_URL } from './constants.js';

const TREASURY_DIR = path.join(REPO_ROOT, 'treasury');
const TREASURY_CONFIG_PATH = path.join(TREASURY_DIR, 'squads-treasury.json');

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

const VAULT_FUNDING_SOL = 0.5;

/** Creates a real devnet Squads multisig (2-of-2, business-owner + treasury-placeholder) and
 * funds its vault. Used by both `pnpm setup-squads-treasury` and (idempotently) by the test
 * suite's `before()` hook, so tests stay a single self-contained command. */
export async function createTreasuryConfig(): Promise<TreasuryConfig> {
  const connection = getConnection();
  const { businessOwner, treasuryPlaceholder } = loadTreasuryMembers();

  const createKey = Keypair.generate();
  const [multisigPda] = multisig.getMultisigPda({ createKey: createKey.publicKey });

  const programConfigPda = multisig.getProgramConfigPda({})[0];
  const programConfig = await multisig.accounts.ProgramConfig.fromAccountAddress(
    connection,
    programConfigPda,
  );

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

  const [vaultPda] = multisig.getVaultPda({ multisigPda, index: 0 });

  const fundTx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: businessOwner.publicKey,
      toPubkey: vaultPda,
      lamports: Math.round(VAULT_FUNDING_SOL * LAMPORTS_PER_SOL),
    }),
  );
  await sendAndConfirmTransaction(connection, fundTx, [businessOwner], { commitment: 'confirmed' });

  const config: TreasuryConfig = {
    multisigPda: multisigPda.toBase58(),
    vaultPda: vaultPda.toBase58(),
    createKey: createKey.publicKey.toBase58(),
    threshold: 2,
    members: [businessOwner.publicKey.toBase58(), treasuryPlaceholder.publicKey.toBase58()],
  };
  saveTreasuryConfig(config);
  return config;
}

export async function ensureTreasuryConfig(): Promise<TreasuryConfig> {
  if (existsSync(TREASURY_CONFIG_PATH)) return loadTreasuryConfig();
  return createTreasuryConfig();
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

  // Build, sign, and send each step's transaction manually via the SDK's low-level
  // `transactions.*` builders rather than its `rpc.*` wrappers — the wrappers' error-translation
  // path has a bug in this SDK version (tries to assign a getter-only `.logs` property on newer
  // @solana/web3.js SendTransactionError instances), which masks the real on-chain error.
  async function sign(tx: VersionedTransaction, signers: Keypair[]): Promise<string> {
    tx.sign(signers);
    const signature = await connection.sendTransaction(tx);
    await connection.confirmTransaction(signature, 'confirmed');
    return signature;
  }

  const blockhash1 = (await connection.getLatestBlockhash()).blockhash;
  await sign(
    multisig.transactions.vaultTransactionCreate({
      blockhash: blockhash1,
      feePayer: businessOwner.publicKey,
      multisigPda,
      transactionIndex,
      creator: businessOwner.publicKey,
      vaultIndex: 0,
      ephemeralSigners: 0,
      transactionMessage,
    }),
    [businessOwner],
  );

  const blockhash2 = (await connection.getLatestBlockhash()).blockhash;
  await sign(
    multisig.transactions.proposalCreate({
      blockhash: blockhash2,
      feePayer: businessOwner.publicKey,
      multisigPda,
      transactionIndex,
      creator: businessOwner.publicKey,
    }),
    [businessOwner],
  );

  const blockhash3 = (await connection.getLatestBlockhash()).blockhash;
  await sign(
    multisig.transactions.proposalApprove({
      blockhash: blockhash3,
      feePayer: businessOwner.publicKey,
      multisigPda,
      transactionIndex,
      member: businessOwner.publicKey,
    }),
    [businessOwner],
  );

  const blockhash4 = (await connection.getLatestBlockhash()).blockhash;
  await sign(
    multisig.transactions.proposalApprove({
      blockhash: blockhash4,
      feePayer: treasuryPlaceholder.publicKey,
      multisigPda,
      transactionIndex,
      member: treasuryPlaceholder.publicKey,
    }),
    [treasuryPlaceholder],
  );

  const blockhash5 = (await connection.getLatestBlockhash()).blockhash;
  const executeTx = await multisig.transactions.vaultTransactionExecute({
    connection,
    blockhash: blockhash5,
    feePayer: businessOwner.publicKey,
    multisigPda,
    transactionIndex,
    member: businessOwner.publicKey,
  });
  return sign(executeTx, [businessOwner]);
}
