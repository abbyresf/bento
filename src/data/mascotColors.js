/* Bento's color schemes.
 *
 * A scheme recolors the body, arms and feet, the two food shapes on the face and
 * the dark ink used for the eyes and mouth. The tray stays cream and every
 * accessory is drawn the same in every scheme. `classic` is the navy Bento the app
 * has always had, and it is what a student wears until they unlock the rest.
 *
 * Unlock: claim one buddy quest (duo_claims, migration 045). The unlock is checked
 * in the app. A color is cosmetic, so there is nothing to gain by getting around it.
 *
 * Ids are stored in profiles.mascot_color and must match ^[a-z]{2,16}$. Never rename
 * one: a buddy's phone would draw the classic Bento for an id it did not know. */
export const COLORS = [
  { id: 'classic',   name: 'Classic',   body: '#24384F', ink: '#24384F', a: '#FD8F2A', b: '#77BD3E' },
  { id: 'cherry',    name: 'Cherry',    body: '#D13B34', ink: '#5A1A16', a: '#FFC53D', b: '#8ED081' },
  { id: 'tangerine', name: 'Tangerine', body: '#F47421', ink: '#6B2D08', a: '#FFE08A', b: '#1F6B3A' },
  { id: 'sunny',     name: 'Sunny',     body: '#F4BE1F', ink: '#5A4308', a: '#E8553A', b: '#1F7A4A' },
  { id: 'matcha',    name: 'Matcha',    body: '#5BA645', ink: '#1F4A18', a: '#FFF6E0', b: '#FFD166' },
  { id: 'sky',       name: 'Sky',       body: '#3B8EDB', ink: '#14385E', a: '#FFC53D', b: '#8ED081' },
  { id: 'grape',     name: 'Grape',     body: '#7B55C4', ink: '#33205C', a: '#FFC53D', b: '#8ED8B0' },
  { id: 'bubblegum', name: 'Bubblegum', body: '#F26BA0', ink: '#6B1F3F', a: '#FFE08A', b: '#E6FBF0' },
];

export const COLOR_IDS = COLORS.map((c) => c.id);
export const DEFAULT_COLOR = 'classic';

/* The scheme for an id. Anything unknown, empty or null is classic. */
export function colorFor(id) {
  return COLORS.find((c) => c.id === id) ?? COLORS[0];
}

/* Only a known id may be saved. Classic is stored as null. */
export function cleanColor(id) {
  return COLOR_IDS.includes(id) && id !== DEFAULT_COLOR ? id : null;
}

/* Colors other than classic need one claimed buddy quest. */
export function colorsUnlocked(buddyQuestsClaimed) {
  return Number(buddyQuestsClaimed) >= 1;
}

export function canWear(id, buddyQuestsClaimed) {
  return id === DEFAULT_COLOR || colorsUnlocked(buddyQuestsClaimed);
}

/* WCAG contrast of the two food shapes against the body, so a new scheme cannot make
 * them vanish. The tests hold every scheme to at least 1.8, a low bar on purpose: they
 * are shapes with a cream tray beneath, not text. */
const lin = (c) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
export function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}
export function contrast(h1, h2) {
  const [a, b] = [luminance(h1), luminance(h2)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
}
