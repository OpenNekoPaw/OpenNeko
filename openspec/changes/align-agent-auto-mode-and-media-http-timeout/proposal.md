## Why

Agent approval currently uses a five-minute timer for the user's decision. A valid pending Tool confirmation therefore turns into a Tool failure even though no provider request was running and the user neither denied nor cancelled it. NewAPI image generation separately exposes a ten-minute task budget while the underlying HTTP transport can close at roughly five minutes, producing misleading outcome-unknown failures before the owning media timeout.

## What Changes

- Keep `ask` as the canonical execution mode for new Agent conversations and make identity-bound confirmation wait for a user or owner cancellation instead of expiring after 300 seconds.
- Give NewAPI image request headers and response bodies the same ten-minute transport timeout as the image generation task.
- Use `https://www.nekoapi.com` as the fresh built-in Neko Gateway URL, keep the custom NewAPI URL unset until explicitly configured, and use the configured provider URL only without automatic secondary-domain failover.
- Preserve fail-visible diagnostics that distinguish approval cancellation, HTTP transport timeout, provider outcome unknown, and owning media task timeout.

## Capabilities

### New Capabilities

- `agent-conversation-execution-mode`: Defines the canonical default and explicit approval behavior for Agent conversation execution modes.
- `media-provider-request-timeout`: Defines aligned, provider-specific HTTP and media task timeout behavior without implicit endpoint failover.

### Modified Capabilities

None.

## Impact

- `packages/agent/runtime` owns confirmation lifecycle and permission policy; `packages/agent/contracts`, `packages/host` and `packages/agent/webview` retain the canonical `ask` default.
- `packages/host` owns default launch/config projection and the fresh canonical Neko Gateway URL.
- `packages/ai/sdk` owns the NewAPI HTTP adapter and its transport boundary; `packages/generation` remains the owner of media task orchestration and the ten-minute image task budget.
- `apps/neko-desktop` remains a thin composition root and only wires the existing provider/configuration ports. No Desktop-owned timeout, provider fallback, or permission policy is introduced.
- Existing conversations retain their persisted execution mode; user data and generated artifacts are not rewritten.
