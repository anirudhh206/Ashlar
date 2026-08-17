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
 *
 * Resumable by construction: evidence is written to disk after every single leg, not just at the
 * end, and a re-run for the same workflowId skips any recipient already recorded as paid instead
 * of re-sending. That's what makes a mid-transfer failure (leg 2 of 4 fails after leg 1 already
 * moved real funds) recoverable rather than silent — the caller sees a clear error naming exactly
 * which recipients are still owed, and can safely re-invoke this same function to finish the job.
 */
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { getOrCreateAssociatedTokenAccount, transferChecked } from '@solana/spl-token';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { getOracleProvider } from './registry.js';
import { usdToUsdcAtomicUnits } from './pythClient.js';
import { USDC_DEVNET_MINT, USDC_DECIMALS, DEVNET_URL } from './constants.js';

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
  signature: string;
}

/** Discriminated by `kind` against splitSettlement.ts's evidence shape — both land in the same
 * treasury/settlements/<workflowId>.json directory, read generically by the dashboard relay.
 * `status: 'partial'` means at least one recipient still hasn't been paid — re-running
 * executeDirectTransfer for the same workflowId will pick up exactly where this left off. A
 * finished transfer omits `status` (implicitly complete), matching how legacy evidence files
 * never had this field either. */
export interface DirectTransferEvidence {
  kind: 'direct-transfer';
  workflowId: string;
  totalAmountUsd: number;
  usdcUsdPrice: number;
  legs: DirectTransferLeg[];
  status?: 'partial';
}

export interface DirectTransferResult {
  evidence: DirectTransferEvidence;
  onChainReference: string;
}

function evidencePath(workflowId: string): string {
  return path.join(SETTLEMENTS_DIR, `${workflowId}.json`);
}

function loadExistingEvidence(workflowId: string): DirectTransferEvidence | undefined {
  const file = evidencePath(workflowId);
  if (!existsSync(file)) return undefined;
  const parsed = JSON.parse(readFileSync(file, 'utf8')) as { kind?: string };
  if (parsed.kind !== 'direct-transfer') return undefined; // a legacy vendor-split file, not ours
  return parsed as DirectTransferEvidence;
}

function writeSettlementEvidence(evidence: DirectTransferEvidence): void {
  mkdirSync(SETTLEMENTS_DIR, { recursive: true });
  writeFileSync(evidencePath(evidence.workflowId), JSON.stringify(evidence, null, 2) + '\n');
}

function toOnChainReference(evidence: DirectTransferEvidence): string {
  return JSON.stringify({
    kind: 'direct-transfer',
    workflowId: evidence.workflowId,
    totalAmountUsd: evidence.totalAmountUsd,
    legs: evidence.legs.map((l) => ({ recipient: l.recipient, usdcAtomic: l.usdcAtomic, signature: l.signature })),
  });
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

  // Resume support: a prior partial run may have already paid some of these recipients. Reuse
  // those legs verbatim (same signature, not re-sent) and only transfer to whoever's left.
  const existing = loadExistingEvidence(workflowId);
  const alreadyPaid = new Map((existing?.legs ?? []).map((leg) => [leg.recipient, leg]));

  const connection = new Connection(DEVNET_URL, 'confirmed');
  const businessOwner = loadWalletKeypair('business-owner');
  const oracle = getOracleProvider();
  const { price: usdcUsdPrice } = await oracle.getPrice('USDC/USD');

  const usdcMint = new PublicKey(USDC_DEVNET_MINT);
  const ownerAta = await getOrCreateAssociatedTokenAccount(connection, businessOwner, usdcMint, businessOwner.publicKey);

  // Sequential, not Promise.all: every leg spends from the same owner ATA, and concurrent
  // transferChecked calls against one token account race on Solana's account-write lock.
  const legs: DirectTransferLeg[] = [];
  for (const r of recipients) {
    const pubkeyStr = r.pubkey.toBase58();
    const reused = alreadyPaid.get(pubkeyStr);
    if (reused) {
      legs.push(reused);
      continue;
    }

    try {
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
      legs.push({ recipient: pubkeyStr, amountUsd: r.amountUsd, usdcAtomic: atomic.toString(), signature });
    } catch (err) {
      // Persist every leg that *did* land before re-throwing — the money already moved for
      // `legs` and must not be lost from the audit trail just because a later leg failed.
      const partialTotal = legs.reduce((sum, l) => sum + l.amountUsd, 0);
      writeSettlementEvidence({
        kind: 'direct-transfer',
        workflowId,
        totalAmountUsd: partialTotal,
        usdcUsdPrice,
        legs,
        status: 'partial',
      });
      const remaining = recipients.filter((rem) => !legs.some((l) => l.recipient === rem.pubkey.toBase58()));
      throw new Error(
        `executeDirectTransfer: failed paying ${pubkeyStr} (${(err as Error).message}). ` +
          `${legs.length} of ${recipients.length} recipients already paid and recorded in ` +
          `treasury/settlements/${workflowId}.json — re-run with the same recipients to pay the ` +
          `remaining ${remaining.length}: ${remaining.map((rem) => rem.pubkey.toBase58()).join(', ')}.`,
      );
    }

    // Record this leg immediately, not just at the end — a crash on the *next* leg must not
    // lose this one.
    const runningTotal = legs.reduce((sum, l) => sum + l.amountUsd, 0);
    const stillIncomplete = legs.length < recipients.length;
    writeSettlementEvidence({
      kind: 'direct-transfer',
      workflowId,
      totalAmountUsd: runningTotal,
      usdcUsdPrice,
      legs,
      ...(stillIncomplete ? { status: 'partial' as const } : {}),
    });
  }

  const totalAmountUsd = legs.reduce((sum, l) => sum + l.amountUsd, 0);
  const evidence: DirectTransferEvidence = { kind: 'direct-transfer', workflowId, totalAmountUsd, usdcUsdPrice, legs };
  writeSettlementEvidence(evidence);

  return { evidence, onChainReference: toOnChainReference(evidence) };
}
