## Context

Agent transcript 的 authoritative facts 由 Agent runtime 提供，`packages/agent/webview` 将 `Message` 和 `contentBlocks` 投影为可见对话。当前 `MessageItem` 已让最终 Agent 文本脱离气泡，但用户输入、system notice、错误和动作反馈仍采用不同的卡片/气泡语言；`MessageActions` 又直接复制 `message.content`，与结构化回答的实际渲染路径不一致。

五层分析结论：

- 职责：本变更只决定 transcript presentation 与浏览器剪贴板交互，不改变领域事实或 Agent runtime。
- 依赖：Webview 实现只依赖 React、浏览器 Clipboard API 和 package-owned `Message` contract；Desktop Main 在既有 Electron permission boundary 精确授权同源 sanitized write。
- 接口：继续消费 `@neko/agent-contracts` 的 canonical `Message`，不增加 IPC、DTO 或持久化字段。
- 扩展：变化点是消息角色和 display kind；复制文本由单一 presenter 从同一 canonical message 投影。
- 测试：组件、presenter 和 Desktop security policy 测试覆盖 canonical 行为，真实 Electron 负责最终视觉与真实剪贴板路径验收。

Presentation owner 是 `packages/agent/webview`（L2 Agent presentation），browser permission owner 是 `apps/neko-desktop/src/main/security.ts` 的 Electron trust boundary。Producer 是 Agent runtime 的 transcript projection，consumer 是 Agent Webview `ChatView`。Canonical copy path 为 `MessageList -> MessageItem -> MessageActions -> projectMessageCopyText -> navigator.clipboard.writeText`，Desktop permission handler 只授权当前 WebContents 的同源 `clipboard-sanitized-write`。被替换路径是 `MessageActions -> message.content` 的直接读取，以及错误消息的独立大卡片样式。用户数据、transcript persistence 和历史记录不受影响。

## Goals / Non-Goals

**Goals:**

- 建立清晰的角色层级：用户输入有弱背景，Agent 输出无气泡，过程信息弱化，错误行内且显眼。
- 保留现有头像、角色名、时间和普通消息结构，只收敛气泡视觉。
- 让复制文本与当前可见最终回答一致，且复制成功或失败可被用户感知。
- 保持窄面板和桌面宽面板中的稳定宽度、换行和动作按钮可访问性。

**Non-Goals:**

- 不改变 transcript contract、消息持久化、Agent runtime、工具调用或错误分类。
- 不复制隐藏的 thinking、工具执行详情或非文本 deliverable。
- 不新增 Electron clipboard IPC、clipboard read 权限或跨领域共享消息模型。

## Decisions

### 1. 按语义保留一种用户输入容器

用户输入保留右对齐、浅中性色背景和紧凑圆角，但不显示描边，因为它只需要承担“这是用户原始指令”的发言权区分；Agent 最终回答继续使用无边框正文。头像、角色名、时间和 system notice 保持现状。错误使用 `role="alert"` 的行内诊断，不使用完整红色边框和大面积背景。

完全移除所有背景会让长对话中用户指令与 Agent 回答难以快速分辨；继续给错误使用大卡片则会压过真正的错误内容并破坏正文节奏。

### 2. 复制文本由 package-local presenter 投影

新增纯函数从 `Message` 计算可复制文本。用户、system、错误和无 content blocks 的 Agent 消息复制当前可见的 `content`；结构化 Agent 回答复用 `projectContentBlocksUi` 与 `projectAssistantTurn` 的分类，只拼接实际显示为最终回答的 Markdown 文本。没有可复制文本时不展示复制动作。

不从 DOM 读取 `textContent`，因为 DOM 同时包含时间、按钮、工具状态和可折叠详情，会把 presentation chrome 混入结果；也不回退到隐藏的 `message.content`，避免复制用户看不到的替代事实。

### 3. Clipboard API 失败必须就地可见

复制仍使用 Webview 的标准 `navigator.clipboard.writeText`，成功显示短暂完成状态；API 缺失或拒绝时显示短暂失败状态并保留日志。Electron Main 的既有 permission handler 仅为当前 Desktop WebContents 且 requesting URL 与 configured renderer origin 一致时授权 `clipboard-sanitized-write`；`clipboard-read`、外部 origin、其他 WebContents 和其他权限继续拒绝。这里不新增 `execCommand` 或 Electron clipboard IPC 第二路径，避免两条实现产生不同权限与成功语义。

### 4. 视觉规则留在 Agent Webview

消息布局使用语义 class 和现有主题 token；不把 Agent 消息结构抽进 `@neko/ui`，因为共享 UI 包只应拥有低语义原语，Agent role、turn 和 transcript 行为属于 Agent Webview。

## Risks / Trade-offs

- [结构化 deliverable 没有最终文本时复制按钮消失] -> 只对真实可复制的最终文本展示动作；deliverable 自身继续使用其专属复制/打开操作。
- [不同浏览器环境拒绝 Clipboard API] -> 显示明确失败状态并由真实 Electron 验收确认产品运行环境可用，不静默伪装成功。
- [放行范围过宽会扩大 renderer 权限] -> 只允许当前 WebContents、configured renderer origin 和 `clipboard-sanitized-write` 的三重精确匹配，其他请求 fail-closed。
- [样式影响窄面板] -> 使用既有 transcript rail 和响应式断点，并在桌面、窄面板两种 viewport 做截图验收。

## Migration Plan

这是可逆的 presentation-only 原子替换：同步更新组件、presenter、样式和测试，无数据迁移。回滚时恢复旧组件和 CSS 即可，不触及 transcript 数据。

## Open Questions

无。用户给出的 Codex 参考已明确角色层级和目标风格。
