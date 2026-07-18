## 1. Contracts and canonical ownership

- [x] 1.1 Resolve the design open questions for generic workspace include policy, project candidate-decision schema, and review actions; record the selected canonical contracts before implementation.
- [x] 1.2 Define host-neutral semantic source scope, portable source identity, analysis mode, fingerprint, freshness, diagnostic, cancellation, and analyzer replacement contracts with strict validators and focused tests.
- [x] 1.3 Define Entity mention, occurrence, candidate cluster, deterministic match, review status, provenance, and confirmed-entity revision contracts without adding a parallel DTO authority.
- [x] 1.4 Extend the public local-metadata repository contracts for source-scoped semantic/entity replacement, stale diagnostics, partition revision, and cache-only cleanup; add Node/Bun adapter contract tests.

## 2. Normalized text extraction

- [x] 2.1 Add bounded strict-UTF-8 plain-text segmentation to `@neko/content` with stable source ranges and oversize/encoding diagnostics.
- [x] 2.2 Add Markdown visible-text segmentation with heading, paragraph, list, and table structure while keeping raw HTML inert.
- [x] 2.3 Add Fountain structure segmentation for scene headings, character cues, dialogue, and action without duplicating Story domain facts.
- [x] 2.4 Replace generic JSON/YAML string-scalar segmentation with registered creative-schema adapters; reject or exclude unknown schema/version without plain-text fallback.
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
- [x] 5.2 Split transient analysis segments from persistent compact evidence; persist locator/range/hash, mentions, occurrences, matches, candidate clusters, freshness, provider/schema version, and diagnostics without complete source text.
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
- [x] 8.5 Run the focused Extension Development Host scenario for dynamic workspace/material-root discovery and the review surface; record an exact blocker if the verified CDP/Development Host environment is unavailable.
- [x] 8.6 Apply the Neko quality review, resolve blocking findings, and document verification coverage, migration safety, performance evidence, and remaining risks.

## 9. Phase-one scope correction

- [x] 9.1 Revise shared contracts and validators to separate `SemanticAnalysisSegment` transient text from persistent `SemanticEvidenceProjection`; poison body-bearing repository payloads and add producer/consumer contract tests.
- [x] 9.2 Reuse `DocumentAccessService` manifest, batch cursor, and range reads for PDF page, EPUB chapter, and DOCX section/paragraph analysis; preserve stable locators and release parser resources on completion or cancellation.
- [x] 9.3 Update discovery profiles and budgets for Fountain/NKS/Story, Markdown/TXT, PDF/EPUB/DOCX, and registered creative schemas; exclude media and ordinary JSON/YAML, and keep container bytes separate from extracted-text limits.
- [x] 9.4 Adapt deterministic Entity analysis to consume bounded transient document units and emit only compact mention/occurrence/candidate/match projections.
- [x] 9.5 Bump semantic provider/schema compatibility, clear legacy `MediaTextSegment.text` cache rows through an allowlisted cache-only migration, and rebuild available sources without dual-read or project-fact changes.
- [x] 9.6 Add Entity-to-occurrence and occurrence/mention/locator-to-Entity-or-Candidate query contracts; fetch visible context through fingerprint-checked `DocumentAccessService.readRange()`.
- [x] 9.7 Add PDF/EPUB/DOCX and registered-schema fixtures covering stable unit locators, DRM, scanned PDF, oversize budgets, cancellation, embedded `ResourceRef`, stale context, and bidirectional query results.
- [x] 9.8 Add SQLite contract tests that decode every semantic/search/entity projection and prove complete page, chapter, section, segment, document bytes, and embedded media never enter the database.
- [x] 9.9 Update unified Entity, local metadata, Content/document, Search, and status documentation; rerun OpenSpec validation, focused tests, producer/consumer checks, Extension Development Host acceptance, Agent evaluation where affected, and Neko quality review.

## 10. Agent Entity reference grounding

- [x] 10.1 Define and validate the resolved Agent Entity context contract without moving Entity project facts into Webview state.
- [x] 10.2 Resolve selected Entity mention identities through the existing Entity facade at the Extension turn boundary; reject missing, wrong-kind, or wrong-workspace results before provider dispatch.
- [x] 10.3 Format the resolved Entity snapshot into Agent context and add path-level tests proving the provider prompt contains canonical Entity facts and never falls back to the thin mention summary.
- [x] 10.4 Run focused shared/runtime/Extension tests, producer-consumer checks, Extension Development Host acceptance, Agent evaluation disposition, and Neko quality review; record remaining risk.

