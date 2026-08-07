# Bento — New School Integration Checklist

Reference document for adding a new university. Work through every section in order.
Each item is independent enough to do in one sitting; do not skip sections even if they seem optional.

---

## 0. Pre-integration research

Before writing any code, answer every question here. Many downstream decisions depend on these answers.

- [ ] What dining management platform does the school use?
  - Known platforms: Nutrislice, FoodPro, Sodexo (sodexomyway), AVI Dish, dineoncampus/Cbord, custom CMS
- [ ] Is the menu endpoint publicly accessible without authentication?
  - Fetch it from a terminal (`curl`) — a 403 or redirect to a login page means blocked
- [ ] Does the endpoint return HTML or JSON?
- [ ] Is there a CORS header (`Access-Control-Allow-Origin`) that allows browser requests?
  - If yes, you can call it directly from the client. If no, you must proxy through Vercel.
- [ ] What are the dining hall names and their URL slugs (or API identifiers)?
- [ ] Does the school label halal items? Kosher? Vegan/vegetarian?
  - Drives school-specific warnings in onboarding and Settings.
- [ ] Does the school have a dedicated kosher dining hall?
  - If yes, set `allItemsKosher: true` on that location in the config.
- [ ] What are the school's typical meal period times (breakfast/lunch/dinner windows)?
- [ ] What is the school's academic calendar? When do menus go offline (summer, winter break)?
- [ ] What item ID prefix will you use to namespace this school's items?
  - Existing: `bh_` = Brandeis, `tu_` = Tufts. Pick a new 2–3 letter prefix. Never reuse one.
- [ ] Has a dining admin contact been established? Do they know Bento exists?

---

## 1. Supabase migrations

Run these migrations in order. Every migration must be applied before any code that depends on it is deployed.

### 1a. `menu_cache` — add university column (run once; already done after Tufts)

```sql
ALTER TABLE menu_cache ADD COLUMN IF NOT EXISTS university text NOT NULL DEFAULT 'brandeis';
ALTER TABLE menu_cache DROP CONSTRAINT IF EXISTS menu_cache_slug_date_key;
ALTER TABLE menu_cache ADD CONSTRAINT menu_cache_university_slug_date_key UNIQUE (university, slug, date);
-- Optional: rename html_content to content if not already done
-- ALTER TABLE menu_cache RENAME COLUMN html_content TO content;
```

### 1b. `suggestions` — add university column (run once; already done after Tufts)

```sql
ALTER TABLE suggestions ADD COLUMN IF NOT EXISTS university text NOT NULL DEFAULT 'brandeis';
CREATE INDEX IF NOT EXISTS suggestions_university_idx ON suggestions (university);
```

Update the `submit_suggestion` RPC to accept and store `p_university text`. Update the RLS policy if it exists.

### 1c. `item_ratings` — add university column (run once; already done after Tufts)

```sql
ALTER TABLE item_ratings ADD COLUMN IF NOT EXISTS university text NOT NULL DEFAULT 'brandeis';
CREATE INDEX IF NOT EXISTS item_ratings_university_idx ON item_ratings (university);
```

Rebuild the `item_rating_aggregates` view to include `university`:

```sql
CREATE OR REPLACE VIEW item_rating_aggregates AS
SELECT
  item_id,
  item_name,
  university,
  AVG(rating)::numeric(4,2)  AS avg_rating,
  COUNT(*)                    AS rating_count
FROM item_ratings
GROUP BY item_id, item_name, university;
```

### 1d. `dining_availability` — add university column (run once; already done after Tufts)

```sql
ALTER TABLE dining_availability ADD COLUMN IF NOT EXISTS university text NOT NULL DEFAULT 'brandeis';
ALTER TABLE dining_availability DROP CONSTRAINT IF EXISTS dining_availability_pkey;
ALTER TABLE dining_availability ADD PRIMARY KEY (date, university);
```

### 1e. New school — no additional migrations needed

