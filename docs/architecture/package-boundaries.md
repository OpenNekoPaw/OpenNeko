# 包边界、公共层与运行平面

状态：Accepted

更新日期：2026-07-17
对应变更：`align-pruned-workspace-build`

本文定义当前保留 workspace 的依赖方向、公共能力 owner，以及 TUI、VS Code Extension/Webview 和 Rust Media Engine 的边界。包名、入口和示例只描述当前保留实现；已移除产品不构成兼容要求。

## 分层与依赖方向

| 层级 | 主要包 | 可依赖 | 不得依赖 |
| --- | --- | --- | --- |
| L0 host-neutral | `@neko/shared`、`@neko/proto`、`@neko/content`、`@neko/entity`、`@neko/search`、`@neko/markdown`、`@neko/skills` | 更低层纯 contract/utility | VS Code、React、Webview、应用根、功能包内部实现 |
| L1 host/client | `@neko/host`、`@neko/neko-client`、各功能包 host-neutral core/platform | L0、明确 runtime dependency | React/Webview 实现、`apps/*`、其他功能包内部实现 |
| L2 browser UI | `@neko/ui`、功能包 Webview | L0、L2 公共 UI、包自有 contract | `vscode`、Node-only API、Extension 实现、Engine native handle |
| Extension Host | 保留功能包的 Extension、Engine Extension | L0/L1、VS Code API、包自有 host adapter | React/Webview implementation、其他功能扩展内部实现 |
| Application | `apps/neko-tui`、`apps/neko-vscode` | package public entries | `packages/*/src`、其他应用内部目录、应用级领域副本 |

依赖必须自上而下组合：

```text
apps
  -> public package entries
  -> host/domain contracts
  -> shared/proto

Webview -> UI/shared contracts
Extension -> host/domain/client contracts
Engine hosts -> Host API -> Kernel/runtime
```

任何跨层消息都先定义类型化 contract；任何跨包复用都走 public entry、port、facade command 或明确 adapter，不直接导入另一个包的内部实现。

## 公共包职责

### `@neko/shared`

`packages/neko-types` 是零依赖或低依赖基础能力 owner，包含 Logger、i18n、Theme、Errors、路径和 VS Code bridge 等分层公共入口。

- L0 入口不得导入 DOM、React、VS Code 或功能包。
- VS Code/Webview 专用能力只能从对应子路径暴露，不能污染通用入口。
- 功能包不得复制 package-local logger、i18n runtime、theme token、error 类型、path resolver 或项目文件 IO。

### `@neko/host`

`packages/neko-host` 提供 host-neutral application identity、project/file/config/credential 等宿主 port 和组合辅助。

- 具体 VS Code 或 Node/TUI adapter 在宿主边界实现。
- host-neutral core 不读取 VS Code API、DOM 或 Webview global。
- application identity 是路由契约，不会创建产品入口，也不能让已移除产品成功启动。

### `@neko/proto`

`packages/neko-proto` 是跨语言 wire contract 的单一事实来源。涉及 Engine action、stream descriptor 或跨层 DTO 时，优先更新 Proto/Host API 和生成类型，不在功能包手写平行协议。

### `@neko/neko-client`

`packages/neko-client` 是 Engine HTTP/WebSocket 和流消费 client 的边界。

- 功能包不得散落私有 Engine URL、裸 WebSocket 协议或重复 normalizer。
- Webview 只能消费 Extension 授权后的 descriptor；Extension 负责端口、token、路径授权和生命周期。
- 普通播放器优先组合公共 stream lifecycle，只保留领域控件、渲染与错误 UI。
- 被移除的 Scene/Puppet/Model/ML/Device/Live client method 不得以 fallback 或空结果恢复。

### `@neko/content`

`packages/neko-content` 拥有文档解析、locator/range、entry ref、图片元数据探测和格式识别等跨领域内容语义。

- 通过 runtime deps 注入文本、二进制和 container 读取能力。
- 不管理 cache root、Webview URI、Engine token、workspace 生命周期或 UI 状态。
- Agent 和领域包复用公共入口，不重新实现 document reader/cache/path/media catalog。

### `@neko/entity` 与 `@neko/search`

实体和搜索是 host-neutral 跨领域服务。

- core/projection 通过 port 注入文件、锁、日志和事件能力，不依赖 VS Code、React 或功能包内部实现。
- Assets 是当前 VS Code Entity runtime、Entity Browser、metadata binding 和 Inspector 的宿主 owner。
- Canvas、Assets 和 Agent 通过 canonical facade/contract 访问 Entity；不存在 Dashboard fallback。
- projection 不泄露 store/cache/index 绝对路径、token、Webview URI 或 manifest path。

### `@neko/ui`

`packages/neko-ui` 是 React/Webview 公共 UI 层。

- 只拥有无业务 UI primitive、viewport/layout、foundation、keyboard/focus、hooks 和测试辅助。
- 不拥有 contribution registry、产品生命周期、宿主权限、Engine operation 或 Agent runtime。
- `workbench` UI 若保留，只是 render-only primitive；它不得依赖已移除 Workbench Core，也不得成为第二套 runtime registry。
- 新增组件前先审计公共 primitive、同包 components/hooks/shared 和相邻保留包；跨两个以上 Webview 的无业务 UI 才适合提升到公共层。
- 生产 Webview 不直接调用 `acquireVsCodeApi()` 或建立本地 mock/fallback bridge，应复用共享 typed facade。

## 组合包已移除

`@neko/workbench-core` 和 `@neko/market-core` 不在 workspace 中。保留 Canvas、Cut、Agent 和 Preview Webview 直接暴露 package-owned host adapter；应用根显式组合这些公共入口。

