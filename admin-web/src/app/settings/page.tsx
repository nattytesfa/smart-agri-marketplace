'use client';

import { useState } from 'react';
import AppShell from '../../components/AppShell';
import PageHeader from '../../components/PageHeader';
import Icon from '../../components/Icon';
import AccountSummary from '../../components/AccountSummary';
import { useToast } from '../../components/Toast';

function envStatus(value: string | undefined): { ok: boolean; label: string } {
  if (!value) return { ok: false, label: 'Not configured' };
  if (value.includes('your-') || value.includes('...')) {
    return { ok: false, label: 'Using placeholder value' };
  }
  return { ok: true, label: 'Configured' };
}

interface SettingRow {
  label: string;
  value: string;
  hint: string;
}

export default function SettingsPage() {
  const { notify } = useToast();
  const [prefs, setPrefs] = useState({
    emailAlerts: true,
    smsAlerts: true,
    weeklyDigest: false,
    compactTables: false,
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const apiBase = process.env.NEXT_PUBLIC_BACKEND_API_BASE_URL;

  const endpoints: SettingRow[] = [
    {
      label: 'Supabase project URL',
      value: supabaseUrl ? supabaseUrl.replace(/https?:\/\//, '').split('.')[0] + '.supabase.co' : '',
      hint: 'Authentication and direct database reads',
    },
    {
      label: 'Supabase anon key',
      value: anonKey ? `${anonKey.slice(0, 8)}…${anonKey.slice(-4)}` : '',
      hint: 'Public key, safe to expose to the browser',
    },
    {
      label: 'Backend API base URL',
      value: apiBase || '',
      hint: 'Admin routes are mounted under /api/admin',
    },
  ];

  return (
    <AppShell title="Settings" subtitle="Environment and notification preferences">
      <PageHeader
        eyebrow="Configuration"
        eyebrowIcon="settings"
        title="Workspace settings"
        description="Read-only view of the environment this console is connected to, plus your local notification preferences."
      />

      <div className="stack">
        <div className="card card--flush">
          <div className="card__header">
            <div className="card__titles">
              <h2 className="card__title">Connected services</h2>
              <p className="card__subtitle">
                Values come from <code>admin-web/.env.local</code>
              </p>
            </div>
          </div>
          <div className="card__body">
            <div className="stack stack--sm">
              {endpoints.map((endpoint) => {
                const status = envStatus(endpoint.value);
                return (
                  <div
                    key={endpoint.label}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--space-4)',
                      padding: 'var(--space-3) var(--space-4)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-md)',
                    }}
                  >
                    <span
                      style={{
                        color: status.ok ? 'var(--brand-text)' : 'var(--amber-700)',
                        display: 'flex',
                      }}
                    >
                      <Icon name={status.ok ? 'check-circle' : 'alert-triangle'} size={18} />
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p
                        style={{
                          fontSize: 'var(--text-base)',
                          fontWeight: 'var(--weight-semibold)',
                          color: 'var(--text-strong)',
                        }}
                      >
                        {endpoint.label}
                      </p>
                      <p className="u-mono u-subtle u-truncate">{endpoint.value || '—'}</p>
                      <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                        {endpoint.hint}
                      </p>
                    </div>
                    <span
                      className={`badge badge--${status.ok ? 'success' : 'warning'}`}
                      style={{ flexShrink: 0 }}
                    >
                      {status.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card__header">
            <div className="card__titles">
              <h2 className="card__title">Notification preferences</h2>
              <p className="card__subtitle">Stored in this browser only</p>
            </div>
          </div>
          <div className="card__body">
            <div className="settings-group">
              <div className="settings-row">
                <div className="settings-row__text">
                  <p className="settings-row__title">Verification requests</p>
                  <p className="settings-row__description">
                    Email me when a new applicant waits on a Fayda ID check.
                  </p>
                </div>
                <div className="settings-row__control">
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={prefs.emailAlerts}
                      onChange={(event) =>
                        setPrefs((current) => ({
                          ...current,
                          emailAlerts: event.target.checked,
                        }))
                      }
                    />
                    <span className="switch__track" />
                    <span className="u-visually-hidden">Toggle verification request alerts</span>
                  </label>
                </div>
              </div>

              <div className="settings-row">
                <div className="settings-row__text">
                  <p className="settings-row__title">Escrow disputes</p>
                  <p className="settings-row__description">
                    Alert me the moment a transaction is flagged as disputed.
                  </p>
                </div>
                <div className="settings-row__control">
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={prefs.smsAlerts}
                      onChange={(event) =>
                        setPrefs((current) => ({
                          ...current,
                          smsAlerts: event.target.checked,
                        }))
                      }
                    />
                    <span className="switch__track" />
                    <span className="u-visually-hidden">Toggle escrow dispute alerts</span>
                  </label>
                </div>
              </div>

              <div className="settings-row">
                <div className="settings-row__text">
                  <p className="settings-row__title">Weekly digest</p>
                  <p className="settings-row__description">
                    A Monday summary of verification, escrow and listing activity.
                  </p>
                </div>
                <div className="settings-row__control">
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={prefs.weeklyDigest}
                      onChange={(event) =>
                        setPrefs((current) => ({
                          ...current,
                          weeklyDigest: event.target.checked,
                        }))
                      }
                    />
                    <span className="switch__track" />
                    <span className="u-visually-hidden">Toggle the weekly digest</span>
                  </label>
                </div>
              </div>

              <div className="settings-row">
                <div className="settings-row__text">
                  <p className="settings-row__title">Compact tables</p>
                  <p className="settings-row__description">
                    Reduce row padding to fit more records on screen.
                  </p>
                </div>
                <div className="settings-row__control">
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={prefs.compactTables}
                      onChange={(event) => {
                        setPrefs((current) => ({
                          ...current,
                          compactTables: event.target.checked,
                        }));
                        notify({
                          tone: 'info',
                          title: event.target.checked ? 'Compact tables on' : 'Compact tables off',
                          message: 'This preference is not yet applied to the data tables.',
                        });
                      }}
                    />
                    <span className="switch__track" />
                    <span className="u-visually-hidden">Toggle compact tables</span>
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>

        <AccountSummary />
      </div>
    </AppShell>
  );
}
