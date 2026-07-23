## Why

Character Dialogue、Embody Character、角色证据、角色档案组装和角色 purpose-model 调用目前分散在 `neko-entity` 与 `neko-agent` Extension。Entity 因此同时拥有通用实体事实和角色运行策略；Agent Extension 同时拥有通用会话宿主和角色领域编排。两边都无法形成边界清晰、可独立演进的 Character owner。

已接受的 Character/World 聚合架构要求建立顶级 `neko-chara`，并让 Agent 只保留唯一 Pi runtime 和薄 capability/host adapter。本变更实施该要求的第一阶段：创建 Character package，迁移当前已存在的角色能力，删除原包中的平行成功路径。

## What Changes

- 新建顶级 `packages/neko-chara` / `@neko/chara` package，提供显式 `core`、`application`、`host-vscode` 和 `testing` public entry。
- 从 `@neko/entity` 迁移 Character Dialogue/Embody session、角色 prompt、角色 evidence、角色 runtime policy、NPC profile assembly 和 character purpose operations。
- 从 `@neko-agent/extension` 迁移 Character Dialogue/Embody controller、VS Code evidence loader 和角色候选解析/确认逻辑。
- `@neko/entity` 只继续拥有通用实体事实、候选、关系、出现位置、素材绑定和 Entity capability；不再导出 Character runtime。
- `@neko-agent/extension` 只组合 `@neko/chara/host-vscode`，保留 Chat/Webview transport、tab projection 和用户入口，不再实现角色领域状态机。
- 删除旧文件和旧 export，不保留 `@neko/entity` 或 `@neko-agent/extension` compatibility re-export。
- 增加 package architecture tests 和 Agent boundary tests，证明 `neko-agent` 不再拥有 Character controller/runtime。
- 记录 Agent Evaluation 决策：真实 Character roleplay 路径需要 target-scoped suite，但当前 Evaluation 只驱动 TUI，且没有 CharacterRun/roleplay canonical input operation；因此真实 case 暂时 blocked，不能用 direct session injection 或 mock 冒充。

## Capabilities

### New Capabilities

- `neko-chara-domain-package`: 当前 Character Dialogue、Embody、Evidence、Profile Assembly 和 Host orchestration 的唯一 package owner。

### Modified Capabilities

- `character-world-domain-aggregation`: 将 `neko-chara` 从拟议边界推进为第一阶段实现；CharacterProject/CharacterVersion 持久格式和 `neko-world` 仍不在本次范围。

## Impact

- 新增 `packages/neko-chara` 和 workspace dependency。
- 修改 `packages/neko-entity` public exports、测试和架构约束。
- 修改 `packages/neko-agent/packages/extension` 的 imports、controller composition、角色候选搜索与测试位置。
- 更新 package boundaries、Agent ADR/OpenSpec 关系和 Agent Evaluation evidence。
- 不迁移现有 `Npc*` 共享 DTO，不新增第二套 Agent loop，不改变 Character transcript artifact 格式。
