# ADR: Neko Desktop AppHost、资源工作台与 Engine Viewport 边界

状态：Superseded（2026-07-14）
日期：2026-07-08  
范围：`neko-desktop`、Desktop AppHost、Resource Explorer、Market/Packages/Skills 管理面、Engine-owned viewport、VSCode/TUI/未来客户端边界。

取代说明：Desktop 产品壳已由 `restructure-client-applications-and-retire-desktop-shell` 删除，Workbench Core 又由 `align-pruned-workspace-build` 删除；本文仅保留历史决策背景，不是当前产品或实现入口。现行契约以 `application-composition.md`、`package-boundaries.md` 和 `engine-runtime.md` 为准。

## 背景

OpenNeko 当前主要运行在 VSCode Extension Host + React Webview + Rust Engine 的组合上，并已有 Agent TUI。这个结构适合 VSCode 内集成、Agent 会话、项目文件访问和轻量预览，但 VSCode Webview 与浏览器媒体栈不适合作为专业媒体/Scene 输出真值：CSP、`asWebviewUri()`、Range、codec 支持、10-bit/HDR 色彩、GPU texture 复用、frame clock 和 native surface 生命周期都不是 Neko 可完全控制的边界。

Neko Desktop 的目标不是替代现有 VSCode 入口，而是新增一个 AIGC 原生本地编辑器宿主：Electron 负责桌面壳和 Web UI 工作台，Rust Engine 负责专业渲染输出真值，领域包继续拥有素材、实体、搜索、市场、技能、Canvas、Cut、Audio、Model 等业务能力。它同时承担更可控的自动化测试宿主职责，用于弥补 VSCode Extension Host 与 Webview 原生测试在启动、焦点、截图、IPC 和可重复断言上的不稳定。

## 决策

### 1. Electron 是 MVP AppHost，不是渲染真值

`neko-desktop` MVP 使用 Electron 作为桌面客户端壳层。Electron main/preload/renderer 的职责是窗口、菜单、IPC、文件对话框、拖拽、设置、工作台 UI 和本地 AppHost 编排。

Electron WebContents 不承担专业视频、Scene、10-bit/HDR、色彩管理、纹理复用或最终导出的画面真值。它只能显示控制 UI、低风险预览投影、缩略图、诊断和占位 viewport。

### 2. 专业输出由 Engine-owned ViewportSession 负责

视频、媒体和 Scene 的专业渲染输出必须进入 Engine-owned viewport/session 边界：

```text
React/Electron UI
  -> typed command / intent
  -> Desktop AppHost
  -> neko-engine viewport/session/control
  -> native surface / texture lease / swapchain / stream descriptor
```

ViewportSession 至少应覆盖：

- native surface 或等价输出目标；
- frame clock；
- 纹理 lease / GPU resource 生命周期；
- 色彩空间、HDR、tone mapping 和后续 OCIO 管线；
- overlay、gizmo、hit-test 和诊断；
- 与导出路径共享的媒体/Scene 真值。

MVP 可以只实现 contract 和占位面板，但不得把 WebContents canvas、HTML video 或 WebCodecs 输出声明为专业输出真值。

### 3. Resource Explorer 是资源源工作台，不是目录树

Neko Desktop 的 Resource Explorer 采用 source-owned resource node 模型，而不是单纯的 OS 文件目录展示。

资源节点可以来自：

- Project Files；
- Assets / Media Library；
- Entities；
- Generations / Tasks / Outputs；
- Search；
- Engine Media / Preview descriptors；
- Market / Packages；
- Skills。

节点应表达 stable ref、来源、类型、缩略图、预览描述、metadata、badges 和 actions。不得把 `.neko/.cache` 路径、Webview URI、blob URL、Engine token、preview token 或 absolute temp path 当作长期资源身份。

### 4. Explorer、Assets、Market/Packages、Skills 是分离管理面

Explorer 是当前项目创作资源入口。Assets、Generations、Market/Packages、Skills、Search 是独立管理面，可以共享 ResourceNode、thumbnail、action 和 registry primitives，但不能全部塞进 Explorer 目录层级。

```text
Resource Registry primitives
  -> Explorer View
  -> Assets Manager
  -> Generations Queue
  -> Market / Package Manager
  -> Skill Manager
  -> Search View
```

Market/Packages 涉及安装、更新、信任、版本、依赖和 entitlement。Skills 涉及 Agent 激活、trust、诊断、工具/提示词能力。它们和项目文件浏览有不同生命周期和安全边界，因此必须保留单独 UI 入口。

### 5. Desktop 是 composition root，领域能力仍归 owning package

