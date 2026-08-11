## UI Validation Evidence

### Acceptance inventory

| Surface | Required result | Current evidence |
| --- | --- | --- |
| Character authoring | Storyline select/edit/publish/compare/restore/delete; no runtime progress | Webview tests pass |
| Companion memory review | Stable continuity candidates and entries with explicit accept/reject/delete | Webview tests pass |
| Main Presentation | Exact owner-qualified surface kind/provider ref; duplicate/unknown/mismatched providers fail locally without fallback | Host registry and Desktop focused tests pass |
| Narrative context | Frozen CharacterVersion and consumer-visible node background only | Renderer projection implemented; Desktop focused tests pass |
| Storyline Timeline | Read-only authored node order in bottom Workbench, with a distinct identity from RoomEvent timeline | Webview Timeline and Host Scene tests pass |
| Room participant manager | Exact participant, controller, CharacterVersion, node, AgentSession, participant-specific provider/model/TTS/capabilities and eligibility; commands affect one owner only | Read-only Renderer projection exists; Agent-backed configuration commands remain open |
| Companion Agent composition | One Character composer, exact CharacterVersion/effective Agent configuration, role-manager provider/model/capability controls, standard reference/Skill/Tool/Approval projections and no native-model lane | Single Character initial turn now uses the canonical Agent lifecycle and Agent-owned configuration; role-manager commands and complete Workbench composition remain open |
| Narrative Agent composition | Exact participant provider/model controls with Skill/Tool activation absent or disabled and an effective empty capability receipt | Agent lifecycle freezes the empty capability constraint, rejects references before Character runtime materialization and omits Skill/Tool runtime exposure; visible participant controls remain open |
| Character management presentation | Character presentation contains only TTS and representation controls; no stale Chara-owned provider/model summary remains | Stale chat-provider/model summary removed from Desktop Character management; focused source/test evidence only, no authoritative screenshot |
| Workspace Chara capability | Workspace Agent can invoke exact character use/preview/validation without rebinding; validation responder is tool-free and suggestions require confirmation | Only testing primitives exist; production ports, Agent catalog and visible Workspace composition remain open |

### Automated UI evidence

- `pnpm --filter @neko/chara-webview typecheck`
- `pnpm --filter @neko/chara-webview test -- --run` — 4 files, 14 tests passed.
- Focused Desktop Character renderer/runtime tests — 2 files, 54 tests passed.
- `pnpm --filter @neko/host test` — 38 files, 312 tests passed.

### Visible runtime disposition

A visible real-Electron validation was not claimed. The production Character promotion gate remains
active, the one-lane Character UI and canonical Agent-path migration are incomplete, and the shared
dirty worktree currently has unrelated Automation/Canvas type failures. Per fail-visible policy,
screenshots from a test-only bypass or a non-authoritative hidden route are not accepted as UI
evidence. The management presentation removal is therefore functionally covered but visually
blocked: no current authoritative screenshot proves spacing, empty-state balance or narrow-window
layout after the summary was removed.

Overall result remains **blocked** for visible-product acceptance. Automated evidence establishes
contract and functional behavior for the isolated Character surfaces, but it does not establish
pixel-level narrow-window layout, participant-exact configuration commands or Workspace Chara
capability composition.
