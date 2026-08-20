# ADR: Pi Agent Runtime 与模型边界

状态：Superseded

更新日期：2026-08-21

取代关系：生产实现已由 [`agent.md`](agent.md) 描述的 DSH/ACP 单一路径取代；最终发布验收由
[`replace-pi-with-dsh-runtime-atomically`](../../openspec/changes/replace-pi-with-dsh-runtime-atomically/)
跟踪。本文只保留历史决策背景，不再作为当前实现或新开发依据。

范围：`neko-agent`、Pi Agent/Session/Skill、模型路由、Provider/Auth、Capability Tool bridge 与 Electron Desktop。

## 决策

Pi 是 OpenNeko 唯一通用 Agent/LLM/Skill/Session canonical path。OpenNeko 不在 Pi 外建立第二套
agent executor、transcript、skill lifecycle、tool loop 或通用 chat provider。

Pi 拥有：

- Agent loop、turn、stream、steering、follow-up queue 与取消；
- Pi Session JSONL transcript、branch、reopen、compaction 与 context build；
- Skill 文件发现、解析、渐进披露和 prompt formatting；
- Tool Call 参数校验、执行和结果回填；
- 主模型 provider/model 请求与认证投影。

OpenNeko 拥有：

- Conversation identity、catalog、workspace/project binding 和 permission；
- Skill source、trust、enablement、fingerprint 与产品 metadata；
- Capability catalog、领域 Tool schema、资源授权和 owning-domain application port；
- purpose model binding、provider catalog、CredentialStore 与用户交互；
- Desktop Main session registry、typed IPC 和 Renderer 投影；
- 独立恢复的具体领域 Job。

```text
Desktop renderer
  -> Desktop Main conversation owner
  -> immutable conversation/model/tool snapshot
  -> Pi Session + Pi Agent
  -> Capability Tool bridge
  -> owning-domain operation or Job
```

## Session 与身份

`conversationId`、`branchId`、Pi `sessionId`、Agent Run、Turn、Tool Call 和 SubagentRun 是独立
身份，必须显式映射，不能互相推导。Transcript 只有 Pi Session 一个 authority；SQLite 只保存
产品 catalog、binding 和恢复所需 metadata，不复制完整消息。

同一 Conversation 同时只允许一个 exact session/request owner 推进 turn/checkpoint。跨窗口 view
订阅 Main 中同一 runtime owner；陈旧 owner、乱序 event 或 identity mismatch 必须失败，不使用全局
active conversation 协调。

## Skill 与 Capability

Builtin、project 和 personal Skill 使用同一 `SKILL.md` 形态。模型常驻上下文只包含 catalog
metadata；完整 Skill 在明确匹配或显式激活时加载。Skill 正文负责方法和创作语义，不承担工具协议。

Capability Host 在 turn 边界生成不可变 Tool snapshot。Pi bridge 只适配 schema、调用和结果，
不成为 Capability authority，也不理解 Canvas、Cut、Assets、Quality 等领域内部状态。重复 identity、
缺失 owner、无效 schema 或不受信来源直接返回 owner-aware diagnostic。

## 模型、Provider 与凭据

每个 purpose 在 snapshot 时解析为明确 provider、model、参数、capability 和 credential provenance。
执行期不得再次选择默认模型、首个可用模型或主模型 fallback。Agent 主模型由 Pi provider path
执行；图片、视频、音频、embedding 和领域评估由 owning runtime 消费冻结 binding。

CredentialStore 是程序级用户凭据 authority。credential value 不进入 workspace、项目文件、
transcript、SQLite catalog、Tool 参数、日志或 evaluation facts。Desktop Host 只提供登录、同意、
错误和撤销交互；provider identity、endpoint、auth profile 或 credential 冲突时直接拒绝。

## 领域执行

Agent-owned 短执行直接使用 Tool Call。需要脱离当前 turn 或应用重启恢复的工作由 Generation、
Cut 等领域 Job 持有。Quality 决策、项目 mutation、revision、repair 和 apply 留在 owning domain；
Pi 不维护跨领域 workflow、项目事实或通用 TaskManager。

## 验证

- Pi Session create/append/reopen/branch/compaction 和 identity mapping 使用聚焦测试；
- Skill discovery/trust/activation 与 immutable Tool snapshot 使用路径测试；
- 多窗口 writer fencing、取消、stale event 与资源释放使用真实 Desktop 场景；
- provider/model/credential 缺失或冲突必须 fail-visible，并验证 secret redaction；
- Prompt、Skill、Tool routing、provider 或 AgentSession 行为变更运行聚焦真实 Agent evaluation。

相关决策见 [`agent.md`](agent.md)、
[`adr-agent-runtime-architecture-comparison-boundary.md`](adr-agent-runtime-architecture-comparison-boundary.md)、
[`adr-agent-tool-call-domain-job-lifecycle-boundary.md`](adr-agent-tool-call-domain-job-lifecycle-boundary.md) 和
[`application-composition.md`](application-composition.md)。
