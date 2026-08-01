## Context

OpenNeko 当前由 pnpm 10 管理一级 `packages/*` 与唯一应用 `apps/neko-desktop`。Turbo 配置没有远程缓存，
测试任务也明确禁用缓存；实际价值主要是 workspace 遍历和拓扑排序，而 pnpm 已原生提供 recursive、filter、
sort、workspace concurrency 与 no-bail 语义。删除 Rust 后也不存在需要独立编排的 Cargo graph。

## Goals / Non-Goals

**Goals:**

- 让 pnpm 成为安装与任务编排的唯一 workspace 工具。
- 保持现有根命令、依赖顺序、测试并发和 coverage 尽量收集完整失败的行为。
- 清理全部仓库级 Turbo 配置、依赖、cache 与过期文档表述。
- 通过真实全量 build 与 Desktop package 证明应用构建链仍然成立。

**Non-Goals:**

- 不重构各子包自己的 build/test scripts。
- 不增加新的构建缓存服务或自定义 task runner。
- 不修改用户工作区内容扫描器对常见生成目录 `.turbo` 的过滤策略。

## Decisions

### pnpm 直接编排根任务

`build` 与 `typecheck` 使用 sorted recursive execution，忽略未声明对应 script 的 workspace；`test` 保留
workspace concurrency 2；`test:coverage` 额外使用 no-bail，确保一个包失败后仍继续收集其他包结果。
`build:ui` 使用明确 filter 列表，继续限定五个 Webview owner。

### 不替换 Turbo 输出缓存

当前没有远程 Turbo cache，测试本就不缓存。删除后只保留 pnpm store cache，接受 build/typecheck 重新运行，
避免为当前单应用本地产品再引入一层编排与缓存状态。

### 清理仓库 cache，但保留内容边界过滤

仓库内所有 `.turbo` 都是可重建生成物，迁移时移入系统废纸篓。Desktop 对任意用户工作区进行资源/内容枚举时，
仍应忽略名为 `.turbo` 的第三方生成目录；该行为不表示仓库继续依赖 Turbo。

### 对齐 Webview TypeScript library surface

pnpm 全量构建暴露 Cut 与 Tools Webview 仍使用 ES2020 lib，无法类型化共享 contract 中标准化的
`Error.cause`。这两个包仅将 `lib` 对齐到已有 Webview 使用的 ES2023，输出 target 仍保持 ES2020，
因此不改变运行时语法基线。

## Risks / Trade-offs

- 删除 task-output cache 会增加重复 build 的耗时；当前规模和缓存命中收益不足以抵消维护成本，后续只有出现
  可量化 CI/开发瓶颈时再以独立变更评估缓存方案。
- pnpm 与 Turbo 的失败调度细节不同；contract tests 固定关键命令参数，并通过全量 test/build 验证真实路径。
- 工作区存在并发中的 Desktop 改动，仓库总门禁结果必须将本次迁移结果与无关基线失败分开记录。