## 11. Entity mention selection runtime regression

- [x] 11.1 Reproduce the highlighted Entity mention selection as a deterministic Extension Development Host failure and trace the first broken contract boundary.
- [x] 11.2 Replace query-only Webview asset cache busting with content-addressed JS/CSS paths resolved from a strict build manifest.
- [x] 11.3 Give the tabless entry composer explicit context-reference ownership, carry selected Entity payloads into the first send, and add path-level Webview/Host regression tests.
- [x] 11.4 Prove the selected Entity mention becomes a visible context reference in a fresh Extension Development Host, run the remaining focused gates, and record any runtime blocker or residual risk.

Acceptance evidence (2026-07-19): in the synthetic `neko-test` Development Host workspace, entering `@小` and selecting the visible 小橘 Entity Candidate cleared the textarea and menu and rendered one removable attached reference with `data-agent-context-type="entity"` and `data-reference-kind="entity"`. The raw report is gitignored at `reports/webview-functional/entity-mention-attached.png`; first-send canonical Entity grounding remains covered by the deterministic Host/provider boundary tests because this fixture contains only Candidates, not a confirmed Entity fact.

## 12. Character Dialogue stable Entity handoff

- [x] 12.1 Reproduce the selected-confirmed-Entity roleplay failure at the Character Dialogue controller boundary and identify the first identity-contract violation.
- [x] 12.2 Interpret explicit `entity:<entityId>` roleplay input as a character `CreativeEntityRef`; keep `@name` resolution separate and forbid picker/name fallbacks for explicit identities.
- [x] 12.3 Add Webview-to-controller path tests proving the stable Entity ID reaches canonical profile assembly and unresolved identities fail visibly.
- [x] 12.4 Run focused Agent/Webview/Extension gates, record the Agent evaluation disposition, and repeat Extension Development Host acceptance when the runtime becomes available.

## 13. Creative Entity Dashboard compatibility cleanup

- [x] 13.1 Audit shared DTOs, Entity Host commands, Inspector/Canvas/Assets consumers, Agent Search, Character Dialogue and character evidence for Creative Entity Dashboard dependencies; identify the canonical facade/query replacement for each path.
- [x] 13.2 Remove Dashboard creative-entity shared contracts, package exports, Entity source implementation, command registration/activation, row-to-search projection and related tests without deleting owning Entity, candidate, binding, draft, memory or semantic data; rename the still-owned Agent task mirror to the host-neutral `TaskProjection` canonical path and delete Dashboard task/project aliases.
- [x] 13.3 Replace Agent creative-entity search and Character Dialogue assembly/evidence with canonical Entity facade/service and explicit evidence ports; limit roleplay results and picker entries to confirmed character Entities.
- [x] 13.4 Replace or remove Assets/Canvas/Inspector Dashboard consumers, add path assertions that poison removed commands/contracts, and run focused producer/consumer tests plus removed-surface searches.
- [x] 13.5 Run OpenSpec validation, affected package typechecks/builds, focused Agent/Webview/Entity tests, Agent evaluation disposition, Neko quality review and Extension Development Host roleplay acceptance; record blockers and residual risk.

## 14. Explicit roleplay Candidate confirmation

- [x] 14.1 Capture the ordinary mention and roleplay payloads in Extension Development Host; prove the visible characters are open semantic `entity-candidate` projections rather than confirmed Entities.
- [x] 14.2 Define the explicit “confirm and roleplay” handoff: Webview submits stable Project Search identity, Host re-resolves the Candidate, Entity facade owns propose/confirm, and Character Dialogue receives only the returned confirmed Entity ref.
- [x] 14.3 Add red-capable Webview/protocol/router/controller/Search regression tests, implement the canonical confirmation path, and poison direct Candidate-to-dialogue or Webview-fact fallback.
- [x] 14.4 Run focused builds/tests, key-free Agent evaluation disposition, quality review, and Extension Development Host acceptance with the captured 小橘/小灰 fixture.
