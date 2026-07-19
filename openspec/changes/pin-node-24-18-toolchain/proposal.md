## Why

OpenNeko 已以 Node 24 作为 Extension、CLI 和本地元数据运行时基线，但开发机、CI 与 Release 只声明主版本或仍运行已结束支持的 Node 25，无法保证构建工具链一致。现在需要将仓库工具链固定到最新 Node 24 LTS 补丁 `24.18.0`，同时保持既有 Node 24 公共运行契约不变。

## What Changes

- 为仓库增加 Node `24.18.0` 的单一工具链版本文件，供本地版本管理器和 GitHub Actions 读取。
- 将 CI 与 Release 从浮动的 Node 24 主版本切换到仓库版本文件。
- 更新中英文源码开发说明，区分推荐工具链版本与 Node 24 最低运行契约。
- 验证 Node 24.18.0 下 pnpm、Corepack、SQLite contract、构建、测试和质量门禁。
- 将当前 Homebrew Node 切换到 `24.18.0`，不改变 VS Code Extension Host 自带运行时。

## Capabilities

### New Capabilities

- `node-toolchain-policy`: 定义 OpenNeko 开发、CI 与 Release 的 Node LTS 固定策略、运行时边界和版本一致性要求。

### Modified Capabilities

无。

## Impact

- 影响根目录工具链元数据、`.github/workflows/ci.yml`、`.github/workflows/release.yml`、README 开发要求和本机 Homebrew Node 链接。
- 不修改 Node 24 最低运行时、`@types/node ^24`、TUI `node24` bundle target、VS Code `^1.128.0` 或用户数据格式。
- 不引入 Node 25/26 兼容分支、fallback 或第二套构建路径。
