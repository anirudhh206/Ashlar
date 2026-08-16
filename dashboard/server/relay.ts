/**
 * Live Public Dashboard's backend relay — plain node:http, no server framework (same
 * minimal-deps pattern agent/src/server.ts already established). Holds the Helius API key
 * server-side: subscribes to Attestation account changes via connection.onProgramAccountChange
 * and pushes sanitized events to connected browsers over Server-Sent Events. The browser only
 * ever talks to this relay's own endpoints — it never sees Helius or holds a key.
 *
 * Everything above, plus GET /settlement/<workflowId>, GET /settlements, GET /receipts, GET
 * /workflows, and POST /verify, is genuinely read-only and safe to expose. POST /deploy and POST
 * /resume really do spend real devnet SOL/USDC or resolve a real paused workflow — instead of a
 * bearer secret typed into a browser field, they're gated by a loopback-address check (the
 * request must originate from the same machine this relay runs on). That's the honest boundary
 * for this dashboard's real usage pattern (an operator running it locally); it does NOT make
 * these endpoints safe to expose beyond localhost — doing that would need real session auth,
 * which this project doesn't build.
 *
 * Usage: pnpm dashboard-server
 */
import { Program, AnchorProvider, Wallet } from '@anchor-lang/core';
import { Connection, Keypair, PublicKey, type KeyedAccountInfo } from '@solana/web3.js';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as anchor from '@anchor-lang/core';
import { DEVNET_URL } from '../../scripts/lib/constants.js';
import { deployWorkflowFromInstruction } from '../../scripts/lib/deployWorkflow.js';
import { loadPolicyEngineContext, submitResumeAfterOverride } from '../../scripts/lib/policyEngineClient.js';
import { loadChainClient, verifyWorkflow } from '../../verifier/src/index.js';
import type { Ashlar } from '../../target/types/ashlar.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const IDL_PATH = path.join(REPO_ROOT, 'target', 'idl', 'ashlar.json');
const SETTLEMENTS_DIR = path.join(REPO_ROOT, 'treasury', 'settlements');
const RECEIPT_COLLECTION_PATH = path.join(REPO_ROOT, 'treasury', 'receipt-collection.json');
const PORT = Number(process.env.DASHBOARD_SERVER_PORT ?? 8789);

const receiptCollectionMint: string | null = existsSync(RECEIPT_COLLECTION_PATH)
  ? (JSON.parse(readFileSync(RECEIPT_COLLECTION_PATH, 'utf8')) as { collectionMint: string }).collectionMint
  : null;

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

// SSE clients keyed by the workflow pubkey (base58) they're watching, or '*' for clients that
// opened /events with no ?workflow= param — a global feed of every attestation across the whole
// program (powers Overview's live "Guardrail activity" list).
const WILDCARD = '*';
const clientsByWorkflow = new Map<string, Set<ServerResponse>>();

function broadcast(event: AttestationEvent): void {
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  const perWorkflow = clientsByWorkflow.get(event.workflow);
  if (perWorkflow) for (const res of perWorkflow) res.write(payload);
  const global = clientsByWorkflow.get(WILDCARD);
  if (global) for (const res of global) res.write(payload);
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

// Basic per-IP rate limit for the write endpoints below — same pattern as agent/src/server.ts's
// /trigger limiter, tightened since each accepted request is a real, real-cost devnet action.
// Defense-in-depth alongside the loopback check below, not the primary boundary.
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

// The real auth boundary for /deploy and /resume: a browser can't hold a genuine server-side
// secret, so instead of asking one to be typed into a field, these endpoints only ever accept
// requests whose TCP connection actually originates from this same machine. Handles both IPv4
// and the IPv6-mapped forms Node reports for loopback connections.
function isLoopback(address: string | undefined): boolean {
  if (!address) return false;
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
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

interface DasAssetItem {
  id: string;
  content?: {
    json_uri?: string;
    metadata?: {
      name?: string;
      description?: string;
      attributes?: { trait_type: string; value: string }[];
    };
  };
}

// Real compressed-NFT receipts, queried live from Helius's DAS index (getAssetsByGroup on the
// "Ashlar Receipts" collection minted by scripts/lib/receiptClient.ts) rather than from any local
// record — receipt asset IDs aren't persisted anywhere else today, this collection is the only
// source of truth. Same DEVNET_URL (Helius RPC) already used for everything else in this file;
// DAS methods are plain JSON-RPC over that same endpoint, no new dependency or key needed.
async function fetchReceipts(): Promise<
  { assetId: string; workflowId: string | null; name: string; jsonUri: string | null }[]
> {
  if (!receiptCollectionMint) return [];
  const res = await fetch(DEVNET_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'ashlar-dashboard',
      method: 'getAssetsByGroup',
      params: { groupKey: 'collection', groupValue: receiptCollectionMint, page: 1, limit: 50 },
    }),
  });
  if (!res.ok) throw new Error(`Helius DAS returned ${res.status}`);
  const body = (await res.json()) as { result?: { items: DasAssetItem[] }; error?: { message: string } };
  if (body.error) throw new Error(body.error.message);

  const receipts = (body.result?.items ?? []).map((item) => {
    const attrs = item.content?.metadata?.attributes ?? [];
    const workflowId = attrs.find((a) => a.trait_type === 'workflowId')?.value ?? null;
    return {
      assetId: item.id,
      workflowId,
      name: item.content?.metadata?.name ?? 'Ashlar Receipt',
      jsonUri: item.content?.json_uri ?? null,
    };
  });
  // Most recently minted first — workflow ids are Date.now()-based, so numeric descending order
  // is chronological, same ordering principle as the live attestation feed.
  receipts.sort((a, b) => Number(b.workflowId ?? 0) - Number(a.workflowId ?? 0));
  return receipts;
}

