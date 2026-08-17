/**
 * Stand-in for a real invoicing system — the "fake invoice" data Phase 2's own done-when
 * criterion already assumes. Amounts are USD (Phase 5's splitSettlement prices and pays these
 * out in real devnet USDC via live Pyth pricing — see scripts/lib/splitSettlement.ts — so these
 * stay small, realistically fundable figures rather than Phase 2's original mock lamport units).
 *
 * Backed by a real JSON file on disk (treasury/mock-invoices.json), not just an in-memory array —
 * so the dashboard's Agent page can create a new invoice and have it actually persist across
 * server restarts, and mark one settled once its workflow actually completes, without anyone
 * hand-editing this source file.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const STORE_PATH = path.join(REPO_ROOT, 'treasury', 'mock-invoices.json');

export interface MockInvoice {
  id: number;
  amount: number;
  vendor: string;
  status: 'approved' | 'pending';
  /** Set once the workflow that triggered this invoice actually reaches Completed on-chain —
   * see dashboard/server/relay.ts's /agent/trigger handler, which is the only writer of this
   * field. An invoice can be triggered again after settling (nothing stops re-using an id), but
   * the dashboard's picker hides settled invoices by default so a demo doesn't accidentally
   * reuse one. */
  settled?: boolean;
}

const DEFAULT_INVOICES: MockInvoice[] = [
  { id: 1, amount: 5, vendor: 'Acme Corp', status: 'approved' },
  { id: 2, amount: 3, vendor: 'Acme Corp', status: 'approved' },
  { id: 3, amount: 10, vendor: 'Widget Co', status: 'pending' },
];

function loadStore(): MockInvoice[] {
  if (!existsSync(STORE_PATH)) {
    mkdirSync(path.dirname(STORE_PATH), { recursive: true });
    writeFileSync(STORE_PATH, JSON.stringify(DEFAULT_INVOICES, null, 2) + '\n');
    return DEFAULT_INVOICES;
  }
  return JSON.parse(readFileSync(STORE_PATH, 'utf8')) as MockInvoice[];
}

function saveStore(invoices: MockInvoice[]): void {
  writeFileSync(STORE_PATH, JSON.stringify(invoices, null, 2) + '\n');
}

export function getMockInvoice(id: number): MockInvoice | undefined {
  return loadStore().find((invoice) => invoice.id === id);
}

/** Read-only listing, used by the dashboard's live Agent page to let an operator pick a real
 * trigger invoice instead of guessing an id. Returns every invoice, settled or not — the
 * dashboard itself decides whether to hide settled ones. */
export function listMockInvoices(): MockInvoice[] {
  return loadStore();
}

export function createMockInvoice(input: { amount: number; vendor: string; status: 'approved' | 'pending' }): MockInvoice {
  const invoices = loadStore();
  const nextId = invoices.reduce((max, inv) => Math.max(max, inv.id), 0) + 1;
  const invoice: MockInvoice = { id: nextId, amount: input.amount, vendor: input.vendor, status: input.status };
  invoices.push(invoice);
  saveStore(invoices);
  return invoice;
}

/** Called once a workflow triggered against this invoice actually reaches Completed on real
 * chain state — never optimistically, and never for a paused/rejected workflow. */
export function markMockInvoiceSettled(id: number): void {
  const invoices = loadStore();
  const invoice = invoices.find((inv) => inv.id === id);
  if (!invoice) return;
  invoice.settled = true;
  saveStore(invoices);
}
