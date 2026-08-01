# ADR: Desktop 子包粒度、领域所有权与 Host 接入边界

状态：Proposed

日期：2026-07-31

范围：`apps/neko-desktop`、一级 `packages/*` workspace、Desktop Main/preload/renderer、
Host ports、领域 runtime、Node adapter、Webview、测试支撑与仓库治理。

本文是待评审的目标架构，不是当前 package 拓扑的事实清单，也不授权直接移动、删除或重命名
workspace。当前行为以代码、manifest 和 Accepted 架构文档为准；本文目标必须通过“实施
OpenSpec”列出的 change 完成路径级验收后，才能提升为 Accepted/current 约束。

## 背景

OpenNeko 已收敛为唯一 Electron Desktop 应用和一级
`packages/*` workspace。当前拓扑解决了嵌套 package、VS Code Extension 和 TUI 多宿主问题，
但仍存在四类结构性疑问：

1. `apps/neko-desktop` 是否应移入 `packages/`；
2. Agent、Canvas、Cut、Preview、Tools 为什么分别拆成 contracts/domain、runtime/node 和
   Webview 等多个包；
3. Desktop 是否已经承担了本应归属领域包的业务逻辑，以及是否需要为每个领域创建独立
   Host package；
4. 扁平化迁移后是否仍有目录、文档、OpenSpec、测试和 package identity 残留。

代码量不是 package 边界。独立 package 必须对应稳定职责、真实运行边界、独立依赖闭包、
多个真实消费者或可验证的替换点。仅因目录较大、名称相似或假想未来复用而拆包，会增加
workspace、构建、依赖、测试和命名成本，却不能改善所有权。

## 决策摘要

- `apps/neko-desktop` 继续作为唯一可执行应用和 concrete composition root，不移入
  `packages/`。
- 一级 package 只为 bounded context、跨 runtime contract、Node/browser 隔离、重型 adapter
  或多个真实消费者建立。
- `@neko/host` 继续作为唯一共享 Host primitive port 包，但必须先执行准入审计；产品
  application contract、领域命令目录、mutable registry 和 concrete adapter 不得留在其中。
  领域接入在 Desktop 内按模块隔离，不为单一 Electron 宿主创建一组 `neko-*-host`
  workspace package。
- Desktop 可以拥有产品 Shell、Home、Project/Window/View、typed IPC、授权、文件选择和
  跨领域 capability composition；不得拥有 Agent 会话语义、Cut 时间线/导出编排等
  host-neutral 领域运行逻辑。
- 优先拆解 `neko-platform` 和审计 `neko-types`；不得继续通过宽泛 Platform/Shared manager
  bag 承接无 owner 能力。
- 没有真实消费者的 package 必须接入、明确标记为未接入内核，或删除/合并；package 存在
  本身不得成为产品能力已支持的证据。
- package identity 最终统一到单一 `@neko/*` scope，并与目录责任一致；所有权迁移先于
  纯命名迁移。
- 已删除聚合根、过期活动文档、完成但未归档 OpenSpec 和空测试目录必须分类治理；迁移、
  拒绝和 poison 测试不得被误删。

## 五层分析

### 职责

- Desktop：应用生命周期、Electron 安全、Main/preload/renderer、产品 Shell、Host adapter
  和跨领域组合。
- Domain/runtime package：领域状态、命令、策略、生命周期、错误契约和 host-neutral
  application orchestration。
- Contract package：跨 Main/preload/renderer 或跨两个以上 package 的最小稳定协议。
- Node adapter：FFmpeg、SQLite、文件、进程或其他 Node-only 实现。
- Webview package：React、浏览器状态、交互和授权 descriptor 消费。

### 依赖

```text
apps/neko-desktop
  -> package public entries
  -> domain/runtime contracts
  -> @neko/host + @neko/shared

Desktop Main
  -> domain application/runtime + Node adapters

Desktop preload
  -> package-owned contracts

Desktop renderer
  -> Webview packages + contracts + @neko/ui
```

