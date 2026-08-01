## Why

OpenNeko 已完成 Desktop-only monorepo 收敛，`apps/neko-desktop` 是唯一应用组合根。
Foundation、Shell、Agent、Assets/Canvas 和 Cut/Preview 的多个 child change 已实施大部分
生产路径，但本 program 仍保留创建 Desktop、维护 VS Code/TUI 产品根、允许
`ResourceRef`/私有媒体协议和旧平台矩阵等过时前提。

program checklist 也把已由 child change 实施的工作、被 successor 取代的 transport 工作、
尚未创建的 P1.6/P1.7 和真实运行态证据混在一起。继续机械勾选会产生多个事实来源，并允许
“child change 接近完成”被误读为 Phase 1 产品链已经闭合。

Phase 1 必须基于当前代码与 Accepted 架构重新建立 focused owner、依赖顺序和验收边界，
然后只由 owning change 实施剩余工作。

## What Changes

- 定义 Phase 1 唯一完成目标：在参考平台交付 Home → Content Project →
  Agent/Media Library/Canvas/Cut/Preview → Generation/Export 的真实纵向路径。
- **BREAKING** 删除“VS Code/TUI 仍是当前产品根”的 program 约束；Electron Desktop 是唯一
  产品组合根，旧宿主只允许出现在历史说明、拒绝测试或残留扫描中。
- 将 durable content identity 收敛为 `ContentLocator`；路径、bytes、cache identity 和
  Renderer URL 只允许作为 Host/runtime materialization，不进入持久跨包事实。
- 将 Desktop media successor 固定为 Main-owned unified `openneko:` handler 与
  exact-resource registry；旧 `neko-media:`/loopback HTTP/upstream proxy 只作为待删除路径。
- 把当前剩余工作映射到 Agent/Shell、Assets/Canvas、Cut editing、OpenNeko resource transport、
  Preview/EPUB、support domains 和 final qualification focused changes。
- 明确 CI 只拥有平台构建、确定性 unit/contract 和 headless functional evidence；真实 API
  Agent Evaluation 与图形化 Electron UI 验收必须显式本地运行。
- 保持原生构建闭集为 `darwin-arm64` 与 `win32-x64`。Phase 1 的完整图形化纵向产品验收以
  `darwin-arm64` 为参考；Windows 完整安装、媒体/GPU 和发布资格仍属于 Phase 2。

## Capabilities

### New Capabilities

- `desktop-phase-1-delivery-plan`: 定义 Desktop Phase 1 的当前组合根、状态与安全协议、
  focused successor 顺序、真实 Content 纵向路径和实施/验收门禁。

### Modified Capabilities

无。本提案是 Phase 1 的项目级 program 约束；具体 runtime contract 由 focused OpenSpec
分别定义。

## Impact

- 运行时代码：P1.0 只重整 OpenSpec program，不修改生产实现。
- 活跃 changes：`retire-resource-ref-contract`、HTTP resource gateway、Agent/Shell、
  Assets/Canvas、Cut/Preview、EPUB 和未来 P1.6/P1.7 获得唯一 successor ownership。
- 用户数据：继续保护 workspace identity、conversation、trust、credential、installed
  package 和 artifact；transport/contract 清理不得静默删除或双写。
- 产品声明：Desktop-only 与 macOS/Windows 构建目标是当前事实；Phase 1 参考平台验收不等于
  Windows 完整资格，也不提前声明 Phase 3 MCP/plugin/professional-tool 支持。
