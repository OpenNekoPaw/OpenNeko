## Why

OpenNeko 已经只发布一个平台 VSIX，但源码和构建仍把 Tools、Preview、Assets、Cut、Canvas、Agent 等能力模拟成多个“嵌入式扩展”：每个功能保留独立 Extension 入口和嵌套 workspace，打包时先生成临时 VSIX，再解包进最终 VSIX，运行时再通过 registry、scoped `ExtensionContext` 和宽泛的 Host services 重新组合。这个结构没有带来真实的进程隔离，却增加了构建层级、跨功能发现协议、状态投影和整包激活失败面。

Desktop/TUI 仍需要复用 host-neutral domain、runtime 和 UI 能力，因此目标不是把所有代码塞进 `apps/neko-vscode`，而是把 VS Code 交付边界收敛为一个扩展包：共享能力保持顶层 workspace，VS Code 专属适配器变为应用内部 feature module，并通过窄契约组合。

## What Changes

- **BREAKING** 将 VS Code 产品收敛为一个扩展 manifest、一个 Extension Host 入口、一个真实 `ExtensionContext` 和一个反向释放的应用生命周期；不再把内部功能作为可激活的嵌入式扩展。
- **BREAKING** 移除 `packages/<feature>/packages/*` 形式的二级 workspace。需要被 Desktop、TUI 或其他产品复用的 domain/runtime/UI 包迁移为顶层 `packages/*` workspace；仅服务 VS Code 的 activation、command、view、custom editor、Webview panel 和 host adapter 迁入 `apps/neko-vscode/src/features/*`。
- **BREAKING** 删除临时功能 VSIX 的打包、解包和运行时加载链路；最终 VSIX 直接包含应用 bundle、功能 Webview/媒体资源、Node runtime 依赖和目标平台 Engine closure。
- 用类型化的 Host Kernel 和显式 feature descriptor/capability dependency graph 替代 embedded feature registry、scoped context 和内部 marketplace-style API discovery。
- 将当前宽泛的 AI/Host services bag 拆为按功能注入的最小 ports；保留 `@neko/host` 作为 host-neutral contract，不引入统一万能 Host 接口或 service locator。
- 明确失败隔离：应用内核、manifest、契约和必需运行时失败时整扩展激活失败；可选 feature/capability 失败只禁用其自身及显式依赖者，并产生可见 diagnostic，不静默降级。
- 为原 scoped storage、memento、secret 和 global-storage identity 定义显式复用或迁移规则；迁移失败时 fail-closed，禁止静默丢失用户数据。
- 更新 workspace、构建、边界检查、架构文档和 VS Code 运行态验收，使“单层 workspace + 单扩展应用内部模块”成为唯一 canonical path。

## Capabilities

### New Capabilities

- `vscode-single-extension-package`: 定义单扩展包源码布局、Host Kernel 与 feature module 契约、直接打包、失败隔离、状态迁移和运行态验收要求。

### Modified Capabilities

None. 当前稳定 specs 尚未包含 VS Code 单 VSIX 架构能力；本变更将替代活跃变更 `finalize-platform-packaging-and-removal` 中的 embedded feature/scoped context/临时 VSIX 方案，同时保留其单一公开平台 VSIX 目标。

## Impact

- 主要影响 `apps/neko-vscode`、现有功能 extension 入口、根 workspace 配置、Turborepo 构建图、`scripts/package-openneko-platform.mjs`、VS Code L1 registry/context 辅助代码、CI/Release 校验和架构文档。
- 可复用的 Agent、Canvas、Cut、Preview、Tools 等 domain/runtime/UI 能力仍是独立顶层包，Desktop/TUI 不依赖 `apps/neko-vscode`，Webview 仍遵守浏览器沙箱边界。
- 对用户保持一个 `OpenNeko-<platform>-<version>.vsix` 的安装与升级体验；内部扩展 API、包路径和测试 fixture 会发生预发布破坏性调整。
- 迁移风险集中在贡献清单合并、Webview/本地资源路径、Engine/Sharp/FFmpeg 离线闭包、功能激活顺序、Disposable 所有权和旧状态 identity；这些边界必须通过结构测试、包内容检查与 Extension Development Host 验收。
