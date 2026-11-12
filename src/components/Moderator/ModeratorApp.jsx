import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { isFeedModerator, getModFeedItems, modSetPostHidden, modSetReplyHidden } from '../../lib/db';
import { UNIVERSITIES } from '../../data/universities';
import './Moderator.css';

/* bentodining.com/moderator: Campus feed moderation for Bento staff (migration 078).
 *
 * Sign in with a Bento account that is listed in public.feed_moderators. Everyone else gets "no access", and the
 * database refuses them too, so the page itself guards nothing. Remove hides a post or reply for everyone. Restore
 * brings it back and keeps later reports from hiding it again. Keep does the same for something reported but fine. */

const FILTERS = [['reported', 'Reported'], ['removed', 'Removed'], ['all', 'Everything']];
const KINDS = [['', 'Posts and replies'], ['post', 'Posts only'], ['reply', 'Replies only']];

// Reported means at least one report a moderator has not cleared. Hidden items stay in it until someone decides.
const isReported = (it) => it.flag_count > 0 && !it.reviewed_ok;

export default function ModeratorApp() {
  const [session, setSession] = useState(undefined);
  const [access, setAccess] = useState({ session: null, ok: null });

  // Keep this page out of search results.
  useEffect(() => {
    const m = document.createElement('meta');
    m.name = 'robots'; m.content = 'noindex, nofollow';
    document.head.appendChild(m);
    const title = document.title;
    document.title = 'Bento Moderator';
    return () => { m.remove(); document.title = title; };
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s ?? null));
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    let live = true;
    isFeedModerator().then((ok) => { if (live) setAccess({ session, ok }); });
    return () => { live = false; };
  }, [session]);

  const signOut = () => supabase.auth.signOut();

  if (session === undefined || (session && access.session !== session)) {
    return <div className="mod-root mod-center"><p className="mod-muted">Loading…</p></div>;
  }
  if (!session) return <ModLogin />;
  if (!access.ok) {
    return (
      <div className="mod-root mod-center">
        <div className="mod-card mod-login">
          <h1>No access</h1>
          <p className="mod-muted">{session.user?.email} is not a feed moderator.</p>
          <button type="button" className="mod-btn" onClick={signOut}>Sign out</button>
        </div>
      </div>
    );
  }
  return <ModQueue email={session.user?.email} onSignOut={signOut} />;
}

function ModLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError(null);
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (err) setError(err.message ?? 'Sign in failed.');
    setBusy(false);
  };

  return (
    <div className="mod-root mod-center">
      <form className="mod-card mod-login" onSubmit={submit}>
        <h1>Bento Moderator</h1>
        <p className="mod-muted">Sign in with your Bento account.</p>
        <label>Email<input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label>Password<input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
        {error && <p className="mod-error">{error}</p>}
        <button type="submit" className="mod-btn is-primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </div>
  );
}

