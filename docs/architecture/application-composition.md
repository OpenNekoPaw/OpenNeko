# 应用组合根

状态：Accepted

更新日期：2026-08-04
对应变更：`replace-desktop-media-scheme-with-http-resource-gateway`、
`enforce-thin-desktop-application-root`、`compose-desktop-workbench-scenes`

OpenNeko 只有一个可执行产品组合根：`apps/neko-desktop`。`packages/*` 与 `packages/*/*` canonical workspace
提供 host-neutral contract、领域 runtime、Node adapter 和 browser-safe UI；应用根负责把它们
组合为 Electron Main、preload 和 renderer 运行时。Application root 是部署、信任和 concrete
adapter 边界，不是业务逻辑 owner；当前只有 Desktop 一个 Host，也不改变这个职责划分。

## 当前组合

| 层级                | Canonical root                                                 | 拥有                                                                                                   | 不得拥有                                                                                    |
| ------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Desktop application | `apps/neko-desktop`                                            | Electron 生命周期、Main/preload/renderer、typed IPC、文件与凭据授权 adapter、窗口/产品 shell、产品打包 | 领域事实或 contract 副本、业务状态机/策略/事务、跨领域万能 router、package internal imports |
| Host/runtime        | `packages/host`、`packages/media`、各领域 runtime/node package | host-neutral ports、Node/FFmpeg 执行、资源生命周期                                                     | React UI、应用生命周期、对 `apps/*` 的依赖                                                  |
| Browser UI          | `packages/ui` 与各 `packages/<family>/webview` package         | React UI、交互、browser media client、package-owned Desktop host port                                  | Node/Electron API、文件路径、持久事实、后台任务 owner                                       |
| L0/domain           | `packages/shared` 与各领域 contracts/domain package            | 类型契约、领域规则、authoring、validation                                                              | Electron、React、应用内部实现                                                               |

## 依赖方向

```text
apps/neko-desktop
  -> package public entries
  -> host/runtime/domain contracts
  -> shared or package-owned L0 contracts

all packages/** package roots -X-> apps/*
renderer/webview packages -X-> electron or node:*
```

- 所有 workspace manifest 必须位于 `packages/<name>` 或 `packages/<family>/<role>`；family 容器不得拥有 `package.json`。
- Desktop 只能通过 package public entry 组合能力，不得导入 canonical package root 下的 `src/` 内部实现。
- Main 拥有文件、凭据、进程、窗口和后台资源；preload 只投影最小 typed port；renderer
  只拥有浏览器 UI 和可恢复展示状态。
- 独立 workspace package 表达业务 ownership 和依赖方向，不要求先有第二个 Host 或第二个消费者；只有一个
  Desktop 调用方的领域规则、状态机和 workflow 仍必须由 owning package 拥有。
- 每个 runtime/session/task/editor 实例独立拥有可变状态和资源，active selection 只选择
  展示投影，不是状态 owner。
- Desktop 在 `app.ready` 前注册唯一 privileged `openneko:` scheme；同一个
  `protocol.handle('openneko', ...)` 分发 `openneko://desktop` bundle 与
  `openneko://resource` 短生命周期资源。Desktop exact-resource registry 只接受 owning
  service 已解析、已授权的 byte source、one-shot PCM 或 frozen resource set，不解析项目内容身份。
- 缺失 Desktop adapter、未知 IPC message、过期 instance identity 或被移除宿主入口必须
  fail-visible。

## 薄应用组合根

`apps/neko-desktop` 可以保留：

- Electron app/window/view/webContents、single-instance、protocol、CSP、fuse 和关闭生命周期；
- Main/preload/renderer 入口、sender-bound typed IPC 和 trust-boundary schema decode；
- 原生 dialog、shell、凭据、本地路径、外部进程和 opaque resource 的 concrete Host adapter；
- package public application port 的构造、依赖注入、注册、窗口绑定和释放；
- Desktop shell、产品导航、窗口级 presentation state、Forge/Vite 打包和真实 Electron fixture。

`apps/neko-desktop` 不得拥有：

- 领域实体、业务状态机、业务 revision/CAS、业务错误 taxonomy 或领域校验；
- Prompt/Skill/Tool、Agent workflow、Canvas/Cut/Assets/Media/Generation 的策略和数据变换；
- 通过注入 file/time/credential/process 等 port 即可脱离 Electron 运行的同步、恢复、authoring、
  portability 或其他业务事务；
- package-owned cross-runtime contract 的应用级副本，或为多个领域决策的万能 service/manager。

判断逻辑是否应下沉时，依次审计职责、依赖、接口、扩展和测试：若它决定领域结果、只依赖可注入
port、输入输出已经是领域 contract、随业务规则而变化，并可在不启动 Electron 时完成 authoritative
test，则必须进入对应 owning package。Desktop handler 只做边界解析、sender/路径授权、调用 package
public port、投影结果和释放资源。

不能以“当前只有 Desktop”“只有一个调用方”或“尚无 TUI/VS Code”为由把业务实现留在应用根；这类
条件只意味着不应建立 speculative multi-host framework。没有明确 owner 的跨领域业务先通过 OpenSpec
定义中立职责，不得放进 `@neko/desktop-core` 或其他 catch-all package。

