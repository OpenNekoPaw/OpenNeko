## Context

当前存在两条互不相交的 prompt 结构：

```text
真实路径
  Extension SystemPromptManager / TUI
    -> SystemPromptBuilder
    -> PiConversationRuntime
    -> Skill catalog / explicit Skill invocation

不可达路径
  PromptModuleRegistry
    -> ModuleOrchestrator
    -> PromptSectionCache
    -> SystemPromptComposer
    -> projected modules
```

Agent `PromptManager` 只有公开导出，没有实例；Platform `PromptManager` 虽由 `createPlatform()` 构造，但只有 Extension 两个未调用 bridge 方法引用，因而不是实际 runtime consumer。

### Five-layer analysis

| Layer | Decision |
| --- | --- |
| Responsibility | Builder owns locale/execution-mode base selection and AGENTS.md host projection; Pi runtime owns actual Skill catalog/invocation composition; prompt-file runtime owns user-authored file IO planning. |
| Dependency | `@neko/agent` exposes Builder and evidence types; Extension/TUI inject host paths/config; Platform has no prompt template registry; Pi runtime consumes final base input plus Skill snapshot. |
| Interface | Canonical input is Builder config plus optional AGENTS.md content; canonical runtime output is one system prompt string and secret-free fragment evidence derived from the same inputs. |
| Extension | New domain capabilities remain dynamic Pi capability/Skill inputs. They do not register arbitrary prompt modules or mutate a global Composer. |
| Testing | Builder/path tests assert locale/mode/environment behavior; source-absence tests poison retired APIs; real TUI Evaluation asserts base/AGENTS/Skill facts and forbidden fallback. |

## Goals / Non-Goals

**Goals:**

- Reduce prompt construction to the path currently used by both Hosts.
- Delete all no-consumer framework code, tests, exports, docs and Platform registry state in one boundary.
- Preserve fail-visible locale/mode and AGENTS.md load behavior.
- Preserve secret-free path evidence without retaining Composer as an observability-only abstraction.

**Non-Goals:**

- Rewrite builtin prompt content or optimize prompt quality.
- Remove dynamic Skill/capability providers.
- Move tool schema, capability prompt or Skill content into AGENTS.md or Builder.
- Add a new registry/provider/factory around Builder.

## Decisions

### 1. Builder is the only base prompt authority

Extension and TUI construct or call `SystemPromptBuilder` directly. It selects the builtin locale/execution-mode prompt and exposes the loaded AGENTS.md overlay where the Host supports it. There is no Composer adapter, module registry or template manager between Builder and Pi.

### 2. Pi owns runtime Skill composition

`PiConversationRuntime` continues to combine the Builder-produced base with the exact `PiSkillHostSnapshot` used by the turn. Explicit Skill invocation remains a Pi user-turn operation. Capability Tool schemas remain in the capability bridge. Builder does not become a general runtime catalog.

### 3. Evidence is a value contract, not a Composer

`PromptCompositionFragmentProjection` moves to a small independent file. Builder/Pi runtime may emit id/source/order/version/hash facts only for fragments that actually participated. Prompt bodies, credentials, Host paths and hidden content remain absent.

The evidence producer cannot instantiate a retired Composer or reproduce a parallel composition solely for testing. Missing evidence fails the focused Evaluation.

### 4. Prompt managers are deleted

Agent `PromptManager` and Platform `PromptManager` have no production behavior. `Platform.prompts`, Extension `getPlatformPrompt()` and `registerPrompt()` are removed together. User-authored prompt files remain configuration/host file concerns and are not migrated into another runtime registry.

### 5. Prelaunch replacement has no compatibility surface

Retired files, symbols and Platform properties are added to source-absence checks. No deprecated exports, no-op managers, compatibility aliases or fallback template lookup remain.

## Evaluation

Authoring decision: `update` the existing `agent-runtime.prompt-composition` suite because it already owns base, environment and Skill composition behavior, but its evidence must come from the canonical Builder/Pi runtime rather than an empty or Composer-derived projection.

- Positive case: base plus explicit builtin Skill are present in actual TUI Pi composition.
- Boundary case: isolated workspace AGENTS.md augments base and does not replace it.
- Forbidden fallback: Composer, module registry, PromptManager, legacy Skill fragment or hidden prompt body projection.
- Deterministic gates: source absence, builder tests, Platform/Extension typechecks and prompt suite key-free validation.
- Real evidence: focused TUI cases with exact effective model/runtime identity and prompt fragment facts.

## Risks

- Existing TUI prompt composition facts currently expose no production fragments; the implementation must close this observability gap before claiming real Evaluation acceptance.
- Removing `Platform.prompts` is a public prelaunch API break. Full monorepo typecheck and unused analysis must prove no hidden consumer.
- AGENTS.md behavior differs by Host today; the implementation must preserve explicit path semantics and report any runtime gap rather than silently dropping content.
