## Context

Desktop renderer 通过 `desktop-theme.ts` 将浅色主题投影为一组 canonical `--neko-*` token。其中 `--neko-button-background` 已加深为强主操作背景，而 `--neko-accent` 仍是用于焦点、选中与轻量强调的中性灰。Character、World 与 Agent 的局部 CSS 没有保持该语义区分：部分主按钮直接使用 accent，Agent 浅色覆盖又把辅助文字混合到 32% 前景，造成跨 Surface 的视觉层级漂移。

### Five-layer analysis

| Layer          | Decision                                                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Responsibility | Desktop 继续拥有主题值投影；`@neko/ui` 拥有无业务按钮原语；各 Webview 只消费 canonical token 呈现 package-owned 业务 Surface。 |
| Dependency     | 仅修改 L2 React/CSS 与测试，不引入 Electron、Node、IPC、全局 store 或第二主题服务。                                            |
| Interface      | 复用现有 `--neko-button-*`、`--neko-fg-*` 与 `--neko-focusBorder`；不新增 token、public prop、message 或 contract。            |
| Extension      | 新组件复用 Button 原语或同一 token 语义即可获得一致层级；不需要按 Character、World、Agent 维护独立浅色调色板。                 |
| Test           | 公共 primitive 与三个 Webview 的样式契约测试固定 canonical 消费路径；可见 Desktop 截图检查管理页与 Agent Composer。            |

## Goals / Non-Goals

**Goals:**

- 浅色主题的主操作保持清晰、稳定的高对比背景。
- 可操作的次级按钮和 Composer 控件不再呈现为禁用态灰色。
- 辅助文字保留层级，但不再通过额外 alpha 混合降到不可读对比度。
- Character、World 与 Agent 不建立平行主题事实来源。

**Non-Goals:**

- 不改变主题选择、持久化或即时切换机制。
- 不重设计管理页布局、卡片结构或 Agent transcript。
- 不把所有元数据提升为正文强度，也不改变真实 disabled 状态的透明度。
- 不抽取 Character/World 领域组件或合并其业务 ownership。

## Decisions

### 1. Button 与 accent 保持不同语义

默认主操作直接消费 `--neko-button-background`、`--neko-button-foreground` 与 `--neko-button-hoverBackground`。`--neko-accent` 继续用于 selection、focus、badge、轻量 tint 和 queue 等非主按钮表达。缺少 Desktop token 的独立 Webview 仍以 accent 作为最终 CSS fallback，但不建立第二成功路径。

### 2. 次级操作使用已有 secondary button token

Character、World 管理页和 Agent Composer 的可操作次级控件使用 `--neko-button-secondaryForeground`，管理页背景使用 `--neko-button-secondaryBackground`。说明性正文继续使用 `--neko-fg-secondary`；真正次要的元数据才使用 `--neko-fg-muted`。

### 3. 删除浅色辅助文字的二次透明稀释

Agent 浅色覆盖直接映射到 `--agent-fg-secondary` 与 `--agent-fg-muted`，不再把前景色混合到 66%/32% 透明。这样 Desktop 已解析的 canonical 对比度保持到最终消费者，主题值只存在一个 authority。

### 4. 组件复用与共享层审计

已检查 `@neko/ui` Button/IconButton、Character/World 现有 management controls 与 Agent Composer controls。公共原语本身需要修正语义；Character/World 现有按钮包含领域布局 selector，整批替换 React 结构会扩大本次视觉缺陷边界，因此保留元素并对齐 canonical token。Character 与 World 的管理布局虽相似，但领域数据、动作和生命周期不同，本次不抽取跨领域业务组件。

## Boundary inventory

| Owner / role                        | Canonical path                                | Producer -> consumer                            | Runtime boundary | Replaced path / user-data impact                              |
| ----------------------------------- | --------------------------------------------- | ----------------------------------------------- | ---------------- | ------------------------------------------------------------- |
| Desktop theme projection            | `renderer/desktop-theme.ts`                   | setting/nativeTheme -> root `--neko-*` tokens   | Desktop renderer | 不变；仍是唯一主题值 owner；无用户数据变化                    |
| Shared button presentation          | `@neko/ui/primitives`                         | canonical button tokens -> Button/IconButton    | browser L2       | 替换 default variant 的 accent 背景；无状态或 contract 变化   |
| Character/World management surfaces | package `style.css`                           | canonical tokens -> domain management controls  | browser L2       | 替换 package-local accent 主按钮和弱次级控件；无 catalog 写入 |
| Agent conversation presentation     | `@neko/agent-webview` `index.css`             | canonical tokens -> transcript/composer CSS     | browser L2       | 删除浅色 alpha 稀释；无 Session/runtime 数据变化              |
| Presentation contract verification  | owning-package Vitest source/style assertions | CSS source -> canonical semantic path assertion | test/jsdom       | 防止旧 accent/muted 路径重新成为成功展示                      |

## Risks / Trade-offs

- 主操作会比中性 accent 更深，这是有意恢复交互层级；selection/focus 色不改变。
- 小字号提升可能轻微改变卡片文本占用，但现有截断与两行 clamp 保持不变。
- 本次仅覆盖用户截图涉及的管理页与 Agent presentation；其他 Webview 的既有 muted 用法仍需按实际可见证据单独审计。

## Migration Plan

1. 增加 canonical token 消费的失败测试。
2. 原子替换公共 primitive 和三个 Webview 的错误 CSS 消费路径。
3. 运行定向测试、typecheck、strict OpenSpec、可见 UI 检查与质量审查。

无 durable migration；回退 CSS/primitive class 变更即可恢复旧展示。

## Open Questions

无 apply-blocking open question。
