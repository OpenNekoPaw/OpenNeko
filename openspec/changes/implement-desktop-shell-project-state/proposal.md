## Why

`bootstrap-neko-desktop-foundation` 已建立安全 Electron composition root，但 renderer 仍只显示
foundation projection。后续 Agent、Assets、Canvas、Cut 和 Preview 接入都依赖稳定的
Project、Window、Tab、View identity、Host-owned catalog 和可恢复 projection attachment。

如果直接在 renderer 中增加页面、Zustand 全局 store 或浏览器持久化，会让 active Tab 成为
事实 owner，并使 reload、跨窗口订阅和迟到响应能够写入错误项目。P1.2 必须先建立唯一
Shell/state canonical path。

## What Changes

- 在 `@neko/host` 提取 owner-neutral projection attachment envelope，复用 Agent 已验证的
  snapshot-first、ack、sequence、base revision 和 fatal recovery 语义。
- 在 Desktop Host 中实现受保护的 revisioned Project catalog，复用 canonical workspace
  identity/registry，只向 renderer 投影无绝对路径的导航 metadata。
- 实现 Window/ProjectTab/View identity、CAS 持久化、duplicate-open 聚焦、close/reopen 和
  renderer reload 恢复。
- 扩展固定 preload bridge，提供 Shell snapshot、订阅、打开 Content workspace、Tab 激活/
  关闭和 profile capability 查询；不增加 raw IPC 或通用 command router。
- 使用 `@neko/ui` 原语实现 Home、Project Tabs、Content Project layout、Context Dock 和
  Activity/Attention 空投影；Character/World 与尚未接入的领域 surface 显示明确 unavailable
  diagnostic。

## Capabilities

### New Capabilities

- `desktop-shell-project-state`: 定义 Desktop Shell、Project catalog、Window/View identity、
  projection attachment 和 CAS persistence。

### Modified Capabilities

- `desktop-phase-1-delivery-plan`: 完成 P1.2，并为 P1.3-P1.7 提供唯一 Shell/state 基础。

## Impact

- 公共契约：`@neko/host` 新增通用 projection attachment primitive；Agent 保持现有公开
  protocol，通过类型别名复用该 primitive。
- Desktop：扩展 main/preload/renderer/shared contract 与 AppHost 生命周期。
- 用户数据：新增 Host user-local Desktop Shell state；其中可保存受保护的绝对 workspace
  locator，但不得发送到 renderer 或写入 workspace/project facts。
- 当前产品：不改变 VS Code/TUI 行为，不接入任何领域 runtime，不修改发布支持矩阵。
