# ADR: 单扩展、单层 Workspace 与共享能力所有权边界

状态：Superseded / Historical（2026-07-31）
日期：2026-07-29
范围：`apps/neko-vscode`、`apps/neko-desktop`、`apps/neko-tui`、`packages/*`、pnpm/Turborepo workspace、VS Code Extension Host/Webview、Host ports、`@neko/shared`、平台打包与发布。

本文记录 OpenNeko 将 VS Code 产品收敛为单一扩展、将 workspace 收敛为 `apps/*` 与 `packages/*` 两个单层分组，并重新明确 App、共享 Package、Host adapter 和 `@neko/shared` 所有权的目标边界。

当前唯一 Desktop 与一级 workspace 边界由 [`application-composition.md`](application-composition.md) 和
[`package-boundaries.md`](package-boundaries.md) 接续；
本文不再是实现入口。

## 背景

OpenNeko 当前已经只发布一个平台 VSIX，但源码、构建和运行时仍保留多扩展模型：

- Tools、Preview、Assets、Cut、Canvas、Agent 分别拥有扩展 manifest 或 activation entry。
- 平台打包先创建功能 VSIX，再解包到最终 VSIX。
- `apps/neko-vscode` 动态加载功能 `extension.js`，并模拟 feature-scoped `ExtensionContext`。
- 内部功能通过 embedded registry 或 `vscode.extensions` 风格的 API 发现彼此。
- pnpm 同时发现 `apps/*`、`packages/*`、`packages/*/packages/*` 和 feature-local `test-utils`。

这些边界没有提供进程隔离：功能 JavaScript 与原生模块仍运行在同一个 VS Code Extension Host。它们反而增加了 manifest 合并、资源路径、状态投影、构建闭包和跨功能发现协议的复杂度。

与此同时，Desktop 和 TUI 已经直接复用 Agent、Canvas、Preview 等 domain/runtime/UI 能力。原本嵌套在 `packages/neko-agent/packages/*`、`packages/neko-canvas/packages/*` 等目录中的子包已成为跨应用能力，继续把它们表示成某个 VS Code 功能父包的内部成员会产生错误的所有权暗示。

`packages/neko-types` 的 npm identity 是 `@neko/shared`。它同时包含 L0 类型与工具、React UI、VS Code adapter、SQLite/local metadata、项目文件 IO、配置和多个领域的 contract，已经超出单一 shared 基础包的职责。

## 决策

### 1. Monorepo 保留 App 与 Package 两个一级分组

目标 workspace 只发现：

```yaml
packages:
  - apps/*
  - packages/*
```

目录结构为：

```text
apps/
  neko-vscode/
  neko-desktop/
  neko-tui/

packages/
  neko-shared/
  neko-host/
  neko-ui/
  neko-agent/
  neko-agent-types/
  neko-agent-ui/
  neko-canvas-domain/
  neko-canvas-ui/
  neko-cut-domain/
  neko-cut-ui/
  neko-preview-contracts/
  neko-preview-ui/
  neko-media/
  neko-content/
  neko-entity/
  neko-local-metadata/
  neko-project/
  ...
```

上述名称表示职责方向，不要求所有 npm identity 在同一提交中改名。

`apps/*` 是可运行、可安装或可发布的产品组合根；`packages/*` 是跨 App 复用的 domain、runtime、contract、UI 或基础能力。App 可以依赖 Package，Package 不得依赖 App。

`apps` 与 `packages` 不合并。`apps/neko-vscode` 不进入 `packages/*`，共享领域实现也不进入 App。

### 2. 删除二级 workspace，不删除真实 package 边界

目标架构不再发现：

```text
packages/*/packages/*
packages/*/test-utils
```

现有二级 workspace 按真实消费者处理：

- 被 Desktop、TUI、多个领域或多个 runtime 使用的能力提升为顶层 package。
- 仅由一个 owner 使用、且没有独立生命周期或依赖层的薄 contracts/types 合并为 owning package subpath。
- 仅服务 VS Code 的 extension、command、view、custom editor、panel 和 host adapter 移入 `apps/neko-vscode`。
- test-utils 默认成为 owning package 的普通测试模块；只有多个真实消费者时才保留独立顶层 package。