After the above four migrations are in place, adding a new school requires no further schema changes. All tables now accept any `university` string.

---

## 2. Vercel API / proxy

File: `api/dining.js` (or a new school-specific file if the upstream format is very different).

- [ ] Add the new school's location slugs to `ALLOWED_SLUGS`
  - Format: prefix slugs with the school ID to prevent collision: `tufts:carmichael-dining`
  - Or use a per-school allowlist map: `{ brandeis: Set([...]), tufts: Set([...]) }`
- [ ] Add routing logic to direct the upstream fetch to the right base URL based on the school param
- [ ] If the upstream returns JSON instead of HTML, store it in `menu_cache` as a JSON string
  - The `content` column (formerly `html_content`) accepts any string
  - Pass a `content_type` flag if you need to distinguish on read (`'html'` | `'json'`)
- [ ] Set `university` when writing to `menu_cache`
- [ ] If the upstream has CORS and you decide to call it directly from the client, skip the proxy but still write a thin Vercel function that populates `menu_cache` on a schedule (so the cache is warm for users)

---

## 3. `src/services/menuFetcher.js`

- [ ] Write `{SCHOOL}_CONFIG`:

```js
export const TUFTS_CONFIG = {           // replace TUFTS with school name
  locations: {
    locationId: {
      id:        'locationId',
      slug:      'upstream-slug',       // used in getDiningUrl and menu_cache
      name:      'Full Location Name',
      shortName: 'Short Name',
      allItemsKosher: false,            // true only for dedicated kosher halls
    },
    // ... more locations
  },
  getDiningUrl(slug, dateStr) {
    return `/api/tufts/${slug}?date=${dateStr}`;   // adjust path to match api/*.js route
  },
  parseLocationPage: schoolParseMenu,   // see parsing section below
};
```

- [ ] Write the parser function `schoolParseMenu(rawContent)`:
  - Input: whatever the upstream returns (HTML string or JSON string)
  - Output: `{ meals: { breakfast: [], lunch: [], dinner: [] }, isOpen: boolean }`
  - Each item in a meals array: `{ id, name, station, meal, nutrition: { calories, protein, carbs, fat, sodium, fiber, sugar }, tags, ingredients, allergens }`
  - `id` must use the school's prefix: `tu_${upstreamId}`
  - `tags` values: `'vegan'`, `'vegetarian'`, `'glutenFree'`, `'dairyFree'`, `'nutFree'`, `'halal'`, `'kosher'`
  - `allergens` values: lower-case strings matching Bento's keys (`'milk'`, `'eggs'`, `'wheat'`, `'soy'`, `'fish'`, `'shellfish'`, `'treeNuts'`, `'peanuts'`, `'sesame'`)

- [ ] Write a station normalizer `schoolParseStation(stationName)`:
  - Maps upstream station strings → Bento standard categories: `'grill'`, `'deli'`, `'salad'`, `'soup'`, `'sides'`, `'beverage'`, `'bakery'`, `'breakfast'`, `'pizza'`, `'entree'`

- [ ] Export `fetchSchoolMenu`:
```js
export const fetchTuftsMenu = (dateStr = null) => fetchDiningMenu(TUFTS_CONFIG, dateStr);
```

- [ ] Add the new config to `getUniversityConfig(universityId)`:
```js
export function getUniversityConfig(universityId) {
  switch (universityId) {
    case 'brandeis': return BRANDEIS_CONFIG;
    case 'tufts':    return TUFTS_CONFIG;
    default:         return BRANDEIS_CONFIG;
  }
}
```

---

## 4. `src/data/universities.js`

- [ ] Add the new school entry with `available: true`:

```js
{
  id:           'tufts',
  name:         'Tufts University',
  abbreviation: 'Tufts',
  location:     'Medford, MA',
  available:    true,
  aliases:      ['tufts', 'jumbos'],
  // School-specific feature flags:
  hasKosher:    false,
  labelHalal:   true,    // does the dining system label halal items?
  itemPrefix:   'tu_',   // matches prefix used in parser
},
```