`neko-desktop` 不拥有 Media Library、Creative Entity、搜索索引、市场协议、技能 runtime、Agent runtime 或 Engine 计算。它只组合这些公共契约和 domain providers。

新增 resource source 或 management action 时优先由 owning package 暴露 host-neutral contract，再由 Desktop AppHost/renderer 投影。不得从 desktop 直接 import 另一个功能包的内部实现。

### 6. Desktop 是更稳定的自动化验收宿主

VSCode 继续作为插件生态和轻量创作入口，但 VSCode 原生 Extension/Webview 测试在窗口生命周期、Extension Development Host、Webview focus、DevTools target、截图和消息时序上存在天然不稳定。Desktop 应提供更可控的 E2E 测试面：

- 可预测的 AppHost 启动和关闭；
- typed IPC 可直接断言 unknown channel、version mismatch 和 host diagnostic；
- renderer 状态、资源面板、viewport placeholder 和 command intent 可截图或查询；
- 测试 fixture 可以从 AppHost 注入，而不依赖 VSCode workspace activation 顺序；
- Engine viewport、资源工作台和 Agent/Capability 投影可形成稳定验收路径。

这不意味着跳过 VSCode runtime smoke。涉及 VSCode 插件、Webview CSP、Extension 命令、Custom Editor 或焦点行为的变更仍必须用 VSCode 运行态验证；Desktop 负责补足专业客户端和稳定自动化验收路径。

## 五层分析

职责：

- `neko-desktop`：Electron AppHost、preload bridge、renderer workbench、desktop composition。
- `neko-desktop` 自动化面：稳定启动、fixture 注入、typed IPC 断言、截图和 E2E 验收。
- `@neko/host`：host primitive ports，不承载资源语义。
- `neko-engine`：viewport、media/Scene rendering、codec、color、texture、export truth。
- Domain packages：资源事实、管理动作、capability provider 和投影。

依赖：

- Renderer 不导入 `vscode`、Node API、Electron main internals 或 Engine internals。
- Main/preload 可导入 Electron/Node，但不导入 React。
- Engine 通信走 `@neko/neko-client`、Proto 或后续 Engine viewport contract。
- 资源访问走 ResourceRef/source ref + AppHost 授权，不直接暴露缓存和 runtime handles。

接口：

- Desktop bridge 是 typed IPC contract，未知 channel/version fail-visible。
- ResourceNode 是 projection DTO，不是持久项目事实。
- Thumbnail/preview 是短生命周期 descriptor 或 lease。
- Viewport command 是 intent，不直接修改 renderer 私有媒体真值。

扩展：

- 新 source 可接入 Resource Explorer 而不改 shell。
- Tauri 或其他 host 可实现同等 AppHost ports。
- Native viewport 可以替换 MVP placeholder，不影响控制 UI 与资源面板。

测试：

- Desktop package build 覆盖 main/preload/renderer。
- Renderer boundary tests 阻止 Node/Electron/VSCode/Engine internal import。
- Resource node tests 覆盖 thumbnail descriptor、surface 分类和 fixture。
- Desktop E2E tests 覆盖 AppHost 启动、typed bridge、资源面板、viewport placeholder、command intent 和稳定截图/状态断言。
- Native viewport、10-bit/HDR、texture lease 和性能基线作为后续 Engine/Desktop integration 验收。

## 后果

- VSCode 继续作为集成入口，Desktop 成为专业 AIGC 编辑器宿主。
- Web UI 保留迭代效率，但不再决定专业画面真值。
- Resource Explorer 能覆盖缩略图、资产、实体、生成、市场、技能等创作对象。
- Engine viewport 成为后续 10-bit/HDR、OCIO、纹理复用和低延迟预览的唯一正确落点。
- Desktop 自动化路径成为专业客户端 E2E 验收的优先落点，VSCode smoke 继续覆盖插件宿主特有行为。

## 不做

- 不移除 VSCode extension。
- 不用 Electron WebContents 作为专业输出真值。
- 不把 `@neko/host` 扩成资源/市场/技能聚合器。
- 不让 Desktop 直接拥有 domain runtime。
- 不把 `.neko` 内部文件当普通用户资源展示。

## 参考

- OpenSpec change：`openspec/changes/introduce-neko-desktop-mvp-client`
- 客户端目标：[`client-targets.md`](client-targets.md)
- 相关文档：[`package-boundaries.md`](package-boundaries.md)、[`engine-runtime.md`](engine-runtime.md)、[`webview-media-security.md`](webview-media-security.md)、[`adr-agent-runtime-architecture-comparison-boundary.md`](adr-agent-runtime-architecture-comparison-boundary.md)