Renderer/Webview 不得导入 Node/Electron；Desktop Main 不得导入 React；领域包不得导入
`apps/neko-desktop`。Desktop adapter 可以依赖领域 public entry，但不得重新实现领域状态机。

### 接口

- 跨 runtime contract 必须由 owning package 或应用 L0 shared contract 持有。
- `NekoHostPorts` 是组合入口，不要求每个消费者接收完整端口集合；消费者应通过
  `Pick<NekoHostPorts, ...>` 或更窄领域 port 声明实际能力。
- Desktop domain adapter 必须携带 project/window/view/session 等显式 identity，并返回
  typed diagnostic。
- package 之间只通过 public entry、port、command 或 facade 组合。

### 扩展

- 新增第二个真实应用宿主时，新增宿主自己的 composition root 和 adapter，而不是扩张
  Desktop package。
- 新增同领域 Node/browser 实现时，先比较 package subpath 与独立 package；只有依赖闭包、
  构建、测试或发布生命周期确实独立时才新增 workspace package。
- 新增 contract package 前必须证明至少两个独立 producer/consumer，或存在必须强制的
  Main/preload/renderer 安全边界。

### 测试

- package boundary tests 证明依赖方向和旧路径不可成功。
- producer/consumer tests 同时覆盖 contract 两端。
- Desktop adapter tests 证明 sender、identity、revision、授权和释放。
- domain tests 证明状态机、命令、取消和错误，不依赖 Electron。
- 删除 package 或旧目录前运行 unused、legacy、dependency、test ownership 和 Desktop
  packaging/运行态验证。

## 当前 package 职责与处置

| Package                       | 当前职责                                               | 决策                                            |
| ----------------------------- | ------------------------------------------------------ | ----------------------------------------------- |
| `apps/neko-desktop`           | Electron Main/preload/renderer、Shell、打包和产品组合  | 保留在 `apps/`                                  |
| `neko-agent-runtime`          | Pi 会话、Turn、Tool、Capability、权限和 Agent runtime  | 保留；接收从 Desktop 下沉的 Agent 逻辑          |
| `neko-agent-types`            | Agent Main/preload/Webview contract 和状态投影         | 保留                                            |
| `neko-agent-webview`          | Chat/Agent React UI 和浏览器交互                       | 保留                                            |
| `neko-ai-sdk`                 | AI SDK/provider adapter                                | 暂保留；在 Platform 拆解后复核消费者            |
| `neko-platform`               | Config、provider 和媒体生成集成                        | 拆解到真实 owner 后移除                         |
| `neko-agent-test-utils`       | fixture、stream replay 和 poison helper                | 当前无跨包消费者；合并或建立真实复用            |
| `neko-types` / `@neko/shared` | 公共契约、Logger、路径、metadata 和 Node helper        | 保留最小 L0；提取 L1/领域职责                   |
| `neko-host`                   | Host primitive ports，以及当前误置的应用/命令/registry | 保留并收窄；非 primitive 迁回真实 owner         |
| `neko-ui`                     | 无业务 React primitive、布局、焦点和基础交互           | 保留                                            |
| `neko-media`                  | 媒体契约、Node/FFmpeg、browser video/PCM               | 保留；现有 subpath 隔离有效                     |
| `neko-content`                | 文档解析、locator、range 和读取                        | 保留                                            |
| `neko-markdown`               | Markdown 解析与投影                                    | 保留；内部包应显式 `private`                    |
| `neko-entity`                 | 创作实体、分析和 projection                            | 保留                                            |
| `neko-search`                 | 搜索 coordinator/provider                              | 当前未接入；接入或明确为未接入内核              |
| `neko-generation`             | 生成 contract 和 recoverable Job                       | 保留                                            |
| `neko-quality`                | Quality Gate、evaluator 和证据模型                     | 当前未接入；接入或明确为未接入内核              |
| `neko-chara`                  | Character Dialogue、证据和运行编排                     | bounded context 保留；不得宣称 Desktop 已接入   |
| `neko-skills`                 | 内置 Skill 内容资源                                    | 保留为内容 owner                                |
| `neko-assets`                 | Resource Browser 和 Media Library copy                 | 保留                                            |
| `neko-canvas-domain`          | Canvas contract、authoring 和 session                  | 保留                                            |
| `neko-canvas-webview`         | Canvas 浏览器 UI                                       | 保留                                            |
| `neko-cut-domain`             | OTIO、Timeline、Command 和 session                     | 保留                                            |
| `neko-cut-node`               | FFmpeg、媒体导入、导出和预览 adapter                   | 保留                                            |
| `neko-cut-webview`            | Timeline 编辑 UI                                       | 保留                                            |
| `neko-preview-contracts`      | Main/Webview Preview contract                          | 保留                                            |
| `neko-preview-webview`        | PDF、EPUB、媒体和 3D Preview UI                        | 保留                                            |
| `neko-tools-contracts`        | Media Diff contract                                    | 仅有 Webview 消费时合并；真实 Host 消费后可独立 |
| `neko-tools-webview`          | 图片、音频和视频 Diff UI                               | 当前未接入；不得视为已交付产品能力              |

