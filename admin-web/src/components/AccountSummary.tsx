'use client';

import Icon from './Icon';
import { useAdminUser } from './AppShell';

/**
 * Signed-in account summary. Must be rendered as a child of <AppShell> so the
 * admin user context is in scope.
 */
export default function AccountSummary() {
  const { user } = useAdminUser();

  const rows = [
    { label: 'Email', value: user.email },
    { label: 'Role', value: 'Administrator' },
    {
      label: 'User ID',
      value: user.id,
      mono: true,
    },
  ];

  return (
    <div className="card">
      <div className="card__header">
        <div className="card__titles">
          <h2 className="card__title">Signed-in account</h2>
          <p className="card__subtitle">Supabase identity backing this session</p>
        </div>
        <div className="card__actions">
          <span className="badge badge--violet">
            <span className="badge__dot" aria-hidden="true" />
            Administrator
          </span>
        </div>
      </div>
      <div className="card__body">
        <div className="detail-list">
          {rows.map((row) => (
            <div key={row.label} className="detail-list__item">
              <span className="detail-list__label">{row.label}</span>
              <span
                className="detail-list__value"
                style={row.mono ? { fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' } : undefined}
              >
                {row.mono ? `${row.value.slice(0, 18)}…` : row.value}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function SessionBadge() {
  const { user } = useAdminUser();
  return (
    <span className="badge badge--success" title={user.email}>
      <Icon name="shield-check" size={12} />
      Session active
    </span>
  );
}
