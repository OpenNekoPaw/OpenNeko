# Verification

## Result

- Implementation: passed.
- Functional Electron scenarios: Cut and Preview passed. Desktop Workbench produced the requested settled Sidebar and Settings artifacts, then failed later while activating an Assistant session because the fixture exposed no available model; the failed run is retained and is not reported as a scenario pass.
- Agent visual review: failed. The current screenshots expose user-visible defects, so the UI report remains failed as advisory evidence. This result does not affect code-quality gates, task completion, commit, merge, or release.

## Scope And Ownership

- Risk: L1. This change updates repository development policy, a repository Skill, deterministic orchestration tests, and existing functional scenario evidence. It does not change product runtime contracts or user data.
- Shell-owned Sidebar and Settings states remain in `desktop-workbench-scenes`.
- Cut and Preview evidence remains in each package-owned functional scenario.
- The existing scenario registry, runner, screenshot artifact contract, and local-only GUI entry remain canonical. No pixel baseline, alternate runner, product Agent integration, or GUI CI path was added.
- The Skill and screenshot-coverage contract now run only through the explicit `test:local:ui:contract` entry. Generic orchestration retains only a negative reachability check and does not execute UI scenarios, inspect pixels, or consume UI outcomes.
- Neko Agent Evaluation: `excluded`. The changed Skill is a repository development workflow; product prompts, Skill Host injection, capability routing, provider/model selection, AgentSession behavior, and Desktop Agent event projection are unchanged.

## Commands

- Passed: Skill Creator `quick_validate.py` for `.codex/skills/neko-ui-validation`.
- Passed: `node --test scripts/local-ui-validation/ui-validation-skill.test.mjs` (6 tests).
- Passed: `pnpm check:test-orchestration` (91 tests plus ownership/config audits). The six UI contract tests are intentionally outside this gate.
- Passed: `pnpm exec openspec validate expand-agent-visual-ui-validation --strict`.
- Passed: scoped Prettier check and `git diff --check`.
- Passed: midpoint-aware `cut-openneko-consumer` and `preview-openneko-consumer` runs through the canonical development runner.
- Failed: the first settled Desktop Workbench run exceeded the 120-second scenario budget. A rerun with a larger scenario budget produced the Sidebar and Settings artifacts, then failed in a later Assistant-session activation because the fixture reported `无可用模型`.
- Earlier infrastructure attempts are retained: the first Cut launch and two Preview launches exceeded the standard 60-second CDP startup timeout before a renderer target was available. No scenario assertions or visual artifacts were produced by those attempts.

Current midpoint reports:

- Passed: `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-06T18-39-55.546Z-cut-openneko-consumer-development/report.json`
- Passed: `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-06T18-40-47.621Z-preview-openneko-consumer-development/report.json`
- Failed at 120 seconds: `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-06T17-31-48.593Z-desktop-workbench-scenes-development/report.json`
- Failed after the requested Shell captures: `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-06T17-34-27.393Z-desktop-workbench-scenes-development/report.json`

The successful Cut report records ready and seek timeline duration/midpoint/presentation as `4 / 2 / 2` seconds and authoring as `6 / 3 / 3` seconds. The successful Preview report records video duration/midpoint/presentation as `4 / 2 / 2` seconds with playback paused. Both paths used their visible seek controls. Failed development attempts caused by concurrent Vite reloads, an intermittent unprepared Cut preview request, and a packaged run that did not release the prior playback request remain under the same report root and are not treated as passing evidence.

## Agent Visual Findings

Every artifact below was opened and inspected directly at its current pixels. Scenario status, DOM readiness, filenames, and earlier evidence were not used as substitutes for visual review.

