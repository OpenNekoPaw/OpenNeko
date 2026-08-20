# W8 Retired Agent Artifact Scan

Date: 2026-08-20

## Scope

`check-neko-agent-boundaries.mjs` now applies one fail-visible retired-marker inventory to:

- production Agent/Desktop source and public paths;
- production Evaluation `.mjs` and `.json`, excluding test poison fixtures, reports and shared fixtures;
- Desktop `.vite/build` and renderer `dist/assets` JavaScript;
- first-party Main, preload and renderer root entries inside the packaged macOS `app.asar`.

The scan rejects retired Pi dependencies/imports, direct `agentLaunch`/`confirmTool`/`agentAutomation`
bridges, the deleted Draft submit contract/parser/DSL, queue/send-now facts, `pi-runtime`,
`projectionEvents` and `messageQueue`. Evaluation additionally rejects human-readable Pi authority claims.
The built-output scan intentionally does not reject an arbitrary word `Pi`, because third-party XML/math
bundles contain that text without representing an OpenNeko Agent authority.

The isolated test creates a real fixture `app.asar`, proves current DSH input passes, proves production
Evaluation and built output fail on retired markers, and proves `.test.mjs` poison fixtures are excluded
from production findings.

## Source And Evaluation Result

```text
node --test scripts/check-neko-agent-boundaries.test.mjs
PASS: 4 tests

node scripts/check-neko-agent-boundaries.mjs
PASS: 360 source/Evaluation files; 0 findings

pnpm check:agent-boundaries
PASS: 12 tests; 360 source/Evaluation files; 14 extension evidence inputs

pnpm test:agent:eval
PASS: 45 files / 314 tests; 26 suites / 65 cases
```

The production Evaluation cleanup removed the residual Draft binding workflow method and renamed the stale
`draft-binding-first-submit` target. Active scenario metadata now names the DSH Session/Turn/Skill/Tool
authority. Deleted Pi source paths were also removed from change selection rather than retained as active
coverage inputs.

This validation-only change does not alter prompts, capability routing, provider choice, Session workflow
or product UI behavior. Provider-backed Agent behavior Evaluation is therefore excluded for this slice;
the deterministic schema/discovery/dry-run and boundary tests are the relevant evidence.

## Built Output Release Blocker

```text
pnpm check:agent-retired-output
FAIL: 490 files inspected; 10 retired-marker findings
```

The remaining findings are confined to stale generated output:

- renderer `dist/assets`: `agentLaunch`, `confirmTool`, `messageQueue`;
- packaged `app.asar` preload: `agentLaunch`, `confirmTool`, `pi-runtime`, `messageQueue`;
- packaged `app.asar` renderer roots: `confirmTool`, `messageQueue`.

No source or Evaluation production definition reports these markers. The package is not rebuilt in this
workstream because task 12.6 permits `build:desktop` and `package:desktop` only after the machine release
guard in 12.5 passes. The failing command is the intended release-blocking result, not an accepted
baseline. Task 11.6 remains open until a post-guard rebuild produces zero findings.

No Webview or product UI file was modified while adding or satisfying this scan.
