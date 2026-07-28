## Why

拟议 Desktop 当前仍容易被理解为要在 Canvas、Cut、Preview、角色和世界表面内逐步
复制专业 DCC/NLE/游戏引擎能力。OpenNeko 的产品定位应相反：内置子包提供 AI 原生的
快速生成、组织、预览、轻编辑和审阅；复杂剪辑、调色、分层图像、Live2D、3D、游戏
工程和节点生成工作流交给用户已有的专业软件。

Desktop 因此必须支持从稳定项目/素材事实导出，直接打开 DaVinci Resolve、剪映/
CapCut、Photoshop、Live2D Cubism、Blender、Unity、ComfyUI 等工具，并让 Agent 通过
现有 Tool Call/MCP runtime 或受控 Computer Use 执行经过信任、权限和实例校验的专业
操作。稳定 vendor API/MCP 优先；Computer Use 只补足可见 UI 缺口，并且必须绑定明确
应用、窗口和外部文档、允许用户暂停接管、用独立结果证据验收。没有这些条件时只能声明
较低集成等级，不能用截图、窗口焦点或私有项目格式伪造完整支持。

## What Changes

- 明确内置创作子包是 AI-native lightweight authoring surface，不是专业软件替代品。
- 定义专业工具 integration 的发现、启动、导出/打开、外部会话、round-trip 和
  automation 分级。
- 定义 `ProfessionalToolIntegration` 受控 contribution：launch、exchange 和
  MCP/API/Computer Use automation facet 共享同一 app identity、permission 和 diagnostic。
- 复用现有 MCP Manager、External Processor、ContentLocator、领域 Export Job 与
  plugin/capability catalog，不新增第二套 Agent runtime、processor runtime 或全局任务系统。
- 明确 UI “Open in…” 与 Agent automation 复用同一 Host application service，但 UI
  不经 Agent 绕行，MCP/Computer Use 也不直接获得任意进程或本地路径权限。
- 将 Computer Use 定义为显式选择的 host capability：只观察和操作授权目标窗口，
  高风险动作进入现有 approval，用户接管立即暂停，结果按 API/MCP、产物或语义 UI
  证据分级；不得在 MCP/API 失败后静默切换到键鼠操作。
- 规定外部修改通过显式 import/relink/review 返回 Neko；外部 app active document
  不成为 Neko 项目事实或隐式目标。

## Capabilities

### New Capabilities

- `desktop-professional-tool-handoff`: 定义专业应用发现、启动、交换、外部会话、
  MCP/API/Computer Use 自动化、round-trip、插件贡献和安全边界。

### Modified Capabilities

无。当前没有 Desktop runtime 或稳定的专业工具集成 spec。

## Impact

- 架构文档：新增专业工具 handoff/MCP ADR，并更新 Desktop composition、
  Home/Profile UX、外部处理器边界和架构导航。
- 当前实现：无运行时代码、格式、配置、安装或用户数据变化。
- 后续实现：需要独立 OpenSpec 创建 Desktop Host port、integration catalog、
  首批 tool adapters、交换格式和真实应用验收。