## Package identity、owner 与处置映射

下表冻结本 ADR 提出时的完整映射。`Consumers` 是 2026-07-31 manifest 直接依赖基线，不包含
动态资源加载、root script 和历史测试引用；实施前必须重新生成并与本表对账。标记为“治理后
决定”的 package 不得先行重命名：若治理决定删除/合并，则最终目录和 identity 均为无；若
决定保留，使用表中给出的规范化目标。

| 当前目录                          | 当前 npm identity         | 最终目录                          | 最终 identity             | Owner                                       | Consumers（当前 manifest）                                                                      | Disposition                                                              |
| --------------------------------- | ------------------------- | --------------------------------- | ------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `apps/neko-desktop`               | `@neko/app-desktop`       | `apps/neko-desktop`               | `@neko/app-desktop`       | Electron application/composition            | 无（应用根）                                                                                    | 保留                                                                     |
| `packages/neko-agent-runtime`     | `@neko/agent`             | `packages/neko-agent`             | `@neko/agent`             | Agent runtime、Pi session、Tool、permission | Desktop、Agent test-utils、Platform                                                             | 仅目录改名；不得恢复历史聚合根语义或创建第二个 `@neko/agent`             |
| `packages/neko-agent-test-utils`  | `@neko-agent/test-utils`  | `packages/neko-agent-test-utils`  | `@neko/agent-test-utils`  | Agent test support                          | 无                                                                                              | 零消费者治理后决定；保留时统一 identity，否则合并到真实测试 owner 或删除 |
| `packages/neko-agent-types`       | `@neko-agent/types`       | `packages/neko-agent-types`       | `@neko/agent-types`       | Agent L0/cross-runtime contract             | Desktop、Agent runtime、Agent Webview、AI SDK、Platform                                         | 保留并统一 identity                                                      |
| `packages/neko-agent-webview`     | `@neko-agent/webview`     | `packages/neko-agent-webview`     | `@neko/agent-webview`     | Agent browser/React UI                      | Desktop                                                                                         | 保留并统一 identity                                                      |
| `packages/neko-ai-sdk`            | `@neko/ai-sdk`            | `packages/neko-ai-sdk`            | `@neko/ai-sdk`            | AI SDK/provider adapter                     | Platform                                                                                        | Platform 拆解后复核真实消费者；保留时名称不变                            |
| `packages/neko-assets`            | `neko-assets`             | `packages/neko-assets`            | `@neko/assets`            | Resource Browser/Media Library              | Desktop                                                                                         | 保留并统一 identity                                                      |
| `packages/neko-canvas-domain`     | `@neko-canvas/domain`     | `packages/neko-canvas-domain`     | `@neko/canvas-domain`     | Canvas contract/authoring/session           | Desktop、Canvas Webview                                                                         | 保留并统一 identity                                                      |
| `packages/neko-canvas-webview`    | `@neko-canvas/webview`    | `packages/neko-canvas-webview`    | `@neko/canvas-webview`    | Canvas browser/React UI                     | Desktop                                                                                         | 保留并统一 identity                                                      |
| `packages/neko-chara`             | `@neko/chara`             | `packages/neko-chara`             | `@neko/chara`             | Character Dialogue bounded context          | 无                                                                                              | 零消费者治理后决定；保留时标记未接入内核                                 |
| `packages/neko-content`           | `@neko/content`           | `packages/neko-content`           | `@neko/content`           | Content locator/range/read                  | Agent runtime                                                                                   | 保留                                                                     |
| `packages/neko-cut-domain`        | `@neko-cut/domain`        | `packages/neko-cut-domain`        | `@neko/cut-domain`        | Cut OTIO/timeline/session                   | Desktop、Cut Node、Cut Webview                                                                  | 保留并统一 identity                                                      |
| `packages/neko-cut-node`          | `@neko-cut/node`          | `packages/neko-cut-node`          | `@neko/cut-node`          | Cut Node/FFmpeg adapter                     | Desktop                                                                                         | 保留并统一 identity                                                      |
| `packages/neko-cut-webview`       | `@neko/webview`           | `packages/neko-cut-webview`       | `@neko/cut-webview`       | Cut browser/React UI                        | Desktop                                                                                         | 保留；优先消除 owner 不明确的 `@neko/webview`                            |
| `packages/neko-entity`            | `@neko/entity`            | `packages/neko-entity`            | `@neko/entity`            | Entity domain/projection                    | Desktop                                                                                         | 保留                                                                     |
| `packages/neko-generation`        | `@neko/generation`        | `packages/neko-generation`        | `@neko/generation`        | Generation job/output lifecycle             | Desktop、Platform                                                                               | 保留并接收 Platform 中的 Generation owner 职责                           |
| `packages/neko-host`              | `@neko/host`              | `packages/neko-host`              | `@neko/host`              | Host-neutral primitive ports                | Desktop、Agent types                                                                            | 保留并按 Host 准入规则收窄                                               |
| `packages/neko-markdown`          | `@neko/markdown`          | `packages/neko-markdown`          | `@neko/markdown`          | Markdown parse/projection                   | Agent Webview、Content、UI                                                                      | 保留；内部包显式 `private`                                               |
| `packages/neko-media`             | `@neko/media`             | `packages/neko-media`             | `@neko/media`             | Media contract/Node/browser runtime         | Desktop、Agent/Canvas/Cut/Preview/Tools Webview、Cut Node                                       | 保留                                                                     |
| `packages/neko-platform`          | `@neko/platform`          | 无                                | 无                        | 当前无稳定 owner                            | Desktop                                                                                         | 按领域 owner 拆解后删除；不得保留 facade、alias 或 fallback              |
| `packages/neko-preview-contracts` | `@neko-preview/contracts` | `packages/neko-preview-contracts` | `@neko/preview-contracts` | Preview cross-runtime contract              | Desktop、Preview Webview                                                                        | 保留并统一 identity                                                      |
| `packages/neko-preview-webview`   | `@neko/preview-webview`   | `packages/neko-preview-webview`   | `@neko/preview-webview`   | Preview browser/React UI                    | Desktop                                                                                         | 保留                                                                     |
| `packages/neko-quality`           | `@neko/quality`           | `packages/neko-quality`           | `@neko/quality`           | Quality Gate/evidence bounded context       | 无                                                                                              | 零消费者治理后决定；保留时标记未接入内核                                 |
| `packages/neko-search`            | `@neko/search`            | `packages/neko-search`            | `@neko/search`            | Search coordinator/provider                 | 无                                                                                              | 零消费者治理后决定；接入、标记未接入或删除                               |
| `packages/neko-skills`            | `@neko/skills`            | `packages/neko-skills`            | `@neko/skills`            | Builtin Skill resource owner                | 无 manifest 消费者                                                                              | 先审计资源 loader/打包消费；证实内容 owner 后保留，否则合并或删除        |
| `packages/neko-tools-contracts`   | `@neko-tools/contracts`   | `packages/neko-tools-contracts`   | `@neko/tools-contracts`   | Tools/Media Diff contract                   | Tools Webview                                                                                   | 与 Tools Webview 作为依赖岛共同治理；保留时统一 identity                 |
| `packages/neko-tools-webview`     | `@neko-tools/webview`     | `packages/neko-tools-webview`     | `@neko/tools-webview`     | Tools/Media Diff browser UI                 | 无                                                                                              | 零消费者治理后决定；接入、合并或删除                                     |
| `packages/neko-types`             | `@neko/shared`            | `packages/neko-shared`            | `@neko/shared`            | Cross-domain L0 foundation                  | 24 个 workspace；除 Cut domain、Markdown、Skills、Tools contracts 外的当前 app/package consumer | 先按 layer/owner 拆解，再仅改目录；不得在职责收敛前改名                  |
| `packages/neko-ui`                | `@neko/ui`                | `packages/neko-ui`                | `@neko/ui`                | Cross-Webview React primitives              | Desktop、Agent/Canvas/Cut/Preview/Tools Webview                                                 | 保留并接收 Shared 中的 L2 UI primitive                                   |

