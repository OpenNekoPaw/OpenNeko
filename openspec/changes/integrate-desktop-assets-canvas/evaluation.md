## Evaluation Scope

- Change/feature: Desktop Resource Browser → explicit Canvas document authoring, Canvas Host runtime
  injection, multi-document View composition and presentation-state recovery.
- Decision and owning suite: `excluded` from provider-backed Agent behavior evaluation. The affected
  owners are Assets Resource Browser, Canvas domain/Webview and Desktop Host composition; no Agent
  prompt, Skill, Tool schema, capability routing, provider/model selection, conversation/session
  workflow or Agent event projection changed.
- Why real Evaluation is not required: every changed input is a versioned deterministic Host/UI
  contract. A provider response cannot choose the target Canvas, rewrite the locator, bypass the
  expected revision or alter the resulting `.nkc` mutation.
- Canonical path: package-owned Resource Browser projection → stable `ContentLocator` plus explicit
  Canvas document/session identity → Canvas Host intent → owning Canvas authoring/session → durable
  `.nkc` snapshot.
- Forbidden fallback: active/recent Canvas inference, renderer-owned candidate/delivery state,
  VS Code commands in Desktop, demo Canvas surface, absolute-path payload and optimistic local
  acceptance.

## Cases

- Excluded behavior is covered by deterministic producer/consumer, stale identity/revision,
  cancellation, authorization, placement/provenance, dual-session isolation, save/reopen and
  architecture-poison tests in Assets, Canvas and Desktop.
- Existing Workspace Board delivery coordinator tests remain the owner evidence for idempotent
  delivery, writer fencing, conflict/retry and stable provenance. Desktop adds no alternate
  candidate or delivery implementation.
- No Agent runtime observability is missing for this decision: the changed path is fully observable
  before and after Agent boundaries and does not accept Agent-selected implicit targets.

## Verification

- Key-free harness: run `pnpm test:agent:eval` as repository Evaluation infrastructure regression
  evidence only; record the result in `verification.md`.
- Real cases and reports: not created or executed because the disposition is `excluded`.
- Blocked or unexecuted cases: no provider credential/model/cost authorization is requested for this
  non-Agent change.

## Interpretation

- Deterministic tests, Canvas document facts and Host identity/revision assertions are authoritative
  for this change. A successful generated answer or Judge score would not prove the Resource/Canvas
  canonical path.

## Residual Risk

- Agent-authored Workspace Board deliveries retain the evaluation evidence and risks of their owning
  change. Any future Desktop Tool/capability that lets an Agent select or mutate a Canvas target must
  change this disposition and add focused real TUI evaluation.
