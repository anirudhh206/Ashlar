/**
 * Minimal local HTTP server standing in for the vendor's invoice-payment endpoint. Speaks real
 * x402 v2 wire protocol via x402-solana: `GET /invoice` returns 402 with payment requirements
 * (devnet USDC, pay-to = test-vendor's wallet) until a valid `PAYMENT-SIGNATURE` header is
 * presented, at which point it verifies + settles through the PayAI facilitator and returns 200.
 *
 * Usage: pnpm x402-vendor-server
 */
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { X402PaymentHandler } from 'x402-solana/server';
import { PAYAI_FACILITATOR_URL } from '../lib/x402Client.js';
import { USDC_DEVNET_MINT, USDC_DECIMALS } from '../lib/constants.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const MANIFEST_PATH = path.join(REPO_ROOT, 'wallets', 'manifest.json');

const PORT = Number(process.env.X402_VENDOR_PORT ?? 8788);

function resolveVendorPubkey(): string {
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as {
    wallets: { role: string; pubkey: string }[];
  };
  const pubkey = manifest.wallets.find((w) => w.role === 'test-vendor')?.pubkey;
  if (!pubkey) throw new Error('test-vendor wallet not found in wallets/manifest.json');
  return pubkey;
}

export function createVendorHandler(): X402PaymentHandler {
  return new X402PaymentHandler({
    network: 'solana-devnet',
    treasuryAddress: resolveVendorPubkey(),
    facilitatorUrl: PAYAI_FACILITATOR_URL,
    defaultToken: { address: USDC_DEVNET_MINT, decimals: USDC_DECIMALS },
  });
}

function startServer(defaultAmountUsdcAtomic: bigint) {
  const handler = createVendorHandler();
  const resourceUrl = `http://localhost:${PORT}/invoice`;

  const server = createServer((req, res) => {
    void (async () => {
      const requestUrl = new URL(req.url ?? '', `http://localhost:${PORT}`);
      if (req.method !== 'GET' || requestUrl.pathname !== '/invoice') {
        res.writeHead(404).end('not found');
        return;
      }

      // The amount owed varies per payment (e.g. splitSettlement's computed vendor leg) —
      // callers pass it explicitly rather than relying on a fixed server-startup amount.
      const amountParam = requestUrl.searchParams.get('amount');
      const amountUsdcAtomic = amountParam ? BigInt(amountParam) : defaultAmountUsdcAtomic;

      const requirements = await handler.createPaymentRequirements(
        { amount: amountUsdcAtomic.toString(), asset: { address: USDC_DEVNET_MINT, decimals: USDC_DECIMALS } },
        resourceUrl,
      );

      const paymentHeader = handler.extractPayment(req.headers as Record<string, string>);
      if (!paymentHeader) {
        const { status, body } = handler.create402Response(requirements, resourceUrl);
        res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body));
        return;
      }

      const verification = await handler.verifyPayment(paymentHeader, requirements);
      if (!verification.isValid) {
        res
          .writeHead(402, { 'content-type': 'application/json' })
          .end(JSON.stringify({ error: verification.invalidReason ?? 'payment invalid' }));
        return;
      }

      const settlement = await handler.settlePayment(paymentHeader, requirements);
      if (!settlement.success) {
        res
          .writeHead(402, { 'content-type': 'application/json' })
          .end(JSON.stringify({ error: settlement.errorReason ?? 'settlement failed' }));
        return;
      }

      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ settlement }));
    })().catch((err: unknown) => {
      console.error('[x402-vendor-server] error:', err);
      res.writeHead(500).end('internal error');
    });
  });

  server.listen(PORT, () => {
    console.log(`[x402-vendor-server] listening on ${resourceUrl}`);
  });
  return server;
}

const amountArg = process.argv[2];
const amountUsdcAtomic = BigInt(amountArg ?? '1000000'); // default $1.00
startServer(amountUsdcAtomic);
