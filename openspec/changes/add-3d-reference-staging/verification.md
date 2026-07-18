# Verification: add-3d-reference-staging

Date: 2026-07-19

This is the current implementation evidence. The change remains active because downstream Canvas/media routing, automated Webview scenarios, system-document synchronization, and full repository gates remain incomplete or blocked as described below.

## Design and reuse audit

- Preview owns temporary 3D reference sessions, immutable built-in guide metadata, exact local-resource authorization, Three.js projection, purpose captures, cancellation, and recursive disposal.
- Existing `ModelPreviewProvider`, `LocalResourceAccessService`, `PreviewService`, shared `ResourceRef`, shared UI primitives, theme tokens, and i18n runtime are reused. No second design system, path resolver, cache manager, Engine client, panorama provider lifecycle, or durable 3D project was introduced.
- `3d-reference` is the only successful replacement context. Legacy `model-preview` parsing and generic-image fallback are poisoned inside this boundary.
- Built-in guide geometry is project-authored and procedural. It is structurally restricted to pose/camera guidance and cannot produce appearance output.

## Built-in catalog and production bundle

Production build command:

```text
pnpm --dir packages/neko-preview compile:webview
pnpm --dir packages/neko-preview copy:webview
```

Measured output:

| Item                               |       Raw |      Gzip | Notes                                                                                |
| ---------------------------------- | --------: | --------: | ------------------------------------------------------------------------------------ |
| `assets/model.js`                  | 908.18 kB | 242.46 kB | Only `model.html` loads the 3D entry                                                 |
| Built-in preset binaries           |       0 B |       0 B | Mannequin, props, studio, and panorama grid are project-authored procedural geometry |
| Catalog aggregate binary increment |       0 B |       0 B | No Draco, Meshopt, KTX2, worker, or third-party model payload                        |

`buildOwnership.test.ts` proves every non-model HTML entry points to its own main module and contains no model entry or `model.js` reference. Catalog validation proves immutable identity/capabilities/dependencies/provenance/license notices. All current presets use `LicenseRef-OpenNeko` with project-owned redistribution metadata.

## Extension Development Host evidence

Host: VS Code Extension Development Host on macOS, verified through the existing CDP endpoint and the repository `vscode-extension-debugger` workflow.

### Built-in no-source guide

- Invoked `neko.preview.openThreeReferenceGuide` in the running Development Host.
- Observed guide-only notice, disabled appearance purpose, enabled pose/camera purposes, pose preset/joint controls, ground grid, XYZ indicator, and purpose capture controls.
- Runtime facts: 32 nodes, 15 meshes, 1 material, 0 animations.
- Cached production resource timings: `model.js` 17 ms, shared React chunk 4 ms; decoded model entry size 908,183 bytes.
- Pose skeleton preview rendered without editor chrome. After a real Extension Host reload, no capture-runtime diagnostic was produced; the earlier diagnostic came from a retained pre-build provider instance and did not reproduce on the rebuilt canonical path.

### External real model

- Used only `~/Git/neko-test/test.glb` (33,859,320 bytes). The model was never copied into this repository or a repository fixture.
- Initial view was front-facing and framed the complete character.
- Observed 39 model nodes, 37 meshes, 37 materials, 0 animations; black clothing, textured garments, hair, accessories, limbs, and tail were present.
- Orbiting to a side angle preserved model content and material color. Reset returned to the front view. Ground grid and XYZ indicator remained visible.
- External GLB resource load measured 170 ms in the supported host (cached transfer size is unavailable; decoded size was 33,859,320 bytes).
- Closing the editor removed the Preview Webview CDP target within the first 500 ms poll. Provider/runtime unit tests additionally assert idempotent recursive disposal and simultaneous-panel isolation.
- Console inspection reported no Preview runtime errors; the only message was VS Code's unrelated `local-network-access` feature warning.
- Capturing appearance and camera outputs materialized two 140,949-byte PNGs under the external workspace's `.neko/.cache/resources/three-reference-captures/` directory. No new capture was written to Preview `globalStorageUri`, and the previous “File access path outside allowed roots” diagnostic did not recur.
- Starting from the canonical empty Agent entry state (`activeTabId: null`, no open tabs), Preview created and bound a local conversation before context injection. The Agent Webview displayed one `3d-reference` chip with `appearance · camera`, no alert, and no recurrence of “Cannot send context payload without an active conversation Tab.” No provider request was submitted during this acceptance check.

