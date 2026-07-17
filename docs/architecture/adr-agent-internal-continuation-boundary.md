# ADR: Agent 内部续跑、消息队列与异步结果回传边界

状态：Proposed

本文记录 Neko Agent 在 TUI、eval、异步任务和 subagent 场景中，对内部续跑（Internal Continuation）、消息队列（Message Queue）和异步结果回传的边界决策。它补充 [`adr-agent-message-task-queue-boundary.md`](adr-agent-message-task-queue-boundary.md)、[`agent.md`](agent.md) 与 [`headless-project-authoring.md`](headless-project-authoring.md)。

## 背景

Agent 一次 turn 可以提交图片、视频、文档解析、subagent 等后台工作。当前 TUI 中，后台任务完成后会生成类似 `Continue from the completed async task result.` 的 prompt-like 输入，用于让主 Agent 读取稳定资源引用并继续完成原目标。

问题在于，这类输入由 runtime 生成，不是用户通过 composer 发送的消息。如果复用普通 `submit()` 路径，它会被 TUI 和 eval 误认为用户消息，导致：

- UI transcript 出现用户从未输入过的内部 prompt。
- eval 把 task continuation 计入 user-authored prompt，污染测试事实。
- 异步任务结果、用户排队消息和 subagent 回传共用语义，后续无法正确排序、取消或诊断。
- 批量异步任务可能每完成一个结果就触发一轮主 Agent，导致上下文抖动和重复评审。

OpenNeko 是本地 VSCode 客户端 + 本地 Rust/Node Engine 产品。本文只定义本地 Agent runtime/TUI/eval 的边界，不引入云端任务调度、多租户队列或远程 workflow 编排。

## 决策

### 1. 内部续跑是模型输入，不是用户 transcript 消息

Runtime-authored continuations MAY be delivered to the model as Agent turn input, but MUST NOT be displayed or recorded as user-authored transcript messages.

内部续跑只进入：

- turn timeline，用于解释 Agent 为什么继续执行；
- journal，用于恢复、诊断和审计；
- eval facts，用于断言异步结果续跑路径被命中。

内部续跑不得进入普通聊天 transcript，也不得以 `role: 'user'` 形式展示在 TUI 历史中。

### 2. Message Queue 与 Continuation Queue 在领域上必须区分

Message Queue 只表示用户意图等待执行。Continuation Queue 表示 runtime 生成的内部续跑等待执行。

实现上可以共享底层 ordered queue 或 drain 机制，但 queue item MUST 带有 source/display metadata，至少区分：

```ts
type AgentTurnSource =
  | 'user'
  | 'task-result-continuation'
  | 'subagent-result-continuation'
  | 'system-continuation';
```

TUI 展示、eval facts、journal 和 queue 操作不得只依赖文本内容推断来源。

### 3. 当前 turn 触发的异步任务结果默认优先续跑

如果异步任务由当前 Agent turn 触发，任务完成后产生的 continuation 默认优先于后续用户排队消息执行。这样可以保证例如“生成猫猫图片并进行质量分析”这类闭环目标不会被用户新问题插队打断。

用户仍应保留显式控制权：

- 可以中断当前 Agent 处理；
- 可以使用立即发送/抢占操作处理紧急消息；
- 可以取消尚未执行的用户 pending message；
- 可以在未来 UI 中延后或取消 pending continuation，但这不改变默认优先级。

这些控制操作 MUST 使用不同语义，不得混成一个隐式“发送”行为：

| 操作 | 语义 | 对当前 turn 的影响 | 对 pending continuation 的影响 |
| --- | --- | --- | --- |
| interrupt-current-turn | 停止当前正在运行的 Agent turn | 请求取消当前 turn | 不隐式丢弃，除非该 continuation 依赖被取消的 turn 且已失效 |
| send-now | 将用户消息抢占到 pending continuation 前执行 | 不隐式取消当前 turn；若当前 turn 正在运行，应等待可抢占点或要求用户先 interrupt | 不隐式丢弃，只改变排序 |
| discard-continuation | 明确丢弃某个内部续跑 | 不影响当前 turn，除非丢弃的是当前待执行 continuation | 标记为 discarded，并写入 timeline/journal/eval facts |

`send-now` 的目标是处理紧急用户意图，不是清理异步任务结果。若用户想放弃某个任务结果，应使用 `discard-continuation` 或等价 UI 操作。discard 必须可观测，因为它改变了后台结果是否被主 Agent 消费。

默认排序原则：

```text
same parent turn continuation
  -> already queued internal continuation
  -> user message queue
  -> unrelated stale continuation, if still valid
```

### 4. 批量任务默认 wait-all 聚合

多个相关后台任务属于同一 Task Group 时，默认 result delivery policy 是 `wait-all`：所有任务进入 terminal 状态后聚合一次 observation，再触发一次主 Agent continuation。

只有显式 streaming review、逐项质检或用户要求边生成边反馈时，才使用 `continue-on-each`。

