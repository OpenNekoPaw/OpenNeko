# Validation

## Deterministic Gates

- `pnpm --dir packages/neko-tools run typecheck`: passed.
- `pnpm --dir packages/neko-tools test -- --run`: passed, 10 files / 39 tests.
- `pnpm build`: passed, 8 build tasks.
- `pnpm test`: passed, 28 package tasks.
- `pnpm check`: passed; Knip and dependency-cruiser reported no violations.
- `pnpm check:quality`: passed; 62 OpenSpec items, 83 orchestration tests, application/Agent/Webview/Engine boundaries, strict TypeScript and ownership audits passed.
- `pnpm test:agent:eval`: passed in isolation, 40 files / 282 tests and 24 suites / 53 indexed dry-runs. This is harness evidence only; the deleted Agent surfaces remain excluded from real behavior Evaluation as documented in `evaluation.md`.
- `git diff --check`: passed.

## VS Code Runtime Evidence

- Host: VS Code `1.130.0`, Apple Silicon.
- Synthetic fixture preparation passed at `.tmp/vscode-test-workspaces/media-runtime`.
- `pnpm smoke:vscode:targets -- --skill vscode-extension-debugger --require-webview --expect-extension-id openneko.neko-suite` did not find the composed OpenNeko extension in the active debugger targets.
- The reachable Extension Development Host was not using the required isolated synthetic workspace. It was therefore not inspected or reused, and no screenshot, DOM, console, message, media or workspace data was captured.
- Task 8.4 remains open. Image/audio/video comparison, Git comparison, cancel/timeout, Media Info, concurrent viewer and disposal behavior still require a fresh `Debug Dev (All)` session that loads `.tmp/openneko-vscode-dev` and opens only the synthetic fixture.

## User Data Safety

- No real `.nkv`, `.nkc`, `.otio` or media file was opened, migrated, rewritten, moved or deleted.
- `.nkv` coverage uses synthetic rejection fixtures only and asserts that no writer or migration path runs.
- Four 14-byte untracked probe artifacts produced by the test run (`-decoders`, `-encoders`, `-filters`, `-version`) were removed from `packages/neko-media`; they were generated test output, not user data.

## Remaining Risk

- Deterministic tests cover cancellation forwarding, timeout abort, partial session cleanup, stop failure, viewer disposal and request identity validation, but a real Extension Development Host has not yet proven that no FFmpeg/media session survives the complete Webview lifecycle.
