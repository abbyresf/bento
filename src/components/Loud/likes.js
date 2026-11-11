/* "Foods you like" from the shorter setup. A typed word ("chicken") matches any dish whose name contains it as a whole
 * word, plurals too, so "chicken" finds "Grilled Chicken Breast" but "ham" does not find "Hamburger". A matched dish the
 * student has not rated is treated as rated 4 stars, the same nudge a dish they liked gets. Their own ratings always win. */

export function cleanLike(text) {
  return String(text ?? '').trim().replace(/\s+/g, ' ').slice(0, 40);
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function likedIdsFrom(menu, likes) {
  const words = (likes ?? []).map(cleanLike).filter(Boolean);
  const ids = new Set();
  if (!words.length || !menu?.locations) return ids;
  const patterns = words.map((w) => new RegExp(`\\b${escape(w)}(s|es)?\\b`, 'i'));
  for (const loc of Object.values(menu.locations)) {
    for (const items of Object.values(loc?.meals ?? {})) {
      for (const item of items ?? []) {
        if (item?.id && item?.name && patterns.some((p) => p.test(item.name))) ids.add(item.id);
      }
    }
  }
  return ids;
}

export function withLikes(ratingsById, likedIds) {
  if (!likedIds?.size || !(ratingsById instanceof Map)) return ratingsById;
  const merged = new Map(ratingsById);
  for (const id of likedIds) if (!merged.has(id)) merged.set(id, 4);
  return merged;
}
