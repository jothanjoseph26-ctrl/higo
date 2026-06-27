/** Coerce API values (Prisma Decimal strings, etc.) to a finite number. */
export function toNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function formatRating(value: unknown, fallback = '5.0'): string {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(1) : fallback;
}

export function formatKoboNGN(kobo: unknown): string {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 0,
  }).format(toNumber(kobo) / 100);
}

export function formatPeriod(value: unknown): string {
  if (value == null) return '—';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (value instanceof Date) return value.toLocaleDateString();
  return String(value);
}