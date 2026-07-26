## Context

当前 Character 调用链为：

```text
Agent Webview
  -> Agent Extension ChatProvider
  -> Agent-owned CharacterDialogueController / EmbodyCharacterController
  -> Entity-owned CharacterDialogueRuntime / Session / Evidence / ProfileAssembler
  -> Agent-injected purpose-model responder
  -> Agent Webview legacy role-session projection
```

该结构有两个 owner：

- `neko-entity` 拥有角色 prompt、session、policy、evidence 和 profile assembly，超出通用 Entity 事实职责；
- `neko-agent` Extension 拥有 launch、route、cancel、exit、角色候选确认、证据 Host adapter 和 artifact apply，超出通用 Agent Host 职责。

本变更只移动现有能力并收敛 owner，不同时设计 CharacterProject/CharacterVersion 文件格式、World runtime、独立 Character Webview 或新的 Agent protocol。

## Goals / Non-Goals

**Goals:**

- 建立 `@neko/chara` 作为当前角色运行能力的唯一 owner。
- 让 Character core/application 保持 host-neutral。
- 让 VS Code 依赖只存在于 `@neko/chara/host-vscode`。
- 让 Agent Extension 只负责组合、消息 transport 和 Chat shell integration。
- 删除 Entity/Agent 中被取代的 Character implementation 和 export。
- 保持当前角色对话、Embody、证据、候选确认和 transcript 行为。

**Non-Goals:**

- 实现 CharacterProject、CharacterVersion、发布、持久 CharacterRun 恢复或 `neko-world`。
- 将所有 `Npc*` DTO 从 `@neko/shared` 迁走。
- 在本次创建独立 Chara Webview bundle；现有 Agent Webview 只继续承担 Chat shell projection。
- 修改 Pi Agent loop、模型 provider、Prompt composition 总架构或通用 Tool protocol。
- 把 Entity memory contribution automation 移入 Chara。

## Five-layer analysis

| Layer          | Decision                                                                                                                                                                                                        |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Responsibility | Chara owns character prompt/session/evidence/profile/roleplay/embody orchestration; Entity owns generic entity facts; Agent owns generic Pi session and Chat transport.                                         |
| Dependency     | `chara/core -> shared`; `chara/application -> chara/core + shared`; `chara/host-vscode -> chara application + entity/content/search + agent-types + vscode`; Agent Extension imports only Chara public entries. |
| Interface      | Preserve existing DTO and controller behavior in phase one; expose explicit package entries and small role-session host ports, without wildcard exports.                                                        |
| Extension      | New Character capabilities enter Chara application/adapter; Agent must not add package-local Character controllers or prompt logic.                                                                             |
| Testing        | Move existing tests with the implementation, add static import/ownership tests, poison old paths, and run focused Extension/Entity/Chara tests plus strict package checks.                                      |

## Decisions

### 1. Package shape

```text
packages/neko-chara/
  src/
    core/
      character-runtime-policy
      character-dialogue-profile-projector
      character-dialogue-session
      character-evidence
      embody-character-session
      npc-profile-assembler
    application/
      character-dialogue-runtime
      character-purpose-operations
    host-vscode/
      character-dialogue-controller
      embody-character-controller
      character-evidence-loader
      roleplay-project-search
    testing/
      vscode
```

Public entries are explicit:

- `@neko/chara`
- `@neko/chara/core`
- `@neko/chara/application`
- `@neko/chara/host-vscode`
- `@neko/chara/testing`

No wildcard export is added.

### 2. Core and application remain host-neutral

`core` and `application` must not import:

- `vscode`;
- React/Webview;
- `@neko-agent/extension`;
- Agent runtime implementation;
- `@neko/entity/host-vscode`;
- Search/Content Host adapters.

Character purpose operations may depend on the shared `ICapabilityPurposeTextRuntime` contract but not on Platform or provider implementations. This keeps one Pi/provider runtime while allowing Chara to own character-specific purpose projection and result parsing.

### 3. VS Code controller moves as a Chara host adapter

The current controllers move to `@neko/chara/host-vscode`. They continue to use:

- `@neko-agent/types` for existing Chat shell messages and tab projections;
- `@neko/entity/host-vscode` for stable Entity facts and mutations;
- `@neko/content` and `@neko/search/host-vscode` for authorized evidence lookup;
- injected semantic responder/evaluator/enrichment ports for model behavior.

They must not import `@neko-agent/extension` or relative Agent Extension files. Roleplay candidate resolution therefore moves into Chara host-vscode, and logging uses a Chara-owned logger registry or injected logger.

### 4. Agent Extension becomes composition-only for Chara

`ChatProvider` may:

- instantiate Chara host controllers;
- inject purpose-model ports and current Webview/tab transport callbacks;
- route explicit role-session messages to the injected controller;
- render existing Chara projections inside the shared Chat shell.

