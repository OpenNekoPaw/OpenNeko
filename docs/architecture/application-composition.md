# 应用组合根

状态：Accepted

更新日期：2026-08-10
对应变更：`replace-desktop-media-scheme-with-http-resource-gateway`、
`enforce-thin-desktop-application-root`、`compose-desktop-workbench-scenes`、
`bound-desktop-ui-residency`

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

- 领域实体、业务状态机、业务并发控制、业务错误 taxonomy 或领域校验；
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

Resource Browser 的 `entity.manage` 继续复用同一个 sender-bound Desktop bridge。Desktop 根据已授权
workspace 构造 `@neko/entity-node` runtime，并注入 canonical Entity repository 与 local-metadata public
repository；`@neko/assets-node` controller 校验选择、capability、Entity/candidate identity 和 expected
project revision 后委托 exact Entity owner。Entity ID、binding ID、时间、canonical commit、candidate
decision 和恢复 journal 都由 Entity package 持有，应用根不复制其业务语义或文件 workflow。生产环境
缺失 manifest-backed Asset lifecycle、完整 reference-rewrite participant、Character、Room 或
Conversation owner 时，对应 Inspector capability 必须隐藏或返回 owner-qualified blocker，不得在
Desktop 中以 flat Asset、Agent command、fallback conversation 或 no-op handler 补齐。

workspace package 的角色、拆分条件、领域家族命名和 inactive capability 语义统一遵循
[`package-taxonomy.md`](package-taxonomy.md)，应用根不得通过私有 source alias 或 wildcard export
绕过这些边界。

## 唯一宿主

产品、开发、测试和发布入口均以 Electron Desktop 为唯一 canonical path。不得通过 alias、
动态 optional import、平行 package、fallback transport、空命令或成功 no-op 建立第二条宿主路径。
唯一宿主只限定产品入口，不把 Application 层提升为领域 owner。

## Desktop Workbench 组合

每个 Desktop Window 只组合一个 `ControlledWorkbenchShell` 和一个持续存在的
PrimarySidebar。Host 以 closed canonical scene projection 拥有一个当前 Window composition、当前
Workspace/Workbench identity、slot refs 与独立 sidebar presentation；renderer 只能把已验证的 package
public Root 映射到 Interaction、Main、Secondary Main、Manager、Timeline 和 Status slot，不得根据 route、
当前组件、active/first/recent Project 或模型文本推断场景和权限。一个 Window 只挂载当前 scene composition
在各可见 slot 明确引用的业务 Root；同一 slot 不保留历史 Root，只有产品明确提供且用户当前可见的分屏
composition 才能增加 `Secondary Main`。当前 Workspace 可同时组合 Agent Interaction、Main editor、Resources
和 Timeline，但它们仍只服务当前可见 composition，不构成跨场景 retained tree。离开场景后，先由 owning
package 保存必要的最小 presentation snapshot，再卸载隐藏的 Workbench、Agent、管理页、资源页、编辑器和
inspector Root；Host 不保存 open Workbench catalog、Renderer lifecycle policy 或访问历史对应的隐藏 Root。

Desktop 分别建模本地 durable 业务记录、当前可见 presentation、可脱离 UI 的后台 task/runtime，以及
可丢弃并可重建的 package-owned presentation snapshot。入口与管理场景是 Window 导航，Workspace/Project
是本地创作上下文，Conversation/Task 是可后台运行的 Agent 业务实例，Canvas/Cut/Preview 是文档或 View
领域实例；不得用统一 Session、Workbench、全局 active identity 或跨领域 open-instance catalog 同时承担
这些 lifecycle。Project、Workspace、Conversation、Asset 和文档历史不受 UI 驻留预算限制，应通过轻量
metadata、分页、搜索、最近项和用户显式归档/删除管理。

