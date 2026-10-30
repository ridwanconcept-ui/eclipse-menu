/**
 * Money helpers. Prices are integer minor units (kobo). 1 NGN = 100 kobo.
 */

export const CURRENCY_SYMBOL = '₦';

/** Format kobo into a naira string, e.g. 1500000 -> "₦15,000" and 15050 -> "₦150.50" */
export function formatMoney(kobo: number, opts: { withSymbol?: boolean; compactZeroDecimals?: boolean } = {}): string {
  const { withSymbol = true } = opts;
  if (!Number.isFinite(kobo)) return withSymbol ? `${CURRENCY_SYMBOL}0` : '0';
  const sign = kobo < 0 ? '-' : '';
  const abs = Math.abs(Math.round(kobo));
  const naira = Math.floor(abs / 100);
  const koboPart = abs % 100;
  const nairaStr = naira.toLocaleString('en-NG', { maximumFractionDigits: 0 });
  const decimals = koboPart === 0 ? '' : `.${String(koboPart).padStart(2, '0')}`;
  return `${sign}${withSymbol ? CURRENCY_SYMBOL : ''}${nairaStr}${decimals}`;
}

/** Parse an admin-entered naira string ("15,000", "15000.50", "15000") into kobo. Returns null when invalid. */
export function parseNairaToKobo(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  if (typeof input === 'number') {
    if (!Number.isFinite(input) || input < 0) return null;
    return Math.round(input * 100);
  }
  const cleaned = input.replace(/[₦,\s]/g, '').trim();
  if (cleaned === '') return null;
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 100);
}

/** Kobo -> editable naira input value ("15000" or "150.50") */
export function koboToInput(kobo: number | null | undefined): string {
  if (kobo === null || kobo === undefined) return '';
  const abs = Math.round(kobo);
  const naira = Math.floor(abs / 100);
  const koboPart = abs % 100;
  return koboPart === 0 ? String(naira) : `${naira}.${String(koboPart).padStart(2, '0')}`;
}

export function discountPrice(priceKobo: number, percent: number): number {
  const pct = Math.max(0, Math.min(100, percent));
  return Math.round((priceKobo * (100 - pct)) / 100);
}