It may not:

- create or mutate Character sessions directly;
- assemble character profiles or evidence;
- parse Character evaluation output;
- confirm Entity candidates with character-specific policy;
- define Character prompt or runtime policy.

Router and slash handler dependencies use Chara public controller/port types. The old Agent controller and evidence files are deleted, not re-exported.

### 5. Entity returns to generic entity ownership

`@neko/entity` continues to own:

- Entity/Candidate stores and facade;
- relationships, occurrences and representation hints;
- Entity asset bindings and visual identity facts;
- generic Entity capability/search/reference contribution;
- Entity memory contribution processing.

It no longer exports Character Dialogue, Embody, roleplay prompt, Character evidence, Character model/tool policy or NPC profile assembly. Chara consumes Entity through public refs/readers and host services.

### 6. Shared DTO migration is deferred explicitly

Existing `NpcProfileSource`, `NpcTranscriptArtifact`, `NpcEvaluationReport`, role-session Webview projections and command payloads remain in `@neko/shared` / `@neko-agent/types` for this phase because they cross Entity, Chara, Agent Extension and Webview.

Moving them in the same change would combine package ownership migration with persisted/wire contract migration. A later contract OpenSpec may rename `Npc*` to Character types and move durable Character contracts to `@neko/chara/contracts`; until then:

- Chara is the semantic owner;
- Shared only hosts cross-package DTO;
- Agent must not interpret or mutate their domain meaning.

### 7. Agent Webview remains a shell projection

Existing role-session headers, handlers and tab rendering may remain in `@neko-agent/webview` during phase one because they are transport/display code coupled to the current single Chat Webview bundle. They must remain projection-only and consume Chara-owned session projections.

Moving UI into a separate Chara Webview package requires a separate design for bundle composition, shared store ownership and message registration. This omission does not permit Character runtime logic to remain in Agent Webview.

### 8. No compatibility path

The following old paths are deleted:

- `@neko/entity` Character runtime/profile/evidence exports;
- Agent Extension `chat/characterDialogueController`;
- Agent Extension `chat/embodyCharacterController`;
- Agent Extension `evidence/characterEvidenceLoader`.

All in-repository callers migrate in the same change. Tests must assert the old files do not exist. No compatibility barrel, alias, fallback import or duplicate implementation is retained.

### 9. Evaluation disposition

The change can affect character purpose routing and session behavior, so real Agent Evaluation is required in principle.

Authoring decision:

- behavior: Character roleplay/Embody session uses Chara-owned canonical path with the same configured purpose-model runtime;
- disposition: `create`;
- target owner: future `character.role-session` target-scoped suite;
- positive case: start an identified character, perform one roleplay turn, and observe Chara run/session identity plus configured purpose-model evidence;
- failure case: missing/stale character identity fails visibly and does not start ordinary Agent chat or legacy Entity controller;
- forbidden fallback: direct AgentSession injection, mock responder, old Entity Character runtime, old Agent controller.

Current blocker: Evaluation only drives the canonical TUI input path, while Character Dialogue/Embody currently have only VS Code command/Webview entry. TUI exposes no CharacterRun/role-session operation or corresponding neutral debug facts. Directly constructing a Chara session would violate Evaluation ownership. Therefore this change runs key-free harness validation and deterministic path tests, but must record real behavior acceptance as blocked rather than passed.

## Risks / Trade-offs

- [Package move causes circular dependency] → Chara depends only on `agent-types`, not Agent Extension/runtime implementation; Agent Extension depends on Chara.
- [Chara becomes a copy of Entity] → Chara consumes Entity refs/readers and does not move generic stores, candidate lifecycle or relationship facts.
- [VS Code adapter remains large] → The move fixes owner first; later refactoring may deepen the application interface, but no second controller is added now.
- [Shared Npc DTO obscures ownership] → Document Chara as semantic owner and defer wire/persistence migration explicitly.
- [Roleplay UI still appears under Agent] → Treat it as Chat shell projection only; runtime and policy imports are forbidden.
- [Evaluation cannot run real case] → Preserve the exact TUI input/observability blocker and do not substitute mocks.

## Migration Plan

1. Add package manifest, strict tsconfig, test config, logger/testing support and architecture tests.
2. Move host-neutral Character files/tests from Entity to Chara and update imports.
3. Move VS Code controllers/evidence tests from Agent Extension to Chara host-vscode.
4. Extract roleplay search/selection helpers to Chara and update Agent composition imports.
5. Remove old exports/files, update package dependencies, lockfile, boundary scripts and docs.
6. Run focused tests/typechecks/build, strict OpenSpec validation, Agent boundary checks and key-free Agent Evaluation.
7. Record real Evaluation blocker and residual UI/DTO migration risk.
