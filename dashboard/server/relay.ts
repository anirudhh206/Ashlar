/**
 * Live Public Dashboard's backend relay — plain node:http, no server framework (same
 * minimal-deps pattern agent/src/server.ts already established). Holds the Helius API key
 * server-side: subscribes to Attestation account changes via connection.onProgramAccountChange
 * and pushes sanitized events to connected browsers over Server-Sent Events. The browser only
 * ever talks to this relay's own endpoints — it never sees Helius or holds a key.
 *
 * Everything above is genuinely read-only and safe to expose. If DASHBOARD_DEPLOY_SECRET is set,
 * this relay also exposes one authenticated write endpoint, POST /deploy, which really does
 * compile and deploy a workflow on devnet (spending real devnet SOL/USDC) — see the doc comment
 * above that route below. Without the env var set, /deploy always responds 500 and nothing about
 * the read-only behavior above changes.
 *
 * Usage: pnpm dashboard-server
 */
import { Program, AnchorProvider, Wallet } from '@anchor-lang/core';
import { Connection, Keypair, PublicKey, type KeyedAccountInfo } from '@solana/web3.js';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { DEVNET_URL } from '../../scripts/lib/constants.js';
import { deployWorkflowFromInstruction } from '../../scripts/lib/deployWorkflow.js';
import type { Ashlar } from '../../target/types/ashlar.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const IDL_PATH = path.join(REPO_ROOT, 'target', 'idl', 'ashlar.json');
const PORT = Number(process.env.DASHBOARD_SERVER_PORT ?? 8789);

const idl = JSON.parse(readFileSync(IDL_PATH, 'utf8'));
const connection = new Connection(DEVNET_URL, 'confirmed');
const throwaway = Keypair.generate();
const provider = new AnchorProvider(connection, new Wallet(throwaway), { commitment: 'confirmed' });
const program = new Program(idl, provider) as Program<Ashlar>;
const programId = new PublicKey(idl.address);

interface AttestationEvent {
  type: 'attestation';
  workflow: string;
  stepIndex: number;
  stepKind: string;
  outcome: string;
  executedBy: string;
  timestamp: number;
}

// SSE clients keyed by the workflow pubkey (base58) they're watching.
const clientsByWorkflow = new Map<string, Set<ServerResponse>>();

function broadcast(event: AttestationEvent): void {
  const subscribers = clientsByWorkflow.get(event.workflow);
  if (!subscribers) return;
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of subscribers) res.write(payload);
}

function decodeAttestationAccount(keyedInfo: KeyedAccountInfo): AttestationEvent | null {
  try {
    const decoded = program.coder.accounts.decode('attestation', keyedInfo.accountInfo.data);
    return {
      type: 'attestation',
      workflow: (decoded.workflow as PublicKey).toBase58(),
      stepIndex: decoded.stepIndex as number,
      stepKind: Object.keys(decoded.stepKind as object)[0] ?? 'unknown',
      outcome: Object.keys(decoded.outcome as object)[0] ?? 'unknown',
      executedBy: (decoded.executedBy as PublicKey).toBase58(),
      timestamp: Number(decoded.timestamp),
    };
  } catch {
    return null; // not an Attestation account (e.g. Counter/WorkflowInstance/Ledger) — ignore
  }
}

const attestationMemcmp = (
  program.coder.accounts as unknown as { memcmp: (name: string) => { offset: number; bytes: string } }
).memcmp('attestation');

connection.onProgramAccountChange(
  programId,
  (keyedInfo) => {
    const event = decodeAttestationAccount(keyedInfo);
    if (event) broadcast(event);
  },
  { commitment: 'confirmed', filters: [{ memcmp: attestationMemcmp }] },
);

// Basic per-IP rate limit for the write endpoint below — same pattern as agent/src/server.ts's
// /trigger limiter, tightened since each accepted request is a real, real-cost devnet deploy.
const DEPLOY_RATE_LIMIT_WINDOW_MS = 60_000;
const DEPLOY_RATE_LIMIT_MAX_REQUESTS = 5;
const deployRequestTimestamps = new Map<string, number[]>();

function isDeployRateLimited(ip: string): boolean {
  const now = Date.now();
  const timestamps = (deployRequestTimestamps.get(ip) ?? []).filter(
    (t) => now - t < DEPLOY_RATE_LIMIT_WINDOW_MS,
  );
  timestamps.push(now);
  deployRequestTimestamps.set(ip, timestamps);
  return timestamps.length > DEPLOY_RATE_LIMIT_MAX_REQUESTS;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const CORS_HEADERS = {
  'access-control-allow-origin': process.env.DASHBOARD_CORS_ORIGIN ?? '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'Content-Type, Authorization',
};

async function fetchWorkflowSnapshot(workflowPubkey: PublicKey) {
  const workflow = await program.account.workflowInstance.fetch(workflowPubkey);
  const [ledgerPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('ledger'), workflowPubkey.toBuffer()],
    programId,
  );
  const ledger = await program.account.ledger.fetch(ledgerPda);
  return {
    workflow: {
      owner: workflow.owner.toBase58(),
      workflowType: Object.keys(workflow.workflowType as object)[0],
      status: Object.keys(workflow.status as object)[0],
      currentStep: workflow.currentStep,
      spendCap: workflow.spendCap.toString(),
    },
    ledger: {
      entries: ledger.entries.map((e: Record<string, unknown>) => ({
        stepIndex: e.stepIndex,
        stepKind: Object.keys(e.stepKind as object)[0],
        outcome: Object.keys(e.outcome as object)[0],
        timestamp: Number(e.timestamp),
      })),
    },
  };
}

