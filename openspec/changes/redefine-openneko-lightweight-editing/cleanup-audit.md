# Cut OTIO replacement cleanup gate

Status: `not-started`

This gate records evidence that the selected legacy Cut implementation and its success tests have been removed before any new OTIO production implementation begins. It is an implementation checkpoint, not a substitute for the final quality gates.

## Rules

- Allowed statuses are `not-started`, `in-progress`, `blocked` and `passed`.
- Status MUST NOT become `passed` while any required absence or validation is incomplete.
- Sections 4–9 of `tasks.md` MUST NOT begin before this gate is `passed`.
- Cleanup may retain shared UI/Host primitives and the selected current media-runtime seam only when an owner and post-cleanup consumer are recorded below.
- Cleanup MUST NOT modify, migrate or delete user NKC/NKV files or referenced media bytes.

## Inventory and disposition

| Path or capability | Owner/callers | Disposition | Evidence |
| --- | --- | --- | --- |
| NKV/NKC Cut registration and codec | TBD | TBD | TBD |
| Webview writable project state and save snapshot | TBD | TBD | TBD |
| Extension full-project timeline reconstruction | TBD | TBD | TBD |
| Media import/copy and automatic audio/subtitle creation | TBD | TBD | TBD |
| Current linked separation behavior | TBD | `replace-after-cleanup` | TBD |
| Selected current media adapter seam | TBD | `retain-current-media-adapter` | TBD |
| Active/recent Cut targets and legacy Agent/Canvas aliases | TBD | TBD | TBD |
| Professional/deferred operation surfaces | TBD | TBD | TBD |
| Minimap vertical path | TBD | TBD | TBD |
| Legacy success tests/fixtures/snapshots | TBD | TBD | TBD |

## Required absence evidence

- [ ] No writable NKV/NKC Cut editor, codec, save, backup or migration registration remains in the replacement boundary.
- [ ] No Webview-to-Host full project snapshot can be used as a successful save path.
- [ ] No Extension DTO reconstructs the removed full project model for new Cut requests.
- [ ] No media copy/import, automatic audio/subtitle creation or derived-audio request remains in the new Cut entry path.
- [ ] No active/recent editor fallback or implicit `.nkv` target can return success.
- [ ] No removed professional operation or Minimap path remains registered, callable or hidden behind a setting.
- [ ] No retained test obtains success through a removed handler, codec, alias, fixture or fallback.
- [ ] No stale package export, dependency, manifest entry or generated artifact keeps a deleted path reachable.

## Retained seams

Record the exact shared primitives and current media-runtime seams retained for later composition. Each item requires an owner, callers, lifecycle, error contract and reason it is not part of the deleted project model.

| Seam | Owner | Post-cleanup consumer | Reason retained | Evidence |
| --- | --- | --- | --- | --- |
| TBD | TBD | TBD | TBD | TBD |

## Validation commands and results

| Command | Result | Coverage |
| --- | --- | --- |
| TBD | not run | forbidden source/dependency/manifest paths |
| TBD | not run | legacy debt |
| TBD | not run | unused code and dangling exports |
| TBD | not run | focused cleanup compilation/tests |
| `git diff --check` | not run | patch integrity |

## User-data check

- [ ] Cleanup does not open user NKC/NKV files through a writer.
- [ ] Cleanup does not rename, migrate or delete user project files.
- [ ] Cleanup does not copy, modify or delete referenced media bytes.

## Gate decision

- Decision: `not-evaluated`
- Reviewed by: TBD
- Date: TBD
- Blockers/residual risk: TBD
