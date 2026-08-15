/**
 * Live USDC/USD pricing via Pyth's Hermes REST price service — public, no API key. Used to
 * convert a workflow's stated USD settlement amount into an exact 6-decimal USDC-devnet token
 * amount at the current rate, rather than assuming a fixed 1:1 peg.
 */
const HERMES_URL = process.env.PYTH_HERMES_URL || 'https://hermes.pyth.network';

// Crypto.USDC/USD — https://hermes.pyth.network/v2/price_feeds?query=USDC&asset_type=crypto
const USDC_USD_FEED_ID = 'eaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a';

interface HermesPriceEntry {
  id: string;
  price: { price: string; conf: string; expo: number; publish_time: number };
}

interface HermesLatestPriceResponse {
  parsed: HermesPriceEntry[];
}

export interface UsdcUsdPrice {
  /** USDC price in USD, e.g. 0.9999 */
  price: number;
  publishTime: number;
}

export async function getUsdcUsdPrice(): Promise<UsdcUsdPrice> {
  const url = `${HERMES_URL}/v2/updates/price/latest?ids[]=${USDC_USD_FEED_ID}&parsed=true&encoding=base64`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Pyth Hermes request failed: ${res.status} ${await res.text()}`);
  }
  const body = (await res.json()) as HermesLatestPriceResponse;
  const entry = body.parsed?.[0];
  if (!entry) throw new Error('Pyth Hermes returned no price entry for USDC/USD');

  const price = Number(entry.price.price) * 10 ** entry.price.expo;
  return { price, publishTime: entry.price.publish_time };
}

/** Converts a USD amount into an exact USDC-devnet atomic amount (6 decimals) at the live rate. */
export function usdToUsdcAtomicUnits(amountUsd: number, usdcUsdPrice: number): bigint {
  const usdcAmount = amountUsd / usdcUsdPrice;
  return BigInt(Math.round(usdcAmount * 1_000_000));
}