## 决策

### 1. `apps` 与 `packages` 保持分离

`apps/neko-desktop` 是可执行产品、打包单元和唯一 concrete composition root。
`packages/*` 是可复用能力和契约。即使当前只有一个应用，这个差异仍约束依赖方向、发布、
Electron 权限和产品生命周期。

将 Desktop 移入 `packages/` 只减少一个目录层级，却会弱化“应用可以依赖 package，package
不得依赖应用”的可见边界，因此不采用。

### 2. Agent 的多 package 拆分继续保留

Agent 的拆分对应真实运行边界：

```text
Desktop Main (Node) -> neko-agent-runtime -> neko-agent-types
Desktop preload --------------------------> neko-agent-types
Desktop renderer -> neko-agent-webview ---> neko-agent-types + neko-ui
Provider adapter -> neko-ai-sdk
Tests -> neko-agent-test-utils
```

`types`、`runtime` 和 `webview` 不得合并，否则 React/browser、Node/SQLite/进程和跨层
contract 会进入同一依赖闭包。`ai-sdk` 隔离第三方 provider adapter，暂时保留。
`test-utils` 只有出现两个以上真实测试消费者时才值得独立；当前零消费者不满足条件。

已删除的历史 `packages/neko-agent` 聚合根不是父 package，也不得恢复为兼容包、目录容器或
第二个 Agent owner。最终允许将 `packages/neko-agent-runtime` 目录改名为
`packages/neko-agent`，但该路径只拥有当前 `@neko/agent` runtime；这是一对一目录收敛，不是
聚合根复活。

