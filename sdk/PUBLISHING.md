# Publishing `@vanceeq/canary` to npm

Step-by-step walkthrough for Option 2 in `DEPLOYMENT.md`. Nothing has
actually been published yet — `sdk/package.json` is prepared (name, version,
no longer private) but `npm publish` hasn't been run.

## Already done

- **Package name decided**: `@vanceeq/canary` — scoped under the `vanceeq`
  npm org (already created, so scope ownership is settled — no need to
  claim it). `mini-sentry` is a *team* inside the `vanceeq` org, not a
  separate scope — npm teams don't have their own scope, they're just
  permission groups for managing package access within an org. First
  attempt tried `@mini-sentry/canary` and got a 404 on publish for exactly
  this reason; corrected to `@vanceeq/canary` once the mixup was found.
- **`sdk/package.json` updated**: `"name": "@vanceeq/canary"`,
  `"version": "0.1.0"`, `"private": true` removed, plus a `"repository"`
  field pointing back at this repo (`directory: "sdk"`, so npmjs.com's
  package page deep-links correctly).
- **The CDN/script-tag build's global renamed too**: `Canary.init(...)`,
  not `MiniSentry.init(...)` — the output file is `dist/canary.min.js`, not
  `dist/mini-sentry.min.js`. This is a real public-API rename, not just
  packaging — every doc/demo/snippet referencing the old name was updated
  alongside it (see the commit that did this rename for the full list).

## 1. Create an npm account (if you don't have one)

Sign up at [npmjs.com/signup](https://www.npmjs.com/signup). npm requires
(or strongly pushes) two-factor auth for publishing — enable it under
Account Settings, you'll need it in step 3. Make sure your account has been
added as a member of the `vanceeq` npm org with publish access.

## 2. Run the pre-publish checklist

```bash
npm run typecheck -w sdk
npm run test -w sdk
npm run build -w sdk
find sdk/dist -iname '*.test.*'      # must be empty
npm pack -w sdk --dry-run            # eyeball the file list — dist/ + package.json + README.md only
```
Rerun these fresh right before you actually publish, since code keeps
changing — don't trust an earlier run.

## 3. Log in to npm from the CLI

```bash
npm login
```
Prompts for username/password and a 2FA one-time code. `npm whoami`
confirms you're authenticated afterward. **This step needs your own
credentials — no one else can run it for you.**

## 4. Publish

```bash
npm publish -w sdk --access public
```
`--access public` is required the first time a scoped (`@vanceeq/...`)
package is published — scoped packages default to restricted/private
otherwise. Subsequent publishes remember this once set, but there's no harm
including it every time.

## 5. Verify it actually landed

```bash
npm view @vanceeq/canary           # shows the published metadata
```
- Check `https://www.npmjs.com/package/@vanceeq/canary` in a browser.
- In a scratch directory: `npm install @vanceeq/canary` and confirm it
  resolves.
- jsDelivr/unpkg mirror automatically but can take a few minutes to catch
  up: `https://cdn.jsdelivr.net/npm/@vanceeq/canary/dist/canary.min.js`.

## 6. Publishing an update later

npm versions are **immutable** — you can never publish over `0.1.0` again,
and `npm unpublish` is only unrestricted within 72 hours of a version with
near-zero downloads (after that it needs an npm support request, and is
discouraged since it can break anyone who already depends on that version).
So: bump the version in `package.json`, rerun step 2's checklist, then
repeat step 4 (`--access public` no longer strictly needed, but harmless).

## 7. After a real publish, one doc update

`sdk/README.md` currently says *"Not published yet — see PUBLISHING.md."*
— that line becomes false the moment step 4 succeeds. Update it (and
`DEPLOYMENT.md`'s Option 2 framing) once you've actually published, not
before.
