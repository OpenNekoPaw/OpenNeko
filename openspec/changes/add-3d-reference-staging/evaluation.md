# Agent Evaluation: add-3d-reference-staging

Date: 2026-07-19

## Evaluation Scope

- **Change/feature:** Purpose-aware `3d-reference` context delivery for appearance, pose/depth, camera, and panorama outputs.
- **Decision and owning suite:** `update` — `agent-runtime.creative-media-workflow` remains the correct owner, but it needs a new target-scoped canonical case and one unsupported-control failure case after downstream routing is implemented.
- **Why real Evaluation is required:** Tasks 6.2–6.4 change reference-token projection, multimodal attachments, media control routing, provider/model capability negotiation, and submission failure behavior. Those decisions can change real Agent/media behavior and are not pure parsing.
- **Canonical path:** VS Code Preview panel → exact live purpose captures → one `3d-reference` context → Agent context/evidence projection → Canvas/media purpose mapping → selected provider/model capability validation → submission.
- **Forbidden fallback:** Legacy `model-preview`, generic-image conversion, pose/depth as appearance, prompt-only success, dropped controls, provider rerouting, direct 3D upload, direct turn injection, or mock media submission.

## Cases

- **Update required — canonical:** Start with a real Preview-created context containing role-isolated outputs, select a supported media model, and prove effective role mapping plus successful submission from the canonical TUI/session owner.
- **Update required — failure:** Select a provider/model without the required control capability and prove failure before submission with no dropped, converted, prompt-only, or alternate-provider success.
- **Evidence:** Context identity/revision, output roles and ResourceRefs, effective provider/model identity, projected control fields, submitted request identity, terminal task state, diagnostics, and no-fallback facts.
- **Missing observability/input boundary:** The current Evaluation platform has no canonical TUI operation that originates a VS Code Preview `3d-reference` context. Directly injecting one into a turn would violate the platform ownership contract and cannot count as acceptance.

## Verification

- **Key-free validation:** `pnpm test:agent:eval` passed on 2026-07-19: 39 files and 278 tests passed; all-suite dry-run discovered 23 suites and 48 cases.
- **Real cases and reports:** Not run. No case/report is claimed as real Agent acceptance.
- **Blocked:** The downstream owner files are currently available for scoped implementation. A focused real TUI case remains blocked until Evaluation has a canonical Preview-context input operation; directly injecting a context into a turn would test a synthetic path rather than the product behavior.

## Interpretation

- Harness integrity and indexed-suite validity pass.
- Preview contract/materialization tests prove only deterministic upstream behavior; they do not prove provider capability negotiation or media request routing.
- The earlier standard-model-preview `excluded` decision is superseded for this follow-up because this proposal explicitly changes downstream media semantics.

## Residual Risk

- Residual product risk is limited to real-provider behavior: current audited adapters intentionally reject structured camera/panorama, and no real TUI case proves a supported pose/depth or appearance submission from a Preview-originated context.
- Unsupported provider/model controls have no real TUI acceptance evidence.
- The new focused cases must be authored and run after the downstream canonical path and neutral observability are available; a good final answer or dry-run cannot replace them.