首次移动优先保持 npm package name，避免把物理路径调整与公共 API 重命名混成一次变更。单层 workspace 不等于减少所有 package，也不构成强行合并 domain/UI contract 的理由。

### 3. `apps/neko-vscode` 是唯一 VS Code 扩展

VS Code 产品最终只有：

- 一个扩展 manifest；
- 一个 Extension Host `activate` / `deactivate` 入口；
- 一个真实 `ExtensionContext`；
- 一个最终平台 VSIX；
- 一组 App 内部 feature modules。

VS Code 专属模块位于：

```text
apps/neko-vscode/src/
  extension.ts
  bootstrap/
  adapters/
  features/
    tools/
    preview/
    assets/
    cut/
    canvas/
    agent/
```

feature module 是普通源码模块，不是 workspace package，不拥有独立扩展 identity、manifest、`ExtensionContext` 或 VSIX。

以下路径必须删除：

- 内部功能扩展 manifest 和 activation entry；
- 临时 feature VSIX 的创建、解包和 staging；
- embedded feature registry；
- 模拟 `vscode.Extension` 的内部发现；
- scoped `ExtensionContext`；
- 以内部 marketplace extension ID 解析 OpenNeko 功能 API。

### 4. 使用显式组合，不创建第二套插件框架

OpenNeko 的功能集合当前是产品内固定能力，不需要通用插件 registry、IoC container、service locator 或运行时动态功能市场。

应用 composition root 直接、类型化地组合功能：

```text
VS Code composition root
  -> create shared infrastructure
  -> register Tools / Preview / Assets
  -> inject typed Assets and Preview capabilities into Canvas
  -> inject typed Agent dependencies
  -> own reverse-order disposal
```

可以保留轻量 bootstrap/lifecycle helper，但其职责只包括：

- 轻量注册顺序；
- cancellation；
- feature-owned disposable；
- diagnostics；
- lazy runtime 生命周期；
- 反向释放。

feature adapter 不得横向 import sibling feature adapter。跨功能依赖只允许在 composition root 显式连线。

不得以删除 embedded registry 为名重新创建通用 `FeatureRegistry`、字符串 capability lookup 或万能 services container。

### 5. Extension 激活采用轻量注册，重型能力按需创建

扩展 activation 只完成必要的契约校验和轻量注册：

- commands；
- views/providers；
- custom editors；
- Webview factories；
- diagnostics；
- capability availability projection。

AI、generation、metadata、media 等重型 runtime 默认在首次真实使用时创建。调用方接收 typed lazy port 或明确 factory，不读取全局 runtime singleton。

故障粒度以 capability 和资源 owner 为准，不以整个 Agent、Canvas 或其他产品功能为粗粒度 optional 标记。

### 6. Host 使用 consumer-owned narrow ports

`@neko/host` 保留为 host-neutral 稳定契约 owner，不得引入 VS Code、Electron、Node 实现、React 或具体产品领域。

Agent、Canvas、Cut、Preview、Assets 等领域分别定义自己需要的窄 port；VS Code 和 Desktop 在各自 App 内实现 adapter。

禁止：

- UniversalHost；
- mutable application-wide services bag；
- 全局 service locator；
- feature 依赖完整 Host Kernel；
- 用 active feature、active tab 或 active workspace 代替实例 identity。

只有两个以上消费者的职责、生命周期、错误模型和变化方向一致时，才允许提取共享 adapter。

### 7. `@neko/shared` 收敛为基础内核

`@neko/shared` 保留：

- core async/concurrency；
- logger contract；
- errors；
- path；
- i18n core；
- 少量真正跨领域、host-neutral 的 primitive。

现有内容按 owner 迁移：

