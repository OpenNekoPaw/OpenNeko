## Context

OpenNeko 是本地 VS Code 客户端与本地 Rust Engine 的 monorepo，远程 CI 的主要高成本来自完整 coverage、macOS Rust runner、FFmpeg/N-API 构建和双平台 VSIX 打包。当前 workflow 在 PR 上发布 `Branch Gate`，在每次 main push 上重新执行并发布 `Main Gate`；平台打包只属于后者，因此确定性的发布失败可能在代码进入 main 后才暴露。仓库目前只有 main 远端分支，main 已保护并要求 `Branch Gate`。

职责分析：开发者本地 checkout 拥有日常反馈；GitHub Actions 拥有手动 runner 验证和 PR 合并验收；Engine/VSIX package scripts 拥有产物内容；Release workflow 拥有 main 标签到 GitHub Release 的发布副作用；GitHub protection/environment 拥有外部门禁和批准。

依赖分析：Manual Gate 与 Merge Gate 只组合已有确定性命令和 package scripts，不引用 GUI、真实 provider、用户 fixture 或 Agent Evaluation。Release 只消费标签 checkout 与本次 run 生成的产物，不读取普通开发工作区或旧 CI artifact。

接口分析：稳定本地入口为 `gate:local` 与 `gate:remote`；远程权威信号为 `Manual Gate` 和 `Merge Gate`；发布输入为 `v<semver>` 标签。旧 `gate:branch`、`gate:main`、`Branch Gate`、`Main Gate` 被一次性替换。

扩展分析：新的确定性检查只需加入共享 job graph 及两个 aggregator 的 required-success 列表。平台集合继续由现有 Engine package config 与 matrix consistency test 约束，不新增第二套 target registry。

测试分析：编排测试覆盖事件集合、禁止 push、开发分支/main 来源、job required/skip、local-only 隔离、平台矩阵、标签 ancestry、版本投影和 checksum。GitHub protection/environment 通过 API 回查，真实 VSIX 安装仍是显式本地 L4 证据。

## Goals / Non-Goals

**Goals:**

- 普通开发分支 push 不自动消耗 GitHub Actions，日常验证由本地门禁拥有。
- 允许开发者在任意显式 ref 上手动运行无发布副作用的完整远程 CI。
- 只有非空、非 main 的开发分支到 `main` 的 PR 可以通过 Merge Gate，且完整源码门禁和双平台打包在合并前成功。
- main 版本标签只能从 main 历史发布，且标签基础版本与全部可发布 VSIX manifest 一致。
- 分支、CI、Release 和外部 protection 各自只有一个 canonical path。

**Non-Goals:**

- 不为开发分支引入自动 push CI、merge queue 或长期 pre 分支。
- 不把 Extension Development Host、Webview GUI、真实 provider/API 或 Agent Evaluation 放入通用远程门禁。
- 不发布 VS Code Marketplace/Open VSX，也不引入 PAT。
- 不改变支持平台、VSIX 内容、用户数据或产品运行时行为。

## Decisions

### 1. 开发分支是工作来源，main 是唯一发布分支

开发者可以使用 `dev`、`fix-*`、`feature/*` 等任意非 main 分支工作。main 禁止直接 push，只接受 base 为 main、head 非空且 head 不为 main 的 Pull Request。来源约束由 host-neutral script 在 Merge Gate 中 fail-visible 校验。

替代方案是把字面量 `dev` 作为唯一允许的 head。该方案错误地把开发分支类别实现为固定名称，阻断 topic branch 的正常 Pull Request；新增长期 pre 分支仍因没有独立 staging owner 而不采用。

### 2. 远程 CI 只有手动验证和合并验证两个入口

`.github/workflows/ci.yml` 只声明 `workflow_dispatch` 与面向 main 的 `pull_request`。所有 build、test、quality、Rust、Proto、OpenSpec 和 package jobs 对两个事件使用同一实现；`Manual Gate` 不要求 PR-only dependency review/来源检查，`Merge Gate` 要求全部 job 成功。普通 push 没有远程 workflow。

手动运行不能满足 main required check，即使选择了同一 SHA；Merge Gate 必须在 PR merge ref 上重新运行并观察开发分支/main 来源。

### 3. Merge Gate 在合并前拥有完整发布可行性

