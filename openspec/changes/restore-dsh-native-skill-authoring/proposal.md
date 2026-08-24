## Why

OpenNeko 的稳定规范仍承诺 personal 与 Workspace Skill 创作，但 Pi-to-DSH 原子替换已经删除旧 `CreateSkill` consumer，当前 production DSH Tool catalog 没有可执行的 Skill authoring 路径。现有 `skill-creator` Evaluation 仍要求调用不存在的 `CreateSkill`，因此文档、评测和产品能力发生漂移。

该能力必须建立在 DSH filesystem Skill 格式和 provider 发现之上，而不是恢复 Pi SkillHost、复制 DSH parser 或引入 OpenNeko 私有 Skill schema。

## What Changes

- 恢复一个普通、与 Skill 名称无关的 Host `CreateSkill` Tool contribution；`skill-creator` 仍只是可选的方法论 Skill。
- Assistant Conversation 写入配置的 DSH personal root；Workspace Conversation 写入 exact Workspace 的 DSH-supported project root，目标不能由模型参数或 active Workspace 选择。
- 支持 DSH directory `SKILL.md`、flat Markdown、原生 frontmatter、调用策略、metadata 和安全相对资源。
- 使用锁定 DSH filesystem provider 在隔离 scope 中验证 staged package，验证通过后由 Host 原子发布；不复制 parser。
- 创建后由 DSH provider invalidation/watch 重新发现；不得把新 Skill 手工注册到第二目录或伪造成功 projection。
- 修复 `skill.skill-creator` Evaluation，使其验证真实 DSH source identity、provider fingerprint、重名和路径安全。

## Capabilities

### New Capabilities

- `dsh-native-skill-authoring`: Host 在 Conversation authority 下安全创建 DSH-native personal/Workspace Skills，并由 DSH registry 成为唯一发现和加载 authority。

### Modified Capabilities

- `skill-authoring-targets`: 用 DSH provider/roots 取代已删除的 Pi SkillHost 与旧 portable definition，但保留普通 Skill Creator、Conversation-bound target 和非破坏性发布语义。

## Impact

- `@neko/agent-contracts`：拥有 version-free `CreateSkill` Tool input/result 和诊断契约。
- `@neko/agent-runtime`：拥有 host-neutral authoring application service 与 staged validation port，不拥有 Skill registry。
- `@neko/agent-dsh-plugin`：提供唯一官方 Tool contribution 和 DSH 原生审批声明，不拥有目标或文件写入。
- `@neko/dsh-bridge`：提供 reverse Host port、隔离 DSH provider validation 与 scoped observation，不写用户 Workspace。
- `apps/neko-desktop`：解析 exact Conversation owner、实现 personal/Workspace filesystem trust adapter 与原子 publish。
- `packages/skills/skill-creator`：仅更新 DSH-native authoring 方法，不获得专用 runtime 分支。
- 用户数据：只在用户批准后新建目标；重名、非法或验证失败时目标根保持逐字节不变。删除/覆盖不在本变更范围。
- Extensions 管理面继续是 DSH 全局 Skill/MCP 只读投影；打开、显示、安装和任意路径编辑不属于本变更。

## Dependencies

- 依赖 `align-dsh-skill-runtime-semantics` 完成 exact source、scope、resource 和 catalog invalidation 语义。
