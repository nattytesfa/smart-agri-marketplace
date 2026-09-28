/** Formatting helpers shared across the admin dashboard. */

const CURRENCY = 'ETB';

const numberFormatter = new Intl.NumberFormat('en-US');

const compactFormatter = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

const dateTimeFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

export function formatNumber(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return '-';
  return numberFormatter.format(n);
}

export function formatCompact(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return '-';
  return compactFormatter.format(n);
}

export function formatCurrency(value: unknown, fractionDigits = 2): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return '-';
  return `${n.toLocaleString('en-US', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })} ${CURRENCY}`;
}

export function formatCompactCurrency(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return '-';
  return `${compactFormatter.format(n)} ${CURRENCY}`;
}

export function formatPercent(value: unknown, fractionDigits = 0): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return '-';
  return `${n.toFixed(fractionDigits)}%`;
}

export function formatDate(value: unknown): string {
  if (!value) return '-';
  const d = new Date(value as string);
  if (Number.isNaN(d.getTime())) return '-';
  return dateFormatter.format(d);
}

export function formatDateTime(value: unknown): string {
  if (!value) return '-';
  const d = new Date(value as string);
  if (Number.isNaN(d.getTime())) return '-';
  return dateTimeFormatter.format(d);
}

export function formatRelativeTime(value: unknown): string {
  if (!value) return '-';
  const d = new Date(value as string);
  if (Number.isNaN(d.getTime())) return '-';

  const diffSeconds = Math.round((d.getTime() - Date.now()) / 1000);
  const abs = Math.abs(diffSeconds);

  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 60 * 60 * 24 * 365],
    ['month', 60 * 60 * 24 * 30],
    ['week', 60 * 60 * 24 * 7],
    ['day', 60 * 60 * 24],
    ['hour', 60 * 60],
    ['minute', 60],
  ];

  const rtf = new Intl.RelativeTimeFormat('en-US', { numeric: 'auto' });
  for (const [unit, seconds] of units) {
    if (abs >= seconds) {
      return rtf.format(Math.round(diffSeconds / seconds), unit);
    }
  }
  return 'just now';
}

/** Truncate a UUID-like id for display: "3f2a1b9c-…" */
export function shortId(value: unknown, visible = 8): string {
  if (!value) return '-';
  const str = String(value);
  return str.length <= visible ? str : `${str.slice(0, visible)}…`;
}

/** Initials for an avatar, derived from a phone number or name. */
export function initials(value: unknown): string {
  if (!value) return '?';
  const str = String(value).trim();
  if (!str) return '?';

  const words = str.split(/[\s_-]+/).filter(Boolean);
  if (words.length > 1) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  // Single token (e.g. a phone number) — use the last two digits
  const digits = str.replace(/\D/g, '');
  if (digits.length >= 2) return digits.slice(-2);
  return str.slice(0, 2).toUpperCase();
}

export function titleCase(value: unknown): string {
  if (!value) return '-';
  return String(value)
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Display helper: returns a dash instead of empty/falsy values. */
export function orDash(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  return String(value);
}

export type BadgeTone =
  | 'neutral'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'violet';

const ESCROW_TONES: Record<string, BadgeTone> = {
  locked: 'warning',
  pending: 'neutral',
  disputed: 'danger',
  refunded: 'violet',
  released: 'success',
  failed: 'danger',
};

const LISTING_TONES: Record<string, BadgeTone> = {
  available: 'success',
  sold: 'info',
  reserved: 'warning',
  expired: 'neutral',
  withdrawn: 'neutral',
  deleted: 'danger',
};

const ROLE_TONES: Record<string, BadgeTone> = {
  admin: 'violet',
  farmer: 'success',
  buyer: 'info',
  agent: 'warning',
  field_agent: 'warning',
};

const VERIFICATION_TONES: Record<string, BadgeTone> = {
  verified: 'success',
  approved: 'success',
  pending: 'warning',
  unverified: 'neutral',
  rejected: 'danger',
  inactive: 'neutral',
  active: 'success',
  premium: 'violet',
  basic: 'info',
  free: 'neutral',
};

function lookup(map: Record<string, BadgeTone>, value: unknown): BadgeTone {
  if (!value) return 'neutral';
  return map[String(value).toLowerCase()] ?? 'neutral';
}

export const escrowTone = (value: unknown): BadgeTone => lookup(ESCROW_TONES, value);
export const listingTone = (value: unknown): BadgeTone => lookup(LISTING_TONES, value);
export const roleTone = (value: unknown): BadgeTone => lookup(ROLE_TONES, value);
export const verificationTone = (value: unknown): BadgeTone =>
  lookup(VERIFICATION_TONES, value);