### 3. Desktop 保留应用业务，不保留领域业务

以下职责属于 Desktop：

- Electron 窗口、菜单、protocol、CSP、sender-bound IPC 和 preload；
- Home、Project catalog、Window/Tab/View、Workbench 和应用设置；
- 文件/目录选择、SecretStorage、workspace trust、资源授权和外部程序交接；
- Preview、Cut、Generation、Media Library 等 owner 的跨领域 capability composition；
- 将领域 snapshot 投影为 Desktop Shell/Home presentation。

以下 host-neutral 逻辑必须从 Desktop 下沉：

- Agent conversation owner、workspace runtime、Turn 互斥/取消、context compact；
- Agent Tab/message queue/Tool confirmation 中不依赖 Electron 的状态机；
- Cut 媒体放置、Timeline command 组合、export task application orchestration；
- 其他只依赖注入 port、identity 和领域 contract 的运行逻辑。

目标不是让 Desktop 变成无业务的启动脚本，而是让它只拥有产品级业务和 concrete adapter。

### 4. Desktop 内按领域模块化，不新增 Host workspace package

当前 `app-host.ts`、`preload/index.ts`、`main/index.ts` 和多个 Desktop runtime 文件已经形成
较大的组合面。优先在应用内部按责任整理：

```text
apps/neko-desktop/src/
  main/
    infrastructure/electron/
    shell/
    capabilities/agent/
    capabilities/assets/
    capabilities/canvas/
    capabilities/cut/
    capabilities/preview/
  preload/bridges/
  renderer/surfaces/
  shared/contracts/
```

