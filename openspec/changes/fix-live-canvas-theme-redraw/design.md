## Context

Desktop `themeController.update(...)` 会立即在 `document.documentElement` 上设置 `data-neko-theme`、`data-neko-theme-kind` 和对应 CSS tokens。Canvas 中普通 DOM 内容会自然响应变量变化，但 `CanvasGrid` 在 effect 中读取 `--canvas-bg`、`--canvas-grid` 与 `--canvas-grid-major` 后将颜色固化为像素；当前 effect 仅依赖宽高和 viewport，所以主题切换不会触发同一绘制路径。

### Five-layer analysis

| Layer          | Decision                                                                                                                |
| -------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Responsibility | Desktop 继续拥有 canonical 主题投影；Canvas Webview 只负责让自己拥有的可丢弃位图与当前投影同步。                        |
| Dependency     | 仅使用浏览器 `MutationObserver` 监听根节点稳定主题标识，不引入 Electron、Desktop adapter、全局 store 或自定义事件总线。 |
| Interface      | 不增加 public prop、IPC 或领域 contract；主题标识仍是现有 Shell 与 Webview 共享的 presentation contract。               |
| Extension      | 用户显式主题和 `system` 跟随 OS 的 resolved theme 都通过同一个根标识变化触发，无需按设置入口增加分支。                  |
| Test           | 组件测试验证同一 canvas 在标识变化后读取新 token 并重绘；真实 Electron 验证暗/亮双向切换且文档状态不丢失。              |

## Goals / Non-Goals

**Goals:**

- 主题选择生效后，Canvas 背景网格在当前页面立即显示对应颜色。
- 保留当前 Canvas Root、文档状态、viewport 和 runtime identity。
- 主题重绘继续复用现有唯一绘制路径。

**Non-Goals:**

- 不改变浅色或深色 Canvas token 数值。
- 不增加 Canvas 自己的主题设置或第二事实来源。
- 不通过 remount、页面刷新、runtime 重启或 viewport 抖动强制刷新。
- 不修改非 Canvas 页面主题行为。

## Decisions

### 1. 观察 resolved theme 标识，而非批量 style mutation

`CanvasGrid` 观察 `document.documentElement` 的 `data-neko-theme`。Desktop 在一次同步调用中先更新该标识并继续写入全部 token；`MutationObserver` 回调在这批同步变更完成后运行，因此重绘读取到完整的新 computed style。只观察主题标识避免每个 inline token 写入都触发一次重绘。

### 2. 主题标识进入现有绘制 effect

组件保存当前根主题标识作为本地 presentation signal，并将其加入现有绘制 effect 依赖。主题、viewport 与尺寸变化都命中同一个 `getComputedStyle -> clear -> fill -> dots` 路径；不存在主题专用 renderer 或备用颜色源。

### 3. 生命周期局部化

Observer 随 `CanvasGrid` 挂载和卸载创建、释放。它不保存 durable data，不持有宿主资源，也不改变 Canvas Root lifecycle。主题切换仅重绘 background bitmap。

## Boundary inventory

| Owner / role                  | Canonical path                   | Producer -> consumer                  | Runtime boundary | Replaced path / user-data impact                    |
| ----------------------------- | -------------------------------- | ------------------------------------- | ---------------- | --------------------------------------------------- |
| Desktop theme projection      | `renderer/desktop-theme.ts`      | preference / OS -> root marker/tokens | Desktop renderer | 不变；仍是唯一主题 owner                            |
| Canvas bitmap presentation    | `components/CanvasGrid.tsx`      | root marker/tokens -> canvas pixels   | browser L2       | 扩展现有重绘触发；无文档或 snapshot 写入            |
| Canvas component verification | `components/CanvasGrid.test.tsx` | theme mutation -> visible redraw      | jsdom            | 证明同一元素重绘，不以 remount/restart 作为成功路径 |

## Risks / Trade-offs

- 每次 resolved theme 变化会执行一次与 viewport 更新相同成本的全背景重绘；主题切换是低频操作，且不增加持续动画或订阅开销。
- Canvas 独立嵌入且根节点没有 `data-neko-theme` 时保持初始绘制；该场景没有主题变化信号，不伪造默认主题或备用事件协议。

## Migration Plan

1. 增加主题 mutation 的失败测试。
2. 在 `CanvasGrid` 内接入根主题标识并复用现有绘制 effect。
3. 运行 Canvas Webview 测试/build、严格 OpenSpec、真实 Electron 暗亮双向切换与质量审查。

无 durable migration；回退组件变更即可恢复旧行为。

## Open Questions

无 apply-blocking open question。
