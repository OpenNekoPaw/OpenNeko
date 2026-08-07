## 1. Prerequisite And Package Topology

- [ ] 1.1 Rebase the change onto the completed `compose-desktop-workbench-scenes` canonical contracts and record the final Workbench View/public Root integration points without adding an alias or parallel View registry.
- [ ] 1.2 Create `@neko/text-editor-domain`, `@neko/text-editor-webview` and `@neko/screenplay-domain` with strict TypeScript configs, exact manifests and explicit public exports matching their declared package roles.
- [ ] 1.3 Add pinned CodeMirror 6 modular dependencies to the Webview package and `fountain-js` 1.2.4 to the Screenplay domain, update the lockfile and retain required MIT license attribution.
- [ ] 1.4 Register the three packages in workspace dependency, role and product-status governance; add boundary fixtures proving Domain has no React/Node/Electron imports, Webview has no Node/Electron imports and Desktop consumes public entries only.
- [ ] 1.5 Add package README files documenting owner, identity, lifecycle, public entry, error boundary and the fact that Workspace bytes remain authoritative.

## 2. Canonical Screenplay Domain

- [ ] 2.1 Define version-free Fountain source-range, element, scene, character, dialogue, outline and diagnostic contracts with strict validators and immutable projections.
- [ ] 2.2 Implement the bounded `parseFountainDocument` policy around the pinned `fountain-js` token engine without exposing or consuming generated HTML.
- [ ] 2.3 Implement deterministic ordered source-block association for parser tokens, including title pages, CRLF, repeated text and inline markup, and fail the current parse when association is ambiguous.
- [ ] 2.4 Implement source-backed scene, character, dialogue-owner and outline projections with identities scoped to the associated document/session revision.
- [ ] 2.5 Add non-mutating diagnostics for likely unforced CJK character cues, scene-like lines, duplicate scene numbers, source limits and parser/source association failures.
- [ ] 2.6 Add Fountain 1.1 conformance fixtures for title pages, scenes, dialogue, parentheticals, dual dialogue, transitions, sections, notes, boneyards, emphasis, escapes, page breaks and forced syntax.
- [ ] 2.7 Add Simplified Chinese, Traditional Chinese, Japanese, Korean, mixed-language, duplicate-text, LF, CRLF, invalid-association and sibling-failure-isolation producer tests.

## 3. Text Document Authoring Domain

- [ ] 3.1 Define the exact document/session/request identities, admitted extension registry, format modes, immutable projections, revisioned edit commands, save/reload/close intents and typed diagnostic codecs.
- [ ] 3.2 Implement bounded UTF-8 admission with optional BOM and consistent LF/CRLF preservation; reject invalid UTF-8, mixed line endings and oversized sources without rewriting bytes.
- [ ] 3.3 Implement `TextDocumentSession` open/focus/project behavior over injected `ContentReadService`, with one session per exact Window + Workspace + ContentLocator and no active/recent fallback.
- [ ] 3.4 Implement ordered atomic text changes with expected revision, bounds/overlap validation, request deduplication, dirty state and immutable result projection.
- [ ] 3.5 Implement Markdown mode delegation metadata, JSON parse diagnostics and deterministic explicit two-space format as ordinary revisioned edits; keep the remaining allowlist in declared plain-text mode.
- [ ] 3.6 Integrate the canonical Fountain parser as the only Fountain format adapter and associate its projection/diagnostics with the accepted Text Document revision.
- [ ] 3.7 Implement fingerprint-CAS save through injected `AuthorizedWorkspaceWriter`, preserving BOM/line endings and clearing dirty state only for the exact saved revision.
- [ ] 3.8 Implement explicit conflict Reload/Keep Editing behavior, dirty Save/Discard/Cancel close behavior, clean-session release and exact-session reconstruction rules.
- [ ] 3.9 Add producer tests for admission, identity isolation, stale/invalid edits, undo/redo transactions, concurrent save revisions, external fingerprint conflicts, reload confirmation, writer failure, close decisions and clean/dirty release.
- [ ] 3.10 Add poison tests proving no full-document renderer save, alternate writer, automatic merge, forced overwrite, wildcard format mode, parser fallback or active-document resolution can succeed.

## 4. Search And Contract Ownership Migration