function summarizeWorkflowAccount(publicKey: PublicKey, workflow: Record<string, unknown>) {
  return {
    pda: publicKey.toBase58(),
    workflowId: (workflow.workflowId as anchor.BN).toString(),
    owner: (workflow.owner as PublicKey).toBase58(),
    workflowType: Object.keys(workflow.workflowType as object)[0],
    status: Object.keys(workflow.status as object)[0],
    currentStep: workflow.currentStep as number,
    spendCap: (workflow.spendCap as anchor.BN).toString(),
    pendingAmount: (workflow.pendingAmount as anchor.BN).toString(),
    pendingRecipient: (workflow.pendingRecipient as PublicKey).toBase58(),
  };
}

// Real, every WorkflowInstance account this program has ever created (258 as of this session —
// every phase's testing accumulates here, not a curated demo set). Sorted most-recent-first
// (workflow ids are Date.now()-based) and capped, but `total` always reflects the real full
// count so the UI can say "showing N of TOTAL" honestly rather than hiding the volume.
async function fetchAllWorkflows(limit: number) {
  const accounts = await program.account.workflowInstance.all();
  const summaries = accounts.map((a) => summarizeWorkflowAccount(a.publicKey, a.account as Record<string, unknown>));
  summaries.sort((a, b) => Number(b.workflowId) - Number(a.workflowId));
  return { total: summaries.length, items: summaries.slice(0, limit) };
}

// Real settlement evidence for every workflow that has actually settled — every file
// scripts/lib/splitSettlement.ts has ever written to disk, not a curated subset.
function fetchAllSettlements(): unknown[] {
  if (!existsSync(SETTLEMENTS_DIR)) return [];
  return readdirSync(SETTLEMENTS_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(path.join(SETTLEMENTS_DIR, f), 'utf8')));
}

