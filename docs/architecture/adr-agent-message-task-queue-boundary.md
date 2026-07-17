# ADR: Agent 消息队列、任务队列与任务卡边界

状态：Accepted

本文记录 Neko Agent 对输入消息队列、Agent 任务队列和任务卡展示面的边界决策。它补充 [`agent.md`](agent.md)、[`package-boundaries.md`](package-boundaries.md)、[`adr-agent-idc-skill-planmode-trigger-boundary.md`](adr-agent-idc-skill-planmode-trigger-boundary.md)、[`adr-agent-autonomous-filmmaking-creation-boundary.md`](adr-agent-autonomous-filmmaking-creation-boundary.md) 与 `normalize-agent-webview-turn-timeline` 变更结论，用于避免 pending prompt、复杂任务 checklist 和后台工具任务在同一个对话 transcript 中混杂。

## 背景

Agent Webview 已经有三类相近但语义不同的进度展示：

- 用户在 Agent 忙碌时继续发送的 prompt 会进入消息队列。
- Agent 面对复杂目标时会生成计划、checklist、IDC task 或 creation iteration 进度。
- 媒体生成、工具后台执行和 subagent 运行会投影为 `AgentWorkItem`，并通过 `TaskCard` 或相关卡片展示。

如果这三类展示共用一个 UI 容器或同一条 transcript 追加规则，典型故障包括：

1. 尚未执行的用户消息提前显示为对话记录，用户误以为已经生效。
2. Agent 自己生成的 checklist 被当成用户 pending prompt，导致发送、编辑、取消语义错误。
3. 后台任务完成后跳到对话底部，脱离触发它的 tool call 或 assistant turn。
4. Webview 通过解析消息文本推断任务进度，绕过 runtime/extension 的权威状态。
5. 为了显示一个队列而复制第二套任务模型，和 `TaskManager`、IDC task projection、creation iteration 事实源分叉。

OpenNeko 是本地 VS Code 客户端 + 本地 Rust Engine 产品。这里的目标是建立清晰的本地 UI/协议边界，不引入云端编排、远程任务服务或多租户队列抽象。

## 决策

### 1. 三个展示面必须分离

Neko Agent 使用三种不同投影，而不是一个通用 queue/card 系统：

| 展示面 | 语义 | 权威来源 | 默认位置 |
| --- | --- | --- | --- |
| 消息队列 | Agent 忙碌时用户提交但尚未执行的 prompt | Agent runtime pending message queue | 输入框上方，模型/模式配置上方 |
| 任务队列 | Agent 为复杂目标生成的计划、checklist 或 creation iteration 进度 | Agent runtime / IDC task projection / creation tracking | 输入框上方的独立 progress surface，可展开或进入侧边任务面板 |
| 任务卡 | 具体后台工具、媒体或 subagent 工作项 | `AgentWorkItem` / `TaskManager` / media task projection | 对话时间线内，锚定到所属 message/tool item |

消息队列不得展示在对话记录中；任务队列不得伪装成待发送用户消息；任务卡不得迁移成全局 pending prompt 队列。

### 2. 消息队列只表示用户意图等待执行

消息队列项的生命周期是：

```text
composer submit while busy
  -> pending message queue
  -> promote/cancel/edit while still pending
  -> dequeue/release when runtime can execute
  -> ordinary user message in transcript
```

约束：

- pending item 在 release/dequeue 前不得作为普通 user message 进入 transcript。
- `promoteQueuedMessage` 表示尽快执行该 pending prompt，不表示创建任务。
- `cancelQueuedMessage` 只取消尚未执行的 prompt，不取消当前 Agent turn 或后台任务。
- `editQueuedMessage` 只回填 composer 并更新 pending prompt，不编辑历史消息。
- Webview 只消费 runtime/extension 发送的 `AgentMessageQueueSnapshot`，不得从 message list 反推 pending prompt。

### 3. 任务队列是 Agent 计划进度投影，不是第二套 Todo 系统

任务队列应投影现有 Agent 事实源：

- IDC plan/checklist 的 `Task` / `TaskItem`。
- creation / iteration 的活动状态与 checklist artifact。
- `TaskManager` 中由 IDC task projection 写入的 project task。
- 必要时的 prompt-chain checkpoint 或 skill lifecycle observation。

任务队列不直接复用消息队列契约，也不通过 `TaskCard` 列表拼装。它需要自己的 snapshot contract，例如：

```ts
interface AgentTaskQueueSnapshot {
  conversationId: string;
  queueId: string;
  version: number;
  status: 'idle' | 'planning' | 'running' | 'blocked' | 'completed' | 'failed' | 'cancelled';
  items: readonly AgentTaskQueueItem[];
  activeItemId?: string;
  completedCount: number;
  totalCount: number;
  source?: {
    kind: 'idc' | 'creation' | 'task-manager';
    runId?: string;
    creationId?: string;
    iterationId?: string;
    checklistPath?: string;
  };
}
```

具体字段应在 OpenSpec change 中落地，但必须满足：

- `conversationId` 必填，Webview 按会话隔离状态。
- `version` 为会话或队列内单调递增，Webview 忽略旧 snapshot。
- item id 稳定，状态更新不能依赖数组下标。
- artifact path 只能是项目相对路径、`${VAR}/path` 或受控 resource ref；不得保存 Webview URI、临时路径或 provider runtime handle。
- Webview 不负责解析 `checklist.md` 来发现进度；解析和投影属于 runtime/extension 或专门 adapter。

### 4. 任务卡保持时间线锚定