| 当前内容                               | 目标 owner                                        |
| -------------------------------------- | ------------------------------------------------- |
| React components、icons、React theme   | `@neko/ui`                                        |
| VS Code adapters                       | `apps/neko-vscode/src/adapters` 或 owning feature |
| Agent、Tool、Skill、Prompt contract    | Agent owning package                              |
| Canvas、Storyboard contract 与 utility | Canvas domain                                     |
| Media、Generated Asset contract        | Media 或对应 owning domain                        |
| Entity、Content contract 与 utility    | `@neko/entity` / `@neko/content`                  |
| SQLite/local metadata                  | 顶层 `@neko/local-metadata`                       |
| NKC、project file IO、authoring        | 顶层 `@neko/project` 或其他明确 owner             |

最终删除 `@neko/shared` 的通配 subpath export。根入口只导出稳定基础契约，不再作为所有领域 DTO 的聚合 barrel。

这些内容不得迁入 `@neko/host`，否则只是把万能共享包改名。

### 8. 单扩展不等于单 bundle 或单故障域

最终 VSIX 可以包含：

- 一个 Extension Host 主入口及其静态 chunk；
- 多个 Webview browser entry；
- 显式 external Node modules；
- 当前平台的 native/runtime closure。

Extension Host、Webview、Node/native 和 host-neutral domain 继续保持真实运行边界。Webview 不得访问 Node 或 VS Code API，Extension Host 不得导入 React renderer，reusable package 不得依赖 App。

可捕获的 JavaScript/capability 初始化异常可以通过 owner-scoped disposable、cancellation 和 diagnostic 隔离。以下失败仍属于进程级故障，不能通过 package 层级恢复：

- N-API/native segfault；
- Extension Host OOM 或退出；
- event loop 不可恢复阻塞。

若未来需要 native 故障隔离，必须通过独立 OpenSpec 定义子进程 owner、IPC、取消、重启和数据一致性；不得用更多 package 或 registry 层伪装进程隔离。

### 9. 最终 VSIX 直接从应用输出组装

目标构建链为：

```text
top-level reusable packages
  -> VS Code feature modules and Webview entries
  -> application builds
  -> target-native/runtime closure staging
  -> manifest/resource/closure validation
  -> one platform VSIX
```

`apps/neko-vscode` 是 VS Code contribution 的 canonical owner。允许在 App 内使用 schema-validated feature manifest fragments 降低冲突，但 fragments 不是 workspace package或独立扩展 manifest，且必须由唯一 generator 生成最终 manifest。

packager 不再创建或解包内部 feature VSIX。缺失资源、重复 contribution、非法 localization、跨平台 native binary、staging root 外依赖和未知 runtime closure 必须在最终 VSIX 创建前 fail-visible。

### 10. 状态 identity 优先保持，不默认执行大迁移

现有 feature memento、secret 和 storage namespace 已使用稳定 feature ID。新实现优先复用相同 key 与路径规则，而不是为了移除 scoped `ExtensionContext` 改写用户状态 identity。

只有确实发生 identity 或存储布局变更时，才执行版本化、幂等、可重试迁移。迁移 marker 必须在所有原子步骤成功后提交；失败时保留源数据和明确 diagnostic，不得静默丢失项目文件、设置、凭据或有价值的本地状态。

## 实施顺序

本决策不采用一次性大爆炸迁移。实施拆为三个连续、各自拥有唯一 canonical path 的变更。

### 阶段一：单扩展运行时与直接打包

- 将 VS Code-only adapter 迁入 `apps/neko-vscode`。
- 收敛一个 Extension 入口和 App-owned contribution。
- 删除 embedded registry、scoped context 和内部扩展发现。
- 将重型 runtime 改为 typed lazy capability。
- 删除临时 feature VSIX，改为直接 staging。
- 暂时保持可复用 package 的 npm identity 和物理路径稳定。

### 阶段二：Workspace 单层化

- 将仍需复用的二级 workspace 提升到 `packages/*`。
- 将 VS Code-only extension workspace 合并进 App。
- 合并无独立消费者的薄 contract/test-utils。
- 更新 pnpm、Turborepo、Vitest、Knip、dependency-cruiser、package groups 和 lockfile。
- 删除旧目录、旧 exports 和所有二级 workspace glob。

