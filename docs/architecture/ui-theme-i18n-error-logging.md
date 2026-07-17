# UI、主题、国际化、错误与日志横切架构

更新日期：2026-06-15

本文定义 OpenNeko 中 UI 公共层、统一主题、国际化、错误处理、日志和诊断的横切边界。它不描述某个创作领域的页面设计，也不记录迁移状态；具体领域 UI 仍放在对应包内，只有跨包复用和跨运行平面的约束放在这里。

## 设计目标

- 将 L0 共享基础设施与 L2 React UI 分开，避免 `@neko/shared` 主入口被 React、DOM 或 VS Code API 污染。
- 让 Webview UI 复用统一主题 token、基础控件、键盘边界和 workbench shell，同时保留领域专属交互。
- 让 Extension Host、Webview、Engine 和 Agent 通过一致的错误、日志和 diagnostic 语义沟通。
- 让国际化按运行平面选择正确入口：VS Code manifest/Extension、Webview bundle、Agent skill/provider 文本分别管理。

## 分层

| 层                 | 典型入口                                                                                                | 职责                                                                                 | 不应承担                                               |
| ------------------ | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| L0 shared contract | `@neko/shared`、`@neko/shared/theme`、`@neko/shared/i18n`、`@neko/shared/logger`、`@neko/shared/errors` | 零依赖类型、token、i18n core、logger/error contract、retry/backoff、diagnostic shape | React 组件、DOM、VS Code API、功能包业务               |
| L1 Extension Host  | `@neko/shared/vscode/extension`、各包 `packages/extension`                                              | VS Code l10n、OutputChannel logger、ErrorHandler、show message、StatusBar、资源授权  | React UI、Webview 业务组件、高频媒体帧                 |
| L2 Webview UI      | `@neko/ui`、`@neko/shared/i18n/react`、`@neko/shared/i18n/webview`、包内 Webview                        | React 组件、主题消费、用户交互、ErrorBoundary、toast/projection                      | 读取工作区文件、调用 VS Code API、持久化 runtime token |
| Engine/Rust        | `engine-types::ApiError`、runtime crate errors、`tracing`                                               | 计算错误、API error code、details、runtime diagnostics                               | 用户提示文案、Webview UI 决策                          |
| Domain packages    | 各创作包 webview/extension                                                                              | 领域 UI、领域文案、领域错误上下文、业务 diagnostic                                   | 重新定义横切 logger/i18n/theme/error 基础设施          |

## 五层约束

| 维度 | 约束                                                                                                                                                               |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 职责 | `@neko/shared` 提供 contract；`@neko/ui` 提供无业务 React UI；Extension Host 负责宿主提示和日志输出；Webview 负责呈现和交互；Engine 返回可分类错误与 diagnostics   |
| 依赖 | `@neko/ui` 可依赖 `@neko/shared` 和 React/Radix，但不能依赖 `vscode`、Node-only module、功能包或 `acquireVsCodeApi`；`@neko/shared` 主入口不导入 React/DOM/VS Code |
| 接口 | 主题走 CSS variables/Tailwind preset；国际化走 `I18nService`/VS Code `l10n`；错误走 `BaseError`/`ApiError`/diagnostic；日志走 `ILogger`/transport                  |
| 扩展 | 新 UI 先判断是否无业务且跨包复用；新文案先判断运行平面；新错误先分类 code/category/retryable；新日志先确定 source、level、transport 和敏感字段                     |
| 测试 | 通过 `@neko/ui` boundary tests、i18n bundle fallback、logger registry tests、ErrorHandler tests、Extension protocol tests、Rust error mapping tests 固化边界       |

## UI 公共层

`@neko/ui` 是新的 L2 React 公共 UI 包，当前公共入口包括 `viewport`、`primitives`、`creative`、`icons`、`hooks`、`workbench`、`keyboard`、`utils` 和 `test-utils`。

