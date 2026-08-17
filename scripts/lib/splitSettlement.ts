/**
 * Split settlement orchestration — Phase 5's actual settlement leg, replacing Phase 4's
 * squadsClient.completeSettlement everywhere it was used as the pre-attestation fund movement.
 *
 * Fetches the live Pyth USDC/USD price, computes an 85% vendor / 10% tax-reserve / 5%
 * yield-pool-placeholder split in USDC-devnet, signs an AP2 mandate authorizing it, pays the
 * vendor leg through real x402 rails, sends the tax-reserve/yield-pool legs as plain SPL
 * transfers, checks the agent's on-chain identity, and returns one evidence JSON blob to be
 * hashed into the on-chain `mock_settlement` attestation — no program changes required, since
 * that instruction's `settlement_reference: String` argument is only ever hashed, never stored
 * raw on-chain.
 *
 * Funding source: the business-owner wallet's own USDC-devnet balance — a deliberately separate
 * track from Phase 4's Squads-held lamport treasury (see agent/README.md and README.md for the
 * documented rationale: x402 payments need a directly-signable payer, which a multisig can't be
 * without deeper Squads integration than this phase's scope).
 */
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { getOrCreateAssociatedTokenAccount, transferChecked } from '@solana/spl-token';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { getOracleProvider } from './registry.js';
import { usdToUsdcAtomicUnits } from './pythClient.js';
import { createPaymentMandate, verifyMandate, type SignedMandate } from './ap2Client.js';
import { payVendorInvoice } from './x402Client.js';
import { createAgentIdentityUmi, verifyAgentIdentity, type AgentIdentityStatus } from './agentIdentityClient.js';
import { USDC_DEVNET_MINT, USDC_DECIMALS, DEVNET_URL } from './constants.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

const VENDOR_INVOICE_URL = process.env.X402_VENDOR_URL ?? 'http://localhost:8788/invoice';
const VENDOR_SPLIT = 0.85;
const TAX_RESERVE_SPLIT = 0.1;
// yield-pool gets the remaining 5% — computed as a remainder below so the three legs always
// sum to exactly totalUsdcAtomic despite integer-division rounding.

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

function loadAgentIdentityAssetAddress(): string | undefined {
  const identityPath = path.join(REPO_ROOT, 'treasury', 'agent-identity.json');
  try {
    const data = JSON.parse(readFileSync(identityPath, 'utf8')) as { assetAddress: string };
    return data.assetAddress;
  } catch {
    return undefined;
  }
}

export interface SplitSettlementEvidence {
  workflowId: string;
  totalAmountUsd: number;
  usdcUsdPrice: number;
  splits: { vendorUsdcAtomic: string; taxReserveUsdcAtomic: string; yieldPoolUsdcAtomic: string };
  vendorPayment: { invoiceUrl: string; status: number };
  /** Empty string means this leg hasn't gone out yet — only possible when `status: 'partial'`. */
  taxReserveTransferSignature: string;
  yieldPoolTransferSignature: string;
  ap2Mandate: { signature: string; verified: boolean };
  agentIdentity: AgentIdentityStatus;
  /** Present only when the tax-reserve or yield-pool leg failed after the vendor was already
   * paid — the vendor payment (and any leg that did land) is real and irreversible, so this
   * record exists to make that visible rather than losing it. There's no automatic retry here
   * (unlike directTransfer.ts's resumable path): the x402 vendor payment itself can't be safely
   * re-sent without risking a duplicate payment, so a partial result needs a human to look at
   * treasury/settlements/<workflowId>.json and finish the remaining SPL leg(s) manually. */
  status?: 'partial';
}

/** Compact enough to safely fit in a Solana transaction's instruction data (~1232-byte tx
 * limit) alongside mock_settlement's other accounts — the full evidence above is written to
 * treasury/settlements/<workflowId>.json for audit purposes instead of being embedded on-chain. */
export interface SplitSettlementOnChainReference {
  workflowId: string;
  totalAmountUsd: number;
  usdcUsdPrice: number;
  splits: { vendorUsdcAtomic: string; taxReserveUsdcAtomic: string; yieldPoolUsdcAtomic: string };
  vendorPaid: boolean;
  taxReserveTx: string;
  yieldPoolTx: string;
  mandateVerified: boolean;
  agentIdentityVerified: boolean;
}

export interface SplitSettlementResult {
  evidence: SplitSettlementEvidence;
  onChainReference: string;
}

function writeSettlementEvidence(evidence: SplitSettlementEvidence): void {
  const dir = path.join(REPO_ROOT, 'treasury', 'settlements');
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, `${evidence.workflowId}.json`), JSON.stringify(evidence, null, 2) + '\n');
}