每个 capability 模块拥有自己的 IPC registration、identity validation 和 disposer，应用根
只负责显式构造与释放。除非未来出现第二个 concrete host、独立发布或独立依赖闭包，不创建
`neko-agent-host`、`neko-cut-host` 等 workspace package。

### 5. `@neko/host` 只接纳 Host primitive

`@neko/host` 的准入必须同时满足：

- product/domain neutral，不含 `neko-desktop` 等 application identity 或产品命令语义；
- 只定义最小 port、value、typed diagnostic 或不可变 projection，不拥有 concrete I/O、
  mutable registry/manager 或资源生命周期；
- 至少两个真实消费者，或存在必须集中约束的 Main/preload/renderer 或 host 安全边界；
- 消费者可以通过精简 subpath 和窄 port 使用，不要求依赖整个 `NekoHostPorts`。

以下内容不得进入或继续留在 `@neko/host`：

- Desktop application identity、handoff 和 storage migration contract；
- workspace/resource/drag 等产品命令目录与领域 payload；
- mutable Command Registry、manager、concrete filesystem/Electron adapter；
- React component、领域 DTO、无 owner 的通用 helper。

当前文件按下表处理，具体 export 必须在实施 change 中逐项对账：

| 当前文件                        | 目标处置                                                                                  |
| ------------------------------- | ----------------------------------------------------------------------------------------- |
| `ports.ts`                      | 保留符合准入的 environment/workspace/files/path/secret/external port 与 diagnostic        |
| `application.ts`                | 移入 Desktop-owned L0 shared contract；不再由 Host primitive package 硬编码应用身份       |
| `commands.ts`                   | 产品 command/payload 移入 owning domain/Desktop contract；mutable registry 移 composition |
| `workspace-content-settings.ts` | 仅保留 host-neutral immutable projection/validation；具体 content/application policy 迁出 |
| `projection-attachment.ts`      | 仅在满足跨 runtime 消费与准入证据时保留，否则迁入 owning projection contract              |

Desktop Main 继续构造和释放 concrete Host adapter。不得用新的 `manager`、`registry`、`common`
或 `platform` package 接走被排除职责，也不得为单一 Electron 宿主创建多个 `*-host` package。

### 6. `neko-platform` 必须按 owner 拆解

`neko-platform` 同时承担 Agent 配置、provider、媒体生成、下载、generated output 和文件
能力，不是稳定 bounded context。目标迁移方向：

- Agent 模型、provider 和 purpose config contract 进入 Agent/AI SDK owner；
- 用户级配置文件、credential 和平台交互留在 Desktop Host adapter；
- Generation Job、recipe、output commit 和 reconciliation 进入 `neko-generation`；
- Node-only 下载、文件 finalizer 或 provider execution 通过 owning package 的 `./node`
  subpath 或明确 Node adapter 暴露。

迁移完成后删除 `neko-platform`，不得保留 facade、fallback 或 manager bag。

### 7. `@neko/shared` 只保留真实共享基础能力

`packages/neko-types` 当前同时拥有广泛领域 DTO、local metadata、project file I/O、Node
helper、组件和图标。审计顺序：

