import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRatings } from '../../context/RatingsContext';
import { getUserProfile, getCampusPosts, getMyVotes, castVote, toggleEmphasize, getReplies, submitReply, flagReply,
  flagSuggestion, submitSuggestion } from '../../lib/db';
import { UNIVERSITIES } from '../../data/universities';
import { COLOR_IDS } from '../../data/mascotColors';
import Mascot from '../Mascot/Mascot';
import PolicyModal from '../Community/PolicyModal';
import { haptics } from '../../lib/haptics';
import { sortPosts, topRated, autoPosts, colorForPost, timeAgo } from './campus.js';
import './loud.css';
import './loud-feed.css';

async function fetchFeed() {
  const profile = await getUserProfile();
  const uni = profile?.university ?? 'brandeis';
  const school = UNIVERSITIES.find((u) => u.id === uni) ?? { id: uni, shortName: 'your school', name: 'your school' };
  const [{ posts, full }, votes] = await Promise.all([getCampusPosts(uni), getMyVotes().catch(() => new Map())]);
  return { school, posts, full, votes };
}

const VIEWS = [['hot', 'Hot'], ['new', 'New'], ['top', 'Top rated']];

/* The Feed tab in the Loud pilot: Campus, the anonymous feed for one school. Posts are the community suggestions, so
 * dining staff still see them as before. With migration 072, posts also take downvotes and anonymous replies. */
export default function LoudFeed() {
  const { aggregates } = useRatings();
  const [school, setSchool] = useState(null);
  const [view, setView] = useState('hot');
  const [posts, setPosts] = useState([]);
  const [full, setFull] = useState(false);
  const [votes, setVotes] = useState(new Map());
  const [loaded, setLoaded] = useState(false);
  const [thread, setThread] = useState(null);
  const [composing, setComposing] = useState(false);
  const [showPolicy, setShowPolicy] = useState(false);
  const [reported, setReported] = useState(new Set());

  const apply = useCallback((r) => {
    setSchool(r.school); setPosts(r.posts); setFull(r.full); setVotes(r.votes); setLoaded(true);
  }, []);
  const load = useCallback(() => fetchFeed().then(apply), [apply]);
  useEffect(() => {
    let live = true;
    fetchFeed().then((r) => { if (live) apply(r); });
    return () => { live = false; };
  }, [apply]);

  const schoolName = school?.shortName ?? school?.name ?? 'your school';
  const sorted = useMemo(() => sortPosts(posts, view), [posts, view]);
  const autos = useMemo(() => (view === 'hot' ? autoPosts(aggregates, schoolName, posts.length) : []), [aggregates, schoolName, posts.length, view]);
  const top = useMemo(() => topRated(aggregates), [aggregates]);

  const vote = async (post, dir) => {
    haptics.light();
    const mine = votes.get(post.id) ?? 0;
    const next = mine === dir ? 0 : dir;
    // Show it at once, then settle on what the server counted.
    const bump = (p) => ({
      ...p,
      emphasize_count: p.emphasize_count - (mine === 1 ? 1 : 0) + (next === 1 ? 1 : 0),
      downvote_count: (p.downvote_count ?? 0) - (mine === -1 ? 1 : 0) + (next === -1 ? 1 : 0),
    });
    setPosts((ps) => ps.map((p) => (p.id === post.id ? bump(p) : p)));
    setVotes((m) => new Map(m).set(post.id, next));
    try {
      if (full) {
        const r = await castVote(post.id, next);
        if (r) setPosts((ps) => ps.map((p) => (p.id === post.id ? { ...p, emphasize_count: r.up_count, downvote_count: r.down_count } : p)));
      } else if (dir === 1) {
        await toggleEmphasize(post.id);
      }
    } catch {
      setPosts((ps) => ps.map((p) => (p.id === post.id ? post : p)));
      setVotes((m) => new Map(m).set(post.id, mine));
    }
  };

  const report = async (post) => {
    setReported((s) => new Set(s).add(post.id));
    try { await flagSuggestion(post.id); } catch { /* the post stays marked reported on this screen */ }
  };

  return (
    <section className="loud loud-feed" aria-label="Feed">
      <span className="loud-glow" style={{ background: 'var(--li)', width: 220, height: 220, right: -40, top: 20 }} />
      <span className="loud-glow" style={{ background: 'var(--pk)', width: 240, height: 240, left: -80, top: 420 }} />

      <div className="lf-top"><span>{schoolName} · Campus</span><span>Anonymous</span></div>
      <h1 className="lf-title">Feed</h1>

      <div className="lf-seg" role="tablist">
        {VIEWS.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={view === id} className={view === id ? 'on' : ''} onClick={() => setView(id)}>{label}</button>
        ))}
      </div>

      {view === 'top' ? (
        <ol className="lf-top-list">
          {top.length === 0 && <p className="lf-empty">Not enough ratings yet. Rate what you eat and the best dishes show up here.</p>}
          {top.map((d, i) => (
            <li key={d.id} className="loud-glass">
              <span className="rank">{i + 1}</span>
              <span className="nm"><b>{d.name}</b>{d.hall ? <small>{d.hall}</small> : null}</span>
              <span className="sc">★ {d.avg.toFixed(1)}<small>{d.count} ratings</small></span>
            </li>
          ))}
        </ol>
      ) : (
        <div className="lf-list">
          {autos.map((a) => (
            <article key={a.id} className="lf-post is-auto">
              <div className="lf-meta"><span className="lf-av is-bento"><Mascot size={22} hop={false} color={null} /></span><b>Bento</b><span className="lf-auto">AUTO</span></div>
              <p>{a.text}</p>
            </article>
          ))}
          {loaded && sorted.length === 0 && (
            <p className="lf-empty">Nothing posted at {schoolName} yet. Be the first: what is good at the hall today?</p>
          )}
          {sorted.map((p) => {
            const mine = votes.get(p.id) ?? 0;
            const net = (p.emphasize_count ?? 0) - (p.downvote_count ?? 0);
            return (
              <article key={p.id} className="lf-post loud-glass">
                <div className="lf-body">
                  <div className="lf-meta">
                    <span className="lf-av"><Mascot size={22} hop={false} color={colorForPost(p.id, COLOR_IDS)} /></span>
                    Anonymous · {timeAgo(p.created_at)}
                  </div>
                  <p>{p.content}</p>
                  <div className="lf-foot">
                    <button type="button" onClick={() => { haptics.light(); setThread(p); }}>
                      {p.reply_count ? `${p.reply_count} ${p.reply_count === 1 ? 'reply' : 'replies'}` : 'Reply'}
                    </button>
                    <button type="button" onClick={() => report(p)} disabled={reported.has(p.id)}>
                      {reported.has(p.id) ? 'Reported' : 'Report'}
                    </button>
                  </div>
                </div>
                <div className="lf-vote">
                  <button type="button" aria-label="Upvote" aria-pressed={mine === 1} className={mine === 1 ? 'up on' : 'up'} onClick={() => vote(p, 1)}>▲</button>
                  <b>{net}</b>
                  {full && <button type="button" aria-label="Downvote" aria-pressed={mine === -1} className={mine === -1 ? 'down on' : 'down'} onClick={() => vote(p, -1)}>▼</button>}
                </div>
              </article>
            );
          })}
        </div>
      )}

      <button type="button" className="lf-fab" onClick={() => setComposing(true)}>+ Post</button>

      {/* Sheets render on the page itself, above the tab bar: the feed's own layer is isolated for the glows. */}
      {composing && createPortal(
        <Compose
          schoolName={schoolName}
          onPolicy={() => setShowPolicy(true)}
          onClose={() => setComposing(false)}
          onPosted={() => { setComposing(false); setView('new'); load(); }}
        />, document.body,
      )}
      {thread && createPortal(<Thread post={thread} enabled={full} onClose={() => { setThread(null); load(); }} />, document.body)}
      {showPolicy && createPortal(<PolicyModal onClose={() => setShowPolicy(false)} />, document.body)}
    </section>
  );
}