新增入口、标签页、聊天室、助手或编辑器必须先归类到上述生命周期，并明确 owning package、精确 identity、
创建与释放条件以及恢复来源。只改变当前展示选择的能力保持为 Window scene；没有独立业务生命周期的页面不得
创建 Session/OpenInstance、跨领域 registry、常驻 Root 或“已打开”数量。数量预算只约束实际驻留和执行资源，
不约束 durable 历史记录。

导航只提交当前 scene、精确 identity 和必要布局。成功的 Host mutation 以 canonical projection event 更新
Renderer，不再无条件刷新完整 Shell snapshot，也不得重新解析未变化的 Workspace authority、重新绑定仍有效的
后台 Agent/task runtime 或启动与目标场景无关的订阅和 IO。资源上限只作用于当前可见 slot、显式分屏 slot、
provider turn、媒体/GPU、subscription、后台 Job 和其他真实昂贵 runtime；不可见且无运行、排队、审批或
未完成外部操作保护条件的 runtime 应释放，受保护后台 runtime 可在无 React Root 时继续。

Workbench 是可变形态，不是固定的 Workspace 页面：默认 Agent draft 只有 Interaction；Assistant
激活后是 Agent + Preview Main；Workspace 是 Agent + creative Main + 右侧 Workspace Resources；
资源中心与扩展中心分别把 Asset Management 和 Extension Management 放入 Main，信息充分且由 owner
提供的 Preview/Detail 只能进入可选 Secondary Main。Settings 和项目管理同样使用该 Shell；低信息量的
Project selection 保留在 catalog，并以独立行操作显式打开 Workspace，不创建空洞的 Detail shell。
Character Management 使用 package-owned catalog Main 与 exact detail Secondary Main；Character/Room
Conversation 使用独立 `character-interaction` composition，组合 Agent Interaction、Avatar/Scene Main、
Character/World Manager 与 Room 按需 Timeline。Avatar/Scene Main 只解析作者显式选择的 VRM，并通过
Desktop Main 授权的短生命周期 opaque resource lease 建立唯一动态 runtime；未支持的表现格式、缺失资源、
完整 World Experience 和未接入的 Room 提交能力必须在 owning Surface 返回 owner-qualified unavailable，Desktop
不得选择 first-compatible 表现、暴露 raw path、回退静态肖像或伪造业务事实与成功状态。

World Foundation 使用独立 `world-management` 单例 scene，在同一个 package-owned Root 中组合 Library、
Studio 和确定性 Preview。Main/preload 只转发 strict command/snapshot contract；Project、Version、Run、Save、
branch 与 event 事务均由 `@neko/world` / `@neko/world-node` 拥有。离开该 scene 后 Root 必须卸载，但 durable
World 记录和后台无关能力不受影响。该 Preview 只检查已发布定义和 committed replay，不创建 Story、Gameplay
或 WorldExperience，也不调用 Agent、游戏引擎或世界模型。

Host 把完整 Project catalog、Desktop stored recent Project context 与 owner-qualified Agent conversation
catalog 组合成一个 canonical grouped navigation projection，PrimarySidebar 只消费该投影，不在 React 中
重新 join 或推断。Project header 是容器入口，conversation child 携带 exact `conversationId + owner`；当前
PrimarySidebar 将 `project` 和无法解析 Project 的 `workspace` group 统一放入“项目”，并只将无 Project 的
Assistant conversation 放入“会话”。失效 Workspace group 保留局部 diagnostic 和清理操作，不得转成独立
Assistant conversation。Character 与 Room conversation 只保留封闭分类；World Foundation 作为独立 scene 而不是 conversation group。未具备 package-owned projection
和 runtime 前不得显示空栏目、占位记录、数量、操作或路由。当前拥有 Conversation 或属于 recent Project
context 的 Project 保留一个 group；清理最后一条 Conversation 只让 child 变为空，不得让 recent Project
从侧栏消失或伪造默认 Conversation。完整 catalog 中从未进入 recent context 且没有 Conversation 的 Project
只出现在 Project Management，不得由 Renderer 从 active tab、catalog 顺序或 mounted Root 临时补组。该轻量
presentation 不改变 capability、memory、resource grant 或 Scene owner。
场景切换、renderer reload 和应用重启不得丢失这些 identity；有 child 的组默认展示有界 child 并显式
展开/收起。sidebar 展开、折叠和宽度修改只更新 Window-owned sidebar aggregate，不修改任何 Workspace
instance。Workspace 只能由显式 Project identity 或 sender/Window-bound opaque directory grant 打开；
取消授权保持原 scene，且不得创建 Workspace 或 conversation。

