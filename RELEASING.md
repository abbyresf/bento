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
