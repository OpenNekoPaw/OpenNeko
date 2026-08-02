# OpenNeko Desktop

`apps/neko-desktop` 是 OpenNeko 的 Electron 应用组合根。

当前已完成 Phase 1 的 P1.1 Desktop foundation、P1.2 Shell/Project state、P1.3
Agent + Home，以及 P1.4 Assets + Canvas 的确定性实现：

- 安全的 main/preload/renderer 边界、Electron Host ports、应用身份和退出生命周期；
- Home、Content Project Tab、Context Dock、Activity/Attention owner-derived 投影；
- canonical Workspace/Project identity、Window/Tab/View state、CAS persistence；
- sender-bound fixed IPC、renderer epoch/revision 检查和 restart recovery；
- 真实 Pi conversation authority、Session/checkpoint、lease、Tool/Skill snapshot 和 Timeline
  projection 的 AppHost composition；
- 只通过 HostSecretPort 持久化的 credential runtime，以及 macOS 原生受保护认证输入；
- workspace content/search/reveal/write effect、package-owned Agent Root、Conversation/Tool
  confirmation、Home Activity/Attention 和跨 reload/restart 生命周期测试；
- package-owned Resource Browser Root，Files/Media/Entity facet、ContentLocator 搜索、
  metadata/thumbnail、授权预览和显式添加到目标 Canvas；
- 项目 Resource Browser 在 Media facet 投影由 Canvas、Cut 与 Entity representation 权威
  引用派生的缺失/不可用/不完整媒体库；恢复仅经 exact-name plan、确认与 apply，add/relink
  只维护全局 alias 与项目 link，不复制整库；
- 项目侧栏 footer 独立拥有便携快照 readiness、计划、确认、进度、取消与跨重启恢复；快照在
  sibling staging 中只收集被引用字节并 atomic publish，不修改源项目或外部媒体库；
- package-owned Global Library Browser Root，为全局 Media Library 与 owned Asset Library
  提供列表/网格、双击或 Enter 目录导航、点号隐藏项过滤、revisioned 图像/视频缩略图和静态
  hover 预览；Asset 导入由 Main 复制到 owned root，删除只进入系统废纸篓，Media Library
  移除只断开 managed link；
- 全局 Library Browser 与项目 Resource Browser 不共享 selection、filter、layout 或 active
  state；全局资源中心不承载项目恢复或便携快照 lifecycle；
- package-owned `CanvasWebviewRoot`、`.nkc` document session、revision/save/undo/redo、
  source picker、资源放置、多个 Canvas View 与最多双栏显示；
- Canvas 素材入口按 owner 收敛为工作区/已链接媒体库直接引用、全局媒体库显式关联或复制、
  外部文件原子导入，以及 Generation Job 成功结果投影；`.nkc` 不保存绝对路径、运行时 URL
  或媒体库真实目标；
- Canvas selection toolbar 从 Desktop owner action catalog 投影 Preview、Reveal、Cut、
  Media Library copy 与 Generation 动作，不在 Canvas 中重新实现 viewer、editor 或 provider；
- package-owned Preview Root，通过授权 URL descriptor 预览图像、音视频、文档与 3D 模型；
- package-owned Cut runtime，接收合法视频 locator 并拥有编辑/导出生命周期；
- workspace-owned Generation runtime，持久化 Job、恢复 observation、提交
  `generated-output`，并仅在精确 Job/locator authority 可解析时允许重新生成；
- Desktop renderer 复用 package-owned Canvas Root、Toolbar、Add popover 和 `@neko/ui`
  primitives；Desktop Tailwind 显式扫描 Canvas source，package CSS 以 Root marker 隔离；
- Character/World、Cut/Timeline 的明确 unavailable 状态。

P1.3 的生产 Electron 已注入完整 `DesktopAgentControllerComposition`，并声明
conversation、config、Skill、content 与 projection effects；缺少任一 requirement 时启动审计
仍会 fail-visible `unavailable`。Home 使用稳定 Project/Workspace/Conversation identity
定位最近对话；目标 Project Tab 已关闭时，Main 会从 Host-only persisted locator 重开同一
Workspace 和新 View。Content Project 在 catalog 与 Tab state 完成 hydration 后才激活目标，
不回退到当前 active conversation。重启后也由同一 locator 惰性重连，identity 漂移会被拒绝。
加密端口只在实际 credential 操作时触发 macOS safeStorage/Keychain 检查。

冷启动最近会话由 Pi owning package 的只读 SQLite catalog reader 提供，并在首次 Shell
snapshot 前按持久 Desktop Project catalog 限定 workspace scope；该路径不 attach Agent
workspace runtime、不打开 transcript 或获取 execution lease。Agent Root 在 layout phase
先建立 Host 订阅，再允许子组件请求 conversation/config/Skill snapshot。新会话 pending send
使用稳定 message identity 保持用户消息可见；发送失败按目标 conversation 投影 diagnostic，
不会留下空白的“执行中”面板。

共享 portal surface 由 `@neko/ui` semantic stylesheet 拥有，Desktop 只投影主题 token，业务
菜单不得复制背景或依赖消费者 Tailwind 扫描共享包源码。Workbench 在没有 creative Main View
时允许 `Chat + Main` 并展示明确空 Main surface；`Main only` 仍要求已有 Main View。

