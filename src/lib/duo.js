/* Duo: the calls behind friends and "I'm here".
 *
 * The database side is migration 043 and the rules are in SOCIAL_SPEC.md. Every
 * function here returns a plain result and never throws on a missing feature,
 * so a build that ships before the migration is run shows nothing instead of
 * breaking. Pure helpers (codes, links, wording) live in src/data/duo.js.
 *
 * The cached friend list is kept under a bento_ key listed in db.js
 * (ACCOUNT_LOCAL_KEYS), so signing out clears it. One account's friends must
 * never show for the next person on the same phone. */
import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { supabase } from './supabase';
import { API_BASE } from './apiBase';
import {
  isMissingFeature, normalizeCode, cleanName, nameProblem, inviteMessage, joinUrl, errorText, redeemText,
} from '../data/duo';

export const DUO_CACHE_KEY = 'bento_duo_friends_v1';

function readCache() {
  try {
    const v = JSON.parse(localStorage.getItem(DUO_CACHE_KEY) || 'null');
    return Array.isArray(v?.friends) ? v : null;
  } catch { return null; }
}
function writeCache(friends) {
  try { localStorage.setItem(DUO_CACHE_KEY, JSON.stringify({ friends, savedAt: Date.now() })); } catch { /* ignore */ }
}

/* { status: 'ok' | 'unavailable' | 'offline', friends, cached } */
export async function getFriends() {
  const { data, error } = await supabase.rpc('duo_friends');
  if (error) {
    if (isMissingFeature(error)) return { status: 'unavailable', friends: [] };
    const cached = readCache();
    return { status: 'offline', friends: cached?.friends ?? [], cached: Boolean(cached) };
  }
  const friends = Array.isArray(data) ? data : [];
  writeCache(friends);
  return { status: 'ok', friends };
}

/* The signed-in person's own Duo settings: { name, socialPush } or null. */
export async function getMyDuo() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from('profiles').select('display_name, push_social_enabled').eq('id', user.id).maybeSingle();
  if (error || !data) return null;
  return { name: data.display_name ?? '', socialPush: data.push_social_enabled === true, email: user.email ?? '' };
}

export async function setDisplayName(name) {
  const problem = nameProblem(name);
  if (problem) return { ok: false, message: problem };
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: errorText('not_signed_in') };
  const { error } = await supabase.from('profiles').update({ display_name: cleanName(name) }).eq('id', user.id);
  return error ? { ok: false, message: errorText(error) } : { ok: true };
}

export async function setSocialPush(on) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false };
  const { error } = await supabase.from('profiles').update({ push_social_enabled: Boolean(on) }).eq('id', user.id);
  return { ok: !error };
}

/* { ok, code, expiresAt } or { ok: false, message } */
export async function createInvite() {
  const { data, error } = await supabase.rpc('duo_create_invite');
  if (error) return { ok: false, message: errorText(error), missing: isMissingFeature(error) };
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.code) return { ok: false, message: errorText('') };
  return { ok: true, code: row.code, expiresAt: row.expires_at };
}

/* { ok, friend: { id, name } } or { ok: false, message } */
export async function redeemInvite(code) {
  const { data, error } = await supabase.rpc('duo_redeem', { p_code: normalizeCode(code) });
  if (error) return { ok: false, message: errorText(error) };
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || row.status !== 'ok') {
    return { ok: false, message: redeemText(row?.status) };
  }
  return { ok: true, friend: { id: row.friend_id, name: row.display_name } };
}

/* Opens the share sheet with the invite. Messages is the first choice on iOS.
 * Returns { ok, how } where how is 'sheet', 'web-share' or 'copied'. */
export async function shareInvite(name, code) {
  const text = inviteMessage(name, code);
  try {
    if (Capacitor.isNativePlatform()) {
      await Share.share({ title: 'Join me on Bento', text, dialogTitle: 'Invite a friend' });
      return { ok: true, how: 'sheet' };
    }
    if (navigator.share) {
      await navigator.share({ title: 'Join me on Bento', text });
      return { ok: true, how: 'web-share' };
    }
    await navigator.clipboard.writeText(text);
    return { ok: true, how: 'copied' };
  } catch (err) {
    // Closing the sheet without sending is a cancel, not a failure.
    if (/cancel|abort/i.test(String(err?.message ?? err?.name ?? ''))) return { ok: false, cancelled: true };
    try { await navigator.clipboard.writeText(text); return { ok: true, how: 'copied' }; } catch { return { ok: false }; }
  }
}

export { joinUrl };

/* "I'm here". Goes through the server route so the friends are told by push in
 * the same step. The route runs the same database function as the user, so the
 * limits and the per-friend switches still apply. Needs a connection: a ping
 * that arrives late says something untrue, so it is never queued.
 * Returns { ok, reached } or { ok: false, message, offline? }. */
export async function pingHere({ hall, meal, friendIds = null }) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return { ok: false, message: errorText('not_signed_in') };
  let res;
  try {
    res = await fetch(`${API_BASE}/api/duo-notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ hall, meal, friends: friendIds }),
    });
  } catch {
    return { ok: false, offline: true, message: 'You need a connection to tell friends where you are.' };
  }
  let body = {};
  try { body = await res.json(); } catch { /* no body */ }
  if (!res.ok) return { ok: false, message: errorText(body?.error ?? '') };
  return { ok: true, reached: body.reached ?? 0, notified: body.notified ?? 0 };
}

export async function clearHere() {
  const { error } = await supabase.rpc('duo_clear_here');
  return { ok: !error };
}

export async function setSharing(friendId, share) {
  const { error } = await supabase.rpc('duo_set_sharing', { p_friend: friendId, p_share: Boolean(share) });
  return { ok: !error };
}

export async function endFriend(friendId) {
  const { error } = await supabase.rpc('duo_end', { p_friend: friendId });
  return { ok: !error };
}

export async function blockFriend(friendId) {
  const { error } = await supabase.rpc('duo_block', { p_friend: friendId });
  return { ok: !error };
}

/* { streak, meToday, friendToday } or null */
export async function getDuoStreak(friendId) {
  const { data, error } = await supabase.rpc('duo_streak', { p_friend: friendId });
  if (error) return null;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return { streak: row.current_streak ?? 0, meToday: row.me_today === true, friendToday: row.friend_today === true };
}
