/**
 * Trigger server: a single `/trigger` endpoint that both a real Helius webhook and a local
 * scheduler can call to wake the agent. Time-based cadences (the "Friday" recurring template)
 * can't come from Helius (event-driven, not calendar-driven), so this one endpoint serves both
 * trigger styles the roadmap names — see scripts/devnet/scheduled-trigger.ts for the cadence
 * side and the README for registering a real Helius webhook against a tunneled URL.
 */
import { createServer, type IncomingMessage } from 'node:http';
import { driveWorkflow } from './driveWorkflow.js';

const PORT = Number(process.env.AGENT_SERVER_PORT ?? 8787);

// Basic per-IP rate limit — found via a real flood test (scripts/devnet/security-diagnosis.ts's
// webhook-flood scenario) that auth correctly rejects every bad request, but nothing stopped
// volumetric abuse before that point. Sliding window, in-memory, no new dependency — matches
// this file's existing "plain node:http" pattern.
const RATE_LIMIT_WINDOW_MS = 10_000;
const RATE_LIMIT_MAX_REQUESTS = 20;
const requestTimestamps = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const timestamps = (requestTimestamps.get(ip) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  timestamps.push(now);
  requestTimestamps.set(ip, timestamps);
  return timestamps.length > RATE_LIMIT_MAX_REQUESTS;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const server = createServer((req, res) => {
  void (async () => {
    if (req.method !== 'POST' || req.url !== '/trigger') {
      res.writeHead(404).end('not found');
      return;
    }

    const clientIp = req.socket.remoteAddress ?? 'unknown';
    if (isRateLimited(clientIp)) {
      res.writeHead(429).end('too many requests');
      return;
    }

    const secret = process.env.HELIUS_WEBHOOK_SECRET;
    if (!secret) {
      res.writeHead(500).end('HELIUS_WEBHOOK_SECRET is not configured');
      return;
    }
    if (req.headers.authorization !== `Bearer ${secret}`) {
      res.writeHead(401).end('unauthorized');
      return;
    }

    let body: { workflowId?: string | number; invoiceId?: number };
    try {
      body = JSON.parse(await readBody(req)) as typeof body;
    } catch {
      res.writeHead(400).end('invalid JSON body');
      return;
    }

    if (body.workflowId === undefined || body.invoiceId === undefined) {
      res.writeHead(400).end('workflowId and invoiceId are required');
      return;
    }

    res.writeHead(202).end('accepted');

    console.log(`[agent-server] trigger accepted: workflow ${body.workflowId}, invoice ${body.invoiceId}`);
    driveWorkflow(body.workflowId, body.invoiceId).catch((err: unknown) => {
      console.error('[agent-server] driveWorkflow failed:', err);
    });
  })();
});

server.listen(PORT, () => {
  console.log(`[agent-server] listening on http://localhost:${PORT}/trigger`);
});