async function fetchWorkflowSnapshot(workflowPubkey: PublicKey) {
  const workflow = await program.account.workflowInstance.fetch(workflowPubkey);
  const [ledgerPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('ledger'), workflowPubkey.toBuffer()],
    programId,
  );
  const ledger = await program.account.ledger.fetch(ledgerPda);
  return {
    workflow: summarizeWorkflowAccount(workflowPubkey, workflow as unknown as Record<string, unknown>),
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
      if (!isLoopback(clientIp)) {
        res.writeHead(403).end('this endpoint only accepts requests from the same machine');
        return;
      }
      if (isDeployRateLimited(clientIp)) {
        res.writeHead(429).end('too many requests');
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

    // Real owner-signed override resolution for a workflow paused in PendingOverrideApproval —
    // same auth/rate-limit trust boundary as /deploy (approving a spend-cap override is exactly
    // as real and exactly as sensitive as creating a workflow in the first place).
    if (req.method === 'POST' && url.pathname === '/resume') {
      const clientIp = req.socket.remoteAddress ?? 'unknown';
      if (!isLoopback(clientIp)) {
        res.writeHead(403).end('this endpoint only accepts requests from the same machine');
        return;
      }
      if (isDeployRateLimited(clientIp)) {
        res.writeHead(429).end('too many requests');
        return;
      }

      let body: { workflowId?: string; approved?: boolean };
      try {
        body = JSON.parse(await readBody(req)) as typeof body;
      } catch {
        res.writeHead(400).end('invalid JSON body');
        return;
      }
      if (!body.workflowId || typeof body.approved !== 'boolean') {
        res.writeHead(400).end('workflowId and approved are required');
        return;
      }

      try {
        const ctx = await loadPolicyEngineContext();
        const signature = await submitResumeAfterOverride(
          ctx,
          new anchor.BN(body.workflowId),
          body.approved,
        );
        res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ signature }));
      } catch (err) {
        console.error('[dashboard-server/resume] failed:', err);
        res
          .writeHead(500, { 'content-type': 'application/json' })
          .end(JSON.stringify({ error: (err as Error).message }));
      }
      return;
    }

    // Real settlement evidence, read-only — written once to disk by
    // scripts/lib/splitSettlement.ts at the moment a workflow actually settles. A 404 here is a
    // normal, expected state (in-progress or paused workflows have no settlement yet), not a bug.
    const settlementMatch = /^\/settlement\/([0-9]+)$/.exec(url.pathname);
    if (req.method === 'GET' && settlementMatch) {
      const filePath = path.join(SETTLEMENTS_DIR, `${settlementMatch[1]}.json`);
      if (!existsSync(filePath)) {
        res.writeHead(404, { 'content-type': 'application/json' }).end(
          JSON.stringify({ error: 'no settlement recorded for this workflow yet' }),
        );
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' }).end(readFileSync(filePath, 'utf8'));
      return;
    }

    // Real, public, safe info only — deliberately never the RPC URL, which embeds the Helius API
    // key as a query param. The whole point of this relay is that the browser never sees that key.
    if (req.method === 'GET' && url.pathname === '/info') {
      res
        .writeHead(200, { 'content-type': 'application/json' })
        .end(JSON.stringify({ programId: programId.toBase58(), network: 'devnet' }));
      return;
    }

    // Real, every WorkflowInstance account — see fetchAllWorkflows's doc comment.
    if (req.method === 'GET' && url.pathname === '/workflows') {
      const limit = Number(url.searchParams.get('limit') ?? 100);
      try {
        const result = await fetchAllWorkflows(limit);
        res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(result));
      } catch (err) {
        res
          .writeHead(502, { 'content-type': 'application/json' })
          .end(JSON.stringify({ error: (err as Error).message }));
      }
      return;
    }

    // Real settlement evidence for every settled workflow — see fetchAllSettlements's doc comment.
    if (req.method === 'GET' && url.pathname === '/settlements') {
      try {
        res
          .writeHead(200, { 'content-type': 'application/json' })
          .end(JSON.stringify({ settlements: fetchAllSettlements() }));
      } catch (err) {
        res
          .writeHead(500, { 'content-type': 'application/json' })
          .end(JSON.stringify({ error: (err as Error).message }));
      }
      return;
    }

    // Real independent verification, on demand — imports the actual @ashlar/verifier logic
    // (verifier/src/index.ts), which builds its own throwaway-keypair read-only chain client
    // rather than reusing this relay's `program`/`connection` — preserving the verifier's "zero
    // trust in Ashlar's own client code" property even when triggered from this dashboard.
    // Read-only: doesn't change any state or spend anything, so no auth is needed, matching the
    // CLI's own "no login required" framing.
    if (req.method === 'POST' && url.pathname === '/verify') {
      let body: { workflowPda?: string };
      try {
        body = JSON.parse(await readBody(req)) as typeof body;
      } catch {
        res.writeHead(400).end('invalid JSON body');
        return;
      }
      if (!body.workflowPda) {
        res.writeHead(400).end('workflowPda is required');
        return;
      }
      try {
        const client = loadChainClient(DEVNET_URL);
        const report = await verifyWorkflow(client, new PublicKey(body.workflowPda));
        res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(report));
      } catch (err) {
        res
          .writeHead(500, { 'content-type': 'application/json' })
          .end(JSON.stringify({ error: (err as Error).message }));
      }
      return;
    }

    // Real receipts, read-only — see fetchReceipts's doc comment for why this is a live DAS
    // query rather than a local record.
    if (req.method === 'GET' && url.pathname === '/receipts') {
      try {
        const receipts = await fetchReceipts();
        res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ receipts }));
      } catch (err) {
        res
          .writeHead(502, { 'content-type': 'application/json' })
          .end(JSON.stringify({ error: (err as Error).message }));
      }
      return;
    }

    if (req.method === 'GET' && url.pathname === '/events') {
      // No ?workflow= param subscribes to every attestation program-wide (WILDCARD) — used by
      // Overview's live activity feed. A specific pubkey keeps the existing per-workflow feed.
      const workflowParam = url.searchParams.get('workflow') ?? WILDCARD;
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
  console.log(`[dashboard-server] GET  /info                          (public program id, network)`);
  console.log(`[dashboard-server] GET  /events[?workflow=<pubkey>]    (SSE live feed — global if no param)`);
  console.log(`[dashboard-server] GET  /workflow/<pubkey>             (single workflow snapshot)`);
  console.log(`[dashboard-server] GET  /workflows[?limit=N]           (every real WorkflowInstance account)`);
  console.log(`[dashboard-server] GET  /settlement/<workflowId>       (real settlement evidence, if any)`);
  console.log(`[dashboard-server] GET  /settlements                   (every real settlement)`);
  console.log(`[dashboard-server] GET  /receipts                      (real cNFT receipts, live from Helius DAS)`);
  console.log(`[dashboard-server] POST /verify                        (real independent verification, on demand)`);
  console.log(`[dashboard-server] POST /deploy                        (real devnet deploy — localhost only)`);
  console.log(`[dashboard-server] POST /resume                        (real override resolution — localhost only)`);
});
