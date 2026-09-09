import { useCallback, useEffect, useMemo, useState } from 'react';

import { api, type Monitor, type User } from './api';

type Session = {
  token: string;
  user: User;
};

const SESSION_KEY = 'pulse-check-session';

function readSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

function formatInterval(seconds: number) {
  return seconds < 60 ? `${seconds}s` : `${seconds / 60} min`;
}

function timeAgo(value?: string | null) {
  if (!value) return 'Not checked yet';
  const seconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

export default function App() {
  const [session, setSession] = useState<Session | null>(() => readSession());
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string>('');

  const signOut = useCallback(() => {
    localStorage.removeItem(SESSION_KEY);
    setSession(null);
    setMonitors([]);
  }, []);

  const refresh = useCallback(async () => {
    if (!session) return;
    try {
      const data = await api.listMonitors(session.token);
      setMonitors(data);
    } catch (error) {
      if (error instanceof Error && /401|token/i.test(error.message)) signOut();
      else setNotice(error instanceof Error ? error.message : 'Could not load monitors');
    }
  }, [session, signOut]);

  useEffect(() => {
    if (!session) return;
    void refresh();
    const timer = window.setInterval(() => void refresh(), 10_000);
    return () => window.clearInterval(timer);
  }, [session, refresh]);

  if (!session) {
    return (
      <AuthScreen
        onAuthenticated={(next) => {
          localStorage.setItem(SESSION_KEY, JSON.stringify(next));
          setSession(next);
        }}
      />
    );
  }

  const up = monitors.filter((monitor) => monitor.state === 'UP').length;
  const down = monitors.filter((monitor) => monitor.state === 'DOWN').length;
  const unknown = monitors.length - up - down;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="logo-mark">
            <i />
          </span>
          <span>Pulse Check</span>
        </div>

        <nav>
          <button className="nav-item active">
            <span>⌁</span> Overview
          </button>
          <button
            className="nav-item"
            onClick={() => document.getElementById('monitors')?.scrollIntoView()}
          >
            <span>◉</span> Monitors
          </button>
          <button
            className="nav-item"
            onClick={() => document.getElementById('status-page')?.scrollIntoView()}
          >
            <span>↗</span> Status page
          </button>
        </nav>

        <div className="sidebar-bottom">
          <div className="mini-user">
            <div className="avatar">{session.user.email.slice(0, 1).toUpperCase()}</div>
            <div>
              <strong>{session.user.email.split('@')[0]}</strong>
              <small>{session.user.email}</small>
            </div>
          </div>
          <button className="ghost-button full" onClick={signOut}>
            Sign out
          </button>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <p className="eyebrow">SYSTEM OVERVIEW</p>
            <h1>Good to see you.</h1>
            <p className="muted">Your services, checks, and incidents in one place.</p>
          </div>
          <div className="top-actions">
            <button className="ghost-button" onClick={() => void refresh()}>
              ↻ Refresh
            </button>
            <button
              className="primary-button"
              onClick={() => document.getElementById('new-monitor')?.scrollIntoView()}
            >
              + New monitor
            </button>
          </div>
        </header>

        {notice && (
          <div className="notice">
            <span>{notice}</span>
            <button onClick={() => setNotice('')}>×</button>
          </div>
        )}

        <section className="stats-grid">
          <StatCard
            label="Total monitors"
            value={monitors.length}
            detail="Configured endpoints"
            icon="◉"
          />
          <StatCard
            label="Operational"
            value={up}
            detail={
              monitors.length
                ? `${Math.round((up / monitors.length) * 100)}% healthy`
                : 'No checks yet'
            }
            icon="✓"
            tone="good"
          />
          <StatCard
            label="Down"
            value={down}
            detail={down ? 'Needs attention' : 'No active outages'}
            icon="!"
            tone={down ? 'bad' : 'good'}
          />
          <StatCard label="Pending" value={unknown} detail="Waiting for first check" icon="⋯" />
        </section>

        <section className="content-grid" id="monitors">
          <div className="panel monitors-panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">MONITORS</p>
                <h2>Service health</h2>
              </div>
              <span className="live-pill">
                <i /> live
              </span>
            </div>

            {monitors.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">⌁</div>
                <h3>No monitors yet</h3>
                <p>Add your first endpoint and Pulse Check will start watching it automatically.</p>
              </div>
            ) : (
              <div className="monitor-list">
                {monitors.map((monitor) => (
                  <article className="monitor-row" key={monitor.id}>
                    <div className={`status-dot ${monitor.state.toLowerCase()}`} />
                    <div className="monitor-main">
                      <div className="monitor-title">
                        <strong>{monitor.name}</strong>
                        <span className={`state-badge ${monitor.state.toLowerCase()}`}>
                          {monitor.state}
                        </span>
                      </div>
                      <a href={monitor.url} target="_blank" rel="noreferrer">
                        {monitor.url}
                      </a>
                    </div>
                    <div className="monitor-meta">
                      <span>Every {formatInterval(monitor.intervalSeconds)}</span>
                      <small>{timeAgo(monitor.lastCheckedAt)}</small>
                    </div>
                    <button
                      className="icon-button danger"
                      title="Delete monitor"
                      onClick={async () => {
                        if (!confirm(`Delete “${monitor.name}”? `)) return;
                        try {
                          await api.deleteMonitor(session.token, monitor.id);
                          await refresh();
                        } catch (error) {
                          setNotice(
                            error instanceof Error ? error.message : 'Could not delete monitor',
                          );
                        }
                      }}
                    >
                      ×
                    </button>
                  </article>
                ))}
              </div>
            )}
          </div>

          <div className="right-column">
            <NewMonitorCard
              id="new-monitor"
              busy={loading}
              onSubmit={async (input) => {
                setLoading(true);
                try {
                  await api.createMonitor(session.token, input);
                  setNotice('Monitor created. The worker will check it shortly.');
                  await refresh();
                } catch (error) {
                  setNotice(error instanceof Error ? error.message : 'Could not create monitor');
                } finally {
                  setLoading(false);
                }
              }}
            />

            <StatusPageCard
              id="status-page"
              monitors={monitors}
              token={session.token}
              onNotice={setNotice}
            />
          </div>
        </section>
      </main>
    </div>
  );
}

