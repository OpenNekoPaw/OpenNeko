## 1. Agent approval lifecycle

- [x] 1.1 Restore every production fresh-state Agent execution-mode default to `ask` across contracts, Host effective configuration, runtime prompt construction and Webview presentation.
- [x] 1.2 Remove the confirmation registry's elapsed-time expiry while preserving exact ToolCall approval, denial, AbortSignal cancellation and controller disposal.
- [x] 1.3 Add producer/consumer and registry tests proving the ask default, a wait beyond five minutes remains pending, late approval succeeds and owner cancellation prevents execution.

## 2. NewAPI image transport timeout

- [x] 2.1 Configure the fresh built-in gateway URL, keep the custom NewAPI URL unset, and add a request-scoped image HTTP dispatcher with ten-minute headers/body timeouts, exact configured URL routing, parent cancellation and deterministic cleanup.
- [x] 2.2 Add adapter tests proving the ten-minute dispatcher configuration, cleanup on success/failure, preserved outcome-unknown classification and absence of secondary-host retry.

## 3. Agent Evaluation and verification

- [x] 3.1 Reuse focused Agent Evaluation coverage for the canonical ask-mode GenerateImage approval path and confirm that no evaluator introduces an automatic permission bypass.
- [x] 3.2 Run OpenSpec validation, affected package tests/typechecks and repository quality review; record actual commands, unexecuted real-provider/UI cases and residual risk in `verification.md`.
