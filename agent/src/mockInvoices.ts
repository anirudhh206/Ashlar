/**
 * Stand-in for a real invoicing system — the "fake invoice" data Phase 2's own done-when
 * criterion already assumes. Amounts are lamports (Phase 2's mock currency unit).
 */
export interface MockInvoice {
  id: number;
  amount: number;
  vendor: string;
  status: 'approved' | 'pending';
}

const MOCK_INVOICES: MockInvoice[] = [
  { id: 1, amount: 2_000_000, vendor: 'Acme Corp', status: 'approved' },
  { id: 2, amount: 1_500_000, vendor: 'Acme Corp', status: 'approved' },
  { id: 3, amount: 750_000, vendor: 'Widget Co', status: 'pending' },
];

export function getMockInvoice(id: number): MockInvoice | undefined {
  return MOCK_INVOICES.find((invoice) => invoice.id === id);
}
