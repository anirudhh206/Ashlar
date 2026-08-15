/**
 * x402 payment client — pays an HTTP 402-protected vendor endpoint using real x402-solana rails
 * (402 challenge -> signed USDC payment -> PayAI facilitator verify/settle), backed by a Solana
 * Keypair already held locally (same devnet-demo pattern as Phase 4's Squads client, where both
 * multisig member keys happen to be held by us).
 */
import { Keypair, VersionedTransaction } from '@solana/web3.js';
import { X402Client, type WalletAdapter } from 'x402-solana/client';

export const PAYAI_FACILITATOR_URL = 'https://facilitator.payai.network';

function keypairToWalletAdapter(keypair: Keypair): WalletAdapter {
  return {
    publicKey: { toString: () => keypair.publicKey.toBase58() },
    signTransaction: async (tx: VersionedTransaction) => {
      tx.sign([keypair]);
      return tx;
    },
  };
}

export interface VendorPaymentResult {
  status: number;
  body: unknown;
}

/** GETs `invoiceUrl`, automatically paying the x402 402 challenge if one is returned. */
export async function payVendorInvoice(
  invoiceUrl: string,
  payer: Keypair,
  amountUsdcAtomic: bigint,
): Promise<VendorPaymentResult> {
  const client = new X402Client({
    wallet: keypairToWalletAdapter(payer),
    network: 'solana-devnet',
    amount: amountUsdcAtomic,
  });

  const response = await client.fetch(invoiceUrl, { method: 'GET' });
  const body = await response.json().catch(() => undefined);
  if (!response.ok) {
    throw new Error(`x402 vendor payment failed: ${response.status} ${JSON.stringify(body)}`);
  }
  return { status: response.status, body };
}
