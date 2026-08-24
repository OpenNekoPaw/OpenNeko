## 1. Extension Mode And Catalog Presentation

- [x] 1.1 Promote Skill/MCP/Professional Applications into one prominent icon-and-label mode selector outside the search toolbar.
- [x] 1.2 Add compact package headings without duplicating page hierarchy; catalog snapshots load automatically on mount.
- [x] 1.3 Remove non-actionable Skill/ready-MCP metadata while preserving local MCP failure diagnostics and Professional Application operation facts.
- [x] 1.4 Refine catalog cards with a stable icon/name heading, two-line summary, quieter boundary and accessible interaction feedback.
- [x] 1.5 Keep canonical kind markers, distinct icons, bounded responsive layout and Project catalog isolation.

## 2. Verification And Delivery Evidence

- Evidence 2.1: Focused Agent Webview, Professional Applications, Desktop composition and style tests cover prominent modes, reduced metadata and responsive rules.
- Evidence 2.2: Focused tests, package/Desktop typechecks, `pnpm check:openspec` and `git diff --check` were run with unrelated pre-existing failures recorded separately.
- Evidence 2.3: Real Electron Extension validation across Skill/MCP/Professional Application modes, representative content states and direct screenshot inspection is recorded in `verification.md`.

## 3. Extension Detail Overlays

- [x] 3.1 Add package-owned Skill/MCP detail Overlay with complete metadata, diagnostics and a selected catalog-card state.
- [x] 3.2 Move Professional Application configuration and operation controls out of catalog cards into one package-owned detail Overlay.
- [x] 3.3 Refine application icon, status tag, detail button, selected card, Overlay hierarchy and responsive styles without adding a Desktop Scene or split Surface.

## 4. Detail Verification Evidence

- Evidence 4.1: Agent, Professional Applications, Desktop style and composition tests cover open/selected/close cycles and single configuration ownership.
- Evidence 4.2: Focused tests, package/Desktop typechecks, boundary checks, `pnpm check:openspec` and `git diff --check` were run.
- Evidence 4.3: Skill and Professional Application Overlays passed in real Electron; MCP detail passed package tests while the real catalog's empty MCP state was verified because no MCP fixture was available.

## 5. Compact Card Catalog

- [x] 5.1 Remove manual refresh and grid/list presentation controls from Agent and Professional Application catalogs.
- [x] 5.2 Compact Skill, MCP and Professional Application cards and increase useful wide-view card density without clipping summaries.
- [x] 5.3 Add a presentation-only all/added Skill filter derived from `user-dsh` and `project-agents` sources. Superseded by 9.1 after loaded-catalog semantics review.

## 6. Compact Catalog Verification Evidence

- Evidence 6.1: Package and Desktop style tests cover fixed card mode, absent redundant controls and source-filter behavior.
- Evidence 6.2: Focused tests, typechecks, boundary checks, OpenSpec and diff validation were run.
- Evidence 6.3: Full and narrow Electron Extension scenes, compact cards, filter counts and detail open/close behavior were validated as recorded in `verification.md`.

## 7. Card And Detail Density Refinement

- [x] 7.1 Replace stretching extension columns with bounded-width card tracks and start alignment.
- [x] 7.2 Align card summaries with titles, add a truthful detail affordance and remove icon-column whitespace.
- [x] 7.3 Reduce Skill/MCP Overlay width, avatar scale, spacing and metadata weight without hiding authoritative facts.
- [x] 7.4 Align catalog header, toolbar and card grid to one bounded content track without stretching cards.
- [x] 7.5 Keep first-row card borders visible on hover and make the search field flex across wide and narrow catalog layouts.

## 8. Density Refinement Verification Evidence

- Evidence 8.1: Focused component and style contracts cover bounded cards and compact detail hierarchy.
- Evidence 8.2: Focused tests, package typechecks, boundary checks, OpenSpec and diff validation were run.
- Evidence 8.3: Dense catalog and open-detail states were inspected in the real Electron Extension scene.
- Evidence 8.4: The shared catalog content track was verified in focused style tests and the real Electron scene.
- Evidence 8.5: First-row hover borders and responsive search sizing were verified in focused style tests and the real Electron scene.

## 9. Loaded Catalog Semantics Correction

- [x] 9.1 Remove the Skill all/added source filter and keep all loaded Skill sources in one searchable catalog.
- [x] 9.2 Add an accurate empty state for an unconfigured MCP catalog without adding an installed-state filter to MCP or Professional Applications.
- [x] 9.3 Update focused package and Desktop style tests for loaded catalog semantics and bounded search sizing.
- [x] 9.4 Validate Skill, MCP and Professional Application modes in the Development Electron scene.
- [x] 9.5 Align the Skill, MCP and Professional Application search fields to the full catalog content track so their displayed width follows the card grid at every supported container size.