Canvas material authoring/generation、Media Library sync、project portability、Resource Browser、
application settings、Agent content/facts/resource projection 与 personal Skill lifecycle 已迁入各自
package。Desktop 对这些能力只保留 sender/path/trust 授权、Electron 资源绑定、native interaction、
public port wiring 与 disposal；旧 app-owned 路径由边界测试和 legacy gate 持续 poison。

workspace package 的角色、拆分条件、领域家族命名和 inactive capability 语义统一遵循
[`package-taxonomy.md`](package-taxonomy.md)，应用根不得通过私有 source alias 或 wildcard export
绕过这些边界。

## 唯一宿主

产品、开发、测试和发布入口均以 Electron Desktop 为唯一 canonical path。不得通过 alias、
动态 optional import、平行 package、fallback transport、空命令或成功 no-op 建立第二条宿主路径。
唯一宿主只限定产品入口，不把 Application 层提升为领域 owner。

## Desktop Workbench 组合

每个 Desktop Window 只组合一个 `ControlledWorkbenchShell` 和一个持续存在的
PrimarySidebar。Host 以 closed、versioned scene projection 拥有当前 scene、slot refs 与独立的
sidebar presentation revision；renderer 只能把已验证的 package public Root 映射到
Interaction、Main、Secondary Main、Manager、Timeline 和 Status slot，不得根据 route、当前组件、
active/first/recent Project 或模型文本推断场景和权限。

Workbench 是可变形态，不是固定的 Workspace 页面：默认 Agent draft 只有 Interaction；Assistant
激活后是 Agent + Preview Main；Workspace 是 Agent + creative Main + 右侧 Workspace Resources；
资源中心与扩展中心分别把 Asset Management 和 Extension Management 放入 Main，选中对象的
Preview/Detail 只能进入可选 Secondary Main。Settings 和项目管理同样使用该 Shell。未具备真实
owner/runtime/public Root 的 Character/Chatroom scene 必须返回 owner-qualified unavailable，Desktop
不得伪造占位业务 UI。

PrimarySidebar 独立消费 Host 的项目 catalog 和 Agent conversation catalog，因此场景切换、renderer
reload 和应用重启不得丢失最近项目、最近会话及其精确 identity 操作。sidebar 展开、折叠和宽度修改只
更新 sidebar aggregate，不修改 Workspace revision。Workspace 只能由显式 Project identity 或
sender/Window-bound opaque directory grant 打开；取消授权保持原 scene，且不得创建 Workspace 或
conversation。

## 数据与资源

- 项目文件和 Desktop settings 是受保护用户数据；宿主清理不得删除、覆盖或静默迁移它们。
- FFmpeg/ffprobe、Range/PCM producer、watcher 与内容解析由 owning Node/domain adapter
  管理；Desktop Main 拥有唯一 exact-resource registry、opaque ID、`webContentsId`
  sender authorization 及 Window/View/session/renderer-epoch/generation 撤销生命周期。
- renderer 只消费 opaque descriptor、URL 或短生命周期 handle，不接收 raw local path、
  credential、SQLite path 或 process handle。
- `ContentLocator` 是跨包和持久项目的内容身份；`openneko://resource` URL 只存在于 package-owned
  Renderer descriptor 中，不得进入项目事实、Agent/provider/Tool、shell 参数或文件 API。
- `neko-app:`、`neko-media:`、`opennekomedia:`、`file:` 和私有
  `media:`/`video:`/`audio:` scheme 不构成成功路径；production 不启动 loopback HTTP gateway。

媒体消费策略由领域 owner 决定：Cut 有声 timeline 使用 Host 混合 PCM；Canvas 普通
audio/video、Preview 与 Agent 展示使用原生 `<audio>` / `<video>`；文档、模型和本地点播
依赖使用 seekable resource 或 frozen resource set；实时采集使用 MediaStream/WebRTC 或
专用 live runtime。scheme 只改变字节 transport，不扩大 codec、纹理、10-bit 或 HDR 能力。

## 验证

- `node scripts/check-desktop-only-topology.mjs` 证明只有一个应用根、canonical package root 和无
  removed-host production path。
- `pnpm check:application-boundaries` 验证 package-to-app、renderer-to-Node/Electron 和
  Main-to-React 依赖违规。
- 新增或实质修改 `apps/neko-desktop` 生产模块时，OpenSpec/评审证据必须说明它为何需要 Application
  层、组合哪些 package public contract，以及为何不是可下沉的业务实现。
- 业务逻辑迁移必须同时用 package producer test、Desktop consumer/path test 和旧 app path
  poison/delete 证明唯一 canonical path；涉及 IPC、窗口、安全或用户资源时增加真实 Electron 验收。
- `pnpm test`、`pnpm build`、`pnpm check` 验证生产者/消费者、workspace resolution 和依赖图。
- `pnpm package:desktop` 检查 Electron 生产包；涉及用户路径时还需真实 Desktop
  project-open/creative-surface 场景。