function ModQueue({ email, onSignOut }) {
  const [uni, setUni] = useState('');
  const [filter, setFilter] = useState('reported');
  const [kind, setKind] = useState('');
  const [search, setSearch] = useState('');
  const [items, setItems] = useState(null);
  const [more, setMore] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);

  const fetchPage = useCallback((before) => getModFeedItems(uni || null, before), [uni]);

  useEffect(() => {
    let live = true;
    fetchPage(null)
      .then((xs) => { if (live) { setItems(xs); setMore(xs.length >= 200); setError(null); } })
      .catch(() => { if (live) setError('Could not load the feed.'); });
    return () => { live = false; };
  }, [fetchPage]);

  const refresh = () => {
    setItems(null);
    fetchPage(null).then((xs) => { setItems(xs); setMore(xs.length >= 200); setError(null); })
      .catch(() => setError('Could not load the feed.'));
  };
  const loadMore = () => {
    const last = items?.[items.length - 1];
    if (!last) return;
    fetchPage(last.created_at).then((xs) => { setItems((cur) => [...cur, ...xs]); setMore(xs.length >= 200); })
      .catch(() => setError('Could not load older items.'));
  };

  const counts = useMemo(() => {
    const xs = items ?? [];
    return { reported: xs.filter(isReported).length, removed: xs.filter((x) => x.is_hidden).length, all: xs.length };
  }, [items]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (items ?? []).filter((it) => (
      (filter === 'all' || (filter === 'removed' ? it.is_hidden : isReported(it)))
      && (!kind || it.kind === kind)
      && (!q || it.content.toLowerCase().includes(q) || (it.post_text ?? '').toLowerCase().includes(q))
    ));
  }, [items, filter, kind, search]);

  const setHidden = async (it, hidden) => {
    if (hidden && !window.confirm(`Remove this ${it.kind} for everyone?`)) return;
    setBusy(it.id); setError(null);
    try {
      if (it.kind === 'post') await modSetPostHidden(it.id, hidden); else await modSetReplyHidden(it.id, hidden);
      setItems((xs) => xs.map((x) => (x.id === it.id ? { ...x, is_hidden: hidden, reviewed_ok: !hidden } : x)));
    } catch {
      setError('That did not go through. Try again.');
    }
    setBusy(null);
  };

  const schoolName = (id) => UNIVERSITIES.find((u) => u.id === id)?.abbreviation ?? id;

  return (
    <div className="mod-root">
      <header className="mod-header">
        <h1>Bento Moderator</h1>
        <div className="mod-who"><span className="mod-muted">{email}</span><button type="button" className="mod-btn" onClick={onSignOut}>Sign out</button></div>
      </header>

      <main className="mod-main">
        <div className="mod-tabs" role="tablist">
          {FILTERS.map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={filter === id} className={filter === id ? 'on' : ''} onClick={() => setFilter(id)}>
              {label}{items && <span className="mod-count">{counts[id]}</span>}
            </button>
          ))}
        </div>

        <div className="mod-filters">
          <select value={uni} onChange={(e) => { setItems(null); setUni(e.target.value); }} aria-label="School">
            <option value="">All schools</option>
            {UNIVERSITIES.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
          <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Type">
            {KINDS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
          <input type="search" placeholder="Search text" value={search} onChange={(e) => setSearch(e.target.value)} />
          <button type="button" className="mod-btn" onClick={refresh}>Refresh</button>
        </div>

        {error && <p className="mod-error">{error}</p>}
        {items === null && !error && <p className="mod-muted">Loading…</p>}
        {items && shown.length === 0 && (
          <p className="mod-empty">{filter === 'reported' && !search && !kind ? 'Nothing reported. All clear.' : 'Nothing matches.'}</p>
        )}

        <ul className="mod-list">
          {shown.map((it) => (
            <li key={it.id} className={`mod-card mod-item${it.is_hidden ? ' is-hidden' : ''}`}>
              <div className="mod-meta">
                <span className={`mod-tag is-${it.kind}`}>{it.kind === 'post' ? 'Post' : 'Reply'}</span>
                <span>{schoolName(it.university)}</span>
                <span className="mod-muted" title={new Date(it.created_at).toLocaleString()}>{formatWhen(it.created_at)}</span>
                {it.flag_count > 0 && <span className="mod-tag is-flags">{it.flag_count} {it.flag_count === 1 ? 'report' : 'reports'}</span>}
                {it.downvotes > 0 && <span className="mod-tag">{it.downvotes} downvotes</span>}
                {it.is_hidden && <span className="mod-tag is-off">Removed</span>}
                {it.reviewed_ok && !it.is_hidden && it.flag_count > 0 && <span className="mod-tag is-ok">Kept</span>}
              </div>
              {it.kind === 'reply' && <p className="mod-parent">Reply to: {it.post_text}</p>}
              <p className="mod-text">{it.content}</p>
              <div className="mod-actions">
                {it.is_hidden ? (
                  <button type="button" className="mod-btn" disabled={busy === it.id} onClick={() => setHidden(it, false)}>Restore</button>
                ) : (
                  <>
                    <button type="button" className="mod-btn is-danger" disabled={busy === it.id} onClick={() => setHidden(it, true)}>Remove</button>
                    {isReported(it) && <button type="button" className="mod-btn" disabled={busy === it.id} onClick={() => setHidden(it, false)}>Keep</button>}
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>

        {items && more && <button type="button" className="mod-btn mod-more" onClick={loadMore}>Load older</button>}
      </main>
    </div>
  );
}

function formatWhen(iso) {
  const d = new Date(iso);
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 60) return `${Math.max(mins, 1)}m ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)}h ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
}