- [ ] 4.1 Make `@neko/search-domain` consume `@neko/screenplay-domain` normalized output for Fountain scenes, characters, dialogue, action and exact source locations.
- [ ] 4.2 Update Search producer/consumer fixtures to cover canonical Chinese Fountain projection, invalid-source isolation and unchanged sibling Markdown/JSON search behavior.
- [ ] 4.3 Move every valid consumer from `@neko/content` Fountain DTOs to the Screenplay public contract, then delete the superseded DTO exports and fixtures atomically.
- [ ] 4.4 Delete Search's `extractFountainSegments`, scene/character regular expressions and independent Fountain-index construction after all consumers switch.
- [ ] 4.5 Add dependency/deletion tests that poison the retired classifier and prove one canonical Screenplay parse per source revision with no raw-text Search bypass.

## 5. Text Editor Webview

- [ ] 5.1 Create the package-owned Text Editor Root, typed host adapter and presentation-snapshot codec for mode, cursor/selection, scroll, split ratio and outline visibility only.
- [ ] 5.2 Integrate CodeMirror state/view/commands with shared theme tokens, stable editor geometry, keyboard focus, selection and revisioned transaction dispatch.
- [ ] 5.3 Implement source-level undo/redo and accepted-projection reconciliation without allowing a renderer-only working copy to become the save authority.
- [ ] 5.4 Implement Markdown `Edit | Preview | Split` using CodeMirror Markdown and the canonical `@neko/markdown` plus safe shared Markdown presentation.
- [ ] 5.5 Implement JSON highlighting, source-range diagnostics, diagnostic navigation and explicit Format; reject formatting invalid JSON without source mutation.
- [ ] 5.6 Implement Fountain decorations, `Edit | Preview | Split`, inert screenplay rendering, scene outline navigation, character completion and context-aware newline behavior from the canonical Screenplay projection.
- [ ] 5.7 Implement IME composition buffering so semantic completion, formatting and replacement wait until one committed edit; cover composition unmount/reconnect behavior.
- [ ] 5.8 Add package-owned English and Simplified Chinese bundles for commands, tooltips, accessibility names and domain diagnostic parameters; remove hard-coded user-facing error strings from reused Markdown presentation in this path.
- [ ] 5.9 Add CJK-capable font fallback, line wrapping, non-negative letter spacing and responsive editor/preview/outline constraints without nested cards or overlapping controls.
- [ ] 5.10 Add Webview interaction tests for all modes, keyboard save/undo/redo, split presentation, JSON diagnostics, Fountain outline/completion, CJK IME, locale switching, accessibility and invalid snapshot isolation.
- [ ] 5.11 Lazy-load the Text Editor Root and record the packaged editor chunk size so CodeMirror does not enter unrelated Canvas/Cut/Preview startup chunks.

## 6. Host And Desktop Runtime Composition

- [ ] 6.1 Extend the final canonical `@neko/host` Workbench View union/parser with `text-editor` exact identities, same-document focus and bounded side-open behavior; update producer and invalid-layout fail-local tests.
- [ ] 6.2 Define one version-free package-owned Text Editor bridge contract for open, projection, edit, format, save, reload, close and subscription with exact sender/window/workspace/view/session/renderer/request identity.
- [ ] 6.3 Add Desktop Main composition that authorizes Workspace locators, injects canonical Content reader/writer ports and manages exact Text Document session attachments without owning edit/save policy.
- [ ] 6.4 Add sender-bound Main handlers and preload exposure with strict decode, stale renderer attachment revocation and per-request fail-closed behavior.
- [ ] 6.5 Mount the package public Text Editor Root from Desktop renderer only for the exact visible `text-editor` scene slot and unmount it when the slot leaves the current composition.
- [ ] 6.6 Integrate dirty Text Document sessions into exact View, Window and application close decisions while allowing clean invisible session release and dirty session survival without a retained React Root.
- [ ] 6.7 Add Desktop contract, Main, preload and renderer delegation tests proving exact identity routing, stale revision rejection, unauthorized sender rejection, renderer restart recovery and sibling Workspace availability.
- [ ] 6.8 Add application-root boundary tests proving Desktop only decodes, authorizes, wires and projects while Text Editor Domain owns admission, revisions, save conflicts and lifecycle decisions.

## 7. Resource Browser Open Routing

