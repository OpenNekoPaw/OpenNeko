# UI Validation

- **Scope:** Character 与 World 管理页删除普通态手动刷新按钮；保留搜索、排序、Add/Import、模板和错误态重试。角色会话标题改为 Chara authority 解析的 GlobalCharacter 显示名。该变更包含用户可见控件与标题，UI validation 适用。
- **Runtime:** 权威边界选择 Development Electron Desktop，因为管理入口、Window 尺寸、Scene composition 和会话发布跨越 package Webview 与 Desktop。组件级 jsdom 只作为辅助功能证据。
- **Inventory:** 宽屏 Character/World 目录应各有一个搜索与排序、零普通刷新按钮、两个独立 Add/Import 动作；窄屏 controls 应换行且无水平溢出；查询变化应调用同一 runtime；失败 diagnostic 应保留 Retry；新 Character Conversation 应显示 GlobalCharacter 名称而非 CharacterVersion label。
- **Evidence:** `@neko/chara-webview` 19 项、`@neko/world-webview` 6 项组件测试通过，覆盖按钮缺席、查询 reload 与两域错误重试；Desktop Character/World focused Renderer 测试 17 项通过；Desktop Adapter 5 项通过，证明统一 `displayName` 成为发布标题。执行 `node scripts/run-desktop-ui-functional.mjs --scenario character-world-management-hierarchy --target development` 时，fixture 在进入页面前因 `Desktop CDP target was not ready before timeout` 终止，没有生成可审查截图。
- **Visual findings:** 没有当前权威截图可供像素检查；宽/窄布局、控件间距、裁切、主题和标题呈现均不能从组件结构测试推断为视觉通过。
- **Result:** `blocked`。代码级功能证据通过，但真实 Electron functional/visual evidence 未产生。
- **Residual risk:** 当前工作树同时包含其他进行中的 Desktop/Canvas 改动，Development fixture 未能启动；待该环境恢复后必须重跑 Character/World 宽屏、720px 窄屏和新 Character Conversation 标题状态并直接检查截图。