1. 领域专属 DTO 回到 owning package contract；
2. React component/icon 回到 `@neko/ui`；
3. Node/local metadata/host I/O 评估独立 L1 owner 或明确 Node subpath；
4. `@neko/shared` 只保留两个以上领域稳定复用、低依赖且方向一致的 L0 能力。

在职责收敛后，目录可从 `neko-types` 改为与 package identity 一致的 `neko-shared`。
不得仅按文件数量机械拆包。

### 8. package identity 统一为单一 scope

当前同时存在 `@neko/*`、`@neko-agent/*`、`@neko-canvas/*`、`@neko-cut/*`、
`@neko-preview/*`、`@neko-tools/*` 和无 scope 的 `neko-assets`。所有 package 都是预发布
内部 workspace，可进行显式破坏性重命名。

目标统一为单一 `@neko/*` scope，并使名称表达责任，例如：

- `@neko/agent-types`、`@neko/agent-webview`；
- `@neko/canvas-domain`、`@neko/canvas-webview`；
- `@neko/cut-domain`、`@neko/cut-node`、`@neko/cut-webview`；
- `@neko/preview-contracts`、`@neko/preview-webview`；
- `@neko/tools-contracts`、`@neko/tools-webview`；
- `@neko/assets`。

`@neko/webview` 必须优先消除，因为名称无法表达 Cut owner。命名迁移必须一次性更新
manifest、imports、lockfile、scripts、tests 和文档，不保留 alias 或兼容 package。

### 9. 未接入 package 必须显式治理

manifest 反向依赖审计显示 `neko-agent-test-utils`、`neko-chara`、`neko-quality`、
`neko-search`、`neko-skills` 和 `neko-tools-webview` 当前没有 workspace 消费者；
`neko-tools-contracts` 仅被未接入的 Tools Webview 消费。manifest 零消费者不等于没有资源
loader、root tooling 或动态消费，尤其 `neko-skills` 必须先检查内容加载与打包路径。这些
package 可以作为真实 bounded context、内容 owner 或独立内核继续存在，但必须满足以下之一：

- 通过活跃 OpenSpec 接入 Desktop canonical path；
- 在 package README 和产品能力文档中明确标记为未接入；
- 若没有近期 owner、consumer 和验收路径，则删除。

不得由 package 存在、单元测试通过或 root build 成功推断产品能力已经可用。

### 10. 残留按性质分类处理

- **本地忽略目录：** 已删除的 `neko-agent`、`neko-canvas`、`neko-client`、`neko-cut`、
  `neko-engine`、`neko-preview`、`neko-tools` 聚合根不属于 workspace。确认只含
  `node_modules`、`dist`、`coverage`、`target`、旧二进制等可重建产物后清理。
- **活动文档：** 当前架构文档中重复或互相冲突的 Character/World 状态、仍把 VS Code/TUI
  描述为当前宿主的 Proposed/Accepted ADR 必须更新状态、标记 superseded 或移动到历史区。
- **OpenSpec：** 已完成 change 应归档；没有 tasks 的 change 必须补齐、合并或删除，避免旧
  package path 和旧宿主叙述继续充当活动约束。
- **空目录：** 空 `__tests__`、旧 domain、market、dashboard、bridge 和 template 目录不受
  Git 管理，但会误导本地开发，应在确认无生成器依赖后清理。
- **测试：** migration、rejection、poison 和 architecture guard 中的旧路径是负向证据，
  不属于可直接删除的 legacy；只有已删除 owner 下的忽略测试产物才是目录残留。

## 迁移顺序

