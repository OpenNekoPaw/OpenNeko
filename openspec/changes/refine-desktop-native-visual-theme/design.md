## Context

Desktop renderer 当前复用三层现有能力：

1. `@neko/shared/theme` 提供 `--neko-*` 语义 token；
2. `@neko/ui` 提供 controlled workbench、toolbar、popover 等无业务 primitive；
3. Agent、Canvas、Assets、Cut、Preview 各自提供 package-owned Root 和样式。

问题不在组件缺失，而在 Desktop theme adapter 将 shared token 重新映射为 VS Code
兼容色，随后 `styles.css` 又用大量页面级硬编码覆盖。最终 Main、Dock、Rail、菜单和输入区
都依赖相近的纯白/浅灰与 1px 分隔线，窗口缺少层次，并且在高分辨率大窗口中控件显得过小。

本次是 Desktop renderer 视觉层修改，不改变 Host contract、窗口布局 authority、
ContentLocator、Canvas/Cut/Preview adapter 或 Agent conversation authority。

## Goals / Non-Goals

**Goals:**

- 跟随系统的亮色与暗色主题都具有清晰的
  window/chrome/surface/elevated/overlay 五级层次。
- 紧凑一级图标栏、Main、Agent/Resource Dock 和浮动控件呈现统一的桌面应用材质。
- 使用 shared token 与既有 UI primitive；package Root 继续拥有自己的组件和命令。
- 在 1x/2x DPI、窄窗口、键盘 focus、high contrast 和 reduced motion 下保持可用。
- 将关键视觉属性转为可测试的 Desktop theme contract，并以真实 Electron 截图验收。

**Non-Goals:**

- 创建第二套 design system 或在 Desktop 复制 Canvas/Agent/Assets 组件。
- 把 Desktop 主题反向写成 VS Code 默认主题，或改变 VS Code Webview 外观。
- 引入用户可下载主题、任意主题编辑器或新的持久配置 authority。
- 改变工作台 slot、Main/Chat preset、面板 resize、文档 identity 或领域功能。

## Decisions

### 1. Desktop theme adapter 扩展 shared token，不复制 shared design system

Desktop theme controller 根据 `prefers-color-scheme` 选择 `nekoDesignTokens.light` 或
`nekoDesignTokens.dark`，随后只增加对应的 `--neko-desktop-*` 窗口组合 token，并把必要的
`--vscode-*` compatibility token 指向同一组语义值。Desktop CSS 只消费语义 token，
不再为同一颜色在多个组件中散落 light-only hex 值。

选择该方案而不是修改 shared token 值，因为 shared token 同时服务 VS Code
Webview；Desktop 的窗口材质、traffic-light inset 与 dock chrome 是宿主差异。

### 2. 窗口使用一张背景，内容使用受控的嵌入 surface

根窗口使用低对比、略带暖色的 canvas；Primary Rail 使用半透明 chrome；Main 与 Dock
是带圆角和轻阴影的独立 surface。Main 保持最大的视觉面积，Canvas 点阵降低对比度；
Agent/Resource Dock 不再通过贯穿窗口的 IDE 分隔线表达层级。

在窄窗口或 overlay 模式中，margin/radius 会收敛，但 owner slot 和最小尺寸不改变。

### 3. 交互尺寸和状态统一为桌面控件密度

图标按钮最小可点击区域为 32×32，主要 rail action 为 36×36；panel header 和 segmented
control 使用一致高度、圆角和 hover/pressed/focus 状态。焦点环使用 shared accent，
不以仅改变文字颜色作为唯一状态。

### 4. package Root 通过 Host theme projection 适配

Desktop 不重写 Agent/Canvas DOM。Renderer 在根 document 投影当前系统亮/暗 theme token；
`AgentWebviewRoot` 的 `desktop-dock` presentation 与 Canvas Root 读取同一组
`--neko-*`/compatibility token。Desktop 只允许对 Root 外层容器、surface clipping 和
宿主级变量做 scoped styling。

如 package 内部仍硬编码 VS Code 色，应优先将其改为既有 shared token；不得在 Desktop
复制 selector 对内部实现做脆弱的逐节点修补。

### 5. 视觉验证同时检查结构和真实渲染

单元测试断言 Desktop token、系统解析后的 light/dark contract、surface class 和可访问性交互；
生产 Electron 验收检查窗口材质、Main/Dock 层次、Agent 输入区、Canvas toolbar、
无全局 Header/Tab 和 panel resize。截图只使用合成项目，不记录用户路径或凭据。

### 6. 系统主题是唯一的运行时主题 authority

Renderer 只订阅一次 `prefers-color-scheme: dark`，初次挂载和系统变化都走同一个
`applyResolvedDesktopTheme()` 路径。该路径同时更新 shared token、Desktop composition
token、VS Code compatibility token、`color-scheme` 与 host dataset；不保留独立的
light-only 成功路径。

Electron Main 使用 `nativeTheme.shouldUseDarkColors` 选择 BrowserWindow 的初始底色，并在
系统主题更新时同步现有窗口底色。Main 不复制 renderer token，也不拥有 package Root
样式；它只负责原生窗口在 renderer 绘制前后的底色。

本次不新增用户主题编辑器或第二个设置存储。用户显式覆盖 `system/light/dark` 属于 Desktop
设置页面的后续持久配置；当前 canonical behavior 是跟随系统。

### 7. 暗色使用中性层级而非 IDE 黑色面板

暗色采用接近 Codex 桌面应用的中性炭灰 window/chrome/surface 层级，保留 OpenNeko
绿色 accent。Main、Dock 与 overlay 通过轻微亮度差、低对比边框和阴影区分，不使用
VS Code editor tab/status bar 语义，也不把媒体/模型 viewport 强制染成壳层背景。

## Risks / Trade-offs

- **[Risk]** 圆角裁切可能影响 Canvas/Preview overlay。
  **Mitigation:** 只在 owner frame 建立 stacking context，允许 package portal/overlay 使用
  既有 overlay root；测试 popover、toolbar 和 fullscreen。

- **[Risk]** compatibility token 修改会影响 package Root。
  **Mitigation:** 保持 token 语义一致，增加 Agent/Canvas/Assets 聚焦测试和生产包验收。

- **[Risk]** backdrop-filter 在低性能设备上增加合成成本。
  **Mitigation:** 仅 Rail、toolbar、popover 使用；大面积 Main/Dock 使用不透明 surface，
  并为 reduced transparency/high contrast 提供无 blur 路径。

- **[Risk]** 过度装饰降低创作区域面积。
  **Mitigation:** 外边距限制为 8–10px，紧凑模式降为 4px；Main 始终优先满足最小尺寸。
