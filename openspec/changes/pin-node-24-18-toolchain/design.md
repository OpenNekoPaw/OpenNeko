## Context

仓库根 `engines.node`、TUI bundle target、`@types/node` 与本地元数据运行时矩阵已经统一在 Node 24 主版本，但 GitHub Actions 使用浮动的 `node-version: 24`，仓库没有供本地工具读取的精确版本文件，当前 Homebrew 默认 Node 则为已结束支持的 `25.6.1`。VS Code `^1.128.0` 的 Extension Host 已验证运行 Node `24.17.0`，所以开发工具链补丁升级不能改变 Extension 的部署目标或公共最低运行契约。

## Goals / Non-Goals

**Goals:**

- 将本地开发、CI 和 Release 的 Node 工具链固定为 `24.18.0`。
- 使用仓库根版本文件作为 GitHub Actions 的 Node 版本来源，减少 CI/Release 重复声明。
- 保持 Node `>=24.0.0`、`@types/node ^24`、TUI `node24` 和 VS Code Host 边界不变。
- 在 Node 24.18.0 下验证 pnpm、Corepack、SQLite、TypeScript、构建、测试和质量门禁。

**Non-Goals:**

- 不支持或推广已结束支持的 Node 25。
- 不提前采用仍处于 Current 阶段的 Node 26。
- 不改变 Bun、VS Code、Rust、Proto、用户数据或媒体引擎契约。
- 不新增版本 fallback、自动下载器或第二套 package-manager bootstrap。

## Decisions

### 使用 `.node-version` 固定开发工具链

根目录新增 `.node-version`，内容为精确版本 `24.18.0`。这是本地版本管理器和 GitHub Actions 的工具链版本来源；`package.json#engines.node` 继续表达产品可运行的最低 Node 24 契约，而不是重复精确开发版本。

备选方案是把所有位置直接写成 `24.18.0`，但这会延续 CI、Release 和文档之间的重复事实来源。另一备选方案是使用 Volta、nvm 或 mise 专属配置，但当前系统没有这些工具，增加专属管理器会扩大本次范围。

### CI 与 Release 读取同一版本文件

所有 `actions/setup-node` 步骤改为 `node-version-file: .node-version`。这保证 CI、跨平台本地元数据测试和发布原生构建使用相同补丁版本，同时不触碰现有 job 拆分、缓存或用户正在修改的测试编排。

### 保持 Node 24 部署目标

`@types/node ^24`、TUI `target: 'node24'`、Node `>=24.0.0` 和 VS Code Extension Host 契约不变。TypeScript 类型和 bundle target 描述部署运行时能力，不能因为开发机补丁版本变化而提高。

### 使用 Homebrew 切换本机默认版本

安装 `node@24` 并将其链接为 `/opt/homebrew/bin/node`。切换后必须验证 `node --version` 为 `v24.18.0`、`corepack --version` 可用且 `pnpm --version` 与根 `packageManager` 一致。若 Homebrew formula 不提供精确版本，则停止切换并保持仓库变更可验证，不使用非受控脚本替代。

## Risks / Trade-offs

- [Homebrew `node@24` 补丁版本发生变化] → 安装前读取 formula 版本，只有等于 `24.18.0` 才链接；否则 fail-visible。
- [切换 Homebrew 链接影响其他本机项目] → 保留 `node` formula，记录可逆的 unlink/link 命令，并通过仓库 `.node-version` 让其他版本管理器可接管。
- [CI 文件存在并行未提交改动] → 只修改 `actions/setup-node` 的版本输入，不重写 job 或测试命令。
- [精确补丁版本未来需要安全升级] → 后续只更新 `.node-version`，CI 与 Release 自动跟随；运行最低契约独立评估。

## Migration Plan

1. 新增 `.node-version` 并更新 CI/Release 读取方式。
2. 更新中英文 README 的推荐开发版本说明。
3. 安装并链接 Homebrew `node@24`，验证 Node、Corepack 和 pnpm。
4. 运行版本一致性、SQLite contract、构建、测试和仓库质量门禁。
5. 若需回滚本机环境，执行 `brew unlink node@24` 后重新链接原 `node` formula；仓库回滚只需恢复版本文件与 workflow 输入。

## Open Questions

无。
