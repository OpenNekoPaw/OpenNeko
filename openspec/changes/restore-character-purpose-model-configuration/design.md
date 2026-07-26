## Context

当前 Character Dialogue/Embody 调用链已经正确收敛为：

```text
Chara session
  -> ICapabilityPurposeTextRuntime
  -> VSCodePiPurposeModelRuntime
  -> ConfigManager.resolveModelRefForPurpose(character.*)
  -> exact Pi provider/model
```

`resolveModelRefForPurpose` 只读取显式 `default_model_purposes`，不会从普通 Agent
会话选择、`default_models.llm` 或兼容模型目录推断。这一 fail-visible policy 是既有架构约束，
但角色入口没有在运行前建立 binding，导致旧配置用户能创建角色 tab，却无法得到第一轮回复。

## Goals / Non-Goals

**Goals:**

- 在任何 Character model operation 前保证所需 purpose 已显式绑定。
- 让用户通过一次明确选择完成配置，而不是要求手工编辑 TOML。
- 原子写入缺失的 `character.dialogue` / `character.profile` bindings，并保留已有值。
- 保持 Chara host-neutral application 与 provider/config runtime 解耦。
- 用路径级测试证明 exact purpose binding 被使用且所有 fallback 未参与。

**Non-Goals:**

- 不增加角色会话级或 turn 级模型切换器。
- 不复用普通 Agent tab 的 `selectedProviderId` / `selectedModelId`。
- 不改变角色 Prompt、session DTO、Webview message schema 或 Pi completion protocol。
- 不自动迁移、推断或静默写入没有用户确认的默认模型。

## Five-layer analysis

| Layer | Decision |
| --- | --- |
| Responsibility | Chara owns when a role session requires model readiness; Platform owns purpose capability validation and config persistence; VS Code Agent Host owns user interaction and composition. |
| Dependency | Chara receives a narrow async preparation port and never imports Platform/provider runtime; Extension imports public Chara and Platform entries; Webview remains projection-only. |
| Interface | Add one atomic `setDefaultModelPurposeRefs` Platform operation and one `preparePurposeModels` Chara Host port. Neither exposes Pi models or credentials to Chara. |
| Extension | Additional product-purpose setup can reuse Platform validation; future Character-specific selection can replace only the Host preparation implementation without changing Chara sessions. |
| Testing | Platform tests cover atomic validated persistence, Chara tests cover launch/route gating, Extension tests cover explicit selection and no-fallback composition, and Agent Evaluation status remains explicit. |

## Decisions

### 1. Keep explicit independent purpose keys

Runtime continues to resolve `character.dialogue` and `character.profile` independently. When both are
missing, the setup flow may write the same user-selected model to both keys in one explicit operation, but
the stored config retains two sibling entries and later configuration may diverge them.

Alternative rejected: resolve either purpose from `agent.main` or `default_models.llm`. This recreates
implicit routing, makes role behavior depend on unrelated Agent configuration, and violates the accepted
flat model-policy contract.

### 2. Add one atomic validated Platform mutation

`ConfigManager` receives a purpose-binding mutation that:

1. accepts known purpose keys plus exact provider/model refs;
2. resolves the current provider and model catalog;
3. rejects missing, disabled, mismatched or capability-incompatible selections before writing;
4. merges updates with existing `defaultModelPurposes`;
5. persists once through the existing `IUserConfigManager` and reloads the canonical config snapshot.

The API is general Platform configuration ownership, not a Chara-local config writer. It does not validate
credentials; credential availability remains the Pi runtime's external-provider boundary and fails visibly
during execution.

### 3. Inject model readiness into Chara Host controllers

Character Dialogue and Embody controllers receive a required `preparePurposeModels` async port. They await
it before creating a new session and before routing a message in an existing session. This prevents a
partially usable role tab and also repairs already-open sessions created before configuration exists.

The port returns only after required bindings exist. Cancellation or failure rejects with an explicit
diagnostic; controllers keep their existing error projection and do not invoke the responder.

Alternative rejected: catch the missing-binding exception inside Chara's responder. That would move
provider/config recovery into the domain completion path and allow session mutation before readiness is
known.

### 4. Use VS Code Quick Pick as a one-time Host configuration surface

The Agent Extension preparation implementation reads both character purpose bindings. If any are missing,
it presents enabled chat-model options from the canonical Platform model catalog. The selected exact
provider/model is written only to missing keys; existing bindings are never overwritten.

The choice is a global roleplay default, not a per-session override. When there are no selectable models or
the user cancels, preparation fails visibly and no fallback path runs.

Alternative rejected: add a Character model selector to the Agent Webview. The current defect needs a
configuration closure, not another session-scoped state owner or new Webview protocol.

### 5. Preserve one canonical runtime

After preparation, Chara still calls `ICapabilityPurposeTextRuntime`, and
`VSCodePiPurposeModelRuntime` resolves the persisted exact purpose entry. The setup path never calls the
model directly and never injects a temporary ref into a role session.

## Risks / Trade-offs

- [The first roleplay launch opens a native Quick Pick] -> It occurs only when an explicit binding is
  missing and prevents creation of a broken session.
- [One initial choice is used for both dialogue and profile] -> The write remains two independent explicit
  keys; advanced users can later diverge them without changing runtime semantics.
- [Config write succeeds but credential is unavailable] -> Pi credential validation remains fail-visible;
  no alternate model is selected.
- [Existing session lost its configured model after external config edit] -> Message routing re-runs
  preparation before invoking the responder.
- [Quick Pick cannot be exercised by TUI Agent Evaluation] -> Deterministic tests prove configuration and
  no-fallback paths; real Character role-session Evaluation remains blocked on the previously recorded
  absence of a canonical TUI Character input and neutral runtime facts.

## Migration Plan

1. Add and test the atomic Platform purpose-binding mutation.
2. Add the Chara preparation port and gate launch/message paths before session/model work.
3. Compose a VS Code Quick Pick configurator from Platform catalog and ConfigManager.
4. Poison main/default-model fallback in regression tests.
5. Update configuration documentation and Evaluation evidence.

Rollback removes the interactive setup and preparation port while leaving any explicitly written purpose
bindings valid. No existing binding or valuable user data is deleted.

## Open Questions

None for this scoped repair. A persistent Character model settings surface or per-session override requires
a separate product/UX change.
