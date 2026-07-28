## Why

OpenNeko 已确定第一阶段先交付 Desktop 前端界面并接入现有保留子包，但当前仓库没有
`apps/neko-desktop`，各子包的跨宿主成熟度也不一致。Agent Webview 已有可注入 runtime
adapter；Canvas、Cut 和 Preview 的完整 UI 仍依赖 VS Code transport；Assets 主要使用
TreeView；`@neko/host` 还保留已删除的 `neko-home` application identity。

如果直接创建 Electron 页面并逐个嵌入简化 `HostAdapterSurface`，最终会得到能展示但不能
完成真实创作、同时拥有第二套 store/route/文件 IO 的空壳 Desktop。Phase 1 必须先冻结
组合根、状态协议、项目/窗口身份、子包 adapter 责任和分步验收，再进入实现。

## What Changes

- 定义 Phase 1 唯一完成目标：在参考平台交付 Home → Content Project →
  Agent/Media Library/Canvas/Cut/Preview → Generation/Export 的真实纵向路径。
- 定义 `apps/neko-desktop` 的 Electron main/preload/renderer/AppHost 组合边界、安全基线、
  application identity、workspace/project catalog 和用户数据处置。
- 复用现有 Agent projection attachment，建立按 owner 的 Desktop snapshot/patch、
  Window/View store、command revision/CAS 和生命周期协议。
- 为 Agent、Assets、Canvas、Cut、Preview、Generation/Quality、Chara/Entity 和
  Tools/Diagnostics 分别定义 public Root、domain adapter、UI transport 与验收边界。
- 把 Phase 1 拆成七个有依赖关系的实施 OpenSpec，禁止用一个长期巨型变更并行维护多条
  新旧路径。
- 规定 `darwin-arm64` 只是 Phase 1 参考平台；本变更不修改当前发布矩阵，也不宣称完成
  macOS/Linux/Windows 跨平台支持。

## Capabilities

### New Capabilities

- `desktop-phase-1-delivery-plan`: 定义 Desktop Phase 1 的组合根、状态与安全协议、子包接入
  顺序、真实 Content 纵向路径和实施变更门禁。

### Modified Capabilities

无。本提案是 Phase 1 的项目级开发约束；具体 runtime contract 由后续七个实施 OpenSpec
分别定义。

## Impact

- 新应用：后续新增 `apps/neko-desktop`，但本提案本身不创建运行时代码。
- 公共契约：后续修改 `@neko/host` application identity/ports，并提取通用 projection
  attachment primitive。
- 功能包：后续让 Agent、Canvas、Cut、Preview、Assets/Content 等通过公共 adapter 接入
  Desktop，不导入 VS Code Extension 私有实现。
- 用户数据：任何旧 `neko-home`、workspace identity、conversation、trust、credential、
  installed package 和 artifact 数据必须先审计并明确 reuse/migrate/rebuild/reject；不得
  静默删除或双写。
- 当前产品：VS Code 与 TUI 继续是现行发布入口；Phase 1 不改变其行为、发布矩阵或验收。
