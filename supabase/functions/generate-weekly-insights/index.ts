// Supabase Edge Function — Weekly Insights Generator
//
// Runs automatically every Monday at 00:05 UTC (5 min after Sunday ends)
// via Deno.cron, and is also callable via HTTP for manual invocation / testing.
//
// For each user who logged meals last week it computes:
//   - Average daily macros (calories / protein / carbs / fat)
//   - Top 5 most-eaten foods by frequency
//   - Best day (day-of-week with highest calorie intake)
//   - Streak count at end of week
//
// Results are upserted into public.weekly_summaries.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, // service role — reads all users
)

// ── Date helpers ──────────────────────────────────────────────────────────────

/** Returns [weekStart, weekEnd) for the ISO week that just completed.
 *  Called on Monday: weekStart = last Monday 00:00 UTC, weekEnd = this Monday 00:00 UTC. */
function lastWeekRange(): { weekStart: Date; weekEnd: Date; weekStartStr: string } {
  const now = new Date()
  const dayOfWeek = now.getUTCDay()              // 0 = Sun, 1 = Mon, …
  const daysSinceMonday = (dayOfWeek + 6) % 7   // Mon = 0, …, Sun = 6
  const thisMonday = new Date(now)
  thisMonday.setUTCDate(now.getUTCDate() - daysSinceMonday)
  thisMonday.setUTCHours(0, 0, 0, 0)

  const weekStart = new Date(thisMonday)
  weekStart.setUTCDate(thisMonday.getUTCDate() - 7)

  return {
    weekStart,
    weekEnd: thisMonday,
    weekStartStr: weekStart.toISOString().split('T')[0],
  }
}

// ── Aggregation ───────────────────────────────────────────────────────────────

interface MealEntry {
  user_id: string
  items: Array<{ name?: string; nutrition?: { calories?: number; protein?: number; carbs?: number; fat?: number } }>
  confirmed_at: string
}

interface WeekSummaryFields {
  avg_calories: number
  avg_protein: number
  avg_carbs: number
  avg_fat: number
  top_foods: Array<{ name: string; count: number }>
  best_day: string | null
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function computeSummary(entries: MealEntry[]): WeekSummaryFields {
  const foodCounts: Record<string, number> = {}
  const dayCalories: Record<string, number> = {}
  const uniqueDays = new Set<string>()

  let totalCal = 0, totalPro = 0, totalCarb = 0, totalFat = 0

  for (const entry of entries) {
    const dateKey = entry.confirmed_at.split('T')[0]
    const dayName = DAYS[new Date(entry.confirmed_at).getUTCDay()]
    uniqueDays.add(dateKey)

    for (const item of entry.items ?? []) {
      const n = item.nutrition ?? {}
      totalCal  += n.calories ?? 0
      totalPro  += n.protein  ?? 0
      totalCarb += n.carbs    ?? 0
      totalFat  += n.fat      ?? 0
      dayCalories[dayName] = (dayCalories[dayName] ?? 0) + (n.calories ?? 0)
      if (item.name) foodCounts[item.name] = (foodCounts[item.name] ?? 0) + 1
    }
  }

  const numDays = uniqueDays.size || 1

  const topFoods = Object.entries(foodCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }))

  const bestDay = Object.entries(dayCalories)
    .sort(([, a], [, b]) => b - a)[0]?.[0] ?? null

  return {
    avg_calories: Math.round(totalCal  / numDays),
    avg_protein:  Math.round(totalPro  / numDays),
    avg_carbs:    Math.round(totalCarb / numDays),
    avg_fat:      Math.round(totalFat  / numDays),
    top_foods:    topFoods,
    best_day:     bestDay,
  }
}

// ── Core logic ────────────────────────────────────────────────────────────────

async function generateInsights(): Promise<{ processed: number; week_start: string }> {
  const { weekStart, weekEnd, weekStartStr } = lastWeekRange()

  // 1. Fetch all meal history entries for last week
  const { data: entries, error: histErr } = await supabase
    .from('meal_history')
    .select('user_id, items, confirmed_at')
    .gte('confirmed_at', weekStart.toISOString())
    .lt('confirmed_at', weekEnd.toISOString())

  if (histErr) throw histErr
  if (!entries?.length) return { processed: 0, week_start: weekStartStr }

  // 2. Fetch streaks for all relevant users in one query
  const userIds = [...new Set(entries.map((e: MealEntry) => e.user_id))]

  const { data: streaks } = await supabase
    .from('streaks')
    .select('user_id, current_streak')
    .in('user_id', userIds)

  const streaksByUser: Record<string, number> = Object.fromEntries(
    (streaks ?? []).map((s: { user_id: string; current_streak: number }) => [s.user_id, s.current_streak])
  )

  // 3. Group meal entries by user and compute summaries
  const byUser: Record<string, MealEntry[]> = {}
  for (const entry of entries as MealEntry[]) {
    ;(byUser[entry.user_id] ??= []).push(entry)
  }

  const summaries = Object.entries(byUser).map(([userId, userEntries]) => ({
    user_id:      userId,
    week_start:   weekStartStr,
    ...computeSummary(userEntries),
    streak_at_end: streaksByUser[userId] ?? 0,
  }))

  // 4. Upsert — idempotent if called more than once for the same week
  const { error: upsertErr } = await supabase
    .from('weekly_summaries')
    .upsert(summaries, { onConflict: 'user_id,week_start' })

  if (upsertErr) throw upsertErr

  return { processed: summaries.length, week_start: weekStartStr }
}

// ── HTTP handler: manual invocation + called by pg_cron every Monday 00:05 UTC ──
Deno.serve(async (_req) => {
  try {
    const result = await generateInsights()
    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('generate-weekly-insights error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
