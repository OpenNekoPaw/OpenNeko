## Context

Agent launch/config correctly defaults to `ask`. The defect is in the Pi confirmation registry: a five-minute timer treats elapsed user decision time as a Tool failure even though the pending approval is a protected Agent runtime state rather than an HTTP or provider operation.

NewAPI image execution is owned by `packages/generation` and `packages/ai/sdk`. The generation executor supplies a ten-minute image task abort signal, but Node's Undici transport can terminate a request after roughly five minutes while waiting for response headers. The NewAPI adapter then correctly marks the submission outcome unknown, but the effective transport budget does not match the owning task budget.

The runtime boundary is Desktop Main -> package-owned Agent/Generation public ports -> NewAPI HTTP adapter. Desktop only supplies exact provider configuration and credentials. Existing persisted conversation configuration and generated artifacts are authoritative user data and are not migrated.

## Goals / Non-Goals

**Goals:**

- Preserve `ask` as the single canonical fresh-state execution mode across Agent contracts, Host configuration, launch projection, prompt construction and Webview presentation.
- Keep ask-mode confirmation identity-bound and pending until the user decides or the owning turn/runtime is cancelled.
- Align NewAPI image response-header and response-body transport timeouts with the ten-minute image task timeout.
- Use `https://www.nekoapi.com` as the fresh built-in gateway URL while leaving custom NewAPI endpoints unset until configured.
- Preserve exact configured provider routing and outcome-unknown diagnostics.

**Non-Goals:**

- Persisting an approval across a full Agent controller shutdown or application restart.
- Changing persisted modes on existing conversations.
- Automatically retrying an ambiguous image submission.
- Switching between `www.nekoapi.com`, `api.nekoapi.com`, or any other provider endpoint after failure.
- Changing video/audio task budgets or Canvas presentation.

## Decisions

### 1. Preserve the ask default and remove elapsed-time expiry

`packages/agent/contracts` owns the shared `ask` default, `packages/host` owns effective configuration defaults, `packages/agent/runtime` consumes the selected mode, and `packages/agent/webview` owns only recoverable presentation defaults. `PiToolConfirmationRegistry` owns only exact pending decisions. It does not impose a user-decision timer; approval resolves through the exact ToolCall identity, its AbortSignal, conversation deletion or controller disposal.

Alternative: default all conversations to `auto`. Rejected because it changes the permission contract instead of fixing approval lifecycle and allows cost-bearing mutations without the user's configured approval boundary.

Alternative: extend approval to ten minutes. Rejected because elapsed user decision time is not a provider timeout; any fixed duration can still fail a valid pending approval.

### 2. Own the ten-minute HTTP transport in the NewAPI image adapter

`packages/ai/sdk` creates a request-scoped Undici dispatcher with ten-minute `headersTimeout` and `bodyTimeout`, passes it to the exact NewAPI image fetch, consumes the response under that dispatcher, and closes/destroys the dispatcher in `finally`. The producer is `MediaGenerationExecutor`; the consumer is the configured NewAPI endpoint. `packages/generation` retains its existing ten-minute task abort as the outer owning operation bound.

Alternative: increase only the Generation executor timeout. Rejected because the observed five-minute failure occurs inside the transport before the outer timer.

Alternative: change Undici's global dispatcher. Rejected because it would silently alter unrelated Agent, MCP, download and provider requests.

### 3. Keep a single exact provider path

The fresh built-in Neko Gateway resolves to `https://www.nekoapi.com`; the custom NewAPI provider has no default URL. The adapter continues to derive one URL from the explicitly resolved `provider.apiUrl` and the canonical `/v1/images/generations` or `/v1/images/edits` path. No retry or secondary-domain selection is added. A transport failure remains local to that request; ambiguous post-submission failures remain non-retryable.

No production logic is added to `apps/neko-desktop`; it retains only credential/configuration wiring required by the Electron trust boundary.

## Risks / Trade-offs

- **Longer occupied HTTP connection** -> The dispatcher is request-scoped and always released; the outer AbortSignal still supports cancellation.
- **Approval may remain pending for a long time** -> It is protected by exact conversation/ToolCall identity and is cancelled by owning turn cancellation, conversation deletion or controller disposal without retaining an HTTP request.
- **Provider closes before ten minutes** -> Report the exact transport diagnostic; do not retry or switch endpoint.

## Migration Plan

1. Keep every fresh-state execution mode at `ask` and remove the confirmation registry's elapsed-time expiry.
2. Add deterministic tests for long waits, exact approval and owning cancellation.
3. Add the request-scoped ten-minute NewAPI transport dispatcher and timeout/cancellation/cleanup tests.
4. Keep focused Agent Evaluation coverage for the canonical approval path.
5. Rollback restores the confirmation timer and adapter dispatcher without rewriting persisted conversations or artifacts.

## Open Questions

None.
