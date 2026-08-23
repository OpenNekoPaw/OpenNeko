## Context

Chara 已实现 `CharacterConversationLaunchService`：它校验 immutable CharacterVersion，创建 CharacterRun 与
Dialogue/Room，调用 `CharacterAgentConversationPort` 发布 exact DSH Conversation，并在 commit 失败时释放未绑定
Conversation。Desktop 也已提供 `createCharacterAgentConversationAdapter`，可把 Chara turn context 投影为
DSH frozen Character payload。缺口仅在 composition 与 Entry producer：服务未实例化，DSH create target 只有
surface/project，Renderer 又在 Agent Entry 挂载后立即拒绝 Character handoff。

## Goals / Non-Goals

**Goals:**

- 让 Development 的单 Character detail 与 Agent Entry selector 走同一 Chara-owned canonical launch path。
- 首条输入只在 exact Character launch 成功后提交，并可见地传播 owner diagnostic。
- 证明没有 Assistant fallback、active Conversation fallback 或 test-only direct runtime path。

**Non-Goals:**

- 在管理页编辑 Character 或选择全局 LLM provider/model。
- 改变 CharacterVersion、Dialogue、Room、DSH Conversation 或 transcript 的 durable authority。
- 推广 Release Character capability。
- 把尚未完整组成的 WorldExperience 伪装成 Character/Agent Conversation。

## Decisions

### 1. DSH create target 复用 Character launch binding

`DshConversationCreationTarget` 增加 `kind: 'character-dialogue'` 的 canonical target，并直接携带现有
`AgentCharacterDialogueLaunchBinding` 所需的 exact mode 与 participants。Agent Webview 只从用户当前显式选择
生成该 target；零选择仍是 surface/project，多 Character 继续由既有 Room topology 语义处理，但本次产品入口
只验收单 Character Dialogue。

### 2. Chara launch transaction 先于首条 turn

Desktop session host 对 Character target 委托一个 Main-composed Chara application service。服务使用 DSH domain
conversation adapter 发布 exact bound Conversation，commit CharacterRun/Dialogue 后返回 conversation identity；
随后 session host 使用 Chara interaction path提交首条输入。任何阶段失败都拒绝当前 create 请求，不附着 draft，
不创建 Assistant Conversation。

### 3. Entry 接收 handoff 后才消费

Renderer 不再在 Workbench mount 时清空 handoff。Agent Webview 以 draft identity 接收一次 exact Character launch，
将其写入 package-owned draft presentation 后通知消费。切换场景只丢弃可丢弃 presentation，不修改 Character
durable facts。

### 4. World 保持 owner-qualified unavailable

当前 World Foundation Runtime 有 canonical launch/read/action service，但完整 WorldExperience Agent binding provider
仍未组成。该 selector 不得降级为 Assistant；本变更不新增 World 成功路径。后续 World promotion 必须由独立
OpenSpec 组成 World-owned typed binding、participant WorldView 和真实 Electron 验收。

## Ownership and Runtime Path

| Responsibility                 | Owner / public entry                               | Producer                                  | Consumer                          | Boundary         | Replaced path                                  |
| ------------------------------ | -------------------------------------------------- | ----------------------------------------- | --------------------------------- | ---------------- | ---------------------------------------------- |
| Character draft selection      | `@neko/agent-webview` DSH Root                     | Character detail handoff / Entry selector | DSH session host create           | Renderer/Webview | handoff immediate rejection / ignored selector |
| Character launch transaction   | `@neko/chara` `CharacterConversationLaunchService` | typed Character target                    | Character repository + Agent port | Node application | uncomposed service                             |
| Agent conversation publication | `@neko/agent-runtime` domain service               | Chara Agent port adapter                  | DSH session runtime               | Node/DSH         | ordinary surface publication                   |
| Desktop wiring                 | Desktop Main composition                           | typed IPC session host                    | package public services           | Electron Main    | renderer-owned diagnostic fallback             |

## User Data Impact

- 不迁移、不删除、不覆盖任何 Character、Conversation 或 transcript 数据。
- 失败的启动只清理本次尚未绑定的 Conversation；已提交的 Character launch aggregate 保持 canonical。
- Release presentation 与 durable data 行为不变。

## Evaluation Decision

更新 `agent-runtime.launch-binding` 的 key-free case，增加从可见 Character detail 到 Agent Entry、首次提交、exact
Character owner/terminal state 的 Development Electron case。若真实 provider/config 不可用，必须记录
`infrastructure-blocked`，不得用 direct runtime 或 mock 回复替代。
