import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRatings } from '../../context/RatingsContext';
import { getUserProfile, getCampusPosts, getMyVotes, castVote, toggleEmphasize, getReplies, submitReply, flagReply,
  flagSuggestion, submitSuggestion, getPostsByIds, getMyReposts, toggleRepost, submitQuote } from '../../lib/db';
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
  const [{ posts, full, reposts }, votes, mine] = await Promise.all([
    getCampusPosts(uni), getMyVotes().catch(() => new Map()), getMyReposts().catch(() => new Set()),
  ]);
  // Quotes show the post they quote. Most are in the list already; fetch the rest.
  const have = new Set(posts.map((p) => p.id));
  const missing = [...new Set(posts.map((p) => p.quote_of).filter((id) => id && !have.has(id)))];
  const extra = reposts && missing.length ? await getPostsByIds(missing).catch(() => []) : [];
  const byId = Object.fromEntries([...posts, ...extra].map((p) => [p.id, p]));
  return { school, posts, full, reposts, votes, mine, byId };
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
  const [canRepost, setCanRepost] = useState(false);
  const [reposted, setReposted] = useState(new Set());
  const [byId, setById] = useState({});
  const [repostMenu, setRepostMenu] = useState(null);   // the post whose Repost / Quote menu is open
  const [quoting, setQuoting] = useState(null);         // the post being quoted

  const apply = useCallback((r) => {
    setSchool(r.school); setPosts(r.posts); setFull(r.full); setVotes(r.votes); setLoaded(true);
    setCanRepost(r.reposts); setReposted(r.mine); setById(r.byId);
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

  const repost = async (post) => {
    setRepostMenu(null);
    const was = reposted.has(post.id);
    haptics.medium();
    setReposted((s) => { const n = new Set(s); if (was) n.delete(post.id); else n.add(post.id); return n; });
    setPosts((ps) => ps.map((p) => (p.id === post.id ? { ...p, repost_count: Math.max(0, (p.repost_count ?? 0) + (was ? -1 : 1)) } : p)));
    try {
      const r = await toggleRepost(post.id);
      if (r) setPosts((ps) => ps.map((p) => (p.id === post.id ? { ...p, repost_count: r.repost_count } : p)));
    } catch {
      setReposted((s) => { const n = new Set(s); if (was) n.add(post.id); else n.delete(post.id); return n; });
      setPosts((ps) => ps.map((p) => (p.id === post.id ? post : p)));
    }
  };

  const report = async (post) => {
    haptics.light();
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
                  {p.quote_of && byId[p.quote_of] && <QuotedPost post={byId[p.quote_of]} />}
                  <div className="lf-foot">
                    <button type="button" className="lf-icon" aria-label={`Comments, ${p.reply_count ?? 0}`} onClick={() => { haptics.light(); setThread(p); }}>
                      <CommentIcon /><span>{p.reply_count || ''}</span>
                    </button>
                    {canRepost && (
                      <button type="button" className={`lf-icon${reposted.has(p.id) ? ' is-reposted' : ''}`} aria-label={`Repost, ${p.repost_count ?? 0}`}
                        aria-pressed={reposted.has(p.id)} onClick={() => { haptics.light(); setRepostMenu(p); }}>
                        <RepostIcon /><span>{p.repost_count || ''}</span>
                      </button>
                    )}
                    <button type="button" className={`lf-icon lf-flag${reported.has(p.id) ? ' is-flagged' : ''}`} aria-label={reported.has(p.id) ? 'Reported' : 'Report'}
                      onClick={() => report(p)} disabled={reported.has(p.id)}>
                      <FlagIcon />
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
      {repostMenu && createPortal(
        <div className="lf-overlay" onClick={() => setRepostMenu(null)}>
          <div className="lf-sheet loud lf-menu" onClick={(e) => e.stopPropagation()}>
            <i className="lf-grab" />
            <button type="button" onClick={() => repost(repostMenu)}>
              <RepostIcon /><span><b>{reposted.has(repostMenu.id) ? 'Undo repost' : 'Repost'}</b><small>Boost it on Campus. Nobody sees who reposted.</small></span>
            </button>
            <button type="button" onClick={() => { setQuoting(repostMenu); setRepostMenu(null); }}>
              <QuoteIcon /><span><b>Quote</b><small>Write a new post with this one attached.</small></span>
            </button>
          </div>
        </div>, document.body,
      )}
      {quoting && createPortal(
        <Compose
          schoolName={schoolName}
          quote={quoting}
          onPolicy={() => setShowPolicy(true)}
          onClose={() => setQuoting(null)}
          onPosted={() => { setQuoting(null); setView('new'); load(); }}
        />, document.body,
      )}
      {showPolicy && createPortal(<PolicyModal onClose={() => setShowPolicy(false)} />, document.body)}
    </section>
  );
}

function Compose({ schoolName, quote = null, onPolicy, onClose, onPosted }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const post = async () => {
    setBusy(true); setError(null);
    try {
      if (quote) await submitQuote(quote.id, text.trim()); else await submitSuggestion(text.trim());
      haptics.success(); onPosted();
    } catch { setError('That did not post. Check your connection and try again.'); setBusy(false); }
  };
  return (
    <div className="lf-overlay" onClick={onClose}>
      <div className="lf-sheet loud" onClick={(e) => e.stopPropagation()}>
        <i className="lf-grab" />
        <h2>{quote ? 'Quote post' : `Post to ${schoolName}`}</h2>
        <textarea value={text} maxLength={300} rows={quote ? 3 : 4} autoFocus placeholder={quote ? 'Add your take' : 'What is good at the hall today?'} onChange={(e) => setText(e.target.value)} />
        {quote && <QuotedPost post={quote} />}
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
                <span className="lf-reply-meta">{timeAgo(r.created_at)}
                  <button type="button" className={`lf-icon lf-flag${reported.has(r.id) ? ' is-flagged' : ''}`} aria-label={reported.has(r.id) ? 'Reported' : 'Report'}
                    disabled={reported.has(r.id)} onClick={() => { haptics.light(); setReported((s) => new Set(s).add(r.id)); flagReply(r.id).catch(() => {}); }}>
                    <FlagIcon />
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

/* The post a quote carries, shown small inside it. */
function QuotedPost({ post }) {
  return (
    <div className="lf-quoted">
      <div className="lf-meta">
        <span className="lf-av"><Mascot size={18} hop={false} color={colorForPost(post.id, COLOR_IDS)} /></span>
        Anonymous · {timeAgo(post.created_at)}
      </div>
      <p>{post.content}</p>
    </div>
  );
}

const ICON = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };
function CommentIcon() {
  return <svg {...ICON}><path d="M21 11.5a8.4 8.4 0 0 1-12.3 7.4L3 20.5l1.6-5.4A8.4 8.4 0 1 1 21 11.5z" /></svg>;
}
function RepostIcon() {
  return <svg {...ICON}><path d="M17 2l4 4-4 4" /><path d="M3 11V9a3 3 0 0 1 3-3h15" /><path d="M7 22l-4-4 4-4" /><path d="M21 13v2a3 3 0 0 1-3 3H3" /></svg>;
}
function QuoteIcon() {
  return <svg {...ICON}><path d="M4 20h4l11-11-4-4L4 16z" /><path d="M13.5 6.5l4 4" /></svg>;
}
function FlagIcon() {
  return <svg {...ICON}><path d="M5 22V4" /><path d="M5 4h11l-2 4 2 4H5" /></svg>;
}
