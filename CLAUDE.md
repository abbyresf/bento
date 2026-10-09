# Bento — working notes

Read this before touching anything. It is loaded automatically each session, so
it is kept short; the detail lives in the documents named at the bottom.

## What this is

React 19 + Vite 7 PWA for college dining, live at Brandeis and Tufts.
`bentodining.com`. Students see their dining hall's live menu and get a plate
built around their calorie and macro targets, allergies and dietary
restrictions. **Bento Pulse** is the admin dashboard inside Bento, at `/admin`,
sold to university dining teams. A native iOS app is in progress.

Public repo. Nothing secret goes in a commit, a comment or a CI artifact.

## Rules that are not negotiable

**Never `git push` unless the user typed "push" in that same turn.** Each push
needs its own approval. Committing locally is fine.

**Deploy only from a clean worktree**, never from the working directory:

```bash
git worktree add /tmp/bento-deploy <sha> --detach
cd /tmp/bento-deploy && cp -r /path/to/Bento/.vercel . && npm ci && npx vercel --prod --yes
```

Unfinished work in the checkout has shipped to production before. Stage files
by explicit path, never `git add src` or `-A`, and read the whole `git status`
before committing. The bento box streak badges shipped on 8 Oct 2026 (art in
`src/data/badgeArt.js`, built by `scripts/build-badge-art.py`). The untracked
`src/components/Badges/BentoBadge.jsx` is an abandoned first draft and is not
used: never commit it.

**Verify on the live domain after deploying.** Compare the served bundle hash
to the local build. Do not trust the deploy message.

**A stale service worker will lie to you.** When production "looks unchanged"
after a deploy, check with `curl` before believing the browser.

## Writing

Bento copy is spartan, active and direct. Short sentences. "You" and "your".
**No em dashes, no semicolons.** Avoid: exciting, powerful, leverage, utilize,
revolutionize, boost, seamless, cutting-edge, game-changer, just, actually,
really, very.

Never claim what the product cannot do. Pulse knows what students **confirm**,
not what they eat. Dietary filtering reads published labels and cannot speak to
cross-contact. Demo figures are labelled as demo figures.

## How to work here

**Measure, do not assert.** Counting the radii, the font sizes and the contrast
ratios found real bugs that looking could not. Claims like "this is fine" or
"that is probably the cause" should be a command, not a sentence.

**Read the failing code before guessing at it.** Guessing has cost more time in
this repo than any other habit.

**Look at the result.** Measurement misses what only the eye catches: a
single-ground page with white cards on a white section, an overlay covering a
working app. Screenshot it.

**Say what is unverified.** "Built and linted" is not "works". Distinguish them.

**Mid-animation screenshots lie.** Wait for the settle before judging a layout.

## Traps already paid for

- `npm run build` runs a prerender and a CSP hash check. A second inline
  `<script>` in `index.html` fails the build on purpose.
- `capacitor.config.ts` needs `typescript@5`. TS 7 removed the API the loader
  uses, and a `.js` config silently yields "Missing appId" because `require()`
  of ESM returns `{ default }`.
- `server.iosScheme: 'https'` does nothing. WKWebView owns http and https, so
  Capacitor falls back to `capacitor`, and the page origin is
  `capacitor://localhost`. Cross-origin calls must allow that origin or `*`.
- Native uses `HashRouter`; the web keeps `BrowserRouter`. The history API does
  not work against the shell's local scheme.
- Vercel env vars are **Production only**, so preview deploys 503 and cannot
  boot React.
- Vercel checks the filesystem before rewrites, which is why `/` is served by
  `middleware.js` and not a `vercel.json` rewrite.

## Where things are written down

| | |
| --- | --- |
| `IOS_SPEC.md` | iOS scope, build order, sustainability. **Authoritative.** |
| `RELEASING.md` | Tag, then deploy from the tag |
| `RESEARCH_STUDY_PLAN.md` | The food-waste study build spec |
| `SCHOOL_INTEGRATION.md` | Adding a university |
| `IOS_APP_PLAN.md` | Superseded. Research trail only |

The research study: Abigail owns the software, the researchers own the
methodology. Do not raise study design or validity concerns.
