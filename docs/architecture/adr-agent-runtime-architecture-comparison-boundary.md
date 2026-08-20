# ADR: Agent Runtime 架构边界

状态：Accepted

更新日期：2026-08-21

范围：Agent runtime、DSH Session、Skill、typed domain Tool、Subagent、领域 Job 与 Electron Desktop 投影。

## 决策

OpenNeko 只保留一个 Agent/LLM/Session canonical runtime。DSH 子进程/profile 提供会话循环、模型调用、
Tool Call、Skill 和上下文管理；OpenNeko 领域能力通过 typed domain Tool contract 注入，
不得在 Canvas、Cut、Character 或 Desktop 中建立第二套 Agent loop。

```text
Desktop renderer
  -> typed Desktop port
  -> Desktop DSH Session Host
  -> ACP JSON-RPC stdio
  -> DSH Session / Tool lifecycle
  -> owning-domain application port
```

## 责任边界

| Owner           | 拥有                                                                  | 不得拥有                              |
| --------------- | --------------------------------------------------------------------- | ------------------------------------- |
| `AgentSession`  | conversation identity、turn、上下文、模型、权限快照、Tool Call        | 领域项目事实、媒体 Job、Renderer 状态 |
| Capability Host | discovery、trust、lifecycle、schema、当前 turn 的不可变 Tool snapshot | Agent transcript、领域内部状态        |
| Owning domain   | operation、validation、revision、持久事实、可恢复 Job                 | 通用 Agent 会话循环                   |
| Desktop Main    | session registry、文件与凭据授权、typed IPC、窗口和资源生命周期       | Agent/领域事实副本                    |
| Renderer        | 对话与 Activity 投影、输入草稿、选择和布局                            | 文件 IO、后台任务、持久会话权威       |

每个 Conversation、Agent Run、SubagentRun 和 Tool Call 都携带显式 identity。界面选择只切换
投影，不改变 runtime owner。跨窗口共享会话时由 Main 中唯一 owner 协调；不得复制 session
或用全局 active conversation 切换共享单例。

Agent-owned 工作直接使用 Tool Call。委派推理使用 SubagentRun。需要脱离当前 turn、页面或
进程恢复的执行由 Generation、Cut 等具体领域 Job 拥有，不建立通用后台 Agent TaskManager。

## 协议与状态

Agent package 的公共面保持为 package-owned command/event contract，不引入独立 daemon、
公共远程 SDK 或分布式控制面。Desktop adapter 只映射 typed IPC 与 runtime command/event，
runtime 不理解 DOM、Electron API 或窗口控件。

Runtime event 是会话执行事实；Renderer store 是可重建投影。事件必须携带 conversation、run、
turn、sequence/revision 和必要的 tool identity。未知 event、乱序不可恢复 event、陈旧 identity
或未注册 capability 必须 fail-visible。

## 扩展条件

只有出现已确认的第二个独立产品客户端、跨进程共享会话服务或第三方协议消费者时，才可通过
新的 OpenSpec 评估 server/protocol 层。评估必须先定义 owner、schema、认证、存储、取消、
迁移和端到端验收，不能为假想扩展预留平行 runtime。

## 验证

- Agent runtime、Capability Host 和领域 application port 使用生产者/消费者测试。
- 多 Conversation、跨窗口订阅、取消、关闭、恢复和陈旧 identity 使用路径级测试。
- Prompt、Skill、Tool routing 或 AgentSession 行为变更运行聚焦 Agent evaluation。
- Renderer 投影与 IPC 变更使用真实 Electron Desktop fixture 验收。

相关决策见 [`agent.md`](agent.md)、
[`adr-agent-tool-call-domain-job-lifecycle-boundary.md`](adr-agent-tool-call-domain-job-lifecycle-boundary.md)、
[`adr-dsh-cordis-replace-agent-extension-runtime.md`](adr-dsh-cordis-replace-agent-extension-runtime.md) 和
[`application-composition.md`](application-composition.md)。