Adding feature flags here (rather than scattering booleans across components) keeps school-specific behavior in one place.

---

## 5. App routing — university-aware menu fetching

File: wherever `fetchBrandeisMenu` is called (currently `MealPlan.jsx` and any other component that initiates a fetch).

- [ ] Replace direct `fetchBrandeisMenu()` calls with `fetchDiningMenu(getUniversityConfig(profile.university))`
- [ ] Pass `profile.university` down to any component that needs it, or read it from a context/store

---

## 6. localStorage menu cache key

File: `src/lib/db.js` — `getCachedMenu` and `setCachedMenu`.

- [ ] Change the cache key from the bare `'bento_cached_menu'` to `'bento_cached_menu_${university}'`
- [ ] When a user changes their university in Settings, bust the old key so they see fresh data immediately

```js
export function getCachedMenu(university) {
  try {
    const key = `bento_cached_menu_${university}`;
    const cached = JSON.parse(localStorage.getItem(key));
    if (!cached) return null;
    if (cached.date !== localDateStr()) return null;
    if (Date.now() - cached.fetchedAt > CACHE_TTL_MS) return null;
    return cached.menu;
  } catch { return null; }
}

export function setCachedMenu(menu, university) {
  try {
    const key = `bento_cached_menu_${university}`;
    localStorage.setItem(key, JSON.stringify({ date: localDateStr(), fetchedAt: Date.now(), menu }));
  } catch {}
}
```

---

## 7. `src/lib/db.js` — school-aware queries

- [ ] `recordDiningAvailability(anyOpen, university)` — add `university` param, include in upsert
- [ ] `getRatingAggregates(university)` — add `university` filter to the Supabase query
- [ ] `getSuggestions({ orderBy, university })` — add `university` filter
- [ ] `submitSuggestion(content, university)` — pass `university` to the RPC
- [ ] Any other query that operates on school-scoped data: audit every `supabase.from(...)` call and ask whether the result should be filtered by school

---

## 8. Onboarding (`OnboardingWizard.jsx`)

- [ ] Remove the default `university: 'brandeis'` hardcode — or keep it but make it a computed default based on something (geo, referral link, nothing)
- [ ] University step: `UniversityPicker` already reads `UNIVERSITIES` — just setting `available: true` in `universities.js` makes the new school appear
- [ ] Halal warning: make it conditional on the school's `labelHalal` flag:
  ```jsx
  {restrictions.halal && !UNIVERSITIES.find(u => u.id === profile.university)?.labelHalal && (
    <p className="dietary-unlabeled-notice">
      ⚠ {UNIVERSITIES.find(u => u.id === profile.university)?.name} Dining doesn't label halal items — always confirm with dining staff.
    </p>
  )}
  ```
- [ ] Kosher warning: if the school has no kosher option (`!school.hasKosher`), warn the user
- [ ] Swipe/rating onboarding step: `MenuRatingOnboarding` must fetch from the right school. Pass `profile.university` into it so it loads the correct menu for the swipe cards.

---

## 9. Community tab (`CommunityTab.jsx`)

- [ ] Pass `university` as a prop (sourced from user profile)
- [ ] Pass it through to `getSuggestions({ university })` and `submitSuggestion(content, university)`
- [ ] Pass it through to `getRatingAggregates(university)` for the leaderboard
- [ ] CommunityTab is school-specific by design — Tufts students should never see Brandeis suggestions or ratings

---

## 10. Settings (`Settings.jsx`)

- [ ] When university is changed: call `setCachedMenu(null, oldUniversity)` or just remove the key — forces a fresh fetch on next load
- [ ] If switching between schools that have different kosher/halal support, consider prompting the user to review their dietary preferences

---

## 11. Bento Pulse (`pulseDb.js` + `PulseDashboard.jsx`)