Task Group MUST be declared when related background tasks are submitted. Observation runtime MUST NOT infer grouping after the fact by comparing prompt text, timestamps, task type, output paths, or conversation proximity.

创建 Task Group 的 owner 是提交批量任务的 capability/tool/runtime adapter，例如批量 `GenerateImage`、批量文档解析或 subagent batch spawn。Task result observation runtime 只消费以下契约字段：

```ts
interface AgentTaskGroupRef {
  readonly taskGroupId: string;
  readonly resultDeliveryPolicy: 'wait-all' | 'continue-on-each' | 'continue-on-threshold';
  readonly expectedTaskIds?: readonly string[];
  readonly parentMessageId?: string;
  readonly parentToolCallId?: string;
}
```

如果任务缺少 `taskGroupId`，observation runtime 按单任务处理。缺少 group contract 时不得静默猜测并返回聚合成功；这类路径应 fail-visible 或作为单任务 delivery 处理。

```text
TaskGroup(wait-all)
  task A completed
  task B completed
  task C completed
  -> group observation
  -> one continuation turn
```

### 5. Subagent 结果走同一 continuation 抽象，但 source 不同

Subagent completion 使用同一内部续跑抽象，source 为 `subagent-result-continuation`。

主 conversation 只消费 subagent summary、artifact refs、status、issues 和 confidence 等结构化结果，不消费原始 subagent sidechain transcript。subagent sidechain 可以进入 journal 或调试视图，但不得伪装成主 conversation 的用户消息或 assistant 消息。

## 推荐接口形状

TUI session SHOULD expose separate entry points for user-authored prompts and runtime-authored continuations:

```ts
interface SubmitInternalContinuationInput {
  readonly prompt: string;
  readonly source: 'task-result-continuation' | 'subagent-result-continuation' | 'system-continuation';
  readonly metadata: {
    readonly observationId?: string;
    readonly taskId?: string;
    readonly taskGroupId?: string;
    readonly subagentId?: string;
    readonly parentMessageId?: string;
    readonly runId?: string;
  };
}
```

普通用户输入继续使用 user submit path。内部续跑可以复用底层 `executePrompt()`，但不得调用会创建普通 user message 的入口。

## TUI 投影规则

TUI 可以显示一条 timeline 或 system note，例如：

```text
Task result ready: task_123. Continuing analysis from generated image result.
```

TUI 不得显示为：

```text
User: Continue from the completed async task result.
```

Queue UI 也必须区分：

| 类型 | 推荐展示 |
| --- | --- |
| 用户 pending prompt | `Queued message: queue-1` |
| task continuation | `Task continuation queued: task_123` |
| subagent continuation | `Subagent result queued: subagent-1` |

## Eval 与 Debug Automation 规则

Eval facts MUST expose source/display metadata so tests can assert canonical path:

- continuation exists;
- source is `task-result-continuation` or `subagent-result-continuation`;
- model turn consumed stable resource refs or summary refs;
- no user-authored message contains the internal continuation prompt;
- wait-for-idle waits for pending continuation queue and user message queue to drain.

测试不得只断言最终 assistant 文本成功；必须断言内部续跑没有通过普通 user submit path 假成功。

## 后果

### 正面影响

- TUI transcript 不再出现用户未输入的内部 prompt。
- eval 可以区分用户输入、任务续跑、subagent 回传和系统续跑。
- 异步图片生成后质检、EPUB 分析后 canvas 生成等闭环流程能保持上下文连续。
- 批量生成默认聚合，减少重复 turn 和上下文抖动。

### 代价

- TUI message model、queue item 和 debug facts 需要增加 source/display metadata。
- `submit()` 不能继续作为所有 prompt-like 输入的唯一入口。
- queue 操作需要明确哪些 item 可由用户编辑/取消，哪些是 runtime continuation。

### 非目标

- 不引入远程任务服务或云端 workflow scheduler。
- 不把 subagent sidechain 合并进主 conversation transcript。
- 不通过解析 prompt 文本判断 continuation 类型。
- 不为未来未知客户端抽象通用分布式队列。

## 验证要求

实现本文决策时，至少补充以下测试：

1. task result auto-resume 不新增 `role: 'user'` 的内部 continuation 消息。
2. model execution path 仍接收到 continuation prompt 和 metadata。
3. task continuation queued 时展示为 continuation event，不展示为普通 queued user message。
4. 当前 turn 触发的 task continuation 优先于后续 user message queue。
5. Task Group 默认 wait-all，只触发一次 group continuation。
6. Task Group 只能由提交批量任务的 owner 显式声明；observation runtime 不按文本、时间或路径事后归组。
7. `send-now` 只改变排序，不隐式丢弃 pending continuation；`discard-continuation` 会写入可观测事实。
8. subagent result continuation 只消费 summary/artifact refs，不导入 raw sidechain transcript。
9. eval facts 暴露 source/display metadata，并断言 canonical continuation path 被命中。