const server = createServer((req, res) => {
  for (const [key, value] of Object.entries(CORS_HEADERS)) res.setHeader(key, value);

  if (req.method === 'OPTIONS') {
    res.writeHead(204).end();
    return;
  }

  void (async () => {
    const url = new URL(req.url ?? '', `http://localhost:${PORT}`);

    // Real devnet deploy, gated behind a bearer secret + rate limit — see the module doc comment.
    // Compiles `instruction` with @ashlar/compiler and walks it through all five real on-chain
    // gates via scripts/lib/deployWorkflow.ts (the same code scripts/devnet/deploy-workflow.ts
    // uses). Responds 202 with the workflow PDA as soon as it exists (after step 1/5) — the
    // remaining steps continue in the background and the browser watches them land live via the
    // existing /events SSE stream, exactly like watching any other workflow.
    if (req.method === 'POST' && url.pathname === '/deploy') {
      const clientIp = req.socket.remoteAddress ?? 'unknown';
      if (isDeployRateLimited(clientIp)) {
        res.writeHead(429).end('too many requests');
        return;
      }

      const secret = process.env.DASHBOARD_DEPLOY_SECRET;
      if (!secret) {
        res.writeHead(500).end('DASHBOARD_DEPLOY_SECRET is not configured');
        return;
      }
      if (req.headers.authorization !== `Bearer ${secret}`) {
        res.writeHead(401).end('unauthorized');
        return;
      }

      let body: { instruction?: string };
      try {
        body = JSON.parse(await readBody(req)) as typeof body;
      } catch {
        res.writeHead(400).end('invalid JSON body');
        return;
      }
      if (!body.instruction || !body.instruction.trim()) {
        res.writeHead(400).end('instruction is required');
        return;
      }

      let responded = false;
      deployWorkflowFromInstruction(body.instruction, {
        log: (message) => console.log('[dashboard-server/deploy]', message),
        onInitialized: (workflowPda) => {
          responded = true;
          res
            .writeHead(202, { 'content-type': 'application/json' })
            .end(JSON.stringify({ workflowPda }));
        },
      }).catch((err: unknown) => {
        console.error('[dashboard-server/deploy] failed:', err);
        if (!responded) {
          res
            .writeHead(500, { 'content-type': 'application/json' })
            .end(JSON.stringify({ error: (err as Error).message }));
        }
      });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/events') {
      const workflowParam = url.searchParams.get('workflow');
      if (!workflowParam) {
        res.writeHead(400).end('missing ?workflow=<pubkey>');
        return;
      }
      res.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      });
      res.write(': connected\n\n');

      let subscribers = clientsByWorkflow.get(workflowParam);
      if (!subscribers) {
        subscribers = new Set();
        clientsByWorkflow.set(workflowParam, subscribers);
      }
      subscribers.add(res);
      req.on('close', () => {
        subscribers?.delete(res);
        if (subscribers?.size === 0) clientsByWorkflow.delete(workflowParam);
      });
      return;
    }

    const workflowMatch = /^\/workflow\/([A-Za-z0-9]+)$/.exec(url.pathname);
    if (req.method === 'GET' && workflowMatch) {
      try {
        const snapshot = await fetchWorkflowSnapshot(new PublicKey(workflowMatch[1]!));
        res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(snapshot));
      } catch (err) {
        res.writeHead(404, { 'content-type': 'application/json' }).end(
          JSON.stringify({ error: (err as Error).message }),
        );
      }
      return;
    }

    res.writeHead(404).end('not found');
  })().catch((err: unknown) => {
    console.error('[dashboard-server] error:', err);
    res.writeHead(500).end('internal error');
  });
});

server.listen(PORT, () => {
  console.log(`[dashboard-server] listening on http://localhost:${PORT}`);
  console.log(`[dashboard-server] GET  /events?workflow=<pubkey>  (SSE live feed)`);
  console.log(`[dashboard-server] GET  /workflow/<pubkey>         (initial snapshot)`);
  console.log(
    `[dashboard-server] POST /deploy                    (real devnet deploy — ` +
      `${process.env.DASHBOARD_DEPLOY_SECRET ? 'enabled' : 'disabled, set DASHBOARD_DEPLOY_SECRET to enable'})`,
  );
});
