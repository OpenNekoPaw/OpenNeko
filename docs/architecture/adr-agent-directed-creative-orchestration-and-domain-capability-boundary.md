# ADR: Agent 驱动创作与领域 Capability 边界

状态：Accepted

更新日期：2026-08-01

范围：Agent、Skill、Canvas、Cut、Assets/Entity、Preview、Content、Generation、Quality、Export、媒体 runtime 与 Provider。

## 决策

普通 Agent ReAct 是唯一智能创作编排循环。Skill 提供创作方法和判断，Capability/Tool 提供机器
可执行契约，owning domain 负责确定性 operation、项目事实、revision、validation 和结果提交。
不得建立固定 stage、领域专用 Agent core、中央 workflow runtime 或跨领域项目事实副本。

```text
user goal + authorized context
  -> Agent reasoning + selected Skill
  -> immutable Capability snapshot
  -> Tool Call / SubagentRun / owning-domain Job
  -> file, ContentLocator, project revision or diagnostic
  -> Agent observes evidence and chooses next step
```

## 领域所有权

| 领域                        | 权威结果                                                      |
| --------------------------- | ------------------------------------------------------------- |
| Content/Media analysis      | 文档、图像、音视频证据与结构化分析                            |
| Assets/Entity/Character     | 资源、创作身份、关系与 representation binding                 |
| Canvas                      | 空间布局、节点、连接、播放路线与 `.nkc` authoring             |
| Cut                         | OTIO 时间线、轨道、剪辑、字幕、音频与导出计划                 |
| Preview                     | 授权只读媒体、模型与 3D reference session                     |
| Generation                  | provider binding、生成 Job、结果、lineage 与 durable artifact |
| `@neko/media` + Node/FFmpeg | probe、decode、PCM、派生、encode 与有界执行                   |
| Quality/Export              | rubric、证据、Gate、preflight、发布与交付验证                 |

Agent 不拼装领域私有文件，不保存 active Canvas/Cut，不维护全局 current revision，也不以聊天总结、
TODO、trace 或 prompt 声明完成。完成必须由真实文件、ContentLocator、project revision、领域
validation 或 export evidence 证明。

## 动态路径

漫画、剧本、小说、插画到分镜、Animatic 或成片是可条件选择的纵向能力，不是固定流水线。Agent
根据来源证据、用户目标、当前 capability、成本、质量和实际结果跳过、重排、重复、并行或停止。
能力缺失、Provider 不支持输入/控制项或质量失败时返回 blocked/degraded diagnostic；不得静默丢字段。

创作语义与模型执行分离：角色身份、构图、镜头、参考用途、目标语言和验收条件属于领域 intent；
输入限制、Prompt 方言、尺寸、时长、成本和并发属于当前 provider/model/profile capability；完成只由
实际执行结果和 validator 证明。

## Prompt 与语言

`uiLocale`、`promptLocale`、创作者内容语言和单次生成指令语言是不同事实。系统 Prompt 与 Skill
的本地化不得覆盖角色名、地名、对白、字幕、歌词或画面文字。Provider 无法可靠满足目标语言或
精确文字时，在 dispatch 前报告限制或使用用户批准的确定性后期能力。

## 验证

- Tool 路径断言 Skill 只指导判断、Capability 来自当前 snapshot、owning handler 被命中；
- 异步执行使用领域 Job identity、revision、取消和终态 evidence；
- project mutation 使用明确 target/base revision，不依赖 active Renderer；
- Provider/profile 变化使旧 capability snapshot 失效；
- 漫画/剧本/小说/插画纵向场景运行聚焦真实 Agent/provider evaluation；
- 最终报告引用真实文件、项目 revision、diagnostic 和 validation evidence。

相关决策见 [`adr-pi-agent-runtime.md`](adr-pi-agent-runtime.md)、
[`adr-agent-prompt-skill-validator-boundary.md`](adr-agent-prompt-skill-validator-boundary.md)、
[`adr-agent-tool-call-domain-job-lifecycle-boundary.md`](adr-agent-tool-call-domain-job-lifecycle-boundary.md) 和
[`headless-project-authoring.md`](headless-project-authoring.md)。