- [ ] 7.1 Extend the Assets-owned Resource Browser contract/presenter with exact `edit-text` capability projection for the admitted text extension registry and a distinct explicit read-only Preview action.
- [ ] 7.2 Route the default Open action for admitted editable text to the canonical Text Editor intent and retain Preview only as the explicit user-selected action for text.
- [ ] 7.3 Add Assets Domain/Webview tests for Markdown, JSON, Fountain, plain-text, unsupported, oversized and invalid-admission actions plus keyboard/context-menu accessibility.
- [ ] 7.4 Delete the prior default text-to-Preview callback/handler after switching every producer and add poison tests proving it cannot participate in successful default Open.
- [ ] 7.5 Verify Canvas, Cut, media, document and model Resource Browser open routes remain unchanged and do not receive Text Editor capability by extension guessing.

## 8. Runtime And User-Visible Acceptance

- [ ] 8.1 Add an isolated Desktop functional fixture with UTF-8 Markdown, JSON, Fountain, plain text, CRLF, invalid UTF-8, mixed-line-ending, oversized and externally modified files.
- [ ] 8.2 Add a visible Electron scenario that opens Markdown from Resource Browser, edits with IME, switches Edit/Preview/Split, saves, closes, reopens and verifies exact persisted bytes.
- [ ] 8.3 Extend the visible scenario to diagnose/format JSON, edit Chinese Fountain with `@角色` and `.场景`, navigate the outline and verify screenplay preview/search projection.
- [ ] 8.4 Verify external fingerprint conflict preserves the dirty buffer, Reload requires confirmation, Cancel retains edits and no stale or partial bytes are published.
- [ ] 8.5 Verify scene switching unmounts the Text Editor Root, dirty session state survives, clean session resources release, renderer restart restores the exact session and unrelated Agent/background work is unchanged.
- [ ] 8.6 Verify two-document split, same-document focus, dirty close decisions, invalid View isolation and adjacent Canvas/Cut/Preview/Resource Dock behavior through the canonical Workbench.
- [ ] 8.7 Run the `neko-ui-validation` workflow with desktop/mobile-sized screenshots where applicable, direct image-capable review, CJK text-fit checks, focus/keyboard checks and adjacent Workbench regression evidence.

## 9. Quality Gates And Completion Evidence

- [ ] 9.1 Run `pnpm --filter @neko/screenplay-domain test`, `pnpm --filter @neko/text-editor-domain test`, `pnpm --filter @neko/text-editor-webview test`, `pnpm --filter @neko/search-domain test`, `pnpm --filter @neko/assets-domain test`, `pnpm --filter @neko/assets-webview test`, `pnpm --filter @neko/host test` and `pnpm --filter @neko/app-desktop test`.
- [ ] 9.2 Run `pnpm --filter @neko/text-editor-domain typecheck`, `pnpm --filter @neko/screenplay-domain typecheck`, `pnpm --filter @neko/text-editor-webview build`, `pnpm typecheck` and `pnpm lint`.
- [ ] 9.3 Run `pnpm check:application-boundaries`, `pnpm check:content-access-boundaries`, `pnpm check:webview-boundaries`, `pnpm check:no-internal-versioning`, `pnpm check:package-roles`, `pnpm check:package-product-status`, `pnpm check:deps` and `pnpm check:openspec`.
- [ ] 9.4 Run `pnpm test:local:ui -- --scenario desktop-text-editor` on the authoritative visible Electron runtime and retain functional observations plus screenshots outside architecture documentation.
- [ ] 9.5 Run `pnpm package:desktop` and verify packaged CodeMirror/font assets, CSP, lazy chunks and typed preload behavior from `openneko://desktop`.
- [ ] 9.6 Run `pnpm gate:local`; if environment or pre-existing failures prevent completion, record the exact command, failure owner and why focused canonical-path evidence remains valid.
- [ ] 9.7 Run the `neko-quality-review` workflow, classify findings by severity, close all blocking findings and document the remaining risks: no crash recovery, no mixed-line-ending editing, no LSP/schema completion, no FDX/PDF and no Agent authoring/evaluation.
- [ ] 9.8 Confirm Agent evaluation is not applicable because no Prompt, Skill, Tool, capability routing or Agent runtime behavior changed; require a separate `add-ai-screenplay-authoring` OpenSpec and `neko-agent-evaluation` evidence before exposing AI write-back.
