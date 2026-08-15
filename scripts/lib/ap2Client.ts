/**
 * AP2 (Agent Payments Protocol) mandate signing, implemented directly rather than via the
 * `agentic-payments` npm package (too new/unverified as of this writing — v0.2.0). This is
 * still a real, verifiable cryptographic authorization artifact: a canonical JSON mandate
 * (intent/cart/payment) signed with the payer's own Solana ed25519 keypair via `tweetnacl`,
 * the same signature scheme Solana itself uses. The mandate JSON (not just its hash) is written
 * to treasury/mandates/<workflowId>.json for audit purposes — tracked in git, no secrets, same
 * pattern as treasury/squads-treasury.json.
 */
import nacl from 'tweetnacl';
import { Keypair, PublicKey } from '@solana/web3.js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const MANDATES_DIR = path.join(REPO_ROOT, 'treasury', 'mandates');

export interface PaymentMandate {
  version: 'ap2-mandate-v1';
  workflowId: string;
  intent: { description: string };
  cart: {
    totalAmountUsdc: string;
    currency: 'USDC';
    splits: { vendor: string; taxReserve: string; yieldPool: string };
  };
  payment: { payer: string; vendorRecipient: string; createdAt: string };
}

export interface SignedMandate {
  mandate: PaymentMandate;
  signature: string; // base64
  signer: string; // base58 pubkey
}

/** Canonical (deterministic key order, recursive) JSON encoding — what actually gets
 * signed/verified. `JSON.stringify`'s array-replacer form only allow-lists key names, and does
 * so at every nesting level using the SAME list — it does not sort per-level and it silently
 * drops any nested key whose name isn't in that top-level list. Using it here previously
 * stripped nearly every real field (amounts, recipient, description) out of the signed message,
 * so a payload-substitution attack (mutate the mandate, keep the original signature) went
 * undetected. Sort keys recursively instead. */
function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value !== null && typeof value === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = sortKeysDeep((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

function canonicalize(mandate: PaymentMandate): string {
  return JSON.stringify(sortKeysDeep(mandate));
}

export function createPaymentMandate(args: {
  workflowId: string;
  totalAmountUsdc: bigint;
  vendorAmountUsdc: bigint;
  taxReserveAmountUsdc: bigint;
  yieldPoolAmountUsdc: bigint;
  vendorRecipient: PublicKey;
  payer: Keypair;
}): SignedMandate {
  const mandate: PaymentMandate = {
    version: 'ap2-mandate-v1',
    workflowId: args.workflowId,
    intent: { description: `Split settlement for workflow ${args.workflowId}` },
    cart: {
      totalAmountUsdc: args.totalAmountUsdc.toString(),
      currency: 'USDC',
      splits: {
        vendor: args.vendorAmountUsdc.toString(),
        taxReserve: args.taxReserveAmountUsdc.toString(),
        yieldPool: args.yieldPoolAmountUsdc.toString(),
      },
    },
    payment: {
      payer: args.payer.publicKey.toBase58(),
      vendorRecipient: args.vendorRecipient.toBase58(),
      createdAt: new Date().toISOString(),
    },
  };

  const message = Buffer.from(canonicalize(mandate), 'utf8');
  const signatureBytes = nacl.sign.detached(message, args.payer.secretKey);
  const signed: SignedMandate = {
    mandate,
    signature: Buffer.from(signatureBytes).toString('base64'),
    signer: args.payer.publicKey.toBase58(),
  };

  writeMandate(signed);
  return signed;
}

export function verifyMandate(signed: SignedMandate): boolean {
  const message = Buffer.from(canonicalize(signed.mandate), 'utf8');
  const signatureBytes = Buffer.from(signed.signature, 'base64');
  const signerPubkeyBytes = new PublicKey(signed.signer).toBytes();
  return nacl.sign.detached.verify(message, signatureBytes, signerPubkeyBytes);
}

function writeMandate(signed: SignedMandate): void {
  mkdirSync(MANDATES_DIR, { recursive: true });
  const filePath = path.join(MANDATES_DIR, `${signed.mandate.workflowId}.json`);
  writeFileSync(filePath, JSON.stringify(signed, null, 2) + '\n');
}
