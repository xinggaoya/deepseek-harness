# Fork sync guide

English | [中文](fork-sync.zh.md)

This repository is a downstream fork of [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) (the upstream). The fork carries a small set of downstream features on top of upstream `master`; this page records how to pull upstream changes back in without losing them.

## Remotes

The two remotes are already configured:

| Remote | Repository | Role |
|---|---|---|
| `origin` | `https://github.com/xinggaoya/deepseek-harness.git` | this fork — push here |
| `upstream` | `https://github.com/deepseek-ai/deepseek-harness` | the upstream — fetch from here, never push |

```bash
git remote -v          # confirm both entries
git fetch upstream     # bring the upstream's refs into the local repo
```

## Routine sync

1. Fetch the upstream and see what moved:

   ```bash
   git fetch upstream
   git log --oneline master..upstream/master | head -50
   ```

2. Start a sync branch off the fork's `master`:

   ```bash
   git switch master
   git pull --ff-only origin master
   git switch -c sync/upstream-$(date +%Y%m%d)
   ```

3. Merge the upstream in. A merge keeps the fork's history intact, so a later sync has one merge commit per upstream batch:

   ```bash
   git merge upstream/master
   ```

4. Resolve the conflicts (see the hot spots below). Generated files are regenerated, not hand-merged.

5. Run the gate ladder (see below).

6. Push the branch and open a pull request into this fork's `master`:

   ```bash
   git push origin sync/upstream-$(date +%Y%m%d)
   gh pr create --base master --head sync/upstream-$(date +%Y%m%d) \
     --title "sync: merge upstream/master" --body "Merged upstream/master into the fork."
   ```

7. Merge the pull request after the gates are green, and delete the branch.

## Conflict hot spots

These paths change on nearly every upstream merge. Regenerate them instead of resolving them by hand:

| Path | Regenerate with |
|---|---|
| `docs/config-catalog.md`, `docs/config-catalog.zh.md` | `pnpm run gen-config-catalog` |
| `docs/capability-seams.md`, `docs/capability-seams.zh.md`, the other graph documents | `pnpm run gen-doc-graphs` |
| `packages/extensions/cordis-client-runner/src/client/slot-catalog.ts` | `pnpm run gen-client-catalog` |
| `packages/extensions/tool-cordis/src/api-catalog.ts`, the cordis API pages | `pnpm run gen-cordis-catalog` |
| `packages/preset/agent-preset/skills/cordis-composition-reference/references/packages.md` | `pnpm run gen-plugin-packages` |
| `tsconfig.base.json` (the package aliases) | `pnpm run gen-tsconfig-paths` |

Resolve these by hand when they conflict:

- `packages/bundle/base/cordis.patch.yml` and `packages/bundle/web-app/cordis.patch.yml` — the base bundle's plugin rows and the Web app's browser roster. Keep the fork's added rows and take the upstream's new rows.
- `packages/bundle/web-app/presets/*.patch.yml` — the shipped agent presets. The fork removes the `persona` row from the `standard`, `cordis`, and `ptc` presets (see below); keep that removal.
- `tsconfig.host.json` and `tsconfig.client.json` — the project references. Keep both sides' new entries.

After any regeneration, re-record the bilingual pairing records:

```bash
pnpm run verify-translation-pairing --write <the changed doc>
```

## This fork's own changes

Re-check these after every sync; they are the parts an upstream merge can silently undo:

- **Three settings pages** — `packages/client/ui-settings-skills` (a read-only skills catalog), `packages/client/ui-settings-prompt` (the deployment persona), and `packages/client/ui-settings-mcp` (the MCP servers this deployment connects to). Each registers a `settings.section` row, so the settings navigation order is `general`, `models`, `plugins`, `agent-presets`, `skills`, `mcp`, `prompt`.
- **The deployment persona is editable** — `packages/core/system-prompt` exposes `personaPrefix`, `personaSuffix`, `includeHarnessIdentity`, and `personaComplete` as volatile fields and re-registers its prompt sections when the Loader commits a new value.
- **The shipped presets no longer carry a persona row** — `standard`, `cordis`, and `ptc` inherit the deployment persona; `minimal` keeps its own. An upstream change to those preset files needs the same treatment.
- **The MCP servers namespace** — `packages/mcp/mcp-servers` owns the `mcp-servers` settings namespace and reconciles the running `mcp-client` instances with it.
- **The skills catalog answers a preset query** — `skills.list` accepts a preset id as well as a session id.

## Gate ladder

Run these before merging a sync branch; each covers one surface:

```bash
pnpm install
pnpm run typecheck
pnpm run lint
pnpm run build
pnpm run test:gui
DSH_SNAPSHOT=replay pnpm run test:web
pnpm run doc-sync
pnpm run hygiene
```

`DSH_SNAPSHOT=replay` re-runs the recorded browser scenarios; use `DSH_SNAPSHOT=refresh` only after confirming that an output change is intentional, because it rewrites the recorded expectations.

## Publishing a downstream change

Downstream work follows the upstream's conventions, so it merges back cleanly:

1. Branch off the fork's `master` (`git switch -c feat/<topic>`).
2. Keep the change in its own commits, with the upstream's commit style (`feat(scope): …`).
3. Record the externally perceptible changes in an upgrade guide under `docs/upgrade-guide/v<version>/<item>/guide.md`, and the durable decisions in an Agent Note under `.agents/notes/implemented/`.
4. Run the gate ladder, push the branch, and open a pull request into this fork's `master`.
