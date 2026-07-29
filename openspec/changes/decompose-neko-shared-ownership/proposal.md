## Why

`packages/neko-types` 的 npm identity 是 `@neko/shared`，但当前同时拥有 L0
基础契约、领域 DTO、React 组件与图标、VS Code adapter、SQLite/local
metadata、项目文件 IO、authoring、配置和 NKC codec。根入口仍被约 947
处源码引用，`"./*"` 通配 export 又允许新增任意隐式公共面。结果是领域 owner
不清晰、L0/L1/L2 边界难以验证，并且任何 shared 改动都可能扩大到全部应用。

已接受的单扩展/单层 workspace ADR 要求 `@neko/shared` 最终收敛为小型
host-neutral 基础内核，同时明确禁止把这项拆分塞进单扩展迁移。本变更作为独立
后继 OpenSpec，先固定完整 inventory、目标 owner、迁移批次、数据策略和防回流
门禁，再实施任何物理移动。

## What Changes

- 建立机器可验证的 `@neko/shared` public export、根 barrel symbol、生产 consumer
  和目标 owner inventory；未知或多 owner 项不得迁移。
- 将 React/components/icons/theme UI 迁往 `@neko/ui`，只把纯 token 和
  host-neutral theme contract 留在 L0 owner。
- 将 VS Code adapter 迁往 `apps/neko-vscode/src/adapters` 或 owning feature，
  不建立新的 package-level 通用 Host。
- 将 SQLite/local metadata 迁往顶层 `@neko/local-metadata`；Node 实现与
  host-neutral contract 使用显式 entry 隔离。
- 将 project-file IO、project authoring 与 NKC/project codec 迁往明确的
  `@neko/project` 或 Canvas-owned package，最终 owner 由 consumer/cycle
  inventory 决定。
- 将 Agent、Canvas、Media、Entity、Content、Chara、Quality 等领域 contract
  迁往各自 owning package 的 L0 public entry。
- 删除无生产 consumer 的 export，并最终删除 `@neko/shared` 的 `"./*"` 通配
  export；根入口只保留 core async/concurrency、logger/error/path、i18n core
  和经审计的通用 primitive。
- 每个迁移批次一次性切换生产者与消费者并删除旧 export，不保留 compatibility
  re-export、双入口或 fallback。
- 对持久格式、workspace 文件、SQLite schema、设置、secret 或 wire DTO 的
  变化要求独立版本/迁移证明；纯 TypeScript import relocation 不改变用户数据。

## Capabilities

### New Capabilities

- `shared-ownership-boundary`: `@neko/shared` 的 export inventory、目标 owner、
  分批迁移、层级隔离、数据保护和防回流契约。

### Modified Capabilities

- None.

## Impact

- **Packages:** `@neko/shared` 将逐批缩小；可能新增 `@neko/local-metadata` 和
  `@neko/project`，并扩充已有 `@neko/ui`、Agent、Canvas、Media、Entity、
  Content、Chara 与 Quality 公共 entry。
- **Applications:** VS Code adapter 移入 `apps/neko-vscode`；Desktop/TUI
  只消费 host-neutral owner，不得通过 VS Code entry 复用。
- **Contracts:** package import path 会发生预发布破坏性调整；每批调用方同批
  迁移，不提供旧路径成功兜底。
- **User data:** 默认不改变持久数据；任何 codec/schema/key/path 变化必须先有
  versioned migration、失败保护和 fixture。
- **Verification:** 新增 export/consumer inventory、依赖方向、L0/L1/L2、
  旧路径 poison、unused/cycle 和生产者/消费者门禁。