Merge Gate 不再按 changed paths 跳过 Rust、Proto、OpenSpec 或 package。TS extensions、darwin-arm64 Engine 和 linux-x64 Engine VSIX 都必须生成。上游失败导致 package skipped 时，aggregator 将 required-skipped 作为失败，而不是把未执行打包视为成功。

替代方案是保留 path selection。当前迁移目标优先消除合并后才发现不可发布的窗口；只有获得真实成本数据并为 path detector 增加完整 ownership contract 后，才可另行提案优化。

### 4. 根命令只表达可在单机复现的源码门禁

保留 `gate:local`，新增 `gate:remote` 作为 Manual/Merge 的源码级串行复现入口；删除 `gate:branch`、`gate:main`、`ci:branch`、`ci:main`。GitHub matrix package 仍由 workflow 拥有，根命令不伪装成跨平台完成证明。

### 5. Release 从 main 标签重新构建并校验来源

Release workflow 继续由 `v*` 标签触发。新增纯 Node validator 校验标签格式、标签提交属于 `origin/main` 历史，以及标签基础版本与 package group 中全部可发布扩展和 extension pack 的 manifest version 一致。预发布后缀不进入 VSIX manifest numeric version；例如 `v0.0.1-alpha.1` 对应 `0.0.1`。

Release 在本次标签 run 中重新生成正式 VSIX，并生成 `SHA256SUMS`。创建 GitHub Release 的 job 绑定 `release` environment；普通 Manual/Merge Gate 永远没有 contents write 权限或发布步骤。

### 6. 外部 required check 采用原子迁移

先在开发分支提交新 workflow 并打开到 main 的 PR。首次 `Merge Gate` 成功后、合并前，管理员将 main required check 从 `Branch Gate` 切换为 GitHub Actions `Merge Gate`；随后才合并迁移 PR。提前切换会因新 check 尚不存在锁死 main，保留双 aggregator 则违反唯一 canonical path。

## Risks / Trade-offs

- [开发分支可能短暂不可构建] → 本地 `gate:local` 是提交前要求，开发者可随时手动运行 Remote CI；main 仍由完整 Merge Gate 保护。
- [每个 promotion PR 成本较高] → 开发分支到 main 是显式发布候选动作，不是每次开发 push；保留 Turbo/Cargo cache 和并行 job。
- [Manual Gate 与 Merge Gate required 列表漂移] → 编排测试读取 workflow 并断言共享 needs 以及仅 PR-only job 的差异。
- [PR merge ref 与最终 main SHA 不同] → strict branch protection 要求最新 main；Release 再校验 main ancestry 并从标签 checkout 重建正式产物。
- [标签指向旧 main ancestor] → 允许有意补发 main 历史版本，但版本 validator 和 GitHub tag protection 禁止覆盖既有版本。
- [外部 protection 迁移时误配置] → API 回查 context/app id、strict、admin、force-push 和 deletion 状态；迁移前不删除旧保护。
- [工作树存在并行变更导致完整本地质量门禁失败] → 聚焦验证本变更 owning surfaces，并把不相关失败明确记录为外部阻塞，不修改其他 change 的文件。

## Migration Plan

1. 创建本 OpenSpec artifacts，并用失败编排测试固定目标事件、命令和聚合信号。
2. 更新 root scripts、CI workflow、Release validator、Release workflow 和文档；删除旧 changed-path/Branch/Main path。
3. 运行聚焦编排、OpenSpec、release package script tests、diff hygiene 与可执行的 repository quality gates。
4. 从当前 main HEAD 创建开发分支；在该分支提交并推送迁移内容。
5. 打开开发分支到 main 的 PR，等待 `Merge Gate` 首次成功。
6. 原子更新 main protection required check 为 `Merge Gate`，配置分支保护和 release environment，再合并 PR。
7. 在 main 上通过 workflow_dispatch 和预发布标签完成首次真实远程验证。

回滚时先恢复旧 workflow 并让 `Branch Gate` 在 PR 上成功，再把 protection required check 切回；不得先删除当前 required check。已有开发分支可以保留，Release 标签与已发布附件不自动删除。

## External Configuration Decision

当前仓库只有一个维护者，`release` environment 不设置 required reviewer，避免创建无法由第二人批准的阻塞路径；environment 使用 custom deployment policy 只接受 `v*` tags。repository tag ruleset 只允许 admin 创建匹配标签，并禁止其他角色创建、删除或非快进更新。增加第二名维护者后，再通过独立治理变更启用 reviewer approval。