### 阶段三：Shared 所有权清理

- 先迁 VS Code 和 React/UI 内容。
- 再按 owning domain 迁移 Agent、Canvas、Media、Entity、Content contract。
- 最后拆分 local metadata 和 project runtime。
- 分边界迁移全部调用方后删除旧 root/subpath export，不保留长期兼容 barrel。

各阶段可以拆为多个提交，但同一职责边界内不得让新旧 activation、registry、packaging、state owner 或 public export 同时返回成功。

## 后果

### 正面后果

- VS Code 的安装、源码、运行时和打包边界一致，不再“对外单扩展、内部多扩展”。
- workspace graph 只剩两个固定层级，pnpm/测试/架构检查不再理解 feature container。
- Desktop、TUI 和 VS Code 对共享 domain/runtime/UI 的依赖地位一致。
- Host 和跨 feature 依赖在 composition root 可见，减少隐式 service locator 耦合。
- `@neko/shared` 不再成为所有领域与 runtime 的公共耦合中心。
- contribution、资源和 native closure 只有一个应用 owner。

### 负面后果

- `apps/neko-vscode` 的源码文件数量增加，需要依靠 feature module 和 import boundary 保持可维护性。
- 顶层 `packages/*` 数量可能暂时增加，目录视觉聚合需要命名规范和文档导航补偿。
- 物理移动会影响构建脚本、测试 fixture、路径检查和活跃 Desktop 变更，必须分阶段协调。
- `@neko/shared` 有大量根入口消费者，完整清理成本高，不能作为单扩展发布的前置大爆炸任务。
- 单扩展不能提供原生代码的进程级隔离。

## 不采用的方案

### 将 App 与 Package 全部合并到一个目录

不采用。它会混淆产品组合根与可复用库，削弱依赖方向和发布边界，没有减少运行时复杂度。

### 保留父功能包和二级 workspace

不采用。当前子包已经被多个 App 使用，父目录不再是真实封装边界；父 package 同时充当扩展与容器会继续制造多重 owner。

### 将所有领域代码合并进 `apps/neko-vscode`

不采用。Desktop/TUI 必须复用 host-neutral domain/runtime/UI，App 只能拥有宿主适配和产品组合。

### 保留 embedded registry 或替换为更通用插件系统

不采用。内部功能不是独立安装、版本、权限或进程单元；通用 registry 会隐藏固定依赖并重新制造服务定位。

### 将 `@neko/shared` 全部迁入 `@neko/host`

不采用。Host 只拥有宿主能力契约，不能成为新的领域 DTO、React、SQLite 和 VS Code 聚合包。

### 一次性完成单扩展、目录迁移和 shared 拆分

不采用。三者影响面不同，合并实施会显著增加回归、冲突和回滚成本。分阶段不代表保留双路径；每个阶段仍必须收敛自己的 canonical boundary。

## 验证要求

完成目标架构至少需要证明：

- workspace 只匹配 `apps/*` 与 `packages/*`；
- 最终产品只有一个 VS Code manifest、entry 和 VSIX；
- 不存在内部 feature VSIX、embedded registry、scoped context 或内部扩展 API discovery；
- feature adapter 不横向 import sibling adapter；
- Webview、Extension Host、Node/native 和 host-neutral 边界检查通过；
- `@neko/host` 不引入具体宿主实现或领域包；
- `@neko/shared` 根入口不重新聚合领域、React 或 VS Code API；
- state identity 保持或通过版本化迁移验证；
- 最终平台 VSIX 在隔离 Extension Development Host 中完成 contribution、Webview、runtime closure、故障 diagnostic 和释放验收。

适用门禁包括 `pnpm build`、`pnpm test`、`pnpm check`、`pnpm check:legacy-debt`、`pnpm check:unused`，以及真实 Extension Development Host 场景。涉及 Agent capability/host routing 时，还必须运行聚焦 Agent evaluation。
