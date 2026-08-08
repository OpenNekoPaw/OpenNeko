# Agent Evaluation: Canvas Generation Recipe Nodes

## Evaluation Scope

- Change/feature: remove Agent composer direct Image/Video/Audio modes while retaining natural-language media generation through Agent Tools; Canvas Generation Node authoring and result fill are adjacent non-Agent behavior.
- Decision and owning suite: `update` and reuse `agent-runtime.workflow-controller` for the retained Agent Tool path and its no-fallback evidence. `excluded` for Canvas Generation Node execution because its public path is a typed Canvas operation, and `excluded` for static Agent control absence because package contract/Webview tests plus visible UI validation are authoritative.
- Why real Evaluation is or is not required: removing Agent submit routing can regress Tool registration, purpose/model binding, GenerationJob observation, durable artifact projection or Board delivery, so one real provider-backed Agent case is required. Canvas authoring does not invoke Agent and must not gain an Evaluation-only control or direct runtime shortcut.
- Canonical path and forbidden fallback: `visible Conversation composer -> Agent Turn -> approved typed Generation Tool -> exact Workspace GenerationJob -> durable generated-output -> Conversation/Board projection`. Forbidden paths are Agent direct submit, media `SessionMode`, hidden Conversation, Canvas routing, alternate provider/model, active/recent Workspace and generic Task substitution.

## Cases

- Reused, updated, created, or excluded: update the existing `media-tool-terminal-result` and/or `workspace-board-delivery-resume` coverage in `agent-runtime.workflow-controller` rather than creating a new suite. Add the smallest failure coverage needed for a stale or unavailable generation binding. Exclude Canvas node execution and Agent control visibility from Agent Evaluation.
- Evidence and coverage: the positive case must capture exact provider/model purpose, Conversation/Turn/ToolCall identities, GenerationJob identity and terminal revision, committed generated-output locator/digest, Board delivery target, terminal idle state and zero forbidden-path facts. The failure case must capture same-Conversation Tool failure before provider/Job success and zero fallback facts.
- Missing observability: implementation must audit whether current Desktop facts distinguish Agent Tool submission from the removed direct-operation contract and identify exact Board target plus provider/model/Workspace fallback counters. If unavailable, add only package-owned neutral runtime facts used beyond Evaluation; do not infer the path from final text or introduce case-specific hooks.

## Verification

- Key-free validation: planned command is `pnpm test:agent:eval` after suite/case updates. It validates schemas, runner semantics, suite discovery and hard-gate readiness only.
- Real cases and reports: after implementation, run the selected case through the complete Desktop session owner and actual visible composer with an explicit provider/model and cost authorization. Store raw reports only under gitignored `reports/agent-eval/` and record the redacted report location, effective identities, artifact evidence and usage/cost availability here.
- Blocked or unexecuted cases: no provider-backed or visible Desktop Agent run was attempted during proposal authoring because product code and Evaluation cases are not yet implemented and no explicit cost authorization was provided. Canvas functional/UI validation is deferred to implementation and cannot be replaced by Agent Evaluation.

## Interpretation

- Result and quality comparison: no behavior or quality claim is made by this proposal. The future acceptance criterion is deterministic canonical-path and no-fallback evidence; no Judge or baseline comparison is required for this routing change.
- Confirmed failures vs attribution hypotheses: current code confirms the presence of Agent direct-operation contracts/UI branches and the absence of Canvas Generation Node authoring. It does not prove a provider behavior failure. Any future real-case failure must be attributed from assertion-level evidence rather than final answer text.

## Residual Risk

- Until the provider-backed visible Agent case passes, removal of the direct controls may have unintentionally broken natural-language generation, exact model binding, terminal Job observation or Board delivery.
- Until visible Canvas functional/UI validation passes, deterministic tests cannot prove control discoverability, compact layout, preview rendering, progress/error clarity or imported-Media behavior.
- Because Generation persistence and projection change, implementation acceptance must explicitly audit basic and multi-turn conversation, compaction continuation, complete owner/application reopen, generation-record restoration, Conversation switching and transcript/queue/config/context/artifact isolation; reused, unaffected and blocked cells must be named.
