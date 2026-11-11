/* Campus feed helpers (Loud pilot). Pure, so they run in Node tests. */

/* Hot: net votes, cooled by age, so a post with 20 votes from last week sinks below one with 8 from this morning.
 * The same shape as most link aggregators: score / (hours + 2)^1.5. */
export function hotScore(post, now = Date.now()) {
  const net = (post.emphasize_count ?? 0) - (post.downvote_count ?? 0);
  const hours = Math.max(0, (now - Date.parse(post.created_at)) / 3600000);
  return (net + 1) / Math.pow(hours + 2, 1.5);
}

export function sortPosts(posts, view, now = Date.now()) {
  const list = [...posts];
  if (view === 'new') return list.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  return list.sort((a, b) => hotScore(b, now) - hotScore(a, now));
}

/* Top rated dishes for the school, from the rating aggregates. A dish needs 3 ratings to count, so one 5-star rating
 * cannot top the list. */
export function topRated(aggregates, { min = 3, limit = 10 } = {}) {
  return Object.entries(aggregates ?? {})
    .map(([id, a]) => ({ id, name: a.name, avg: a.avg, count: a.count, hall: a.diningHall ?? null }))
    .filter((d) => d.name && d.count >= min && Number.isFinite(d.avg))
    .sort((a, b) => b.avg - a.avg || b.count - a.count)
    .slice(0, limit);
}

/* Bento's own posts, built from ratings, so the feed is never empty at a new school. They are always signed as Bento
 * with an AUTO tag and never look like a student. At most two, and they thin out as students post: none once there are
 * 15 student posts. */
export function autoPosts(aggregates, schoolName, studentPostCount) {
  if (studentPostCount >= 15) return [];
  const top = topRated(aggregates, { limit: 2 });
  return top.map((d, i) => ({
    id: `auto-${d.id}`,
    auto: true,
    text: i === 0
      ? `${d.name} is the top-rated dish at ${schoolName} this week. ★ ${d.avg.toFixed(1)} from ${d.count} ratings.`
      : `Runner-up: ${d.name}, ★ ${d.avg.toFixed(1)}${d.hall ? ` at ${d.hall}` : ''}.`,
  }));
}

/* A stable Bento color for an anonymous poster, from the post id. Same post, same color, every time. Reveals nothing
 * about who wrote it. */
export function colorForPost(id, colorIds) {
  let h = 0;
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return colorIds[h % colorIds.length];
}

export function timeAgo(iso, now = Date.now()) {
  const m = Math.max(0, Math.round((now - Date.parse(iso)) / 60000));
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}