`TaskCard` 继续表示具体后台执行项，包括媒体生成、工具后台任务和可重试/可取消的 task work item。它的展示位置由 timeline parent anchor 决定：

```text
assistant turn
  tool call
    tool result / confirmation / error
    child TaskCard
```

约束：

- task/media/subagent update 必须锚定到所属 turn、message、tool call 或显式 parentless timeline item。
- 对于已锚定 work item，不得为了“全局任务队列”再追加一条独立 assistant message。
- 任务队列可以引用某个 work item 的摘要，但不能成为 `TaskCard` 的唯一权威位置。
- `TaskCard` 的 cancel/retry/view-result 语义保持针对具体后台任务，不承担 checklist item 编辑或 pending prompt 操作。

### 5. Webview 布局采用 composer rail 的分层顺序

Agent composer 附近的持久浮层按以下顺序组织：

```text
Chat history
────────────────────────
MessageQueueControls      用户 pending prompt
AgentTaskQueuePanel       Agent checklist/progress
ModeConfigBar             模型、模式、生成参数
Composer shell            @ / 命令 overlay、输入框、附件
```

`@` 引用和 `/` 命令提示框仍属于 composer shell 的临时 overlay。它们服务当前输入文本，不是持久 queue surface；因此不应提升到模型/模式配置上方。消息队列和任务队列是跨输入焦点存在的状态面板，可以放在模型/模式配置上方。

### 6. 操作必须来自真实 runtime 能力

任务队列第一版允许展示和跳转，不应预设没有 runtime 支撑的控制按钮。建议能力分层：

| 能力 | 条件 |
| --- | --- |
| 展开/折叠 | Webview 本地 UI 状态即可 |
| 打开 checklist artifact | 需要 extension host 路径授权和 open command |
| 取消当前 Agent run | 需要 runtime cancellation contract |
| 重试失败 item | 需要 item 与可重试 task/tool/iteration 的绑定 |
| 编辑 checklist item | 需要 Agent/runtime 变更入口，不能直接改 Webview 状态 |

没有明确 contract 的操作应隐藏或禁用，并通过诊断暴露缺失能力，而不是 no-op。

## 五层分析

### 职责

- `agent-types` 定义跨 runtime/extension/webview 的 queue snapshot、item、状态和 validator。
- `agent` 维护 pending message queue、任务/checklist 事实源、IDC task projection 和 task queue snapshot 生成。
- `extension` 负责 VS Code message route、资源路径投影、打开 artifact、取消/重试等 host effect。
- `webview` 只渲染 snapshot、维护展开状态、发送用户动作；不推断任务事实。
- `TaskCard`、`ToolCallDisplay`、timeline presenter 继续负责具体 work item 的时间线展示。

### 依赖

- Webview 不导入 VS Code API 或 runtime 实现。
- Extension 不导入 React。
- Agent task queue contract 留在 `@neko-agent/types`，不提前抽到 `@neko/shared` 或 `@neko/ui`。
- 不需要 Rust Engine 或 Protobuf 变更，除非未来任务源跨越 Engine runtime。

### 接口

- 消息队列继续使用 `AgentMessageQueueSnapshot`。
- 任务队列使用独立 `AgentTaskQueueSnapshot` 或等价契约。
- `AgentWorkItem` 继续服务 task/media/subagent 卡片和 dashboard projection。
- 所有 snapshot 必须带 conversation identity 和 monotonic version。
- 未知 status、未知 source、缺失 id 或跨会话 snapshot 应 fail-visible。

### 扩展

- 后续可以把 task queue 展开到侧边栏、dashboard 或 Codex 风格 task sidebar，但权威仍来自同一 snapshot。
- creation iteration 合约成熟后，task queue 可以从 `creationId` / `iterationId` 读取更稳定的创作身份。
- 多个 Webview 需要相同无业务 UI 时，可提取 `@neko/ui` primitive；Agent task queue 的领域投影仍留在 `neko-agent`。

### 测试

- `agent-types`：snapshot validator、status discriminant、version contract。
- `agent`：IDC checklist / creation iteration / TaskManager 投影到 task queue snapshot。
- `extension`：route 必须要求 conversation id，打开 artifact 走 host 授权，取消/重试缺能力时 fail-visible。
- `webview`：任务队列按 conversation 隔离，忽略旧 version，位于模型/模式配置上方，不进入 transcript。
- timeline：TaskCard 仍锚定在 tool/message 下方，不因任务队列存在而重复追加 assistant message。
- VS Code Webview 视觉/交互变更需要 Extension Development Host + `vscode-extension-debugger` smoke，不以普通浏览器验收替代。

## 后果

- 用户能区分“我刚发但还没执行的消息”和“Agent 正在推进的任务清单”。
- 复杂任务可以提供 Codex 风格的进度感，同时不污染对话记录。
- 现有 `TaskManager`、IDC task projection、creation iteration 和 `TaskCard` 可以继续演进，不需要复制一套队列状态机。
- 初期会增加一个专门的 task queue snapshot 和 presenter，但这是为了降低消息、计划和后台任务之间的长期耦合。

## OpenSpec 建议

后续实现应创建独立 change，例如 `introduce-agent-task-queue-surface`，范围限定为：

1. 新增 Agent task queue contract 与 validator。
2. 从现有 Task/IDC/creation 事实源生成 snapshot。
3. Extension route 和 host effect。
4. Webview `AgentTaskQueuePanel`，放在 composer rail 中、模型/模式配置上方。
5. Placement、conversation isolation、version、防 transcript 污染和 TaskCard 锚定测试。

不要在同一 change 中重构消息队列、重写 `TaskCard` 或引入远程任务编排。