export async function executeSplitSettlement(
  workflowId: string,
  totalAmountUsd: number,
  vendorRecipient: PublicKey,
): Promise<SplitSettlementResult> {
  const connection = new Connection(DEVNET_URL, 'confirmed');
  const businessOwner = loadWalletKeypair('business-owner');
  const taxReserveWallet = loadWalletKeypair('tax-reserve-placeholder');
  const yieldPoolWallet = loadWalletKeypair('yield-pool-placeholder');

  const oracle = getOracleProvider();
  const { price: usdcUsdPrice } = await oracle.getPrice('USDC/USD');
  const totalUsdcAtomic = usdToUsdcAtomicUnits(totalAmountUsd, usdcUsdPrice);

  const vendorAmount = (totalUsdcAtomic * BigInt(Math.round(VENDOR_SPLIT * 100))) / 100n;
  const taxReserveAmount = (totalUsdcAtomic * BigInt(Math.round(TAX_RESERVE_SPLIT * 100))) / 100n;
  const yieldPoolAmount = totalUsdcAtomic - vendorAmount - taxReserveAmount; // remainder absorbs rounding

  const mandate: SignedMandate = createPaymentMandate({
    workflowId,
    totalAmountUsdc: totalUsdcAtomic,
    vendorAmountUsdc: vendorAmount,
    taxReserveAmountUsdc: taxReserveAmount,
    yieldPoolAmountUsdc: yieldPoolAmount,
    vendorRecipient,
    payer: businessOwner,
  });
  const mandateVerified = verifyMandate(mandate);

  const invoiceUrl = `${VENDOR_INVOICE_URL}?amount=${vendorAmount.toString()}`;
  const vendorPayment = await payVendorInvoice(invoiceUrl, businessOwner, vendorAmount);

  const usdcMint = new PublicKey(USDC_DEVNET_MINT);
  const splits = {
    vendorUsdcAtomic: vendorAmount.toString(),
    taxReserveUsdcAtomic: taxReserveAmount.toString(),
    yieldPoolUsdcAtomic: yieldPoolAmount.toString(),
  };

  // The vendor leg is already real and irreversible by this point — from here on, any failure
  // must still record it (plus whichever of the two remaining legs landed) instead of losing
  // that money movement from the audit trail entirely.
  let taxReserveTransferSignature = '';
  let yieldPoolTransferSignature = '';
  try {
    const ownerAta = await getOrCreateAssociatedTokenAccount(connection, businessOwner, usdcMint, businessOwner.publicKey);
    const taxReserveAta = await getOrCreateAssociatedTokenAccount(
      connection,
      businessOwner,
      usdcMint,
      taxReserveWallet.publicKey,
    );
    const yieldPoolAta = await getOrCreateAssociatedTokenAccount(
      connection,
      businessOwner,
      usdcMint,
      yieldPoolWallet.publicKey,
    );

    taxReserveTransferSignature = await transferChecked(
      connection,
      businessOwner,
      ownerAta.address,
      usdcMint,
      taxReserveAta.address,
      businessOwner,
      taxReserveAmount,
      USDC_DECIMALS,
    );
    yieldPoolTransferSignature = await transferChecked(
      connection,
      businessOwner,
      ownerAta.address,
      usdcMint,
      yieldPoolAta.address,
      businessOwner,
      yieldPoolAmount,
      USDC_DECIMALS,
    );
  } catch (err) {
    writeSettlementEvidence({
      workflowId,
      totalAmountUsd,
      usdcUsdPrice,
      splits,
      vendorPayment: { invoiceUrl, status: vendorPayment.status },
      taxReserveTransferSignature,
      yieldPoolTransferSignature,
      ap2Mandate: { signature: mandate.signature, verified: mandateVerified },
      agentIdentity: { registered: false },
      status: 'partial',
    });
    throw new Error(
      `executeSplitSettlement: vendor already paid ($${(Number(vendorAmount) / 1_000_000).toFixed(2)} ` +
        `USDC), but a later leg failed (${(err as Error).message}). Partial evidence recorded in ` +
        `treasury/settlements/${workflowId}.json — the remaining tax-reserve/yield-pool transfer(s) need ` +
        `to be completed manually.`,
    );
  }

  const agentIdentityAsset = loadAgentIdentityAssetAddress();
  let agentIdentity: AgentIdentityStatus = { registered: false };
  if (agentIdentityAsset) {
    const agentIdentityKeypair = loadWalletKeypair('agent-identity');
    const umi = createAgentIdentityUmi(agentIdentityKeypair);
    agentIdentity = await verifyAgentIdentity(umi, agentIdentityAsset);
  }

  const evidence: SplitSettlementEvidence = {
    workflowId,
    totalAmountUsd,
    usdcUsdPrice,
    splits,
    vendorPayment: { invoiceUrl, status: vendorPayment.status },
    taxReserveTransferSignature,
    yieldPoolTransferSignature,
    ap2Mandate: { signature: mandate.signature, verified: mandateVerified },
    agentIdentity,
  };
  writeSettlementEvidence(evidence);

  const onChainReference: SplitSettlementOnChainReference = {
    workflowId,
    totalAmountUsd,
    usdcUsdPrice,
    splits,
    vendorPaid: vendorPayment.status === 200,
    taxReserveTx: taxReserveTransferSignature,
    yieldPoolTx: yieldPoolTransferSignature,
    mandateVerified,
    agentIdentityVerified: agentIdentity.registered,
  };

  return { evidence, onChainReference: JSON.stringify(onChainReference) };
}
