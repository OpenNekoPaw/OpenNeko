# ADR: Agent Runtime 单一权威边界

状态：Accepted

更新日期：2026-08-01

范围：Agent runtime、Pi、Desktop Host、Renderer、Prompt、Capability、外部处理器、Character/World 与 Quality。

## 决策

每类 Agent 状态只允许一个 canonical owner：

| 状态/能力 | Canonical owner |
| --- | --- |
| transcript、turn、stream、tool item | Pi Session / AgentSession |
| conversation catalog、binding、permission | OpenNeko Agent application layer |
| Renderer Timeline | 从 versioned runtime event 派生的只读投影 |
| Prompt composition | 一个纯 composition module，输入不可变 snapshot |
| Skill catalog 与 trust | Skill Host |
| Capability discovery 与 Tool snapshot | Capability Host |
| provider/model/credential projection | config、model registry 与 CredentialStore owner |
| 领域 validation、Job、repair、apply | owning domain |
| Character/World/Quality workflow | 对应领域 package |
| 文件、进程、IPC、窗口和资源生命周期 | Desktop Main |

Renderer 不维护第二份 transcript、active stream 或领域事实。所有增量内容、thinking、Tool Call、
Tool result、完成和错误都进入同一 versioned Timeline projector；乱序、重复或 identity mismatch
按明确规则拒绝或幂等处理。

## 组合与依赖

Pi 只接收已经解析的 model、prompt、tool 和 permission snapshot。它不接收 config manager、
领域 service、Electron API 或 mutable registry。Capability Tool bridge 是适配器，不拥有领域 schema
或 capability lifecycle。

Desktop Agent composition 只注册公共 application port 和 Host adapter，不保存 Character、World、
Quality、Canvas、Cut 或 Generation 的可变状态。领域之间通过 typed ref、command、event 或 facade
协作，不通过 Agent package 内部 controller 中转。

`@neko/platform` 已删除。config、tools、prompts、media 和 provider 直接由 Agent contracts/runtime、
Host settings、Generation、Content 等真实 owner 暴露窄入口；不得重新建立万能 manager 或兼容
facade。单一稳定调用链不额外叠加 factory、registry、provider 和 facade。

外部处理器只有存在真实 manifest、Desktop executor、审批策略和端到端 consumer 时才注册；它是
受管 Tool implementation，不是平行 Capability 系统。

## 验证

- Timeline fixture 覆盖 stream、thinking、Tool、interrupt、resume、duplicate 与 out-of-order event；
- Prompt/Skill/Capability 测试断言唯一 composition path 和不可变 snapshot；
- package boundary test 阻止 Agent 导入领域内部实现，阻止 Renderer 导入 runtime/Node/Electron；
- Character/World/Quality 路径断言 owning controller 被命中；
- 行为变更运行聚焦 Agent evaluation，UI 投影变更运行真实 Electron Desktop fixture。

相关决策见 [`adr-pi-agent-runtime.md`](adr-pi-agent-runtime.md)、
[`adr-agent-runtime-architecture-comparison-boundary.md`](adr-agent-runtime-architecture-comparison-boundary.md)、
[`adr-agent-tool-call-domain-job-lifecycle-boundary.md`](adr-agent-tool-call-domain-job-lifecycle-boundary.md) 和
[`package-boundaries.md`](package-boundaries.md)。