1. 建立 package identity、反向消费者、Desktop 领域逻辑和残留目录的机器可读清单。
2. 修正文档事实与归档已完成 OpenSpec，避免旧约束参与后续设计。
3. 将 Desktop 中的 Agent/Cut host-neutral 逻辑迁回现有 owning package，并增加路径断言。
4. 按准入规则收窄 `@neko/host`，迁出 application contract、产品命令和 mutable registry。
5. 拆解 `neko-platform`，同时消除其 facade 和 fallback。
6. 审计 `@neko/shared`，按领域 owner、L0/L1 和 UI/Node 边界迁移。
7. 处理零消费者 package，明确接入、未接入或删除。
8. 最后统一 package identity 和必要目录名，避免在所有权迁移前产生两轮路径 churn。
9. 清理本地忽略目录和空目录，运行完整 repository、Desktop package 和真实 Electron 验收。

上述步骤涉及跨包契约、目录移动和架构变更；原分阶段重构提案已撤销。本文不再构成实施
入口，也不得视为删除用户数据、批量移动文件或保留兼容 alias 的授权。未来若重新推进，
必须按当时的实际消费者、数据边界和 Electron 运行路径建立新的聚焦 OpenSpec。

## 后果

### 正向

- `apps` 与 `packages` 的依赖方向继续清晰。
- Main/preload/renderer 和 Node/browser 依赖闭包可由 package 边界强制。
- Desktop 保持产品级组合能力，又不会成为第二套 Agent/Cut runtime。
- package 数量由真实责任决定，未接入能力不会伪装成已交付能力。
- 单一 package scope 和一致目录降低脚本、import、文档和认知成本。

### 代价

- Agent/Cut 所有权迁移需要 producer/consumer、路径和 Electron 运行态验证。
- `neko-platform` 与 `@neko/shared` 收敛会触及较多 imports 和测试。
- package identity 重命名会产生较大机械 diff，因此必须在职责迁移后独立实施。
- 删除本地旧目录前必须区分可重建产物与受保护用户数据。

## 不采用

### 将 `apps/neko-desktop` 移入 `packages/`

拒绝。它会弱化应用与可复用 package 的依赖边界，没有运行时收益。

### 为每个领域新增 Electron Host package

拒绝。当前只有一个 concrete host，会产生假替换点和额外 workspace 开销。先使用 Desktop
内部 capability module。

### 将 Agent、Canvas、Cut 的 runtime、contract 和 Webview 全部合并

拒绝。Node、preload 和 browser 的依赖及安全边界真实存在，合并会扩大依赖闭包并削弱
Renderer sandbox。

### 仅按代码量拆分大包

拒绝。代码量只用于发现审计热点；package 边界必须由 owner、consumer、runtime 和生命周期
证明。

### 保留旧 package alias 以降低迁移成本

拒绝。项目处于预发布阶段，alias、fallback 和双入口会保留多种事实来源，违背 canonical
path 要求。

## 审计基线

2026-07-31 的只读审计得到以下证据：

- workspace 包含一个应用和 28 个一级 package；
- `apps/neko-desktop/src` 约 4.2 万行非空代码，其中 Main 生产代码约 1.45 万行；
- `neko-agent-test-utils` 没有反向 workspace 消费者；
- `neko-chara`、`neko-quality`、`neko-search`、`neko-skills`、`neko-tools-webview` 没有
  manifest 反向消费者，`neko-tools-contracts` 只被 Tools Webview 消费；该结论不排除资源
  loader 或 root tooling，且 `neko-entity` 已由 Desktop 直接消费；
- Desktop Agent composition/controller 和 Desktop Cut runtime 包含可下沉的 host-neutral
  业务状态与编排；
- dependency、legacy debt、unused 和 test ownership 门禁通过，但这些门禁不能证明职责
  放置正确；
- 当前活动 OpenSpec、架构文档和本地忽略目录仍存在迁移后治理项。

该基线只说明提出本 ADR 时的仓库状态，不替代实施 change 的最新审计和验证。

## 参考

- [`package-boundaries.md`](package-boundaries.md)
- [`application-composition.md`](application-composition.md)
- [`adr-agent-runtime-single-authority-and-simplification-boundary.md`](adr-agent-runtime-single-authority-and-simplification-boundary.md)
- [`adr-code-review-quality-gates.md`](adr-code-review-quality-gates.md)
