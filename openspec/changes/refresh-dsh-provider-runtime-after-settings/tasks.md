## 1. Contract And Runtime Source

- [x] 1.1 Replace the restart-required settings response with execution-change and runtime-effect contracts, updating all producers and consumers atomically.
- [x] 1.2 Make DSH product runtime prepare each subprocess generation from the latest canonical Provider and credential authority, publishing its execution catalog only after ACP connection succeeds.

## 2. Protected Runtime Refresh

- [x] 2.1 Add runtime-owned activity admission that preserves in-flight prompts, blocks new work while refresh is pending, and restarts immediately when idle.
- [x] 2.2 Wire Agent settings mutations to the refresh owner and automatically flush pending refresh after the active turn ends.

## 3. UI And Verification

- [x] 3.1 Replace the application-restart banner with a pending-refresh status and remove the old restart path from localized copy.
- [x] 3.2 Add producer, consumer, runtime lifecycle and UI tests covering immediate refresh, pending refresh, exact session preservation, latest catalog publication and fail-visible refresh errors.
- [x] 3.3 Run focused tests, typecheck, OpenSpec validation, Agent evaluation gates, authoritative Desktop UI validation and quality review; record commands and residual risks.
