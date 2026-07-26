## Why

角色扮演已经与普通 Agent 会话共享 OpenNeko AI 面板和标签容器，但当前只有无标签入口页
提供角色选择入口。用户进入普通会话后必须先关闭所有标签或通过命令路径启动角色会话，
Header 的高频会话操作因此不能直接创建角色会话。

## What Changes

- 在 Agent Header 的“新对话”和“历史记录”之间增加独立的角色会话图标按钮。
- 点击按钮打开角色选择菜单，并通过现有 roleplay-scoped Project Search 获取可扮演角色。
- 复用无标签入口页已有的 confirmed Entity 与 Candidate 投影、显式 Candidate 确认和
  Character Dialogue handoff，不创建普通 conversation 或第二套角色 session。
- 修复 Entity Project Search adapter 对稳定 item id 的精确重解析，使 Candidate 确认不会在
  provider 预过滤和 `limit` 之前丢失已选择条目。
- 使产品开发 stage 强制重建组合内 feature bundle，避免跨包 Entity/Chara/Search 源码变化
  被 Turbo 陈旧输出隐藏，导致 Extension Development Host 运行旧 Agent 代码。
- 为按钮、菜单、空状态、键盘关闭和窄面板布局补充中英文文案、可访问性及 Webview 验收。
- 保持 Character Dialogue 与 Embody Character 为独立 conversation kind；本入口只启动现有
  Character Dialogue roleplay 路径。

## Capabilities

### New Capabilities

- `agent-role-session-entry`: Agent Header 中可发现、可访问且复用 canonical Chara handoff 的角色会话入口。

### Modified Capabilities

## Impact

- `packages/neko-agent/packages/webview`: Header、ConversationController、角色选择展示、
  i18n、样式和测试。
- `packages/neko-entity`: Project Search adapter 的 exact item identity 过滤及回归测试。
- `scripts/stage-openneko-dev-extension.mjs` 与对应本地调试配置门禁：仅开发 stage 禁用
  feature bundle cache 命中；release 构建缓存策略不变，`.vscode` 配置无需新增入口。
- `packages/neko-agent/packages/agent-types`、Extension message schema 与 `@neko/chara`
  public contract 不变；继续复用现有 `searchProjectFiles`、`confirmRoleplayCandidate` 和
  `startCharacterDialogueFromSlash` 消息。
- 需要 Extension Development Host 验证按钮、菜单、角色选择和标签创建，不以普通浏览器代替。
