# `@neko/shared` export inventory baseline

Date: 2026-07-29

This is the planning baseline, not authorization to move code. Task 1 generates
the symbol-level machine-readable inventory before the first implementation
batch.

## Current public package entries

| Current export cohort | Current entries                                                                                                 | Proposed owner/disposition                                                  |
| --------------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| root and wildcard     | `.`, `./*`                                                                                                      | root shrinks to audited L0; wildcard is removed in final batch              |
| L0 candidates         | `./logger`, `./path`, `./job-lifecycle`, `./i18n`, selected `./theme` tokens                                    | retain only after symbol/consumer audit                                     |
| local metadata        | `./local-metadata`, `/node`, `/sqlite`, `/testing`, node store and workspace identity entries                   | new `@neko/local-metadata` explicit contract/node/testing entries           |
| project and authoring | `./project-file-io`, `./project-authoring`, `/test-helpers`, `./nkc`, workspace-linked media library node entry | `@neko/project` or Canvas owner after cycle/data audit                      |
| content               | `./content-access`                                                                                              | `@neko/content` unless consumer audit proves a lower neutral primitive      |
| UI                    | `./components`, `./icons`, React/Webview i18n entries, UI-facing theme entries                                  | `@neko/ui`                                                                  |
| VS Code               | `./vscode`, `./vscode/extension`, command/resource/content/project writer entries, test utils                   | `apps/neko-vscode/src/adapters`, owning feature, or app test support        |
| config                | config reader and wildcard deep config imports                                                                  | owning Agent/App config module or retained pure config contract after audit |
| domain deep entries   | creative AI invocation, NPC test bench, Agent autoheal, storage and root-exported domain DTO                    | Agent/Canvas/Chara/Media/Entity/Content/Quality owning L0 entries or delete |

## Baseline scale

- `package.json` export entries: 36, including root and wildcard.
- Static source imports using `@neko/shared` or a subpath: approximately 1,109.
- Root-entry occurrences in the current source scan: approximately 947.
- Largest current source cohorts: `types` (~2.4 MB), `vscode` (~668 KB),
  `local-metadata` (~624 KB), `components/icons` (~180 KB), and
  project/NKC/authoring (~280 KB).

Counts are evidence for planning only. The implementation inventory must be
generated from the exact source revision and checked for drift.

## Required symbol-level fields

Every exported symbol/deep path must receive:

| Field                         | Meaning                                                        |
| ----------------------------- | -------------------------------------------------------------- |
| `currentEntry` / `source`     | canonical current public path and defining file                |
| `symbol`                      | exported symbol or side-effect asset                           |
| `consumers`                   | all production consumers, separated by App/domain/UI/Node/test |
| `runtimeLayer`                | L0, Node, VS Code L1, browser/React L2, or persisted/wire      |
| `targetOwner` / `targetEntry` | one canonical owner and public entry, or `delete`              |
| `batch`                       | migration cohort and dependency order                          |
| `durableImpact`               | none, import-only, or required schema/key/path migration       |
| `cycleRisk`                   | target dependency cycle evidence and resolution                |
| `verification`                | producer/consumer/path/data commands and fixtures              |

Unknown fields fail the inventory gate and block physical migration.
