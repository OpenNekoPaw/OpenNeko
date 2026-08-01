# ADR: Agent 创作调用、Run 与写回边界

状态：Accepted

更新日期：2026-08-01

范围：Agent、Canvas、Cut、Assets、Generation、ContentLocator、领域 Job 与 package-owned apply。

## 决策

创作 surface 不建立自己的 Agent loop。用户或领域 UI 发起的开放式创作请求进入同一个
Conversation/Agent Run；确定性操作直接进入 owning-domain application port。Agent 通过 Tool Call
调用能力，独立恢复的长执行由具体领域 Job 拥有。

```text
user or domain surface intent
  -> Agent Run / Tool Call
  -> owning-domain operation or Job
  -> immutable result + ContentLocator/provenance/revision
  -> explicit package-owned apply
```

## Document、Result 与 Apply

- 输入 document、selection 和资源必须使用稳定 identity、revision/digest 与授权 context；
- 生成结果先由 Generation/Assets 等 owner 提交 durable artifact，再返回 `ContentLocator`、digest、
  lineage、model/provider facts 和必要 diagnostic；
- 候选结果不自动改写 Canvas、Cut 或其他项目事实；用户接受后由目标 package 的 revisioned apply
  operation 原子提交；
- apply conflict、目标缺失、权限变化或过期 revision 明确失败，不选择 active/recent document；
- Renderer 只展示 Run、Tool Call、Job 和 candidate 投影，不拥有执行或写回状态机。

## 运行身份

Agent Run、Tool Call、SubagentRun、领域 Job、document 和 candidate identity 相互独立。一个 Agent
Run 可以调用多个领域 Job，但不复制其状态；领域 Job 可以在页面关闭后继续，Agent Run 只保存
JobRef 与观察到的 revision。取消沿 owner 边界传播，不能通过删除 UI card 冒充执行取消。

## 资源与依赖

Agent runtime 不导入 React、Renderer、Electron 或具体领域内部实现。Webview 不导入 Agent runtime、
provider SDK、Node API 或工作区文件系统。Desktop Main 负责资源授权、typed IPC、provider/processor
bridge 和生命周期；媒体计算走 `@neko/media` 与领域窄 port。

## 验证

- producer/consumer 测试覆盖 intent、Tool Call、Job、result、candidate 与 revisioned apply；
- 路径测试断言 owning handler、artifact commit 和目标 package apply 被命中；
- 页面关闭、取消、重启恢复和 stale revision 使用集成或真实 Desktop fixture；
- Agent 能力选择、失败恢复和交付证据使用聚焦 evaluation。

相关边界见 [`adr-agent-tool-call-domain-job-lifecycle-boundary.md`](adr-agent-tool-call-domain-job-lifecycle-boundary.md)、
[`headless-project-authoring.md`](headless-project-authoring.md)、
[`cache-file-access-and-paths.md`](cache-file-access-and-paths.md) 和
[`package-boundaries.md`](package-boundaries.md)。
