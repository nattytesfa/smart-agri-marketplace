'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';
import Icon from '../../components/Icon';

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Surface the reason the auth guard bounced the user back here. Read from
  // window rather than useSearchParams so the page can still be prerendered.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('reason') === 'forbidden') {
      setNotice('That account does not have administrator access.');
    }
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (loading) return;

    setLoading(true);
    setError('');

    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (signInError) throw signInError;
      if (!data.user) throw new Error('Sign in did not return a user.');

      const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('role')
        .eq('user_id', data.user.id)
        .maybeSingle();

      if (profileError) throw profileError;

      if (profile?.role !== 'admin') {
        await supabase.auth.signOut();
        setError('Access denied. This portal is restricted to administrators.');
        setLoading(false);
        return;
      }

      router.replace('/dashboard');
    } catch (err: any) {
      setError(err?.message || 'Unable to sign in. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="auth">
      <div className="auth__grid grid-pattern" aria-hidden="true" />
      <div className="auth__glow auth__glow--one" aria-hidden="true" />
      <div className="auth__glow auth__glow--two" aria-hidden="true" />

      <div className="auth__panel animate-scale-in">
        <div className="auth__card">
          <div className="auth__head">
            <span className="auth__mark">
              <Icon name="shield-check" size={28} />
            </span>
            <h1 className="auth__title">Welcome back</h1>
            <p className="auth__subtitle">
              Sign in to manage the AgriDirect marketplace.
            </p>
          </div>

          {notice ? (
            <div className="alert alert--warning" style={{ marginBottom: 'var(--space-5)' }}>
              <Icon name="alert-triangle" size={18} className="alert__icon" />
              <div className="alert__content">{notice}</div>
            </div>
          ) : null}

          {error ? (
            <div className="alert alert--danger" style={{ marginBottom: 'var(--space-5)' }}>
              <Icon name="alert-circle" size={18} className="alert__icon" />
              <div className="alert__content" role="alert">
                {error}
              </div>
            </div>
          ) : null}

          <form className="auth__form" onSubmit={handleSubmit} noValidate>
            <div className="field">
              <label className="field__label" htmlFor="email">
                Email address
              </label>
              <div className="input-group">
                <Icon name="mail" size={17} className="input-group__icon" />
                <input
                  id="email"
                  name="email"
                  type="email"
                  className="input"
                  placeholder="admin@agridirect.et"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="username"
                  required
                  disabled={loading}
                />
              </div>
            </div>

            <div className="field">
              <label className="field__label" htmlFor="password">
                Password
              </label>
              <div className="input-group">
                <Icon name="lock" size={17} className="input-group__icon" />
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  className="input"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  required
                  disabled={loading}
                  style={{ paddingRight: '2.75rem' }}
                />
                <button
                  type="button"
                  className="input-group__action"
                  onClick={() => setShowPassword((current) => !current)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  disabled={loading}
                >
                  <Icon name={showPassword ? 'eye-off' : 'eye'} size={17} />
                </button>
              </div>
            </div>

            <button type="submit" className="btn btn--primary btn--lg btn--block" disabled={loading}>
              {loading ? (
                <>
                  <span className="spinner" aria-hidden="true" />
                  Signing in…
                </>
              ) : (
                <>
                  Sign in
                  <Icon name="arrow-left" size={16} style={{ transform: 'rotate(180deg)' }} />
                </>
              )}
            </button>
          </form>

          <p className="auth__foot">
            Authorised administrators only. Access is logged.
          </p>
        </div>
      </div>
    </div>
  );
}
