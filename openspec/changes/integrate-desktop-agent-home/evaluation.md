# Agent Evaluation

Date: 2026-07-29

## Evaluation Scope

- Change/feature: Desktop Agent connection bootstrap, durable closed-Conversation context reads,
  canonical Tab/projection message ordering and Entity-authority-backed composer mention search.
- Decision and owning suite: `excluded` from provider-backed Evaluation for these focused
  corrections. The indexed `agent-runtime.session-workflows` suites own host-neutral Agent session
  behavior, but cannot exercise Electron connection epochs, Desktop AppHost ownership or Webview
  Tab bindings.
- Why real Evaluation is not required for the correction: Pi turn prompts, Skill injection,
  capability/Tool routing, provider/model selection, Pi Agent state and provider output are
  unchanged. Entity mention search is a deterministic pre-turn Host effect over canonical Entity
  authority and never enters the provider loop. The exported token estimator is the same Agent-owned
  implementation already used by live `PiConversationRuntime`; Desktop now applies it to
  authority-built persisted context.
- Canonical path and forbidden fallback: Electron fixed preload namespace →
  `DefaultDesktopAgentBridgeRuntime` → shared controller → Desktop workspace/Pi authority →
  package-owned Agent Root. Forbidden paths are a replacement connection for an exact epoch, a
  process-local runtime/model opened for a read-only context query, a transient timestamp Tab,
  active-Conversation fallback, VS Code, legacy `AgentSession`, mock and demo paths.

## Cases

- Reused, updated, created or excluded: `excluded`; no indexed provider-backed case was modified or
  invented for a deterministic Electron Host boundary.
- Evidence and coverage:
  - deterministic bridge regression proves exact-epoch idempotency and advanced-epoch fencing;
  - deterministic AppHost regression proves cold durable context reads use persisted authority;
  - deterministic controller regression proves Tab state precedes active Conversation projection;
  - deterministic content-effect regression proves canonical Entity/store and representation
    binding projection combines with workspace files without a filename fallback;
  - real Electron validation proves Agent Root mount, new Conversation, composer enablement,
    `@小` → `小橘 / 实体·角色`, and no recurrence of the three runtime diagnostics.
- Missing observability: provider-backed Pi turn, Tool confirmation and Activity/reload evidence
  remain the separate OpenSpec `6.5` functional gate.

## Verification

- Key-free validation: `pnpm test:agent:eval` is run as a harness/inventory gate only; it is not
  described as Desktop or real Agent behavior acceptance.
- Real cases and reports: no provider-backed case was run and no report was created.
- Blocked or unexecuted cases: provider/model/cost authorization has not been granted. Retired-host
  runtime validation is explicitly outside the current Desktop-only scope.

## Residual Risk

- The corrected Desktop initialization and local conversation controls are exercised without model
  cost. Credential exchange, provider context, real Tool confirmation, output projection, Activity
  and renderer reload after a real turn remain unverified until explicit authorization is provided.
