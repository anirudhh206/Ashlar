/**
 * Pluggable Compliance & Oracle Registry — the roadmap's "genuinely pluggable" Phase 5 piece.
 * Two narrow interfaces, each with one concrete implementation wrapping existing Phase 2/5 data
 * sources. Swapping a provider (e.g. a real invoicing/compliance API, or an on-chain Pyth CPI
 * instead of Hermes) means changing the factory's return value, not any call site.
 */
import { getMockInvoice, type MockInvoice } from '../../agent/src/mockInvoices.js';
import { getUsdcUsdPrice, type UsdcUsdPrice } from './pythClient.js';

export interface ComplianceProvider {
  checkInvoice(invoiceId: number): Promise<{ compliant: boolean; invoice?: MockInvoice }>;
}

export interface OracleProvider {
  getPrice(pair: 'USDC/USD'): Promise<UsdcUsdPrice>;
}

class MockInvoiceComplianceProvider implements ComplianceProvider {
  async checkInvoice(invoiceId: number): Promise<{ compliant: boolean; invoice?: MockInvoice }> {
    const invoice = getMockInvoice(invoiceId);
    if (!invoice) return { compliant: false };
    return { compliant: invoice.status === 'approved', invoice };
  }
}

class PythOracleProvider implements OracleProvider {
  async getPrice(pair: 'USDC/USD'): Promise<UsdcUsdPrice> {
    if (pair !== 'USDC/USD') throw new Error(`Unsupported price pair: ${pair}`);
    return getUsdcUsdPrice();
  }
}

export function getComplianceProvider(): ComplianceProvider {
  return new MockInvoiceComplianceProvider();
}

export function getOracleProvider(): OracleProvider {
  return new PythOracleProvider();
}
