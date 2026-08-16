/**
 * Stand-in for a real invoicing system — the "fake invoice" data Phase 2's own done-when
 * criterion already assumes. Amounts are USD (Phase 5's splitSettlement prices and pays these
 * out in real devnet USDC via live Pyth pricing — see scripts/lib/splitSettlement.ts — so these
 * stay small, realistically fundable figures rather than Phase 2's original mock lamport units).
 */
export interface MockInvoice {
  id: number;
  amount: number;
  vendor: string;
  status: 'approved' | 'pending';
}

const MOCK_INVOICES: MockInvoice[] = [
  { id: 1, amount: 5, vendor: 'Acme Corp', status: 'approved' },
  { id: 2, amount: 3, vendor: 'Acme Corp', status: 'approved' },
  { id: 3, amount: 10, vendor: 'Widget Co', status: 'pending' },
];

export function getMockInvoice(id: number): MockInvoice | undefined {
  return MOCK_INVOICES.find((invoice) => invoice.id === id);
}

/** Read-only listing, used by the dashboard's live Agent page to let an operator pick a real
 * trigger invoice instead of guessing an id. */
export function listMockInvoices(): MockInvoice[] {
  return MOCK_INVOICES;
}