- [ ] Verify all `pulseDb.js` queries already filter by `university` parameter — they appear to from the dashboard, but audit every function
- [ ] `getAdminSuggestions(university, ...)` — ensure it passes `university` to the Supabase query now that the `suggestions` table has the column
- [ ] Top-rated leaderboard in Pulse: update to use `item_rating_aggregates` view with `university` filter
- [ ] For a new school's dining admin: create a Supabase user for them, set their university in `pulse_admins` table (or however admin auth is scoped), and give them login credentials

---

## 12. Landing page / marketing

- [ ] Add the new school to the social proof line in `LandingHome.jsx` once the integration is live and has real users (do not add it pre-launch)
- [ ] The `LandingUniversities.jsx` page may reference supported schools — update it
- [ ] If outreach was done with a dining admin, coordinate launch timing with them

---

## 13. Testing checklist

Run through these before considering the integration done.

**API / data**
- [ ] Fetch the menu endpoint for a known date during the academic year — confirm it returns data
- [ ] Fetch for a weekend — confirm breakfast/lunch/dinner still appear or handle gracefully
- [ ] Fetch for a date during summer or a holiday break — confirm the empty-menu state is handled without an error screen
- [ ] Check nutrition values on 3–4 items against the school's own nutrition page — confirm they match

**Parser**
- [ ] At least one item from each meal period (breakfast, lunch, dinner) parses correctly
- [ ] At least one vegan/vegetarian item is tagged correctly
- [ ] At least one allergen (e.g. milk) is present on an item that contains it
- [ ] Item IDs use the correct prefix and are stable across fetches for the same item

**Database**
- [ ] `menu_cache` row is written with the correct `university` value
- [ ] A Brandeis menu fetch does not return Tufts cache entries and vice versa
- [ ] `dining_availability` records both schools independently on the same date

**Onboarding**
- [ ] New user who selects the new school sees their school's dining halls in the app
- [ ] Halal/kosher warnings appear or are suppressed correctly for the new school
- [ ] Swipe onboarding shows the new school's food

**Community**
- [ ] A suggestion submitted by a Tufts user does not appear for a Brandeis user
- [ ] The leaderboard shows only items from the user's own school

**Settings**
- [ ] Changing university clears the menu cache and loads the new school's menu immediately

**Pulse**
- [ ] A Tufts admin logging into Pulse sees only Tufts data
- [ ] Suggestions exported from Pulse are Tufts-only

---

## Quick reference — per-school config values

| School | ID | Item prefix | Platform | Dining halls | Kosher hall | Halal labeled |
|---|---|---|---|---|---|---|
| Brandeis | `brandeis` | `bh_` | Custom CMS (brandeishospitality.com) | Farm Table, Usdan, Kosher Table | Yes | No |
| Tufts | `tufts` | `tu_` | Nutrislice | Carmichael, Dewick-MacPhie | No | TBD |

Add a row for each new school as it is integrated.

---

## Notes on platform-specific quirks

**Brandeis (custom CMS)**
- Returns HTML with embedded nutrition JSON in `<script id="recipe-nutrition-{id}">` tags
- Parser: `brandeisParseLocationPage()` in `menuFetcher.js`
- Proxy required (CORS blocked)

**Nutrislice (Tufts)**
- Returns JSON from a public API — no auth needed
- API URL pattern: `https://{school}.api.nutrislice.com/menu/api/weeks/school/{slug}/menu-type/{type}/{date}/`
- CORS: verify on a case-by-case basis
- Proxy recommended for caching even if CORS allows direct calls

**FoodPro (Harvard, possibly BC)**
- Returns HTML — table-based layout, different from Brandeis
- Publicly accessible, no login
- Would need a new HTML parser

**Sodexo (BU, Bentley)**
- JavaScript-rendered; no clean public API
- Fragile to scrape; not recommended without official access

**AVI Dish (Wellesley)**
- Less documented; research needed before committing