完整 provider-backed 宿主验收仍未完成：真实 provider/model 调用尚未获得成本授权，且当前
没有 Desktop complete-session evaluation driver。确定性测试、key-free Evaluation harness、production
package 和无模型成本的 Electron Shell/Agent Root 路径不能替代真实模型、Tool approval 与
checkpoint/cleanup 的完整验收。
Canvas 工具栏按宿主 capability 显示。Desktop 当前已接通 source-add、selection/pan、
undo/redo、资源放置、Preview、Cut、Media Library copy 和已提交 Generation result 的
regenerate。Generation draft/edit-and-generate、playback、Canvas export/package 与
send-to-Agent 尚无对应 Desktop owner，因此入口保持隐藏而不是展示不可工作的按钮。当前
Desktop 是 Phase 1 开发基线，不是已发布产品。

### Canvas 素材操作

- **引用**：选择工作区或已链接 Media Library 文件；保留原 locator，不复制、不改源文件。
- **导入**：选择工作区外文件；Desktop 原子复制到 `neko/imports/<kind>/` 后创建节点。
- **复制到媒体库**：必须选择项目或全局 Media Library 及冲突策略；该操作不改变当前节点身份。
- **生成结果**：只显示 Generation owner 已提交的输出。历史 prompt/model 是只读摘要；
  “重新生成”创建新 Job 和新结果，不覆盖历史节点。
- **派生编辑**：crop、erase、redraw、denoise、separation、transcode 等 owner 操作必须提交
  新 locator 和 `derived-from` lineage，不能就地覆盖引用源。

```bash
pnpm --filter @neko/app-desktop typecheck
pnpm --filter @neko/app-desktop test
pnpm --filter @neko/app-desktop lint
pnpm --filter @neko/app-desktop package
pnpm --filter @neko/app-desktop dev
pnpm test:functional:headless
pnpm test:local:ui
pnpm test:local:ui --scenario=all-openneko-consumers
pnpm test:local:ui --scenario=all-openneko-consumers --target=packaged
pnpm test:local:media-openneko
```

真实 Electron 功能验收可用 `--openneko-functional-fixture` 与
`OPENNEKO_DESKTOP_FUNCTIONAL_HOME` 注入隔离 home；目录必须是绝对路径且 basename 以
`openneko-desktop-functional-` 开头。该入口只隔离功能 fixture，不替代独立
`--user-data-dir`，普通启动不会读取该路径。

`pnpm test:functional:headless` 是 CI 可运行的无 GUI Desktop Main/preload/composition
功能路径，不读取真实用户数据、凭据或 provider。`pnpm test:local:ui` 不带场景参数时启动手动
图形化 Electron fixture；增加 `--scenario=all-openneko-consumers` 后通过 CDP 运行 Cut、Canvas、
Preview 的 package-owned 场景。两种模式都会创建隔离 functional home 与独立 Electron
user-data 目录，并在退出后清理临时目录。`--target=packaged` 使用当前平台已生成的 Desktop
package；运行前必须先执行 `pnpm package:desktop`。图形化入口不得加入 CI。

`pnpm test:local:media-openneko` 使用合成 H.264/WAV/Main10-PQ 和 32 MiB fixture 运行专用
Electron OpenNeko resource qualification，验证 metadata、seek、Range、SHA-256、变化帧、
Canvas/WebGL2 重复纹理上传、sender isolation 和 capability 撤销。原始 JSON 写入 gitignored
`reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/`。
Main10 decode/texture 成功不等于 10-bit surface、zero-copy 或 HDR display output 资格。

Desktop 原生 package/make/release 只接受 `darwin-arm64`。Windows x64 与 Linux 运行
typecheck、orchestration、SQLite 和 host-neutral 仓库测试，但在 Forge 前被拒绝且不上传
Desktop artifact。macOS 固定 Electron `43.2.0` 归档 checksum，并在真实匹配 Host 的 CI
job 中 typecheck、验证 Sharp closure、package 和上传 artifact。

`darwin-arm64` 开发包使用 ad-hoc 签名，并保持 sandbox、CSP、ASAR integrity、安全 fuses，
同时关闭 `file://` extra privileges。Electron V1 fuse 使用严格完整配置：
`LoadBrowserProcessSpecificV8Snapshot` 保持关闭，因为 Electron `43.2.0` macOS 分发包不包含
browser-specific snapshot；其余安全取值均显式固定，包括启用 `WasmTrapHandlers`。
Electron `43.2.0` 的 macOS 归档 checksum 已固定，package 可直接校验本地缓存而不重复
下载 `SHASUMS256.txt`。精确 `v<Desktop version>` tag 会在 `main` 历史上运行正式 Release：
导入临时 Developer ID keychain，启用 hardened runtime，完成 Apple notarization、staple、
strict codesign、Gatekeeper、ZIP 与 `SHASUMS256.txt` 验证后才创建 GitHub Release。需要配置
`MACOS_CERTIFICATE_P12_BASE64`、`MACOS_CERTIFICATE_PASSWORD`、`MACOS_SIGNING_IDENTITY`、
`APPLE_ID`、`APPLE_APP_SPECIFIC_PASSWORD` 和 `APPLE_TEAM_ID` repository secrets；缺失时
fail-visible，不回退 ad-hoc 发布。
