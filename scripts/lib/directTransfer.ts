/**
 * Direct multi-recipient transfer — the settlement path for "transfer $X to <wallet address>"
 * and group transfers to several real wallet addresses at once, entered explicitly by the
 * workflow owner (not parsed as a free-text name).
 *
 * Unlike splitSettlement.ts (which pays a known vendor's own x402 invoice endpoint, plus skims a
 * tax-reserve/yield-pool share), this pays each caller-supplied recipient their full requested
 * share directly via a plain SPL transfer — there's no vendor invoice to fetch and no automatic
 * skim, because the recipient here isn't a business running its own invoicing server, it's just a
 * wallet address the workflow owner named.
 */
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { getOrCreateAssociatedTokenAccount, transferChecked } from '@solana/spl-token';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { getOracleProvider } from './registry.js';
import { usdToUsdcAtomicUnits } from './pythClient.js';
import { USDC_DEVNET_MINT, USDC_DECIMALS, DEVNET_URL } from './constants.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

/** Mirrors programs/ashlar/src/state.rs's `allowlist: Vec<Pubkey>` bound (`#[max_len(4)]`) —
 * a group transfer's recipients are set as the workflow's on-chain allowlist at init time, so
 * the same real limit applies here. */
export const MAX_RECIPIENTS = 4;

function loadWalletKeypair(role: string): Keypair {
  const manifestPath = path.join(REPO_ROOT, 'wallets', 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    wallets: { role: string; file: string }[];
  };
  const entry = manifest.wallets.find((w) => w.role === role);
  if (!entry) throw new Error(`${role} wallet not found in wallets/manifest.json`);
  const secret = JSON.parse(readFileSync(path.join(REPO_ROOT, entry.file), 'utf8')) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

export interface DirectTransferRecipient {
  pubkey: PublicKey;
  amountUsd: number;
}

export interface DirectTransferLeg {
  recipient: string;
  amountUsd: number;
  usdcAtomic: string;
  signature: string;
}

/** Discriminated by `kind` against splitSettlement.ts's evidence shape — both land in the same
 * treasury/settlements/<workflowId>.json directory, read generically by the dashboard relay. */
export interface DirectTransferEvidence {
  kind: 'direct-transfer';
  workflowId: string;
  totalAmountUsd: number;
  usdcUsdPrice: number;
  legs: DirectTransferLeg[];
}

export interface DirectTransferResult {
  evidence: DirectTransferEvidence;
  onChainReference: string;
}

function writeSettlementEvidence(evidence: DirectTransferEvidence): void {
  const dir = path.join(REPO_ROOT, 'treasury', 'settlements');
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, `${evidence.workflowId}.json`), JSON.stringify(evidence, null, 2) + '\n');
}

export async function executeDirectTransfer(
  workflowId: string,
  recipients: DirectTransferRecipient[],
): Promise<DirectTransferResult> {
  if (recipients.length === 0) {
    throw new Error('executeDirectTransfer: at least one recipient is required');
  }
  if (recipients.length > MAX_RECIPIENTS) {
    throw new Error(`executeDirectTransfer: at most ${MAX_RECIPIENTS} recipients are supported in one transfer`);
  }

  const connection = new Connection(DEVNET_URL, 'confirmed');
  const businessOwner = loadWalletKeypair('business-owner');
  const oracle = getOracleProvider();
  const { price: usdcUsdPrice } = await oracle.getPrice('USDC/USD');

  const usdcMint = new PublicKey(USDC_DEVNET_MINT);
  const ownerAta = await getOrCreateAssociatedTokenAccount(connection, businessOwner, usdcMint, businessOwner.publicKey);

  // Sequential, not Promise.all: every leg spends from the same owner ATA, and concurrent
  // transferChecked calls against one token account race on Solana's account-write lock.
  const legs: DirectTransferLeg[] = [];
  let totalAmountUsd = 0;
  for (const r of recipients) {
    const atomic = usdToUsdcAtomicUnits(r.amountUsd, usdcUsdPrice);
    const recipientAta = await getOrCreateAssociatedTokenAccount(connection, businessOwner, usdcMint, r.pubkey);
    const signature = await transferChecked(
      connection,
      businessOwner,
      ownerAta.address,
      usdcMint,
      recipientAta.address,
      businessOwner,
      atomic,
      USDC_DECIMALS,
    );
    legs.push({ recipient: r.pubkey.toBase58(), amountUsd: r.amountUsd, usdcAtomic: atomic.toString(), signature });
    totalAmountUsd += r.amountUsd;
  }

  const evidence: DirectTransferEvidence = { kind: 'direct-transfer', workflowId, totalAmountUsd, usdcUsdPrice, legs };
  writeSettlementEvidence(evidence);

  const onChainReference = JSON.stringify({
    kind: 'direct-transfer',
    workflowId,
    totalAmountUsd,
    legs: legs.map((l) => ({ recipient: l.recipient, usdcAtomic: l.usdcAtomic, signature: l.signature })),
  });

  return { evidence, onChainReference };
}
