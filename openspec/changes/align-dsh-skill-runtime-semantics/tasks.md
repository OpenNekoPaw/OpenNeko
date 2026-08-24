## 1. Freeze the DSH contract and remove normative drift

- [x] 1.1 Record an rc.8 compatibility inventory for Skill layouts, frontmatter, sources/ranks, scope resolution, invocation policies, model catalog rendering, explicit multi-invocation and resource guidance using public DSH packages.
- [x] 1.2 Update `AGENTS.md`, Accepted ADRs, active OpenSpec and quality scans so DSH-valid Skill prose is not rejected merely for naming public Tools/models; retain private protocol, permission and trust boundaries.
- [x] 1.3 Add poison checks rejecting fixed Skill-count, single-primary-Skill, profile-first and OpenNeko-owned selection/loader rules.

## 2. Restore exact scoped lookup

- [x] 2.1 Add a host-neutral Conversation Skill lookup context whose Assistant and Workspace forms carry exact authority without exposing physical paths to Renderer.
- [x] 2.2 Resolve the authorized Workspace cwd or opaque equivalent in Desktop Main and atomically update DSH Session create/list/load/resume producers and consumers; fail local when the binding is unavailable.
- [x] 2.3 Replace unscoped management and duplicated snapshot calls with one bridge helper using the exact Agent scope and lookup cwd; add global-view labeling and incomplete-catalog diagnostics.
- [x] 2.4 Prove project, personal, custom, runtime and bundled precedence with producer/consumer tests and confirm no bundled mirror or virtual-cwd Session success path changes DSH semantics.

## 3. Preserve invocation and resource capabilities

- [x] 3.1 Replace the single `skillName` request with one canonical ordered multi-invocation contract across contracts, runtime, Desktop and Webview; delete the old field and fixtures atomically.
- [x] 3.2 Preserve all DSH model/user invocation-policy combinations in bridge and management projections, including negative user/model catalogs.
- [x] 3.3 Add directory/flat Skill and relative-resource fixtures proving DSH on-demand guidance, non-preloading, authoring traversal rejection and sibling isolation. Missing-resource reads remain owned by the current authorized filesystem Tool rather than a second Skill resource API.
- [x] 3.4 Project only safe management fields and add tests proving physical path, resource base, body and unknown metadata do not leak to Renderer.

## 4. Evaluation and delivery

- [x] 4.1 Update `agent-runtime.skill-runtime` with the Evaluation dispositions and cases in `evaluation.md`; run key-free validation and all-suite dry-run.
- [ ] 4.2 Run focused real-provider hidden cases and one visible Desktop Composer multi-Skill case, preserving exact reports or infrastructure blockers.
- [x] 4.3 Run focused contract/bridge/runtime/Desktop tests, package typechecks, `pnpm check:openspec`, boundary scans and quality review; record actual commands, canonical-path evidence and residual risk.
