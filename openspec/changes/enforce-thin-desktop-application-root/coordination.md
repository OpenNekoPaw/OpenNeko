# Active OpenSpec Coordination

本文记录 `enforce-thin-desktop-application-root` 与活跃领域变更的职责分工。此变更拥有 workspace
拓扑、package role、依赖方向、公开入口和 thin Desktop composition 约束；下列领域变更继续拥有
行为、数据、用户流程和运行态验收。拓扑迁移不得复制、弱化或重新定义领域 requirement。

| 领域             | 行为 owner OpenSpec                                                        | 本变更提供/消费的拓扑                                                                                                                                                         | 不在本变更中重复定义                                                                     |
| ---------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Generation       | `extract-generation-domain-package`                                        | `@neko/generation` 是 provider-neutral job/coordinator/store owner；Desktop 只投影 credential/config binding，Platform 的 generation lifecycle 必须迁出并删除旧入口           | GenerationJob 状态、恢复、provider case、成本授权与真实行为验收                          |
| Tools            | `localize-media-diff-and-retire-timeline-contracts`                        | Tools 必须形成 domain/contract、Node/Media adapter、Webview、Desktop producer 的真实闭包；若领域变更拒绝该产品路径，则 packages 标记 inactive 并删除隐式能力                  | media comparison ratio、diagnostic、cancel/timeout/cleanup、NKV/Timeline retirement 语义 |
| Agent Evaluation | `add-desktop-agent-evaluation-matrix`                                      | Desktop-owned driver 是 executable boundary；Agent runtime/contracts 只暴露产品已有的中立配置和 facts；evaluation scripts/testing package 不得成为第二个 Host                 | matrix、budget、shard、Judge、comparability、消融统计与 complete-session 场景            |
| Media            | `replace-desktop-media-scheme-with-http-resource-gateway`                  | 保留 `@neko/media` 的 root/node/browser 模型；Desktop 仅拥有 `openneko:` protocol、exact-resource registry、sender authorization 和窗口生命周期                               | Range/PCM、resource-set、安全、codec/consumer qualification 与 transport 迁移细节        |
| Assets           | `integrate-desktop-assets-canvas`、`optimize-workspace-media-library-sync` | `neko-assets` 按 domain/application、node、webview 依赖闭包收敛；Media Library requirement/recovery/collect/portability 从 Desktop/Shared 迁给 Assets 或明确的 document owner | Resource Browser UX、symlink 两层模型、recovery/collect 算法、fingerprint 和用户确认语义 |
| Canvas           | `integrate-desktop-assets-canvas`                                          | Canvas domain/application 拥有 authoring、material action 和 Resource Browser handoff；必要 Node adapter 拥有文档 IO；Desktop 仅授权、构造 port 和组合 View                   | `.nkc` session/document、candidate/accept、Workbench/Board 交互和 Canvas 运行态行为      |

## 协调规则

1. 本变更先提供 role catalog、完整 inventory 和禁止新增漂移的自动门禁；领域变更可在其迁移切片内
   消费这些规则，但不得复制一套 package taxonomy。
2. 领域行为迁移由对应 OpenSpec 的 producer/consumer tests 和真实 Desktop 场景验收；本变更只汇总
   canonical path、旧路径删除和 workspace-wide gate 证据。
3. 当两个变更触及同一文件时，领域变更决定行为 contract，本变更决定 owner、public entry 和依赖方向；
   若二者冲突，先更新双方 design/tasks，不保留 facade、dual path 或 fallback。
4. `@neko/shared`、`@neko/platform` 或 Desktop 中的旧实现只有在新 owner 的 canonical path 已通过
   producer/consumer 验证后删除；用户项目、settings、credential 和 SQLite 数据按领域变更定义的
   migration/preservation 语义处理，不由拓扑重构擅自改写。
5. 任何 active OpenSpec 新增 package 时必须登记 role、runtime、status、public exports 和 consumer；
   任何删除/改名必须同步本变更 inventory、机器 catalog 与边界门禁。

## 实施顺序

1. 本变更完成 inventory、role catalog 和 freeze gate。
2. Generation、Tools、Media、Assets、Canvas 以有界领域切片迁移 owner 和 public entry。
3. Agent Evaluation 在唯一 Desktop Agent path 上建立 driver，不等待或恢复 TUI。
4. 每个领域切片删除对应 Shared/Platform/Desktop 旧入口；全部清空后才删除 Platform 和临时 ledger。

上述顺序是依赖约束，不表示一个领域必须等待所有其他领域完成。没有文件或 contract 冲突的切片可独立
推进，但每个切片必须在同一次变更内完成 caller switch、旧路径 poison/delete 和验证。
