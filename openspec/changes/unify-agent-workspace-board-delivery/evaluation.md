# Agent Evaluation

## 2026-08-10 live Board session follow-up

- Decision: `update`/reuse `agent-runtime.workflow-controller`; no new suite or product Evaluation path is
  warranted. The affected canonical path remains completed Agent Turn -> typed terminal artifact delivery ->
  exact Workspace Board coordinator -> committed Canvas document -> attached exact Canvas session projection.
- Prompt/Skill disposition: unchanged. This repair changes Desktop/Canvas session coordination and keyboard
  focus dispatch, not Agent instructions, capability routing or provider/model selection.
- Required evidence: the existing `workspace-board-delivery-resume` case continues to own durable/fenced
  recovery. Visible Desktop acceptance must additionally keep a clean Board open during delivery and observe
  the new node without reopen; a dirty Board must return the typed prewrite conflict without modifying disk.
- Deterministic evidence: focused Main/domain/Webview tests prove clean live projection, two exact attached
  Views, dirty prewrite rejection, save/detach/reopen preservation, delayed Root focus and shortcut mappings.
  Key-free Evaluation passed 44 files / 294 tests and strict discovery passed 24 suites / 64 cases.
- Visible/provider evidence: the isolated visible Canvas scenario was attempted but CDP startup failed with
  `fetch failed` before the target became ready. A real provider case was not run because provider/model/cost
  authorization was not supplied. Neither missing lane is represented as passed.

Date: 2026-08-09

## Evaluation Scope

- Change/feature: locator-backed EPUB/document image display in Agent result cards and Workspace
  Board Canvas nodes.
- Decision and owning suite: `update` the existing `agent-runtime.stream-delivery` suite. The
  `document-image-native-delivery` case already owns the canonical EPUB `ReadDocument` ->
  `ReadImage` path; it now also requires a redacted authorized `document-entry` display projection.
- Canonical path: Desktop Agent input -> Pi Tool execution -> stable document-entry or representation
  locator -> conversation projection -> Workspace content reader -> Desktop exact-resource registry
  -> package-owned Agent card. Workspace Board nodes retain the same ContentLocator and request a
  separate exact Canvas View resource lease.
- Forbidden fallback: source-locator substitution for a representation, extracted/temp/absolute
  path, data URL, persisted `openneko://resource` URL, legacy media scheme, whole-archive image load,
  active Workspace inference or a second document runtime.

## Cases

- Updated: `agent-runtime.stream-delivery/document-image-native-delivery` now proves the successful
  `document-entry` Tool result also produces an authorized `openneko-resource` projection for the
  Agent Webview with no diagnostic.
- Reused: `agent-runtime.stream-delivery/locator-backed-display-projection` continues to prove the
  ordinary workspace-file path and forbids URL/path identity substitution.
- Deterministic coverage: Agent projection tests cover exact representation identity, EPUB bytes,
  per-resource failure isolation and lease release. Canvas bridge/runtime/Webview tests cover
  document-entry acceptance, opaque URL-only results, stale URL rejection, exact source/role lease
  ownership, View detach release and contain rendering.
- Missing observability: current bounded Agent facts do not observe Canvas DOM image decode or
  pixels. `workspace-board-projection` proves durable node/connection delivery only; it must not be
  treated as Canvas image rendering evidence.

## Verification

- Key-free validation: `pnpm test:agent:eval` passed 44 files / 294 tests and the all-suite dry-run
  passed 24 suites / 64 cases.
- Real provider case: not run; explicit provider/model/cost authorization was not supplied for this
  focused implementation turn.
- Visible Desktop case: `canvas-openneko-consumer` opened the EPUB-backed Workspace Board node
  through the production Main/renderer path. The `canvas-epub-document-entry-image` checkpoint
  recorded a redacted `openneko://resource` URL, HTTP status `200`, decoded dimensions `192 x 128`
  and `object-fit: contain`. Direct inspection of
  `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-09T10-37-33.091Z-canvas-openneko-consumer-development/screenshots/02-canvas-epub-document-entry-image.png`
  confirmed nonblank complete image pixels. The resource boundary recorded three authorized PNG
  responses with no console error, warning, exception or poisoned request.
- Full Desktop scenario result: failed after the EPUB checkpoint because the adjacent Generation
  presentation reported horizontal overflow on its node container. This is outside the locator
  projection path, so the EPUB Canvas item passed but the complete UI scenario is not reported as
  passed. The corresponding report is
  `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-09T10-37-33.091Z-canvas-openneko-consumer-development/report.json`.

## Foundational Matrix

- Basic turn and terminal convergence: affected; focused EPUB case selected.
- Multi-turn, compaction, owner/application reopen, restored generation records, conversation
  switching and cross-conversation isolation: runtime ownership and persistence are unchanged.
- Renderer detach/reopen is affected only for disposable display leases and is covered
  deterministically; visible Desktop reopen remains required for final UI acceptance.

## Residual Risk

- The Agent thumbnail was not exercised with a real provider in the visible Electron run; its
  `ReadDocument.imageInfo` presentation and exact-resource projection remain covered by focused
  deterministic tests only.
- The complete Canvas consumer scenario remains failed on the unrelated Generation node horizontal
  overflow assertion. That adjacent presentation regression requires its owning change to resolve
  it before the scenario can provide an overall UI pass.
