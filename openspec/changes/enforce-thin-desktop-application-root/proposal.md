## Why

`apps/neko-desktop` 已被定义为唯一 Electron 产品组合根，但迁移前仍包含可脱离 Electron 的领域规则；
同时当时的 28 个 `packages/*` workspace 采用了不一致的 `types/contracts/domain/runtime/node/webview`
划分，`@neko/shared`、`@neko/platform` 和 `neko-assets` 聚合了跨领域或跨运行环境职责。需要把
Desktop 薄组合根与 package ownership 一起收敛，形成唯一、可验证的依赖和业务执行路径。

截至 2026-08-02，迁移形成 32 个源码 package：Desktop 仍是唯一应用，Platform、Tools、TUI 和
VS Code 旧宿主均已退役；Shared 只保留 core/errors/job-lifecycle/logger/path 六个公开入口，AI、Agent、
Assets、Canvas、Preview、Cut 和 Local Metadata 均通过明确 owner 与公开入口接入。

## What Changes

- 将 `apps/neko-desktop` 收敛为薄应用组合根，只拥有 Electron 生命周期、安全边界、typed IPC、宿主
  adapter、产品级 wiring、平台打包和真实产品验收。
- 建立统一 package taxonomy：`contracts` 只承载跨 runtime contract/codec，`domain/core` 承载纯业务
  规则，`application/runtime` 承载 use case 与生命周期，`node` 承载 Node/FFmpeg/SQLite adapter，
  `webview` 承载 React/DOM，内容包只承载可移植资源。
- 只有运行环境、依赖闭包、发布入口或真实消费者边界不同才建立独立 workspace package；否则使用
  owning package 内的显式子路径，禁止机械复制 `contracts/domain/runtime/node/webview` 全套结构。
- 明确领域规则、状态机、配置解析、业务校验、业务编排和可脱离 Electron 测试的逻辑必须由对应一级
  `packages/*` owning package 拥有；只有依赖 Electron API、窗口/sender identity 或产品级多领域装配的
  concrete adapter 留在应用根。
- 收缩 `@neko/shared` 为真正跨领域的最小稳定基础能力，迁移其中 Agent、Canvas、Assets、Generation、
  Character、Content 和 React/Node 专属实现；按 owner 解体 `@neko/platform`。
- 将 Assets、Preview、Tools 和 Canvas 中与 Desktop 混合的业务职责补齐为 package-owned
  domain/application/node/webview 边界；保留 Cut 与 Media 已验证的 runtime separation。
- 统一 package family 命名、目录 identity 和显式 exports，删除无边界的 `./*`、不必要的 source alias、
  未声明 workspace dependency 和无消费者 test-utils package。
- 把当前 Application 层中的业务逻辑视为已知架构漂移，不以现状合理化边界；建立清单、owner、目标
  package、迁移顺序和删除旧路径的任务。
- 更新架构文档、开发规范、代码评审与质量门禁，要求新增或修改 Desktop 代码时先完成 owning
  responsibility 审计，并让 dependency、Webview、strict tsconfig、exports 和 package manifest 门禁
  覆盖全部 workspace。
- 保持 `apps/neko-desktop` 目录及 `@neko/app-desktop` 应用身份；不新增 TUI、VS Code Host、通用
  multi-host framework 或 `@neko/desktop-core` manager bag。

## Capabilities

### New Capabilities

- `thin-application-composition-root`: 定义 Application 层允许职责、业务逻辑 owning package 规则、现有
  漂移治理和路径级架构验证要求。
- `package-ownership-taxonomy`: 定义 package role、拆分条件、family 命名、public exports、迁移聚合层和
  dormant package 的能力真实性要求。

### Modified Capabilities

无。

## Impact

- 架构与开发规范：`docs/architecture/application-composition.md`、
  `docs/architecture/package-boundaries.md`、`AGENTS.md`。
- 主要迁移面：`apps/neko-desktop/src/{main,preload,renderer,shared}`、`packages/shared`、
  `packages/neko-platform`、Assets/Canvas/Preview/Tools/Agent package families、workspace manifests、
  Vite aliases 和架构门禁。
- **BREAKING**：内部 workspace package name、exports 和 import specifier 将按 family 分批调整；仓库尚未
  发布，所有本次边界内调用方必须一次性迁移，不保留 alias 或兼容 re-export。
- 现有 `extract-generation-domain-package`、`localize-media-diff-and-retire-timeline-contracts` 等领域
  OpenSpec 继续拥有具体业务验收；本变更只规定拓扑、ownership 和迁移 gate，不复制领域实现。
- 用户项目、设置、凭据、SQLite 数据和可重建缓存位置默认不变化；需要 schema/data migration 的领域
  必须建立独立、显式的数据处置任务。