Manual screenshots were kept outside the repository at `/tmp/neko-3d-reference-test-glb-latest.png`, `/tmp/neko-3d-reference-test-glb-rotated.png`, and `/tmp/neko-3d-reference-builtin-guide.png`.

## Focused validation completed

```text
pnpm exec vitest run packages/neko-preview/packages/extension/src/__tests__/webviewHtmlCsp.test.ts packages/neko-preview/packages/webview/src/model/buildOwnership.test.ts
# 2 files, 19 tests passed

pnpm --dir packages/neko-preview build
# extension.js 691.8 kB; copied the current Webview production assets

pnpm --dir packages/neko-preview compile:webview
# production Vite build passed; model.js 908.18 kB / 242.46 kB gzip

pnpm --dir packages/neko-preview exec vitest run packages/extension/src/providers/model/threeReferenceCaptureMaterialization.test.ts packages/extension/src/providers/model/ThreeReferenceOutputCollector.test.ts packages/extension/src/__tests__/extension.test.ts
# 3 files, 25 tests passed

pnpm --dir packages/neko-preview compile:extension
# production Extension bundle passed; extension.js 693.3 kB

pnpm exec vitest run packages/neko-agent/packages/agent/src/runtime/__tests__/message-runtime.test.ts
# 1 file, 68 tests passed

pnpm exec vitest run packages/neko-agent/packages/extension/src/chat/message/__tests__/attachmentProcessor.test.ts packages/neko-agent/packages/extension/src/chat/__tests__/chatProvider.test.ts
# 2 files, 45 tests passed

pnpm exec vitest run packages/neko-agent/packages/webview/src/presenters/__tests__/reference-token-presenter.test.ts packages/neko-agent/packages/webview/src/components/ChatView/InputArea/AgentContextChip.test.tsx
# 2 files, 9 tests passed

pnpm --dir packages/neko-agent run compile
# production Agent Extension and Webview builds passed
```

Earlier focused contract/provider/runtime/UI/materialization groups passed 28 tests in 6 files, and the cumulative focused Preview groups passed 44 tests. Relevant ESLint and `git diff --check` checks passed at their implementation checkpoints.

Agent Evaluation disposition is `update` for `agent-runtime.creative-media-workflow`. `pnpm test:agent:eval` passed with 39 files / 278 tests and strict discovery of 23 suites / 47 cases. This is harness integrity only. The required real canonical/failure cases are blocked by the missing TUI Preview-context input boundary and unfinished downstream routing; see `evaluation.md`.

## Active blockers and residual risk

1. `scripts/webview-functional/` is entirely deleted in the current user worktree, including its VS Code controller and Preview scenario fixtures. Restoring or extending it would overwrite user-owned deletions, so tasks 7.1 and 7.2 remain open. This also explains the reported missing `scripts/webview-functional/vscode-controller` path.
2. Agent task 6.2 is complete: invalid `3d-reference` payloads fail visibly, role-labelled prompt/evidence projection and chips are canonical, exact ResourceRefs become multimodal attachments, and empty-entry injection creates a conversation through the existing bridge. Canvas/media projection and capability negotiation in tasks 6.3–6.5 remain open; overlapping unrelated work in those files must still be preserved.
3. System ADR, architecture index, and package-boundary files already have unrelated edits. Task 8.2 remains open; only clean Preview-owned documentation was updated.
4. Real-model appearance/camera capture and role-labelled Agent context injection are complete, but real-source panorama composition and provider-level role-isolated generation are not; task 7.3 remains open.
5. Full repository `pnpm build`, `pnpm test`, `pnpm check`, legacy-debt, unused, functional, and real Agent evaluation gates have not yet been accepted for this change. Task 7.5 and final verification task 8.3 remain open.
6. The full Preview Vitest run passed 320 of 321 tests; the unrelated standard-format matrix test is blocked because its repository fixture `triangle.glb` is absent. The focused capture/collector/extension regression group passed completely.
7. The Preview Extension `tsc --noEmit` command remains blocked by pre-existing DOM/WebCodecs library configuration errors in `neko-client` plus existing unrelated Preview strict-test errors; the production Extension bundle and focused regression tests pass.