function AuthScreen({ onAuthenticated }: { onAuthenticated: (session: Session) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('register');
  const [email, setEmail] = useState('demo@example.com');
  const [password, setPassword] = useState('password123');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  return (
    <main className="auth-layout">
      <section className="auth-brand-panel">
        <div className="brand hero-brand">
          <span className="logo-mark">
            <i />
          </span>
          <span>Pulse Check</span>
        </div>
        <div className="auth-copy">
          <span className="hero-chip">UPTIME, WITHOUT THE NOISE</span>
          <h1>Know when your services miss a beat.</h1>
          <p>
            Simple uptime monitoring with clean status pages and alerts when something actually
            changes.
          </p>
          <div className="signal-card">
            <div className="signal-line">
              <span>api.example.com</span>
              <strong>99.99%</strong>
            </div>
            <div className="pulse-track">
              <i />
              <i />
              <i />
              <i />
              <i />
              <i />
              <i />
              <i />
            </div>
            <small>All systems operational · 42 ms</small>
          </div>
        </div>
        <p className="auth-footer">
          Built for small teams that want signal, not dashboards full of noise.
        </p>
      </section>

      <section className="auth-form-panel">
        <div className="auth-card">
          <p className="eyebrow">{mode === 'register' ? 'GET STARTED' : 'WELCOME BACK'}</p>
          <h2>{mode === 'register' ? 'Create your workspace' : 'Sign in to Pulse Check'}</h2>
          <p className="muted">
            {mode === 'register'
              ? 'Start monitoring your first endpoint in a minute.'
              : 'Continue to your monitoring dashboard.'}
          </p>

          <form
            onSubmit={async (event) => {
              event.preventDefault();
              setBusy(true);
              setError('');
              try {
                const response =
                  mode === 'register'
                    ? await api.register(email, password)
                    : await api.login(email, password);
                onAuthenticated({ token: response.accessToken, user: response.user });
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Authentication failed');
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                required
              />
            </label>
            {error && <div className="form-error">{error}</div>}
            <button className="primary-button full large" disabled={busy}>
              {busy ? 'Working…' : mode === 'register' ? 'Create account' : 'Sign in'}
            </button>
          </form>

          <p className="switch-auth">
            {mode === 'register' ? 'Already have an account?' : 'New to Pulse Check?'}
            <button
              onClick={() => {
                setMode(mode === 'register' ? 'login' : 'register');
                setError('');
              }}
            >
              {mode === 'register' ? 'Sign in' : 'Create account'}
            </button>
          </p>
        </div>
      </section>
    </main>
  );
}

function StatCard({
  label,
  value,
  detail,
  icon,
  tone = '',
}: {
  label: string;
  value: number;
  detail: string;
  icon: string;
  tone?: string;
}) {
  return (
    <article className={`stat-card ${tone}`}>
      <div className="stat-icon">{icon}</div>
      <p>{label}</p>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function NewMonitorCard({
  id,
  busy,
  onSubmit,
}: {
  id: string;
  busy: boolean;
  onSubmit: (input: {
    name: string;
    url: string;
    intervalSeconds: 60 | 300 | 600;
    timeoutMs: number;
    expectedStatusCode: number;
    enabled: boolean;
  }) => Promise<void>;
}) {
  const [name, setName] = useState('Example API');
  const [url, setUrl] = useState('https://example.com');
  const [interval, setIntervalValue] = useState<60 | 300 | 600>(60);

  return (
    <section className="panel compact-panel" id={id}>
      <div className="panel-header">
        <div>
          <p className="eyebrow">QUICK ADD</p>
          <h2>New monitor</h2>
        </div>
        <span className="panel-symbol">+</span>
      </div>
      <form
        className="monitor-form"
        onSubmit={async (event) => {
          event.preventDefault();
          await onSubmit({
            name,
            url,
            intervalSeconds: interval,
            timeoutMs: 5000,
            expectedStatusCode: 200,
            enabled: true,
          });
        }}
      >
        <label>
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Production API"
            required
          />
        </label>
        <label>
          URL
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            type="url"
            placeholder="https://api.example.com/health"
            required
          />
        </label>
        <label>
          Check every
          <select
            value={interval}
            onChange={(e) => setIntervalValue(Number(e.target.value) as 60 | 300 | 600)}
          >
            <option value={60}>1 minute</option>
            <option value={300}>5 minutes</option>
            <option value={600}>10 minutes</option>
          </select>
        </label>
        <button className="primary-button full" disabled={busy}>
          {busy ? 'Adding…' : 'Add monitor'}
        </button>
      </form>
    </section>
  );
}

function StatusPageCard({
  id,
  monitors,
  token,
  onNotice,
}: {
  id: string;
  monitors: Monitor[];
  token: string;
  onNotice: (message: string) => void;
}) {
  const defaultSlug = useMemo(() => `status-${Math.random().toString(36).slice(2, 7)}`, []);
  const [name, setName] = useState('Public Status');
  const [slug, setSlug] = useState(defaultSlug);
  const [createdSlug, setCreatedSlug] = useState('');

  return (
    <section className="panel compact-panel" id={id}>
      <div className="panel-header">
        <div>
          <p className="eyebrow">PUBLIC PAGE</p>
          <h2>Status page</h2>
        </div>
        <span className="panel-symbol">↗</span>
      </div>

      {createdSlug ? (
        <div className="status-created">
          <div className="success-orb">✓</div>
          <strong>Status page is live</strong>
          <p>Share this page with anyone who needs service updates.</p>
          <a
            className="primary-button full centered"
            href={`/status/${createdSlug}`}
            target="_blank"
            rel="noreferrer"
          >
            Open /status/{createdSlug}
          </a>
        </div>
      ) : (
        <form
          className="monitor-form"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!monitors.length) {
              onNotice('Add at least one monitor before creating a status page.');
              return;
            }
            try {
              const page = await api.createStatusPage(token, {
                name,
                slug,
                published: true,
                monitorIds: monitors.map((monitor) => monitor.id),
              });
              setCreatedSlug(page.slug);
              onNotice('Public status page created.');
            } catch (error) {
              onNotice(error instanceof Error ? error.message : 'Could not create status page');
            }
          }}
        >
          <label>
            Page name
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label>
            Slug
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
              minLength={3}
              required
            />
          </label>
          <p className="form-hint">
            Includes all {monitors.length} current monitor{monitors.length === 1 ? '' : 's'}.
          </p>
          <button className="ghost-button full" type="submit">
            Create public page
          </button>
        </form>
      )}
    </section>
  );
}
