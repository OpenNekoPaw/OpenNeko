# Chara 领域

Chara 是 Character 创作与运行语义的 owner。当前第一阶段实现位于 `packages/neko-chara`，已从 Entity 和 Agent Extension 收回 Character Dialogue、Embody、角色证据、Profile Assembly、角色 purpose operation 和 VS Code 角色编排。

阅读路径：

- [`architecture.md`](architecture.md)：owner、依赖、生命周期与错误边界；
- [`../../architecture/package-boundaries.md`](../../architecture/package-boundaries.md)：跨包约束；
- [`../../architecture/adr-agent-runtime-single-authority-and-simplification-boundary.md`](../../architecture/adr-agent-runtime-single-authority-and-simplification-boundary.md)：Agent 收敛顺序；
- `openspec/changes/extract-neko-chara-domain-package/`：本次迁移的实施设计与验收。

当前不支持 CharacterProject/CharacterVersion 持久格式、发布、持久 CharacterRun 恢复、独立 Chara Webview 或 World runtime。这些能力需要独立 OpenSpec，不能由 Agent、Entity 或 Webview 状态代替。
