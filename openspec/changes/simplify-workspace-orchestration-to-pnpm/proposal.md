## Why

仓库已经移除 Rust，并且当前只有一个 Electron 应用组合根和一组 pnpm TypeScript workspace。现有
Turborepo 只包装 build、typecheck、test 等 pnpm 已能直接编排的任务，却同时引入额外配置、平台依赖、
CI cache 和超过 14 GiB 的本地可重建缓存。继续保留它的维护成本高于当前收益。

## What Changes

- 以 pnpm workspace recursive/filter commands 作为唯一的仓库任务编排入口。
- 保留根 build、build:ui、typecheck、test、test:coverage 和 Desktop package 的既有职责与并发语义。
- 删除 Turbo dependency、配置、CI cache、act mount、ignore/scanner 例外和生成缓存。
- 不引入替代性的任务输出缓存；CI 继续依赖 pnpm store 与现有构建门禁。
- 对齐 Cut/Tools Webview 的 TypeScript library surface，使 pnpm 真实构建可消费共享 `Error.cause` contract。

## Capabilities

### New Capabilities

- `pnpm-workspace-task-orchestration`: pnpm 直接拥有 workspace build、typecheck、test 与聚焦 UI 构建的任务编排。

### Modified Capabilities

<!-- None. -->

## Impact

- 根 `package.json`、`pnpm-lock.yaml`、CI workflow、act helper、质量扫描器和 ignore 配置。
- 删除 `turbo.json`、Turbo npm/platform packages 与仓库内 `.turbo` 生成缓存。
- 根命令名保持不变，但不再提供 Turbo remote/local task-output cache。