PrimarySidebar 是 Desktop 唯一用户级 Project context 与 conversation switcher。Project group 可见性是
轻量导航 projection，不表示对应 Workspace Root、媒体资源或 Agent runtime 驻留。Agent Webview 在 Desktop
dock 中保留完整 controller/composer/runtime 能力，但隐藏 package 内部 Tab、新建和 History 导航，防止只
切换 transcript 而不切换完整 owner-qualified Scene。Project header 不恢复 first/active/recent conversation；
conversation restore 与 delete 都验证完整 owner identity。Character/Room Conversation 必须恢复到 exact
`character-interaction` scene；缺失的 Run、Avatar、World 或 Room command 只在对应 owning Surface 返回
带 exact owner identity 的 unavailable，不得降级为 Assistant 或 Workspace。

Entry Draft 的 `unbound` scope 不显示强制 owner 卡片。用户未选择 owner 而直接发送时，Host 以 exact
draft identity 确定性绑定 Assistant 用户区，并在同一事务中创建首次 conversation/session；选择显式
Project 或 sender/Window-bound directory grant 时绑定 Workspace；一个或多个显式
`@CharacterVersion` 分别绑定 Character Dialogue 或 Room owner。对话文本、模型输出和
active/first/recent Project、Character、Room、World 都不得推断或扩大 owner 权限。失效角色选择、
不完整叙事 World binding 或 actor mapping 必须 fail-visible，不能降级为普通 prompt、Assistant、
Workspace 或 companion。Workspace 布局控件
属于窗口级 presentation chrome，只在 exact Workspace scene 中出现在 PrimarySidebar 顶部品牌控件组、
紧邻 sidebar 显隐按钮；不得放入 footer、Main tab 或领域 Root。

首次提交的 lifecycle authority 原子持有 context、initial message 和 pending-turn intent，并在领取
provider execution 前通过 package-owned materialization port 幂等确保 exact Assistant/Workspace
Agent runtime 已拥有同一 conversation identity；只有该 conversation 可以 bootstrap 后，Host 才把
Scene 暴露为 session。Desktop Main 只实现 context 到 concrete runtime 的组合 adapter，不拥有提交或
恢复规则。renderer 的 session adapter 与 preload 传输按显式 connection identity 绑定 send 和
subscription；endpoint replacement 必须用创建旧 attachment 的 binding 发送 `endpoint-replaced`
detach，再由新 connection attach。全局 active connection 不得代替 instance owner，endpoint identity
mismatch 继续 fail-visible。

Workspace Main 的真实多 View group 是唯一拥有 Workbench tab strip 的区域。所有 Workbench 内 Preview
内容都通过 canonical `@neko/preview-webview` content-only presentation 渲染，不再添加 descriptor
header，并以透明内容背景继承所在 shell 主题。Management 和合格的可选 Preview/Detail 分别占据连续 Main
底板中的两个兄弟 panel，通过同一 resize primitive 和单一可见分隔线连接；场景层不得在 sibling panel
之间增加 margin、空白 gutter、重复边框、圆角或阴影。没有合格 Detail 时不得保留 secondary column 或
分隔线。各 package-owned Root 继续拥有自身内容区的 padding、toolbar gap、表单间距、裁切和 overflow
边界，也不制造单项 tab strip。Workspace Resources 复用 package-owned Root，并隐藏与 Host 自动
projection 重复的顶部全局刷新；relink、recovery 等领域操作仍由该 Root 保留。

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