不得通过 TypeScript alias、空 package、legacy export、动态 optional import 或成功 no-op 恢复已移除组合层。未来出现两个以上真实、同生命周期、同错误模型的复用点时，应先通过 OpenSpec 定义新的中立 contract，而不是复活旧包。

## Extension Host

Extension 包拥有 VS Code 宿主能力：

- 注册 commands、Custom Editors、providers、status bar 和 disposables；
- 通过 `webview.asWebviewUri()` 投影资源，并用类型化 `postMessage` bridge 通信；
- 授权 Engine port、token、file root、stream descriptor 和 preview resource；
- 通过 `EngineClient` 编排媒体操作；
- 在 deactivate、editor close 和取消路径显式释放资源。

Extension 不导入 React，不复制 Rust 媒体计算，不直接依赖其他功能扩展内部实现，也不中继高频视频帧或 PCM。

## Webview

Webview 负责浏览器沙箱内的 UI、用户交互和可恢复展示状态。

- 可以使用 React、Zustand、`@neko/ui`、共享 Webview facade 和包自有 components/hooks。
- 不能导入 `vscode`、`node:*`、`fs`、`path` 或 Extension 实现。
- 不能直接读写 workspace、持久项目事实、SecretStorage 或 Engine 进程状态。
- token、blob URL、stream handle 和 Webview URI 只能是短生命周期投影，不能写回项目文件。
- 媒体入口必须遵守 CSP、codec 和 Range 边界；错误应展示明确 diagnostic，不伪装成功。

涉及视觉、交互、CSP、焦点、消息或媒体的验收必须运行 Extension Development Host；普通浏览器只适合纯浏览器兼容辅助。

## Rust Media Engine

Engine 当前只拥有媒体能力：文件/Range、probe/capture、编解码、音频处理、GPU 媒体处理、timeline、stream、effect、color、preview、export 和 task/health。

- TypeScript 只负责编排、展示、请求和校验，不重写 Engine 权威计算。
- Engine file access 服务大型二进制和需 seek 的媒体；纯文本、配置和 JSON 项目事实仍由 Host IO/领域 codec 管理。
- Scene、Puppet、Model、ML、Device、Live、panoramic 与设备采集已经移除，不能作为 Engine 入口或领域依赖。
- 新能力先定义 contract，再实现 Kernel/runtime，最后接 host/client/consumer，并用路径断言证明旧 handler 未参与。

## Agent 子包

`packages/neko-agent` 内部继续按职责分层：

| 子包 | 职责 |
| --- | --- |
| `agent-types` | Agent/Webview/Extension contract 和状态投影 |
| `agent` | host-neutral session、workflow、prompt、skill、memory、tool、evaluation |
| `ai-sdk` | provider/AI SDK adapter |
| `platform` | host-neutral 配置、provider glue 和平台桥 |
| `extension` | VS Code command、配置桥、host adapter、会话入口 |
| `webview` | Chat/Agent UI、消息投影和用户输入 |
| `test-utils` | 测试支撑 |

TUI 的产品级组合位于 `apps/neko-tui`。Agent core/platform 不导入 VS Code、React 或 Webview；Webview 不导入 Agent runtime、provider adapter 或 Extension API。Prompt、Skill、capability/tool schema 和宿主副作用按各自边界维护。

## 保留领域包

| 包 | 主要职责 | 关键边界 |
| --- | --- | --- |
| `neko-agent` | Agent session、provider、Skill、capability 与 Chat UI | runtime host-neutral；宿主与 UI adapter 分离；行为变更需真实 evaluation |
| `neko-assets` | 素材库、元数据、缩略图、Entity VS Code surface | 路径走公共 resolver；Entity 走 canonical facade；缓存不伪装事实 |
| `neko-canvas` | 画布、创作结构、投影与领域 authoring | Webview 管交互；持久写入走 domain/host contract；复用公共 UI |
| `neko-cut` | Timeline、视频编辑、媒体控制与导出 | Webview 管时间线交互；Extension 管 editor/export；媒体走 Engine client |
| `neko-preview` | 保留格式的授权预览 | Extension 管 provider/resource/CSP；Webview 只渲染授权内容 |
| `neko-tools` | 工具、Media LSP、差异与诊断 | LSP/diagnostic 在 Extension；不得贡献已移除 Device UI |
| `neko-engine` | 本地 Rust Media Engine 与 VS Code native wrapper | 只暴露保留媒体 contract；native 资源显式释放 |
| `apps/neko-vscode` | VS Code 产品组合根 | 只拥有 Extension Pack、打包、发布和产品验收 |

## 路径、缓存与用户数据

- 持久事实保存 workspace-relative path、`${VAR}/path`、stable `ResourceRef`、asset/entity ID 和 provenance。
- 本机绝对路径只允许存在于本机设置、临时运行时状态或明确 host adapter 内。
- Cache 是可重建派生数据，不能替代项目、Entity、Asset 或 Agent 事实。
- 用户 secret 不写入项目文件、日志、Webview state、prompt 或 Skill。
- 跨包 mutation 通过 facade/port/command 和明确 error contract，不直接写另一个包的私有存储。

## 验证命令

按改动影响范围组合运行：

```bash
pnpm check:deps
pnpm check:agent-boundaries
pnpm check:legacy-debt
pnpm check:unused
pnpm test
pnpm build
pnpm test:webview:functional --owner neko-canvas
cd packages/neko-engine && cargo test --workspace
```

Webview 场景由 owning package 维护业务 fixture 和断言；共享 runner 只拥有宿主、CDP、错误策略和报告。原始报告只能使用隔离合成 workspace，并按仓库规则脱敏。
