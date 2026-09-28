import type { BadgeTone } from '../lib/format';

interface StatusBadgeProps {
  status: string | number | null | undefined;
  tone?: BadgeTone;
  label?: string;
  size?: 'sm' | 'md';
  showDot?: boolean;
}

export default function StatusBadge({
  status,
  tone = 'neutral',
  label,
  size = 'sm',
  showDot = true,
}: StatusBadgeProps) {
  const text =
    label ??
    (status === null || status === undefined || status === ''
      ? 'Unknown'
      : String(status).replace(/[_-]+/g, ' '));

  return (
    <span className={`badge badge--${tone}${size === 'md' ? ' badge--lg' : ''}`}>
      {showDot ? <span className="badge__dot" aria-hidden="true" /> : null}
      {text}
    </span>
  );
}
