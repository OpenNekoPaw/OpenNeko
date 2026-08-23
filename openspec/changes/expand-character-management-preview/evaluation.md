## Acceptance inventory

| Area                 | Required state                                                                                | Deterministic evidence                                                               |
| -------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Exact version        | Summary, version label/identity and published time follow the selected immutable version      | Version-switch and cross-Character reset tests passed.                               |
| Character facts      | Background, origin setting, Canon, knowledge boundary, behavior and expression are visible    | Populated preview component test passed.                                             |
| Representation/model | Every reference kind, identity and resource locator plus portrait/avatar defaults are visible | Populated and unconfigured component tests passed.                                   |
| TTS                  | Provider, voice reference, speed and auto-read are visible or explicitly unconfigured         | Populated and unconfigured component tests passed.                                   |
| LLM ownership        | UI explains that chat provider/model belongs to the exact Conversation                        | Component assertion passed.                                                          |
| Read-only            | No input, textarea, edit, save or publish control exists                                      | Component and functional scenario assertions cover this.                             |
| Adjacent action      | Start Conversation keeps the selected exact version                                           | Component action test passed; visible Desktop handoff run is infrastructure-blocked. |

## Verification

- Chara Webview: 5 files / 26 tests passed; typecheck, ESLint and Prettier passed.
- Desktop Agent Surface handoff consumer: 20 tests passed.
- OpenSpec strict validation, application boundaries and Webview boundaries passed.
- A dedicated visible scenario seeds a Character with full representation/TTS data and verifies both the read-only detail and
  the DSH handoff. It could not start because another process owned the checkout's development Vite bundle, so no current
  screenshot was available for direct image review.

## Quality interpretation

Risk level is L3 for the preview surface. The review found and corrected stale selected-version state when navigating between
two Characters. The projection remains a direct read of the existing Character snapshot and adds no edit IPC, durable field,
fallback model or second DTO.

## Residual risk and blockers

- Wide/narrow visible layout and long-content scrolling still require a successful authoritative Desktop run and direct image
  inspection after the development bundle owner releases the checkout.
- Repository-wide `check:unused` is red on pre-existing/concurrent unused files, dependencies and exports; none are introduced
  by the preview files or the new scenario.
