/**
 * Direct multi-recipient transfer — the settlement path for "transfer $X to <wallet address>"
 * and group transfers to several real wallet addresses at once, entered explicitly by the
 * workflow owner (not parsed as a free-text name).
 *
 * Unlike splitSettlement.ts (which pays a known vendor's own x402 invoice endpoint, plus skims a
 * tax-reserve/yield-pool share), this pays each caller-supplied recipient their full requested
 * share directly — there's no vendor invoice to fetch and no automatic skim, because the
 * recipient here isn't a business running its own invoicing server, it's just a wallet address
 * the workflow owner named.
 *
 * The actual fund movement happens *inside the Solana program itself* — this function only
 * computes the live-priced atomic amounts and ensures every token account exists, then submits
 * one `settle_direct_transfer` instruction (see programs/ashlar/src/instructions/
 * settle_direct_transfer.rs) that runs every recipient's `transfer_checked` CPI atomically with
 * the settlement attestation. Because a Solana transaction is all-or-nothing, there is no
 * "leg 2 of 4 failed after leg 1 already moved money" state to recover from anymore: either every
 * recipient gets paid and the attestation lands together, or nothing happens at all and this
 * function simply throws with no funds moved and no evidence file written.
 */
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { getOrCreateAssociatedTokenAccount } from '@solana/spl-token';
import * as anchor from '@anchor-lang/core';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { getOracleProvider } from './registry.js';
import { usdToUsdcAtomicUnits } from './pythClient.js';
import { USDC_DEVNET_MINT, USDC_DECIMALS, DEVNET_URL } from './constants.js';
import { submitDirectTransferSettlement, type PolicyEngineContext } from './policyEngineClient.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SETTLEMENTS_DIR = path.join(REPO_ROOT, 'treasury', 'settlements');

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
}

/** Discriminated by `kind` against splitSettlement.ts's evidence shape — both land in the same
 * treasury/settlements/<workflowId>.json directory, read generically by the dashboard relay. One
 * `signature` covers every leg, since they all landed in the same atomic on-chain transaction. */
export interface DirectTransferEvidence {
  kind: 'direct-transfer';
  workflowId: string;
  totalAmountUsd: number;
  usdcUsdPrice: number;
  signature: string;
  legs: DirectTransferLeg[];
}

export interface DirectTransferResult {
  evidence: DirectTransferEvidence;
  onChainReference: string;
}

function writeSettlementEvidence(evidence: DirectTransferEvidence): void {
  mkdirSync(SETTLEMENTS_DIR, { recursive: true });
  writeFileSync(path.join(SETTLEMENTS_DIR, `${evidence.workflowId}.json`), JSON.stringify(evidence, null, 2) + '\n');
}

export async function executeDirectTransfer(
  ctx: PolicyEngineContext,
  workflowId: anchor.BN,
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

  // Ensuring each recipient's token account exists is a separate, harmless step from the actual
  // transfer — it moves no settlement funds (only a small rent deposit into the new account
  // itself, never lost), and getOrCreateAssociatedTokenAccount is idempotent, so retrying this
  // part after a failure is always safe.
  const legs: DirectTransferLeg[] = [];
  const recipientAtas: PublicKey[] = [];
  for (const r of recipients) {
    const atomic = usdToUsdcAtomicUnits(r.amountUsd, usdcUsdPrice);
    const recipientAta = await getOrCreateAssociatedTokenAccount(connection, businessOwner, usdcMint, r.pubkey);
    recipientAtas.push(recipientAta.address);
    legs.push({ recipient: r.pubkey.toBase58(), amountUsd: r.amountUsd, usdcAtomic: atomic.toString() });
  }

  const totalAmountUsd = recipients.reduce((sum, r) => sum + r.amountUsd, 0);
  const onChainReference = JSON.stringify({ kind: 'direct-transfer', workflowId: workflowId.toString(), totalAmountUsd, legs });

  // The one real, atomic on-chain transaction: every recipient's transfer_checked CPI plus the
  // settlement attestation, all in a single instruction. If this throws, nothing moved.
  const signature = await submitDirectTransferSettlement(ctx, workflowId, {
    mint: usdcMint,
    ownerTokenAccount: ownerAta.address,
    recipientAtas,
    amounts: legs.map((l) => new anchor.BN(l.usdcAtomic)),
    decimals: USDC_DECIMALS,
    settlementReference: onChainReference,
  });

  const evidence: DirectTransferEvidence = {
    kind: 'direct-transfer',
    workflowId: workflowId.toString(),
    totalAmountUsd,
    usdcUsdPrice,
    signature,
    legs,
  };
  writeSettlementEvidence(evidence);

  return { evidence, onChainReference };
}
