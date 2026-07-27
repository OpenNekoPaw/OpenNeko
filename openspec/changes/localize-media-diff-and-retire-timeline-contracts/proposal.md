## Why

`neko-tools` 的图片、音频、视频比较仍是有明确用户价值的本地诊断能力，但当前实现同时携带三类已经失去真实边界的历史结构：

- 媒体比较结果通过 `diff.proto -> *.engine.ts -> Engine*` 投影传递，实际既没有 Protobuf 编解码，也没有跨语言或 Engine wire consumer；
- Neko Tools 仍注册 `.nkv` JVI 语言、Workspace 索引和 Timeline Diff，继续把已退休的 NKV Timeline 当作可成功处理的产品格式；
- `@neko/shared`、Cut 和 Agent 仍保留部分旧 `ProjectData` / `TimelineElement` 投影，使 `timeline.proto` 和 NKV codec 无法退出，即使 Cut 的 canonical project path 已经是 OTIO。

这使 `@neko/proto` 成为只生成 TypeScript interface 的伪协议层，也让媒体比较的取消、指标和展示契约被旧 Engine 命名与未实现字段掩盖。清理必须按完整调用链完成，不能只重命名 `Engine*` 或只删除 manifest 入口。

## What Changes

- 保留 Neko Tools 的图片、音频、视频本地比较以及 Git revision 对比入口。
- 新建 L0 `@neko-tools/contracts`，只拥有 Tools Extension 与 Webview 之间的媒体比较 request/result/message、schema version、diagnostic 和显式 `sessionId`；删除 `EngineDiff*` 与共享 `mediaDiffProtocol`。
- 将媒体分析收敛为 Neko Tools Extension 内的一个直接编排服务，通过窄 `@neko/media` Node port 调用 FFmpeg；删除仅包装四个固定 analyzer 的 registry/factory 层。
- 修复现有契约错误：像素差异统一为 `0..1` ratio；取消和超时必须传到实际 FFmpeg 子进程并等待退出后再清理临时文件；删除固定返回值、空 heatmap 等伪结果。Webview 可保留实时 overlay、curtain、onion-skin 或 GPU display transform，但不得把展示模式冒充为已计算分析产物。
- 保留 `showMediaInfo`，改为真实调用媒体 probe 并显示可用 metadata/diagnostic；删除未读取的 `neko.tools.diffMode`、`neko.tools.showMetadata` 配置。
- **BREAKING** 删除 Neko Tools 的 `.nkv` language/custom editor、JVI LSP、Workspace NKV index、Timeline Diff analyzer/viewer/message/test/i18n/CSS vertical slice；旧 `.nkv` 文件不迁移、不覆盖、不删除。
- 将 Cut 和 Agent 剩余旧 Timeline consumer 迁移到 owning OTIO `TimelineView`、稳定 ID 或只读媒体摘要；无法对应当前产品能力的旧 projection 直接删除，不建立兼容 adapter。
- **BREAKING** 从 `@neko/shared` 删除旧 NKV codec、默认 NKV 注册、Timeline/Diff generated exports 及只服务旧 Timeline 的 DTO/operation；Canvas/NKC caller 改为显式 NKC-only codec/contract。
- **BREAKING** 删除 `diff.proto`、`timeline.proto`、`*.engine.ts` 生成物和自定义 TypeScript interface generator。若审计确认 `packages/neko-proto` 不再拥有其他真实 wire contract，则删除整个 `@neko/proto` package，并移除 `generate:types`、`check:proto-sync` 及对应 CI 编排。
- 更新 `docs/architecture/proto-and-wire-contracts.md`、package boundaries、README 和 legacy-debt gates：Proto 只允许为真实跨语言、持久化或 wire contract 重新引入，不能为了共享 TypeScript shape 恢复。

## Capabilities

### New Capabilities

- `tools-media-comparison`: 定义保留的媒体比较边界、truthful result、生命周期、取消和 Webview message 行为。
- `legacy-timeline-contract-retirement`: 定义 NKV/JVI/Timeline Diff、伪 Proto 生成链和共享旧 Timeline projection 的垂直删除规则。

### Modified Capabilities

None. 本 change 补充并收口 `redefine-openneko-lightweight-editing` 已建立的 OTIO-only Cut 目标，不重新定义 Cut 编辑能力。

## Migration Policy

- 不提供 NKV 到 OTIO/NKC 的在线迁移、自动转换、双读、双写或 fallback。
- 清理过程不得打开、改写、移动或删除用户 `.nkv`、`.nkc`、`.otio` 和媒体文件；被移除入口只是不再声明支持。
- 内部 `EngineDiff*` 与旧 Timeline TypeScript API 属于未发布内部契约，调用方在同一 change 内一次性迁移，不保留 deprecated alias。
- 媒体比较运行中升级或重载时，现有 session 显式取消并释放进程/临时资源，不恢复旧 session。

## Scope

### In Scope

- `packages/neko-tools` 的 Extension、Webview、manifest、消息契约、媒体分析、JVI/Timeline Diff、测试和文档。
- `packages/neko-proto`、`packages/neko-types/src/generated`、共享 NKV/Timeline/Diff exports 和生成/质量门禁。
- Cut、Agent、Canvas、TUI 中阻止旧 Timeline/NKV contract 退出的直接生产 consumer。
- `@neko/media` 仅在缺少正确取消/终止语义时补充最小 Node process port；不加入 Tools 领域 DTO。
- 稳定架构文档、包边界、README、legacy-debt 和 orchestration tests。

### Out of Scope

- 删除图片、音频或视频比较产品功能。
- 新增专业图像算法、持久 diff artifact、远程比较服务或云端任务系统。
- 改变 OTIO/NKC 文件 schema、迁移用户项目或重写 Cut 基础编辑器。
- 清理 `@neko/shared` 中与 Timeline/NKV/Diff 无关的 creative AI、storyboard、UI 或 metadata 大型类型；这些残留另立 change。
- 为将来可能出现的 wire contract 保留空 Proto package、生成器或兼容入口。

## Impact

- **User-visible:** Neko Tools 继续支持图片/音频/视频比较与真实 Media Info；`.nkv` 不再获得 JVI language support、Timeline Diff 或专属 custom editor。
- **Packages:** `@neko-tools/contracts` 成为 Tools Host/Webview 唯一共享契约；`@neko/proto` 预计删除；`@neko/shared` 的 Timeline/NKV/Diff surface 收缩。
- **Build/CI:** Proto interface generator 和 sync gate 删除，增加 Timeline/NKV/EngineDiff 禁回流检查以及 Tools contract/path tests。
- **Compatibility:** 内部 API 为预发布破坏性清理；用户文件字节不变。
- **Documentation:** 本 change 取代 `docs/architecture/proto-and-wire-contracts.md` 中“Timeline/Diff 当前由 Proto 拥有”的现状描述；其余关于真实 media port 和 owning package message 的约束继续有效。
