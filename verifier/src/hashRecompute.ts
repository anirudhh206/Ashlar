/**
 * Rebuilds the exact byte preimage each on-chain instruction hashes via attest_and_log (see
 * programs/ashlar/src/instructions/shared.rs + each instruction's `let data = ...`), and
 * recomputes the keccak256 digest to compare against Attestation.data_hash. `solana_keccak_hasher`
 * (the Rust crate used on-chain) is standard Ethereum-style Keccak-256 — confirmed via a smoke
 * test comparing a known input's hash against js-sha3's `keccak256` output.
 */
import { keccak256 } from 'js-sha3';
import type { PublicKey } from '@solana/web3.js';
import type { BN } from '@anchor-lang/core';

function bnToLE8(value: BN): Buffer {
  return value.toArrayLike(Buffer, 'le', 8);
}

export function fetchStepPreimage(invoiceId: BN, amount: BN): Buffer {
  return Buffer.concat([bnToLE8(invoiceId), bnToLE8(amount)]);
}

export function complianceOrApprovalPreimage(approved: boolean): Buffer {
  return Buffer.from([approved ? 1 : 0]);
}

export function guardrailCheckPreimage(amount: BN, recipient: PublicKey): Buffer {
  return Buffer.concat([bnToLE8(amount), recipient.toBuffer()]);
}

export function mockSettlementPreimage(
  pendingAmount: BN,
  pendingRecipient: PublicKey,
  settlementReference: string,
): Buffer {
  return Buffer.concat([
    bnToLE8(pendingAmount),
    pendingRecipient.toBuffer(),
    Buffer.from(settlementReference, 'utf8'),
  ]);
}

export function resumeAfterOverridePreimage(approved: boolean): Buffer {
  return Buffer.from([approved ? 1 : 0, 0x6f, 0x76, 0x72]); // 'o', 'v', 'r'
}

/** Returns lowercase hex, matching how Attestation.data_hash ([u8; 32]) is typically compared. */
export function keccak256Hex(data: Buffer): string {
  return keccak256(data);
}

export function bytesToHex(bytes: number[] | Uint8Array): string {
  return Buffer.from(bytes).toString('hex');
}