| Acceptance state         | Settled artifact                        | Direct observation                                                                                                                                                                    | Uncertainty                                                                                                                                                  | Result |
| ------------------------ | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| Cut editor ready         | `01-cut-editor-ready.png`               | The preview and timeline both visibly show the colored fixture at `00:02.00 / 00:04.00`; the playhead is at the duration midpoint. Clip labels still collide with the audio controls. | Motion is covered separately by functional evidence; the visible label/control collision independently establishes failure.                                  | failed |
| Cut playback seek        | `02-cut-playback-seek-visible.png`      | The settled post-seek state again shows the colored fixture at `00:02.00 / 00:04.00`, with the ruler playhead at 2 seconds. Clip label/control overlap remains visible.               | The still does not prove motion or resource release; the successful scenario supplies those functional assertions.                                           | failed |
| Cut authoring complete   | `03-cut-authoring-complete.png`         | The active `authoring.otio` tab shows a colored frame at `00:03.00 / 00:06.00` and three authored clips. Multiple clip titles overlap mute/audio controls.                            | Export, persistence, and reopen are functional evidence; the visible text/control collision independently establishes failure.                               | failed |
| Sidebar compact          | `01-primary-sidebar-compact-large.png`  | Compact icon rail, expand control, settings action, main Agent surface, and composer are stable and visible without clipping or overlap.                                              | Hover/tooltips are outside this still-state scope.                                                                                                           | passed |
| Sidebar restored/resized | `02-primary-sidebar-restored-large.png` | Expanded labels, project count, footer actions, main Agent surface, and composer are stable after resize without overlap.                                                             | Minimum/maximum drag limits are covered functionally, not by this one still.                                                                                 | passed |
| Settings workbench       | `08-settings-workbench-large.png`       | Primary navigation, Settings navigation, General heading, startup selector, and panel boundaries are stable, coherent, and readable.                                                  | Only the initial General section is captured.                                                                                                                | passed |
| Preview image            | `01-preview-image-ready.png`            | The fixture image is rendered and recognizable after settlement. The resource toolbar and content continue beyond the right viewport edge, exposing horizontal layout overflow.       | The image's large surrounding whitespace may be intentional contain behavior; the right-edge clipping is independent.                                        | failed |
| Preview audio            | `02-preview-audio-ready.png`            | Audio identity, timeline, volume, speed, and transport controls are visible after settlement. The primary navigation remains shifted beyond the left viewport edge.                   | Playback progression is functional evidence; the still only shows one active playback instant.                                                               | failed |
| Preview video            | `03-preview-video-ready.png`            | A colored midpoint frame is visible with the player reading `0:02 / 0:04` and the progress control centered. The app-level left navigation remains clipped.                           | Motion is not inferred from the still; the report separately proves paused midpoint presentation and resource release.                                       | failed |
| Preview PDF              | `04-preview-pdf-ready.png`              | Page count, zoom controls, page content, and horizontal scrollbar are visible after settlement. Primary navigation remains clipped, and page content is cropped at the captured zoom. | PDF cropping may partly follow the displayed 150% zoom, but the app-level left clipping is independent.                                                      | failed |
| Preview GLB              | `05-preview-glb-ready.png`              | Scene hierarchy and inspector show the expected character node, but no 3D canvas or model is visible in the active main surface; app-level left clipping also remains.                | `modelReady` and `meshCount=1` prove loading only and do not prove visible GPU presentation.                                                                 | failed |
| Preview glTF             | `06-preview-gltf-ready.png`             | Scene hierarchy and inspector again show the expected character node, but no 3D canvas or model is visible; app-level left clipping remains.                                          | The screenshot cannot determine whether the canvas is absent, zero-width, or occluded, but it does establish that the required model presentation is absent. | failed |

Overall UI result: `failed`.

## Quality Review

- No new production `any`, unsafe cast, logger, path resolver, cache, contract, fallback, compatibility route, or hidden success path was introduced.
- Package boundaries remain intact: app-owned Shell evidence is not moved into feature packages, and feature-owned evidence is not moved into the Desktop composition root.
- Screenshot capture happens after the existing functional state boundary and a bounded presentation-settlement wait; the Cut post-authoring capture additionally waits for the saved clip name in the active Main panel.
- The explicit local UI contract rejects returning to immediate capture after readiness, asserts both capture labels and contribution to scenario evidence, and retains trusted interaction, authoring, viewer readiness, and resource-release assertions.
- Non-passing UI evidence remains visible: Cut clip overlap, Preview horizontal overflow, and missing visible GLB/glTF rendering are failed. The prior Cut time-zero ambiguity is resolved by current midpoint artifacts rather than reclassified from old pixels.
- These visual findings are advisory follow-ups. They become code-blocking only if independent functional, contract, security, or code-gate evidence establishes the same defect.

## Residual Risk

- The standard local UI command's 60-second startup timeout is below the observed cold Vite build duration on this machine. The Desktop Workbench also exceeded a 120-second scenario budget, and its larger-budget rerun later failed because no model was available; this change intentionally does not alter runner or fixture policy.
- Concurrent repository builds can trigger Vite page reloads during development scenarios. Those interrupted Cut attempts and the packaged resource-release failure are preserved as failed reports; only the uninterrupted development pass is used for current midpoint evidence.
- The one-second settlement interval is bounded and follows semantic readiness, but it is not proof of completion for every future host or asset. If a current artifact still cannot distinguish loading, source timing, or presentation, the Skill requires `blocked` instead of extending assumptions into a pass or failure.
- The new screenshots cover the requested large Desktop states. They do not add small-window Cut/Preview states, dark theme, high-DPI variants, hover/focus states, or animation quality.
- Screenshot artifacts live under ignored local reports and are not stable pixel baselines. Revalidation must generate and inspect current evidence.
- Because UI validation is intentionally non-blocking, a developer may complete, commit, merge, or release without rerunning these local scenarios; the remaining risk must stay visible rather than being represented as a passing UI report.
