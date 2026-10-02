# Keeping Shoplane up to date

Dependencies, tools and platforms move on whether we touch them or not. Small, regular updates
are cheap; a year of skipped updates is a project. This is the routine for both repositories
(`workshop-buddy-52` and `command-center-control`).

## How updates flow

1. **Dependabot** opens pull requests: a weekly one (Mondays) bundling minor and patch updates,
   separate ones for major versions, a monthly one for GitHub Actions, and security fixes as soon
   as an advisory is published.
2. **CI** must pass on the pull request (types, lint, unit tests).
3. Merging sends it to **staging.shoplane.uk**, where the smoke checks run (app only).
4. Customers get it only when it's **released from Shoplane Control**, like any other change.

## One Node version everywhere

The version lives in `.nvmrc` (currently **24**, long-term support until April 2028). GitHub
Actions read it from there, `package.json` `engines` enforces it, and Vercel projects use the
same major version (Control sets it on new customers). To move to a new Node version:

1. Change `.nvmrc` and `engines` in both repositories.
2. Change `NODE_VERSION` in Control's `supabase/functions/operations/provision.ts` (new customers).
3. Update existing Vercel projects (each customer, staging, Control) to the same version.
4. Merge; check staging passes; release.

## Monthly (about 15 minutes)

- Merge or close the open Dependabot pull requests. Weekly minor/patch PRs should be merged
  once CI passes; major ones need reading the package's changelog first.
- Run `npm audit --omit=dev` in both repositories. Anything here ships to customers: fix it.
  Findings without `--omit=dev` affect only developer tools and can wait for their major update.
- Check end-of-life dates for Node (nodejs.org/en/about/previous-releases), the Postgres version
  Supabase runs, and Deno for edge functions. Plan an upgrade at least three months ahead.
- Check the Releases page in Control: every customer should be within two weeks of the newest
  version that passed on staging.

## When something breaks because a tool changed

Like the GitHub runner's old Node version breaking the staging checks in October 2026: fix the
pin (in `.nvmrc`, not in one workflow), then add the lesson here.