| 可进入 `@neko/ui`                                                                      | 留在功能包内                                                                |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Button、IconButton、Badge、Dialog、Select、Slider、Tabs、Toolbar、Tooltip 等无业务原语 | Agent Header/Input/ModelSelector、Timeline 具体业务面板、Canvas 专属节点 UI |
| CreativeWorkbenchShell、CreativeLeftRail、MainPanelControlLayer 等创作工具壳           | 某领域的具体工具状态、命令协议、Engine command 组装                         |
| ViewportShell、OverlayRenderer、frame metadata bridge                                  | 具体 Scene/Puppet/Video 业务状态机                                          |
| KeyboardBoundary、keyboard dispatcher、focus CSS                                       | 功能包快捷键业务命令和编辑器状态                                            |
| 通用 property panel、number slider、timeline ruler、tree view                          | 领域 schema、文件格式、素材实体业务                                         |

`@neko/shared/components` 是 legacy UI 兼容面。新 Webview UI 优先进入 `@neko/ui`；只有历史迁移兼容或明确 allowlist 才继续使用 `@neko/shared/components`。

### UI 边界规则

- `@neko/ui` 不导入 `vscode`、`node:*`、`fs`、`path`、功能包或 Extension/Webview 实现。
- `@neko/ui` 不调用 `acquireVsCodeApi`，不拥有 command bus、postMessage protocol、Engine client 或 Agent runtime。
- `@neko/ui` 组件只接收 props/callbacks/typed data，不主动读取全局 package state。
- 被多个 Webview 复用且无领域语义的控件可以进入 `@neko/ui`；只在一个领域成立的交互留在领域包。
- Cut、Canvas、Audio、Model、Sketch 等被动状态优先投影到 VS Code native StatusBar，避免在 Webview topbar 重复一套状态栏。
- Agent 聊天输入、模型选择、会话模式、媒体模型栏等 Agent-first 交互留在 `neko-agent` Webview，不迁入 `@neko/ui`。

## 统一主题

主题以 VS Code CSS variables 为宿主真实来源，Neko token 是跨 Webview 的命名和 fallback 层。

```text
VS Code theme variables
  -> @neko/shared/theme tokens
  -> nekoTailwindPreset and --neko-* variables
  -> @neko/ui components and package-local CSS
```

| 入口                           | 用途                                                                 |
| ------------------------------ | -------------------------------------------------------------------- |
| `vscodeCSSTokens`              | 将 `--vscode-*` 变量映射为 Tailwind color/font token                 |
| `nekoDesignTokens`             | 注入 `--neko-*` surface、accent、border、shadow、radius 等跨包 token |
| `nekoTailwindPreset`           | Webview Tailwind 配置的统一 preset，注入 token 和兼容基础类          |
| VS Code `package.nls*.json`    | manifest、command、view title 等 Extension 层文案                    |
| `packages/neko-tools/themes/*` | VS Code color theme 和 file icon theme 资源，不替代 Webview token    |

### 主题规则

- Webview 颜色优先使用 `var(--vscode-*)`、`var(--neko-*)` 或 `bg-vscode-*` / `text-vscode-*` utility。
- `--neko-*` 用于跨包一致的 surface、accent、border、radius、shadow；领域包不应私自发明一套全局 token。
- 高对比、浅色、深色主题都必须有可读 fallback；不要只按暗色主题调 UI。
- `@neko/ui` 组件使用 token，不写死业务色板；领域可用局部 CSS 变量扩展，但不能覆盖全局语义。
- Webview 内嵌 HTML、文档预览、EPUB/PDF/Docx 等内容也要强制套用 VS Code foreground/background/link token。
- 图标优先使用 `@neko/ui/icons`、codicon 或现有图标系统；文件图标主题由 `neko-tools` 的 VS Code theme 资源管理。

## 国际化

国际化按运行平面拆开，避免 Webview bundle、Extension l10n 和 Agent prompt 文案混用。

| 平面               | 入口                                                                   | 规则                                                                                                 |
| ------------------ | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| VS Code manifest   | `package.nls.json`、`package.nls.zh-cn.json`                           | command、view、configuration、activation contribution 文案放这里                                     |
| Extension Host     | `vscode.l10n.t(...)`                                                   | QuickPick、show message、StatusBar、TreeView、CustomEditor fallback HTML 等宿主文案使用 VS Code l10n |
| Webview            | `I18nService`、`detectWebviewLocale`、`I18nProvider`、`useTranslation` | 每个 Webview 注册命名空间 bundle，React 通过 provider/hook 消费                                      |
| Agent Skill/Prompt | Skill localized content、provider cards、prompt fragments              | 用 Agent/Skill 自己的 locale 规则，不把 prompt 文案混入 UI bundle                                    |
| Engine/Rust        | error code/details                                                     | 返回 code 和诊断上下文，不承担最终 UI 翻译                                                           |

