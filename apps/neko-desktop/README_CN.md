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
```

`darwin-arm64` 开发包使用 ad-hoc 签名，并保持 sandbox、CSP、ASAR integrity、安全 fuses，
同时关闭 `file://` extra privileges。Electron V1 fuse 使用严格完整配置：
`LoadBrowserProcessSpecificV8Snapshot` 保持关闭，因为 Electron `43.2.0` macOS 分发包不包含
browser-specific snapshot；其余安全取值均显式固定，包括启用 `WasmTrapHandlers`。
Electron `43.2.0` 的参考平台归档 checksum 已固定，package 可直接校验本地缓存而不重复下载
`SHASUMS256.txt`。Developer ID、hardened runtime、notarization、installer 和 release
channel 属于 Phase 2。
