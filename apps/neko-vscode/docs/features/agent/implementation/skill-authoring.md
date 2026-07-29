# Skill Authoring

本文定义 Neko Agent 的 canonical Skill 创作格式。目标格式遵循开放 [Agent Skills Specification](https://agentskills.io/specification)：`SKILL.md` 是唯一必需文件，Neko-specific 信息只在确有需要时进入 `agents/neko.yaml`。

> `.neko/skills` 和 Skill 根目录 `manifest.json` 仅属于显式 legacy migration 输入，不参与 canonical 创建、发现或加载。架构决策见 [`adr-agent-skill-creator-and-validation.md`](../../../docs/architecture/adr-agent-skill-creator-and-validation.md)。

## 目录结构

最小 Skill：

```text
skill-name/
└── SKILL.md
```

按需扩展：

```text
skill-name/
├── SKILL.md
├── scripts/                 # 可选：确定性脚本
├── references/              # 可选：按需加载的长资料
├── assets/                  # 可选：模板、图标、字体和输出资源
└── agents/
    └── neko.yaml            # 可选：Neko UI 和结构化依赖
```

不要创建空目录、空 `agents/neko.yaml` 或 Skill 根目录 `manifest.json`。

## 最小 `SKILL.md`

```markdown
---
name: epub-character-index
description: Build a reusable character index from EPUB chapters for story planning. Use when the user needs structured recurring-character evidence; do not use for a chapter-only summary.
---

# EPUB Character Index

Follow the supplied chapter order, distinguish direct evidence from inference, and produce a concise character index with source locations.
```

`name` 和 `description` 必需：

- `name` 必须与父目录名一致。
- 名称最多 64 个字符，只使用小写字母、数字和连字符；不能以连字符开头或结尾，不能出现连续连字符。
- `description` 同时说明“做什么”和“何时/何时不应使用”。Agent catalog 主要依靠它判断是否需要激活 Skill。

## 可选 portable metadata

开放规范允许 `license`、`compatibility`、`metadata` 和 `allowed-tools`：

```yaml
---
name: epub-character-index
description: Build a reusable character index from EPUB chapters for story planning. Use for structured recurring-character evidence, not for a chapter-only summary.
license: Apache-2.0
compatibility: Requires an EPUB reader and a host that can emit the requested character-index artifact.
metadata:
  neko.domain: story
  neko.tags: 'epub,character,story'
allowed-tools: 'ReadDocument'
---
```

字段边界：

- `compatibility` 是人类可读的环境说明，不授予 capability 或 tool。
- `metadata` 必须是 string-to-string map；Neko 小型扩展使用 `neko.*` 命名空间。
- 不要增加顶层嵌套 `neko:`。
- `allowed-tools` 是实验性、宿主相关的最小工具提示。Host 可以不支持某个名称；Neko 会在运行时解析真实可用性。
- 不在 frontmatter 写 `source`、`enabled`、`editable`、`path`、`trust`、catalog actions 或 package version；这些由 Host/Registry 或 Marketplace 拥有。

## 可选 `agents/neko.yaml`

只有 Skill 需要 Neko-specific UI 或结构化 capability/profile 引用时才创建：

```yaml
schema_version: 1

interface:
  display_name: 'EPUB Character Index'
  short_description: 'Build structured character indexes'
  icon_small: './assets/character-index.svg'
  default_prompt: 'Use $epub-character-index to build a character index from this EPUB.'

dependencies:
  capabilities:
    - id: 'story.character-index'
      requirement: required
  profiles:
    - id: 'studio.character-index'
      kind: artifact
      relationship: produces
      version_range: '>=1'

relationships:
  skills:
    - name: 'story-planning'
      relationship: complements
```

规则：

- icon 和其他文件路径必须是 Skill 根目录内的相对路径。
- 只引用已注册或可安装的 Neko capability/profile id；依赖不会自动安装子包或扩大权限。
- Skill 关系只描述 discovery/组合语义，不表示自动激活顺序。
- 不把 workflow steps、工具参数、项目素材、cost/risk policy、compliance 审批、source 或 catalog action 放进 overlay。
- `agents/openai.yaml` 等其他宿主文件可以与 `agents/neko.yaml` 并存。Neko 不应修改它们。

Overlay 只引用 Profile，不定义 durable Profile。只要 Profile 会被 artifact 保存、项目事实引用、其他 Skill 复用或 UI/domain validator 读取，就应由 Artifact/Profile Registry 或 profile contribution 拥有；profile-only package 可以独立分发，不需要附带一个占位 Skill。

## `manifest.json` 字段迁移

新 Skill 不创建根目录 `manifest.json`。常见 legacy 字段按以下方式处理：

| Legacy field                           | 新位置/owner                                                                 |
| -------------------------------------- | ---------------------------------------------------------------------------- |
| `domain`、`tags`                       | `SKILL.md.metadata` 中的 `neko.domain`、`neko.tags`                          |
| `referencedSkills`                     | 必要时使用 `agents/neko.yaml.relationships.skills`                           |
| `profileReferences`                    | `agents/neko.yaml.dependencies.profiles`                                     |
| `referencedCapabilities`               | `agents/neko.yaml.dependencies.capabilities`                                 |
| `optionalTools`                        | 适合 portable tool hint 时使用 `allowed-tools`；否则引用 Neko capability     |
| `version`                              | Marketplace/plugin package manifest；本地编辑由 Host fingerprint 识别        |
| `source`、`enabled`、`catalog`         | Host/Registry runtime projection                                             |
| `requiredSubpackages`                  | 不再手写，由 registry 从 capability/tool/profile 解析                        |
| `referencedAssets`                     | bundled 文件放 `assets/`；项目资产通过请求上下文和 ResourceRef/Artifact 绑定 |
| `costLevel`、`riskLevel`、`compliance` | owning capability/operation/发布 policy                                      |

不要把整个 legacy manifest 原样复制到 `agents/neko.yaml`。

## Prompt content 边界

Skill 正文负责：

- 适用与不适用场景；
- 领域方法和决策启发；
- 创作语义、输出标准、示例和质量检查；
- 缺少输入或证据时的 fail-visible 行为。

Skill 正文不负责：

- 具体工具名教程、命令名、参数表和轮询协议；
- Webview、Extension message、cache、绝对路径、临时路径或 `asWebviewUri` 协议；
- 子包内部 schema、Canvas/Cut/Model 私有 DTO 或 authoring lifecycle；
- 通过文本授予工具、trust、model、provider 或项目写入权限。

这些信息分别属于系统提示词、capability prompt、tool schema、Profile/Artifact Registry 和 Host policy。工具名只在 `allowed-tools`、overlay dependencies、tool registry、schema 或测试 fixture 等机器可读位置出现。

新增或修改 Neko 第一方 Skill 时，维护防回流测试，避免正文重新包含 Runtime 已拥有的工具协议。

### 创作计划与执行指导

影视化、动画化等复杂 Skill 应指导 Agent 从实际来源证据出发，区分观察事实、Agent 解释、创作者决策和可执行动作。需要计划时，工作单元应说明对象、触发/跳过条件、当前输入、能力意图、约束、输出、验收、失败恢复、依赖和审批要求；只列“分析、生成、后期、导出”不属于可执行计划。

Skill 不得把这些方法写成固定 stage、DAG、隐藏 prompt-chain executor 或 Plan-to-Apply 协议，也不得要求每次创作都生成相同文档。`brief.md`、`plan.md` 和领域审阅文档是可选的普通用户内容；TODO 只是近期进度投影。批准后由 Agent 重新读取当前文件并选择当前 Tool，Skill 不保存 executor、Tool schema、Task handle 或项目 revision 副本。

## 创建方式

三种方式都合法：

1. **Agent 原生 `CreateSkill`**：推荐默认路径。Agent 先形成完整定义，再由 typed capability 预检并原子写入。
2. **通用文件能力**：可直接创建或编辑 canonical 目录，服从相同 sandbox、workspace trust 和路径 policy。
3. **用户手工创建/编辑**：保存后由 watcher/rescan 发现。

系统 `skill-creator` Skill 用于访谈、结构选择、精简正文、资源拆分、验证和 forward-testing。它是创作指导，不是唯一写入入口，也不拥有额外权限。

`draft`、`review`、`apply` 是可选创作 UX：

- 可以先展示草稿，也可以在请求已经完整时直接创建。
- `ValidateSkill` 可以独立运行且不写文件，但不是 `CreateSkill` 的强制前置步骤。
- `CreateSkill` 不要求 `applySkillDraft` 或 Skill-specific approval；是否需要确认由通用文件写入和 Host policy 决定。
- 目标同名目录已存在时 create 必须报 conflict；更新使用编辑或独立 update 能力。

## Canonical roots

Neko 新的可写 roots：

- 项目：`<workspace>/.agents/skills/<skill-name>/`
- 个人：`${HOME}/.agents/skills/<skill-name>/`

Builtin、Marketplace 和 plugin Skills 位于各自 Host 管理目录，但每个 Skill package 使用相同 portable shape。

旧 `<workspace>/.neko/skills/` 和 `${HOME}/.neko/skills/` 只作为显式迁移输入。不要手工双写新旧目录；迁移发生冲突或无法映射字段时应先处理 diagnostic，不能静默覆盖或删除旧 Skill。

## 验证与兼容性

Neko 分开报告：

1. **Portable validity**：`SKILL.md`、名称、frontmatter 和资源路径是否符合开放规范。
2. **Neko overlay validity**：`agents/neko.yaml` schema 是否有效。
3. **Neko compatibility**：当前 Host 是否具备声明的 tool、runtime、capability、profile 和 trust。
4. **Neko first-party quality**：内置/发布 Skill 的 prompt boundary、locale、fixtures 和领域质量。

外部 Skill 不符合 Neko 内部写作模板，不等于不符合开放规范。反之，格式有效也不保证当前机器可执行其脚本或依赖；缺失依赖必须显示 `incompatible` diagnostic，不能静默降级。

## 激活边界

创建或发现 Skill 不会自动激活它，也不会改变 tool/model/trust policy。Skill 也不在 frontmatter 或 overlay 中声明 `slot`、`lifetime`、`clearable`；这些由激活来源和 Runtime lifecycle policy 决定。

合法激活路径仍是：

- 用户输入 `$skill-name` 或使用显式 Skill UI；
- Agent 调用 `ActivateSkill`；
- Runtime 内部经过同一 activation owner 的显式路径。

若同名 Skill 来自不同 source 且无法唯一解析，Host 应要求明确 source 或返回歧义 diagnostic，而不是按隐藏优先级静默选择。

## 跨应用复用检查清单

要让 Skill 更容易被其他应用复用：

- 保持 `SKILL.md` 自足，Neko-specific 结构只放 `agents/neko.yaml`。
- 使用相对路径，不写用户机器绝对路径、cache、Webview URI 或临时文件。
- 不假设其他宿主认识 Neko capability；在 `compatibility` 中说明必要环境。
- instruction-only 优先；确实需要确定性行为时再加入 scripts。
- 保留其他宿主的 `agents/*` 文件，不重写未知 metadata。
- 用目标宿主分别验证。格式可移植不等于工具名、脚本 runtime、sandbox 和输出 artifact 完全兼容。
