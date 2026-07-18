## 1. Contracts and canonical ownership

- [x] 1.1 Resolve the design open questions for generic workspace include policy, project candidate-decision schema, and review actions; record the selected canonical contracts before implementation.
- [x] 1.2 Define host-neutral semantic source scope, portable source identity, analysis mode, fingerprint, freshness, diagnostic, cancellation, and analyzer replacement contracts with strict validators and focused tests.
- [x] 1.3 Define Entity mention, occurrence, candidate cluster, deterministic match, review status, provenance, and confirmed-entity revision contracts without adding a parallel DTO authority.
- [x] 1.4 Extend the public local-metadata repository contracts for source-scoped semantic/entity replacement, stale diagnostics, partition revision, and cache-only cleanup; add Node/Bun adapter contract tests.

## 2. Normalized text extraction

- [x] 2.1 Add bounded strict-UTF-8 plain-text segmentation to `@neko/content` with stable source ranges and oversize/encoding diagnostics.
- [x] 2.2 Add Markdown visible-text segmentation with heading, paragraph, list, and table structure while keeping raw HTML inert.
- [x] 2.3 Add Fountain structure segmentation for scene headings, character cues, dialogue, and action without duplicating Story domain facts.
- [x] 2.4 Add strict JSON/YAML string-scalar segmentation with structured paths and fail-visible parse errors rather than plain-text fallback.
- [x] 2.5 Add fixture tests for supported formats, ranges, ordering, exclusions, invalid syntax, cancellation, and byte limits.

## 3. Semantic source discovery and reconciliation

- [x] 3.1 Implement the coordinator root registry and deterministic overlap precedence for workspace and media-library scopes.
- [x] 3.2 Implement filesystem-hint deduplication and fingerprint-first source scheduling so repeated create/change signals produce one analysis replacement.
- [x] 3.3 Implement bounded cancellable reconciliation for activation, focus/session recovery, explicit refresh, root changes, and runtime scan slices.
- [x] 3.4 Implement create/change/delete/unavailable freshness transitions and reject stale results when the source fingerprint or root generation changes before commit.
- [x] 3.5 Add fake-filesystem and fake-clock tests proving missed watcher events, external copies, Git-style bulk changes, root remaps, overlapping roots, cancellation, and deletions converge correctly.

## 4. Deterministic Entity analyzer

- [x] 4.1 Implement confirmed-entity snapshots and boundary-aware stable-ref/canonical-name/alias matching with kind compatibility and revision checks.
- [x] 4.2 Implement structural new-candidate recognition for eligible creative segments and enforce `off`, `link-existing`, and `discover-candidates` behavior.
- [x] 4.3 Implement `kind + normalized name` clustering, evidence deduplication, distinct-source/occurrence counts, and separate incompatible-kind clusters.
- [x] 4.4 Implement `observed`, `matched`, `suggested`, and `ambiguous` triage with the specified thresholds and prove confidence or semantic similarity cannot auto-confirm an entity.
- [x] 4.5 Add regression tests for unique exact links, ambiguous aliases, low-signal suppression, repeated structural evidence, source deletion, relinking after entity changes, and no vector-based merge path.

## 5. SQLite projection path

- [x] 5.1 Implement atomic source-scoped replacement for `semantic_sources`, `semantic_evidence`, and `entity_asset_projections` using existing cache-owned schema namespaces.
- [x] 5.2 Persist text segments, entity mentions, occurrences, matches, candidate clusters, freshness, provider/schema version, and diagnostics without exposing SQL or database paths to feature packages.
- [x] 5.3 Add transaction and path tests proving partial analyzer output, stale fingerprints, repository failures, and cache cleanup cannot become empty success or modify project facts.
- [x] 5.4 Add partition revision refresh tests covering Extension writes and TUI/session-boundary reads without WAL-file business signaling.

## 6. Host and material-library integration

- [x] 6.1 Register workspace source scopes in the VS Code Host with canonical exclusions, trust checks, save/focus events, watcher disposal, and manual refresh diagnostics.
- [x] 6.2 Adapt `MediaLibrarySettingsService` roots into source scopes and reconcile external directory changes without calling `AssetFileImportService` or writing `library.json`.
- [x] 6.3 Consolidate semantic rebuild triggers currently spread across Project Search, Media Library Search/Tree, and Media LSP while preserving each consumer's distinct filename, tree, or navigation projection ownership.
- [x] 6.4 Add the LSP-style VS Code diagnostics/navigation adapter over shared evidence, keeping unsaved-buffer analysis session-only and saved-file analysis on the SQLite canonical path.
- [x] 6.5 Add Extension integration tests proving Finder/external copies, direct material-root changes, settings remaps, missing roots, and deletes update semantic projections but do not import Assets or confirm Entities.

## 7. Review workflow and legacy cleanup

- [x] 7.1 Update the Entity review projection to show one evidence-backed item per `suggested` or `ambiguous` cluster and hide `observed`/`matched` items by default.
- [x] 7.2 Implement explicit save-for-review, dismiss, promote, reject, and merge decisions through the selected project-fact contract, with provenance and path-level tests.
- [x] 7.3 Stop Agent stream contribution automation and all automatic analyzers from writing `neko/entities/candidates.json`; delete or poison the legacy auto-write command while keeping explicit project candidate facts readable.
- [x] 7.4 Add a non-destructive migration/audit for existing candidate files that preserves all entries, identifies known automation provenance, and never silently deletes user data.
- [x] 7.5 Add canonical-path assertions proving new source analysis reaches SQLite projection and the legacy automatic candidate-file path cannot return success.

## 8. Documentation and verification

- [x] 8.1 Update unified Entity, Asset Library, local metadata, package-boundary, and package maintenance documentation for dynamic discovery, analysis modes, storage authority, and explicit promotion semantics.
- [x] 8.2 Run OpenSpec strict validation, `git diff --check`, focused Content/Entity/Search/Assets tests, producer/consumer typechecks, and SQLite Node/Bun contract tests.
- [x] 8.3 Run `pnpm build`, `pnpm test`, `pnpm check`, `pnpm check:deps`, `pnpm check:legacy-debt`, and `pnpm check:unused`; classify unrelated pre-existing failures separately.
- [x] 8.4 Use the Agent evaluation skill to run focused real cases for the changed contribution/automation path and record provider/model, facts, results, and residual risk.
- [ ] 8.5 Run the focused Extension Development Host scenario for dynamic workspace/material-root discovery and the review surface; record an exact blocker if the verified CDP/Development Host environment is unavailable.
- [ ] 8.6 Apply the Neko quality review, resolve blocking findings, and document verification coverage, migration safety, performance evidence, and remaining risks.