function Compose({ schoolName, onPolicy, onClose, onPosted }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const post = async () => {
    setBusy(true); setError(null);
    try { await submitSuggestion(text.trim()); haptics.success(); onPosted(); } catch { setError('That did not post. Check your connection and try again.'); setBusy(false); }
  };
  return (
    <div className="lf-overlay" onClick={onClose}>
      <div className="lf-sheet loud" onClick={(e) => e.stopPropagation()}>
        <i className="lf-grab" />
        <h2>Post to {schoolName}</h2>
        <textarea value={text} maxLength={300} rows={4} autoFocus placeholder="What is good at the hall today?" onChange={(e) => setText(e.target.value)} />
        <div className="lf-sheet-row"><span>Anonymous. Dining staff can read posts.</span><span>{text.length}/300</span></div>
        <button type="button" className="lf-link" onClick={onPolicy}>Community guidelines</button>
        {error && <p className="lf-error">{error}</p>}
        <button type="button" className="loud-primary is-li" disabled={!text.trim() || busy} onClick={post}>{busy ? 'Posting…' : 'Post'}</button>
      </div>
    </div>
  );
}

function Thread({ post, enabled, onClose }) {
  const [replies, setReplies] = useState(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [reported, setReported] = useState(new Set());
  const load = useCallback(() => getReplies(post.id).then(setReplies), [post.id]);
  useEffect(() => {
    let live = true;
    (enabled ? getReplies(post.id) : Promise.resolve([])).then((r) => { if (live) setReplies(r); });
    return () => { live = false; };
  }, [post.id, enabled]);
  const send = async () => {
    setBusy(true);
    try { await submitReply(post.id, text.trim()); haptics.success(); setText(''); await load(); } finally { setBusy(false); }
  };
  return (
    <div className="lf-overlay" onClick={onClose}>
      <div className="lf-sheet loud is-tall" onClick={(e) => e.stopPropagation()}>
        <i className="lf-grab" />
        <p className="lf-op">{post.content}</p>
        <div className="lf-replies">
          {replies === null && <p className="lf-empty">Loading…</p>}
          {!enabled && <p className="lf-empty">Replies are not switched on for this school yet.</p>}
          {enabled && replies?.length === 0 && <p className="lf-empty">No replies yet. Start the thread.</p>}
          {replies?.map((r) => (
            <div key={r.id} className="lf-reply">
              <span className="lf-av"><Mascot size={20} hop={false} color={colorForPost(r.id, COLOR_IDS)} /></span>
              <div><p>{r.content}</p>
                <span className="lf-reply-meta">{timeAgo(r.created_at)} ·{' '}
                  <button type="button" disabled={reported.has(r.id)} onClick={() => { setReported((s) => new Set(s).add(r.id)); flagReply(r.id).catch(() => {}); }}>
                    {reported.has(r.id) ? 'Reported' : 'Report'}
                  </button>
                </span>
              </div>
            </div>
          ))}
        </div>
        {enabled && <div className="lf-reply-box">
          <input value={text} maxLength={200} placeholder="Reply anonymously" onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && text.trim() && !busy) send(); }} />
          <button type="button" disabled={!text.trim() || busy} onClick={send}>Reply</button>
        </div>}
      </div>
    </div>
  );
}