### Webview i18n 模型

```text
detectWebviewLocale()
  -> new I18nService(locale)
  -> registerBundle(namespace, locale, bundle)
  -> <I18nProvider service={i18nService}>
  -> useTranslation().t(key, params)
```

规则：

- Webview 包可以有本地 `src/i18n/index.ts` 和 `I18nContext.tsx`，但它们应是 `@neko/shared/i18n/*` 的薄包装或 bundle 注册入口。
- bundle key 应命名空间化，例如 `preview.*`、`mediaDiff.*`、`audio.*`，避免跨包 key 冲突。
- `I18nService` 找不到翻译时返回 key；这适合开发期暴露缺失文案，不能依赖它作为正式文案。
- Extension Host 不使用 Webview `I18nService`；Webview 不直接使用 `vscode.l10n`。
- 用户可见错误、空状态、按钮、菜单、状态栏、QuickPick、TreeView 都应走对应平面的 i18n。
- 日志可以记录稳定 code 和技术上下文，不要求完全本地化；用户可见消息必须本地化。

## 错误、诊断与用户提示

错误分三层：内部错误、结构化诊断、用户提示。不要把三者混成一个字符串。

| 层                 | 入口                                                               | 用途                                         |
| ------------------ | ------------------------------------------------------------------ | -------------------------------------------- |
| TS shared error    | `BaseError`、`ErrorCategory`、`retryable`、`retryAfter`、`context` | 跨 TS 包的错误分类、重试和显示策略           |
| TS display handler | `IErrorHandler`、`VSCodeErrorHandler`、Webview ErrorBoundary/toast | 选择是否展示、展示严重度和用户动作           |
| Engine API error   | `engine-types::ErrorCode`、`ApiError`、HTTP status mapping         | 跨 Rust/TS 边界的错误 code、message、details |
| Domain diagnostic  | `RuntimeDiagnostic`、领域 diagnostic 类型、artifact diagnostic     | 可恢复、可展示、可索引的结构化问题           |
| UI fallback        | ErrorBoundary、empty state、inline validation                      | 防止局部 UI 崩溃扩大成整个 Webview 不可用    |

### 错误处理规则

- `catch (error)` 后先归一化：TS 使用 `toBaseError` 或领域专用转换；Engine client 使用 response code/status/details；Rust 使用 `thiserror` 类型转换到 `ApiError`。
- 用户可见动作走 `IErrorHandler` 或 Webview ErrorBoundary/toast，不在业务深处直接散落 show message。
- Extension Host 可用 `VSCodeErrorHandler`：同时记录日志，并按 category/severity 调用 VS Code message API。
- Webview ErrorBoundary 只负责 React 崩溃兜底；业务错误应以 inline validation、toast、diagnostic panel 或 artifact projection 呈现。
- 可重试错误必须显式标注 `retryable`、`retryAfter` 或 recovery signal；不要让 UI 靠解析 message 决定重试。
- 权限、认证、外部副作用和数据覆盖错误必须提供明确用户动作，例如 Open Settings、Retry、Reveal Output、Cancel。
- Engine/GPU/stream fallback 需要返回 diagnostics；不能静默降级，也不能只在日志里记录。
- 不把 secret、绝对本地路径、token、完整 prompt、二进制 payload 写入用户提示或可上传诊断。

## 日志

日志通过 `ILogger` 和 transport 解耦。包内代码通过 package logger registry 获取 scoped logger，不直接把 `console.log` 当正式日志方案。

```text
package module
  -> getLogger('Module')
  -> ILogger
  -> ConsoleTransport / VSCode OutputChannelTransport / captured test transport
```

