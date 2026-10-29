import { supabase } from './supabase';

/* Event gifts (migration 065): a free closet piece for accounts made during a launch event. The server decides who is
 * eligible from the account's own sign-up time, so nothing here can grant a piece. A failed or missing call answers "not
 * eligible" and "no pieces", and nothing breaks: this is a cosmetic extra. */
export const HALLOWEEN = 'halloween26';

/* { eligible, piece }: whether this student may still choose, and the piece they chose if they did. */
export async function getGiftStatus(event = HALLOWEEN) {
  try {
    const { data, error } = await supabase.rpc('gift_status', { p_event: event });
    const row = Array.isArray(data) ? data[0] : data;
    if (error || !row) return { eligible: false, piece: null };
    return { eligible: !!row.eligible, piece: row.piece ?? null };
  } catch { return { eligible: false, piece: null }; }
}

/* 'ok', 'already', 'not_eligible', 'invalid_piece', or 'error' when the call itself failed. */
export async function claimGift(piece, event = HALLOWEEN) {
  try {
    const { data, error } = await supabase.rpc('gift_claim', { p_event: event, p_piece: piece });
    return error || typeof data !== 'string' ? 'error' : data;
  } catch { return 'error'; }
}

/* Every event piece this student owns, as ids. Empty when the call fails. */
export async function getGiftPieces() {
  try {
    const { data, error } = await supabase.rpc('gift_pieces');
    if (error || !Array.isArray(data)) return [];
    return data.map((r) => r.piece).filter((p) => typeof p === 'string');
  } catch { return []; }
}
