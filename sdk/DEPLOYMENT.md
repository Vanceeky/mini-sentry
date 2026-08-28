# SDK deployment

Scope: `sdk/` only — `demo/` and `web/` are separate apps with their own
deploy stories, not covered here.

## What `npm run build -w sdk` produces

```
sdk/dist/
  index.js, index.d.ts, ...   # ESM + types, for npm/bundler consumers
  canary.min.js(.map)         # IIFE bundle exposing window.Canary, for <script> tags
```

Both come from one build step — nothing extra to run per target.

## Option 1 — Self-host the built file (current approach, no publishing)

What's been used throughout this project so far: copy the built file to
wherever it needs to be served as a static asset.

```bash
npm run build -w sdk
cp sdk/dist/canary.min.js  /path/to/your-site/assets/js/
```

```html
<script src="/assets/js/canary.min.js"></script>
<script>Canary.init({ apiKey: "...", endpoint: "..." });</script>
```

Works today, zero setup. Downside: manual — every SDK change means
re-copying the file to every place that hosts it.

## Option 2 — Publish to npm (unlocks `npm install` + free CDN mirrors)

**Already done** — `@vanceeq/canary@0.1.1` is live on npm (`0.1.0` also
exists but was broken for real npm consumers, see `plans/DECISIONS.md`;
`0.1.1` is the one anyone should actually depend on). The `vanceeq` npm org
was the scope used (`mini-sentry` was tried first — it's a *team* inside
that org, not a separate scope, so it 404'd — see `sdk/PUBLISHING.md`).
Confirmed live:
- `npm install @vanceeq/canary` works anywhere.
- jsDelivr and unpkg mirror it automatically, confirmed via live `curl`
  checks — no separate CDN deploy step, no self-hosting required:
  ```html
  <script src="https://cdn.jsdelivr.net/npm/@vanceeq/canary/dist/canary.min.js"></script>
  <!-- or -->
  <script src="https://unpkg.com/@vanceeq/canary/dist/canary.min.js"></script>
  ```

Full step-by-step walkthrough (for publishing the *next* version): `sdk/PUBLISHING.md`. Summary:

1. Verify the package looks right before publishing:
   ```bash
   npm run typecheck -w sdk && npm run test -w sdk && npm run build -w sdk
   npm pack -w sdk --dry-run   # shows exactly what would be published — should be dist/ + package.json + README
   ```
2. `npm login` (needs your npm account, with access to the `vanceeq` org).
3. `npm publish -w sdk --access public` (the `@scope/name` format defaults
   to private, `--access public` is required the first time).

New versions require repeating step 1–3 with a bumped version — npm
package versions are immutable, a version number can never be republished.

## Option 3 — Private registry (if public npm isn't wanted)

Same steps as Option 2, but pointed at a private registry instead of the
public npm registry — either:
- **GitHub Packages**: add a `publishConfig.registry` pointing at
  `npm.pkg.github.com` in `sdk/package.json`, authenticate with a GitHub
  token that has `write:packages`, then `npm publish -w sdk`.
- **npm private scope**: same `npm publish` flow, but the `vanceeq`
  org/scope is set to private on npmjs.com (requires a paid npm org).

No CDN mirroring in this option (jsDelivr/unpkg only mirror public
packages) — consumers need real npm/registry access, or you're back to
self-hosting the built file for anyone without it.

## Before publishing anything (any option)

- `npm run typecheck -w sdk && npm run test -w sdk` — clean.
- `npm run build -w sdk` — clean, and confirm no test files leaked into
  `dist/` (`find sdk/dist -iname '*.test.*'` should be empty — this is the
  same check the repo already runs elsewhere).
- Check `sdk/package.json`'s `"files"` field (currently just `"dist"`) still
  matches what should actually ship — nothing from `src/` needs publishing.