| 环境             | 入口                                                            | 规则                                                            |
| ---------------- | --------------------------------------------------------------- | --------------------------------------------------------------- |
| L0/Node/browser  | `ConsoleLogger`、`ConsoleTransport`、`CapturedLogTransport`     | 默认 fallback 或测试捕获                                        |
| Extension Host   | `createVSCodeLogger`、`watchLogLevel`、`OutputChannelTransport` | 写 VS Code OutputChannel，响应 `neko.logLevel`                  |
| Package registry | `createLoggerRegistry(packageName)`                             | 包内 `getLogger(source)` 统一来源和 child source                |
| Rust Engine      | `tracing`、`RUST_LOG`                                           | 由 host logger level 同步环境变量，Rust 侧保留结构化 span/event |

### 日志规则

- 每个包建立一个 root logger，模块使用 `getLogger('ModuleName')` 或 `logger.child('SubSource')`。
- Extension 激活时用 `createVSCodeLogger` 替换 root logger，并通过 `watchLogLevel` 热更新级别。
- Webview 默认可用 console transport，但日志级别应保守；高频帧、指针移动、音频包、stream packet 不应逐条 info/debug。
- 日志 source 使用稳定层级，例如 `NekoModel:Viewport`、`NekoPreview:DocumentProvider`。
- `error` 级别记录 Error 对象或结构化 data；不要只记录字符串。
- 禁止记录 secret、provider key、token、完整用户 prompt、完整文件内容、base64、大 buffer 和未脱敏本地路径。
- 需要给 UI 展示的问题走 diagnostic/error handler，不靠用户打开日志理解。

## 运行平面协作

```text
Extension command
  -> vscode.l10n.t user text
  -> logger child source
  -> try operation
      -> EngineClient / domain service
      -> ApiError or diagnostic
  -> toBaseError / diagnostic projection
  -> VSCodeErrorHandler or Webview projection
```

Webview 侧：

```text
React event
  -> typed command/postMessage
  -> optimistic UI or pending state
  -> result/error projection
  -> inline validation / toast / ErrorBoundary fallback
```

Engine 侧：

```text
runtime error
  -> thiserror domain error
  -> host-api ApiError/ErrorCode/details
  -> EngineClient normalized response
  -> Extension/Webview diagnostic or user-visible error
```

## 反模式

| 反模式                                        | 风险                   | 正确边界                                                     |
| --------------------------------------------- | ---------------------- | ------------------------------------------------------------ |
| 把 React 组件放进 `@neko/shared` 主入口       | L0 被 React/DOM 污染   | 新 UI 进入 `@neko/ui`，legacy 才用 `@neko/shared/components` |
| `@neko/ui` 导入功能包或 `vscode`              | 公共 UI 变成业务层     | UI 只接 props/callbacks/typed data                           |
| Webview 自己调用 `vscode.l10n` 或 VS Code API | 沙箱边界破坏           | Webview 用 `I18nService` 和 postMessage                      |
| Extension 使用 Webview bundle 翻译            | 文案来源混乱           | Extension 用 `vscode.l10n.t` / `package.nls`                 |
| 用 `console.log` 做正式日志                   | 无级别、无来源、难排查 | 使用 `ILogger` 和 package logger registry                    |
| 业务层直接 `showErrorMessage` 到处散落        | 无法统一显示策略和测试 | 通过 `IErrorHandler` 或集中 adapter                          |
| UI 解析错误字符串决定重试                     | 文案变更破坏逻辑       | 使用 `code/category/retryable/retryAfter`                    |
| Engine 只返回字符串错误                       | TS 无法分类恢复        | 返回 `ErrorCode`、message、details/diagnostic                |
| 高吞吐循环写 info/debug 日志                  | 卡顿和日志噪声         | 采样、聚合或 trace-level gated                               |
| Webview topbar 重复展示被动状态               | 多包 UI 不一致         | 被动状态投影到 VS Code StatusBar                             |

## 与其他架构文档的关系

- 子包依赖和运行平面边界见 [`package-boundaries.md`](package-boundaries.md)。
- Engine 错误、diagnostic 和 fallback 的运行时权威见 [`engine-runtime.md`](engine-runtime.md)。
- Agent 消息、artifact 和 recovery projection 见 [`agent.md`](agent.md)。
- Auth/secret 不应进入日志、prompt 或 Webview state，见 [`auth.md`](auth.md)。
- 缓存、路径和运行时 URI/token 的持久化边界见 [`cache-file-access-and-paths.md`](cache-file-access-and-paths.md)。
