# Releasing

Tag every production deploy. One command, and it makes "how many times have we
shipped?" answerable later instead of unanswerable.

Until v1.0.0 this repo had no tags, no changelog, and a version pinned at
0.0.0. The only record of shipping was Vercel's deployment list, which keeps
roughly the last eighty days, so everything before that was gone.

## Shipping

With a clean working tree, on `main`:

```bash
npm version patch   # or: minor, major
git push --follow-tags
```

`npm version` bumps `package.json`, commits that bump, and creates the matching
`vX.Y.Z` tag. `--follow-tags` pushes the commit and the tag together, so they
cannot get separated.

Then deploy as usual, from a clean worktree at the tagged commit:

```bash
git worktree add /tmp/bento-deploy v1.1.0 --detach
cd /tmp/bento-deploy && cp -r /path/to/Bento/.vercel . && npm ci
npx vercel --prod --yes
```

Deploying from a worktree at the tag, rather than from your working directory,
is what guarantees that unfinished work sitting in your checkout cannot ship.
That has happened here before.

## Which number to bump

- **patch** — fixes, copy, styling. Most ships.
- **minor** — a new capability students or dining staff can see.
- **major** — a break in something people depend on.

Nobody installs Bento as a package, so these are a changelog for you rather
than a contract with anyone. Consistency matters more than picking perfectly.

## Counting releases

```bash
git tag | wc -l                              # how many
git tag --sort=-creatordate | head           # most recent
git log v1.0.0..HEAD --oneline | wc -l       # commits since a release
git for-each-ref --sort=creatordate --format='%(refname:short)  %(creatordate:short)' refs/tags
```

## If `npm version` refuses

It requires a clean tree. Either finish or stash what you have, or tag by hand:

```bash
git tag -a v1.1.0 -m "What shipped"
git push origin v1.1.0
```

## v1.0.0

Backfilled at the commit where tagging was introduced, not at the original
launch. It marks where counting starts; it does not claim to be the first time
Bento shipped. Everything before it is untagged, and Vercel no longer holds the
record, so treat any pre-1.0.0 release count as an estimate you stand behind
personally rather than something the repo can prove.

## Shipping the iOS app

A `vX.Y.Z` tag that matches `package.json` and sits on `main` starts
`.github/workflows/ios-release.yml`. It builds on a macOS runner, signs with the
App Store Connect API key, and uploads to TestFlight. No laptop is involved.

The tag you already push for the web deploy is the same tag. `npm version`
creates it, so the two numbers cannot drift.

- **Version** comes from the tag. **Build number** is the CI run number, so it
  rises on every upload without anyone typing it.
- **A failed upload:** re-run from the Actions tab, or use "Run workflow" on
  `main`. A manual run ships the version in `package.json`.
- **Secrets** (repo Settings, Secrets and variables, Actions): `ASC_KEY_ID`,
  `ASC_ISSUER_ID`, `ASC_KEY_P8` (the whole `.p8` text), `APPLE_TEAM_ID`,
  `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
- **Keep the `.p8` somewhere that is not one laptop.** Apple shows it once. A
  lost key means a new one and an updated secret, nothing worse.
- **App icon:** `ios/AppIcon-source.svg` is the artwork. The shipped PNG is a
  1024px opaque square with no transparency, which App Store Connect requires.
  iOS rounds the corners itself.

## Live updates (iOS without App Review)

The app carries its own copy of the web code (`webDir: 'dist'`), so a Vercel
deploy does not change it. Capgo (`@capgo/capacitor-updater`, set up 25 Nov
2026) lets web-only changes reach installed apps without a store build. The
settings and the reasons for them are in `capacitor.config.ts`.

**What can go live this way:** screens, copy, styles, logic. Anything in `src/`.

**What still needs a store build:** a new or upgraded Capacitor plugin,
Info.plist, entitlements, permissions, the icon, a Capacitor version bump.
Shipping web code that calls a plugin the installed app lacks breaks it, which
is what `--fail-on-incompatible` below is for.

### Status

Set up 25 Nov 2026: app `com.bentodining.app` in the "Bento Dining" Capgo
organization, default channel `production`, first clean bundle 1.4.2. Tested
end to end on the iOS simulator. The free trial ends **10 Dec 2026**: without a
payment method on the Capgo plans page, phones stop receiving updates.

The channel refuses to serve a bundle older than the native build
(`disable_auto_update_under_native`) or a major version jump, so a stale
upload cannot downgrade anyone.

### One-time setup (done, kept for a rebuild)

1. Make an account at capgo.app and copy an API key (Account, API keys).
2. `npx @capgo/cli@latest login <API key>`
3. `npx @capgo/cli@latest app add com.bentodining.app`
4. In the Capgo dashboard, make a channel called `production` and set it as the
   default channel for iOS.
5. Ship one normal store build that contains the plugin (a version tag, see
   "Shipping the iOS app"), and get it through App Review. Live updates only
   reach phones running that build or later.

### Shipping a live update

After the usual `npm version patch`, push and web deploy, from the same clean
worktree at the tag (it needs `.env.local` with the `VITE_SUPABASE_*` values,
because the native build bakes them in):

```bash
npm run build:native
npx @capgo/cli@latest bundle upload --channel production --fail-on-incompatible
```

The bundle takes its version from `package.json`, which `npm version` has just
bumped, so every upload has a new number. Phones download it the next time the
app opens and switch to it the next time the app goes to the background.

If the upload fails as incompatible, the change touched native code: ship a
store build instead.

**Rollback:** if a bundle never draws the app, the plugin puts the phone back
on the last good bundle by itself (`src/lib/liveUpdate.js`). For a bundle that
draws but is wrong, set the previous bundle on the `production` channel in the
Capgo dashboard.

## Shipping the researcher dashboard

`research.bentodining.com` is its own Vercel project, `bento-research`, deployed
from the CLI out of a clean copy of this repo. It is not deployed by a push.

```bash
git worktree add /tmp/research-deploy <sha> --detach
cd /tmp/research-deploy
rm -rf middleware.js api        # the main site's, see below
node -e "const c=require('./vercel.research.json'); delete c['\$comment']; require('fs').writeFileSync('vercel.json', JSON.stringify(c, null, 2))"
npx vercel link --yes --project bento-research
npx vercel --yes                # a preview first
```

Check the preview serves the dashboard at `/` (`npx vercel curl <preview>/`), then
`npx vercel promote <preview> --yes`. A promote builds again as production, and
after a rollback the domain stays pinned, so promote that production build too.
Confirm `curl -s https://research.bentodining.com/` names the new
`assets/research-*.js`.

Two traps, both paid for on 13 Nov 2026:

- **`middleware.js` takes the dashboard down.** It sends `/` to `/home.html`, the
  main site's prerendered homepage. The dashboard build has no such file, so `/`
  returns 404. Delete it (and `api/`, which the dashboard does not use) from the
  copy before deploying.
- **`$comment` is refused.** Vercel rejects `vercel.json` with that key, so it is
  stripped when the file is copied.
