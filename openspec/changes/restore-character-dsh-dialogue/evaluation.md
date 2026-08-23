## Scope

- Risk level: L4 because the change affects Agent launch routing, DSH Conversation identity and first-turn execution.
- Canonical path under review: Character detail/Entry selection -> strict DSH Character target -> Chara launch service ->
  frozen Character context -> exact DSH Conversation -> visible scene attachment.
- World Experience remains outside this change and is rejected explicitly instead of using an Assistant fallback.

## Cases and evidence

| Case                             | Evidence                                                                         | Result                                                                                                                                                 |
| -------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Strict exact Character target    | Agent contract parser tests                                                      | Passed; empty participants and forged shapes are rejected.                                                                                             |
| Detail handoff adoption          | Agent Webview and Desktop Agent Surface tests                                    | Passed; the exact binding is visible before the handoff is acknowledged.                                                                               |
| No Assistant fallback            | Agent Webview submit assertion and Desktop session-host poison test              | Passed; Character input delegates to the domain turn port and the generic prompt port is not called.                                                   |
| First-turn atomic visibility     | Desktop session-host ordering/failure tests                                      | Passed; scene completion runs only after the domain turn succeeds and is skipped on failure.                                                           |
| Frozen Character context         | Existing Chara interaction and Desktop adapter suites                            | Passed; the exact CharacterRun/CharacterVersion context is submitted through the Chara adapter.                                                        |
| Launch-binding harness readiness | `entry-assistant-first-submit`, `workspace-bound-first-submit` key-free dry-runs | Passed. The current Evaluation DSL has no Character binding kind, so this is harness readiness only.                                                   |
| Visible Development Electron     | `character-management-dialogue` Desktop functional scenario                      | Infrastructure-blocked before launch: another process owned this checkout's Vite bundle. No current screenshot or provider-backed result was produced. |

Focused verification completed:

- Agent contracts: 18 files / 114 tests passed.
- Agent Webview: 5 files / 58 tests passed.
- Chara application: 44 files / 241 tests passed.
- Desktop session host: 34 tests passed; Desktop Agent Surface: 20 tests passed.
- Agent contracts/Webview, Chara and Chara Webview typechecks passed.
- OpenSpec strict validation, application boundaries, Webview boundaries, ESLint, Prettier and `git diff --check` passed.

## Interpretation

The deterministic evidence proves one exact owner path and rejects the former immediate-clear/Assistant-success paths. The
quality review found and corrected an attachment ordering defect: the visible draft is now attached only after the first
Chara-owned turn succeeds. No remaining code-review finding was identified in the changed path.

## Residual risk and blockers

- Provider-backed visible Electron Character dialogue acceptance remains unverified. The failed report is under
  `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-23T19-10-17.585Z-character-management-dialogue-development/report.json`.
- Character turns intentionally accept plain text only in this change; commands, Skills, images, references and Canvas context
  fail visibly rather than bypassing Chara context.
- Full Desktop typecheck/test and repository unused/package/Agent gates are red from unrelated concurrent worktree changes
  (`desktop-workspace-quick-creation.test.ts`, `WorkspaceQuickCreateControl`, package reachability/tool inventory and existing
  unused exports). Focused changed-path tests pass.
