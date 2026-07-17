# ADR: Agent Skill 开放格式、原生创建与校验边界

状态：Accepted
日期：2026-07-10
范围：`neko-agent` Skill 格式、创建、发现、校验、Host overlay、项目/个人/内置/市场 Skill、catalog 投影和迁移。

本文决定 OpenNeko 以开放 Agent Skills 规范作为 Skill 的 canonical core，并把 Neko 专属信息限制在可选 `agents/neko.yaml` 中。`CreateSkill` 是 Agent 原生能力，可以接收完整定义并直接写入 canonical Skill 目录；系统 `skill-creator` Skill 负责创作方法和质量指导，但不是写入权限、注册权威或强制生命周期。

本文补充 [`adr-agent-skill-catalog-activation-boundary.md`](adr-agent-skill-catalog-activation-boundary.md)、[`adr-agent-command-skill-trigger-boundary.md`](adr-agent-command-skill-trigger-boundary.md)、[`adr-agent-prompt-skill-validator-boundary.md`](adr-agent-prompt-skill-validator-boundary.md)、[`adr-agent-sandbox-and-external-processing-boundary.md`](adr-agent-sandbox-and-external-processing-boundary.md) 和 [`package-boundaries.md`](package-boundaries.md)。

## 背景

现有 Neko Skill 同时使用 `SKILL.md` frontmatter、根目录 `manifest.json`、TypeScript 内置对象和 Host catalog projection 表达 metadata。字段在不同载体间重复，产生了三个问题：

1. **格式不便复用。** 外部标准 Skill 需要转换为 Neko-specific manifest，Neko Skill 也难以被 Codex 等支持 Agent Skills 的宿主直接读取。
2. **作者契约和运行时事实混合。** `source`、path、enabled、editable、catalog action、trust 等 Host 事实被当成 Skill 自描述字段。
3. **创作 UX 被误写成通用权限协议。** `draft → validate → review → apply` 曾被提升为 `CreateSkill` 的强制流程，并额外要求 Skill-specific approval；这限制了 Agent 原生创建、用户手工编辑和通用文件能力。

Codex 的可借鉴点是：Skill 目录以 `SKILL.md` 为核心，脚本、引用和资源按需存在，宿主专属 UI/依赖信息进入 `agents/<host>.yaml`，系统 `skill-creator` 负责指导而不垄断文件创建。Neko 采用相同的 portable-first 原则，但 Neko runtime、catalog、Profile、Capability 和 trust 仍由 Neko Host 自己负责。

## 决策摘要

Neko 采用三层模型：

```text
L0 Portable Agent Skill
  SKILL.md
  optional scripts/, references/, assets/

L1 Optional Neko Host Overlay
  agents/neko.yaml

L2 Neko Host / Registry Runtime Facts
  source, root, path, provenance, trust, enablement,
  editability, catalog actions, compatibility, fingerprint,
  capability/tool/profile resolution
```

核心不变量：

- `SKILL.md` 是唯一必需文件。
- Skill 根目录不再使用 Neko-specific `manifest.json`。
- 默认只创建真实需要的文件，不创建空目录、空 overlay 或占位 sidecar。
- 外部标准 Skill 不需要转换即可被 Neko 解析；其他宿主可以忽略 `agents/neko.yaml`。
- 格式合规、Neko 运行兼容和 Neko 第一方质量是三种不同结论，不能混为一个 validator 结果。
- `CreateSkill` 是可直接写入的原生能力，不要求先持久化 draft、review artifact 或调用 `applySkillDraft`。
- 权限由通用 sandbox、workspace trust、capability/tool policy、目标路径和 Host policy 决定，不增加 Skill-specific approval gate。
- 用户手工创建、Agent `CreateSkill`、通用文件能力写入 canonical 目录都是合法路径。
- Registry/activation runtime 才是发现、兼容性判断、启用和激活权威；写入成功不等于自动启用、自动激活或获得更多工具权限。

## 架构自检

1. **是否符合现有架构？**

   符合。Skill 内容仍通过 Skill runtime 加载，激活仍经过 `ActivateSkill`、`SkillInjectionCoordinator`、workspace trust 和 tool/capability guard。变化只收敛 authoring format 和写入入口，不把创建能力变成激活或权限权威。

2. **如何进一步降低耦合？**

   Portable parser 不认识 Neko domain internals；Neko overlay parser 只解析 Neko extension；Host projection 从 path、registry 和 policy 计算运行时事实。Canvas、Cut、Model 等领域通过 capability/profile registry 提供 descriptor，不让 Skill loader import 领域实现。

3. **是否易于扩展与测试？**

   新宿主可增加自己的 `agents/<host>.yaml`，不修改 portable core。新 Neko capability/profile 只扩展 registry 和 compatibility resolver。测试可分别覆盖格式、overlay、兼容性、第一方质量和创建写入路径。

## 术语与领域模型

| 术语                      | 定义                                                                        | 不包含                                             |
| ------------------------- | --------------------------------------------------------------------------- | -------------------------------------------------- |
| Portable Skill            | 符合开放 Agent Skills 目录规范的 Skill package                              | Neko source、trust、enabled、catalog action        |
| Neko overlay              | 可选 `agents/neko.yaml`，只描述 Neko 专属 UI 和结构化依赖/关系              | Portable prompt 正文、Host 运行状态、发布 manifest |
| Host projection           | Registry 根据文件位置、provenance、policy 和运行环境计算的 Skill 运行时视图 | 作者手写的持久事实                                 |
| Canonical Skill directory | Host 为 project/personal source 解析出的可写 Skill 根目录                   | 强制使用特定创建工具                               |
| Format validity           | Portable core 或 overlay 的 schema/结构是否合法                             | 当前机器是否有依赖、Skill 是否高质量               |
| Compatibility             | 当前 Neko Host 是否满足工具、capability、profile、runtime 和 trust 要求     | Portable 格式是否有效                              |
| First-party quality       | Neko 内置/发布 Skill 的 prompt 边界、locale、fixture 和领域质量门禁         | 外部 Skill 的开放规范合规性                        |
| Creation guidance         | 系统 `skill-creator` 提供的访谈、拆分、写作、验证和迭代方法                 | Runtime 强制状态机或额外权限                       |
| Native `CreateSkill`      | 接收完整定义并安全写入 Skill package 的 typed Agent 能力                    | 自动激活、自动发布、自动授予依赖                   |

一个 Skill 的稳定身份由 Host source/root 与 portable `name` 共同确定，不只用裸名称。不同 source 中同名 Skill 不合并；若 `$name` 无法唯一解析，Host 必须返回歧义 diagnostic。

## Portable Skill 标准产物

```text
skill-name/
├── SKILL.md                 # 必需
├── scripts/                 # 可选
├── references/              # 可选
├── assets/                  # 可选
└── agents/
    └── neko.yaml            # 可选，仅 Neko 扩展
```

### `SKILL.md`

`SKILL.md` frontmatter 遵循开放 Agent Skills 规范：

- 必需：`name`、`description`。
- 可选标准字段：`license`、`compatibility`、`metadata`、`allowed-tools`。
- `metadata` 是 string-to-string map；Neko 小型标量扩展使用命名空间键，例如 `neko.domain`、`neko.tags`。
- 不增加任意顶层嵌套 `neko:`，避免与严格 validator 冲突。
- `allowed-tools` 是宿主可能支持的实验字段，只表达最小工具范围，不授予工具，也不替代运行时 policy。
- 目录名和 `name` 必须一致；名称遵循开放规范的小写字母、数字、单连字符规则。

示例：

```yaml
---
name: epub-character-index
description: Build a reusable character index from EPUB chapters for story planning. Use when the user needs structured recurring-character evidence; do not use for a chapter-only summary.
license: Apache-2.0
compatibility: Requires an EPUB reader and a host that can emit the requested character-index artifact.
metadata:
  neko.domain: story
  neko.tags: 'epub,character,story'
allowed-tools: 'ReadDocument'
---
```

Skill 正文只描述任务判断、领域方法、创作语义、输出标准、示例和失败边界。具体工具教程、参数表、轮询协议、Webview/path 协议、子包内部 DTO 和 authoring lifecycle 属于系统提示词、capability prompt、tool schema 或 runtime catalog。

### Optional resources

- `scripts/`：只在确定性、重复性或脆弱操作确实需要时加入；声明脚本不表示 Host 一定有对应 runtime。
- `references/`：按需加载的长资料、schema 和领域参考。
- `assets/`：模板、图标、字体和输出资源；相对路径必须留在 Skill 根目录内。
- 不创建空目录；不把项目素材清单、缓存路径、Webview URI、blob URL 或系统临时路径写入 Skill package。

## Neko Host overlay

`agents/neko.yaml` 是可选扩展。没有 Neko-specific UI 或结构化依赖时不得生成该文件。v1 只允许以下职责：

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

v1 不接收以下字段：

- source、path、enabled、editable、trust、provenance；
- catalog action、visibility 或由 Host 计算的管理能力；
- Skill release version、marketplace package version 或 compliance 审批记录；
- required subpackage 名称、cost/risk policy、缓存或项目资产路径；
- 任意 workflow DSL、执行步骤或工具参数。

`schema_version` 只版本化 Neko overlay schema，不代表 Skill release version。未知 schema version、未知必需字段、越界相对路径或非法依赖必须 fail-visible。若 portable core 有效但 `agents/neko.yaml` 无效，其他宿主仍可读取 core；Neko 将该 Skill 标为 `invalid-overlay`，不得静默忽略 overlay 后继续激活。

Codex 的 `agents/openai.yaml` 可以与 `agents/neko.yaml` 并存。Neko 不读取或重写其他宿主 overlay；复制、迁移和 duplicate 操作必须保留未知 `agents/*` 文件。

## Host / Registry runtime facts

以下信息属于运行时投影，不写入 Skill package：

```ts
interface NekoSkillHostProjection {
  readonly source: 'project' | 'personal' | 'builtin' | 'market' | 'plugin';
  readonly location: {
    readonly rootId: string;
    readonly relativePath: string;
  };
  readonly provenance: SkillProvenance;
  readonly enabled: boolean;
  readonly editable: boolean;
  readonly trusted: boolean;
  readonly compatibility: SkillCompatibilityStatus;
  readonly fingerprint: string;
  readonly catalogActions: readonly SkillCatalogAction[];
}
```

具体类型名可在实现时按共享层边界调整，但职责不能回流到 `SKILL.md` 或 overlay。Catalog 的 role/group/visibility/action 应由 source、provenance、policy、关系和 UI provider 投影；本地 revision 使用 content hash/mtime，不要求作者维护版本号。

## Canonical roots 与跨宿主复用

开放 Agent Skills 规范定义 package 格式，不规定所有宿主必须使用同一个安装目录。Neko 的 Host policy 决定 source root：

| Source        | Neko 新 canonical root        | 说明                                                           |
| ------------- | ----------------------------- | -------------------------------------------------------------- |
| project       | `<workspace>/.agents/skills/` | 便于项目检入并与 Codex 等支持该 root 的宿主零复制共享          |
| personal      | `${HOME}/.agents/skills/`     | 用户级 portable Skills                                         |
| builtin       | Neko package/resource root    | 只读，由产品构建拥有                                           |
| market/plugin | Host/Marketplace 安装 root    | 只读或受安装器管理；package 内每个 Skill 仍采用 portable shape |

路径一致不是跨宿主复用的前提。其他应用即使使用不同 discovery root，也应能复制或导入同一个 Skill 目录而无需转换其 core 文件。

旧 `${workspace}/.neko/skills/` 和 `${HOME}/.neko/skills/` 是显式迁移输入，不再是新写入或默认发现路径。实现不得长期保留新旧双读/双写成功路径。

## `CreateSkill` 是原生能力

`CreateSkill` 与 Read/Write/Edit 等文件能力同属 Agent 可用能力。系统 `skill-creator` Skill 可以帮助 Agent 收集需求、选择 instruction-only 或 bundled resources、编写清晰描述、拆分 references/scripts 并执行 forward test，但使用该指导不是创建合法性的前置条件。

推荐 typed contract：

```ts
interface CreateSkillInput {
  readonly target: 'project' | 'personal';
  readonly skill: PortableSkillInput;
  readonly resources?: readonly SkillResourceInput[];
  readonly neko?: NekoSkillOverlayInput;
}

interface PortableSkillInput {
  readonly name: string;
  readonly description: string;
  readonly body: string;
  readonly license?: string;
  readonly compatibility?: string;
  readonly metadata?: Readonly<Record<string, string>>;
  readonly allowedTools?: readonly string[];
}

type SkillResourceInput =
  | {
      readonly path: string;
      readonly encoding: 'utf8';
      readonly content: string;
    }
  | {
      readonly path: string;
      readonly encoding: 'base64';
      readonly content: string;
    };

interface CreateSkillResult {
  readonly source: 'project' | 'personal';
  readonly rootId: string;
  readonly relativePath: string;
  readonly fingerprint: string;
  readonly diagnostics: readonly SkillDiagnostic[];
}
```

`CreateSkill` 执行路径：

```text
Complete CreateSkillInput
  -> resolve target through SkillRootProvider
  -> validate name and every relative resource path
  -> PortableSkillValidator
  -> optional NekoOverlayValidator
  -> Host write/trust/policy check
  -> write sibling temporary directory
  -> atomic rename to <root>/<name>
  -> registry rescan and return diagnostics
```

临时目录只是原子写入实现细节，不是持久化 draft，也不要求用户 review。

### 创建语义

- 输入必须足以生成完整 `SKILL.md`；不能默认写入 “A custom skill.” 或占位正文并宣称创建成功。
- 目标目录已存在时返回明确 `SkillAlreadyExists` conflict，不静默返回旧路径，也不默认覆盖。
- 更新现有 Skill 使用独立 `UpdateSkill`、通用文件编辑或用户手工编辑；不能把 create 变成隐式 upsert。
- 写入成功后触发 rescan，但不自动启用、激活、发布或执行 Skill。
- `CreateSkill` 可以内部 preflight；独立 `ValidateSkill` 仍可存在，且只返回 diagnostics、不写文件，但它不是强制前置阶段。
- `draft`、`review`、`apply` 可以作为某个 UI 或创作会话的可选指导词。它们不是 Agent 通用 phase，也不是 `CreateSkill` 的强制协议。
- 不存在额外的 Skill-specific approval。是否需要确认由通用文件写入、workspace trust、sandbox、目标 source 和 Host capability policy 决定。

## 合法写入路径

| 路径                         | 是否合法               | 约束                                                        |
| ---------------------------- | ---------------------- | ----------------------------------------------------------- |
| Agent `CreateSkill`          | 是，推荐的可靠默认路径 | typed input、preflight、原子写入、conflict diagnostic       |
| 通用文件能力                 | 是                     | 服从相同 path/trust/sandbox policy；Registry 在发现时校验   |
| 用户手工创建/编辑            | 是                     | 保存后由 watcher/rescan 发现并诊断                          |
| 系统 `skill-creator`         | 是，但它是指导         | 可组织内容并调用任一合法写入路径，不拥有特殊权限            |
| Marketplace/plugin installer | 是                     | 由安装器拥有 package/version/trust，Skill core 仍需格式校验 |

`CreateSkill` 是能力质量入口，不是唯一写入垄断者。相反，Registry 必须能够面对任何合法文件来源：无效目录产生明确 diagnostic，不得因为不是由 Creator 生成就拒绝，也不得因为文件存在就默认为有效。

## Validator 分层

```text
PortableSkillValidator
  -> NekoOverlayValidator (when present)
  -> SkillCompatibilityResolver
  -> NekoFirstPartyQualityValidator (source/policy dependent)
  -> Activation runtime guards
```

| 层                  | 判断问题                       | 主要输入                                                             | 结果                                    |
| ------------------- | ------------------------------ | -------------------------------------------------------------------- | --------------------------------------- |
| Portable            | 是否符合开放 Agent Skills core | `SKILL.md`、目录名、portable resources                               | valid / invalid-core                    |
| Overlay             | Neko-specific schema 是否有效  | `agents/neko.yaml`                                                   | valid / invalid-overlay / absent        |
| Compatibility       | 当前 Host 是否能运行           | allowed tools、scripts/runtime、capability/profile registry、trust   | compatible / incompatible + diagnostics |
| First-party quality | 是否满足 Neko 自有质量标准     | prompt boundary、locale parity、fixtures、领域规则                   | pass / warning / publish-blocking       |
| Activation guards   | 此次激活是否允许               | enabled、session policy、workspace trust、当前 tool/capability state | activated / rejected diagnostic         |

约束：

- 外部 Skill 不能因缺少 Neko 第一方章节、locale fixture 或内部写作风格而被判定为不符合开放规范。
- 格式有效但缺少 runtime/tool/profile 的 Skill 应标为 `incompatible`，不能伪装成 `invalid-core`，也不能静默降级执行。
- Neko builtin 和 Neko marketplace 发布可把第一方质量错误作为 CI/publish gate；project/personal 外部 Skill 默认只报告与安全、格式和真实兼容性相关的错误。
- 未知 capability/profile/tool 不授予权限；resolver 返回可见 diagnostic。
- Validator 不把 Canvas/Cut/Model 规则硬编码进 portable parser。领域规则由 owning registry 提供。

## 移除根目录 `manifest.json`

现有 `SkillManifest` 字段按 owner 拆分，不迁移为一个同构 YAML 文件：

| Legacy field          | 新 owner                                                                                          |
| --------------------- | ------------------------------------------------------------------------------------------------- |
| `version`             | Marketplace/plugin package manifest；本地 revision 使用 Host fingerprint                          |
| `domain`、`tags`      | 小型字符串进入 `SKILL.md.metadata` 的 namespaced keys                                             |
| `requiredSubpackages` | 删除；由 capability/tool/profile registry 解析 owner/package                                      |
| `autoInvoke`          | 删除；当前没有独立 Host 自动激活消费者，激活权威保持 Agent/显式入口/runtime guard                 |
| `referencedAssets`    | 删除；bundled 文件进入 `assets/`，项目素材通过请求上下文或 Artifact/ResourceRef 绑定              |
| `referencedSkills`    | 真正需要时进入 `agents/neko.yaml.relationships.skills`                                            |
| `profileReferences`   | 进入 `agents/neko.yaml.dependencies.profiles`；Profile 定义仍由 Profile Registry 拥有             |
| `mediaWorkflow`       | 按语义拆到 description/body、metadata、overlay dependencies、Artifact Profile 和 operation policy |
| `compliance`          | Marketplace 发布、组织质量或审计 policy，不属于普通 Skill package                                 |
| `catalog`             | Host/Catalog Provider 根据 source、provenance、policy 和 relationships 投影                       |

`mediaWorkflow` 具体拆分：

| Legacy intent                    | 新 owner                                                               |
| -------------------------------- | ---------------------------------------------------------------------- |
| `useCases` / `nonGoals`          | `description` 中的触发与排除边界，必要细节放正文                       |
| input/output/artifact profile    | Artifact/Profile Registry；Skill 只引用 profile id                     |
| `referencedCapabilities`         | Neko overlay capability dependencies                                   |
| `suggestedProjectors`            | Artifact Profile/projector registry                                    |
| `validationRequirements`         | Artifact Profile validator registry                                    |
| `costLevel` / `riskLevel`        | capability/operation policy                                            |
| `optionalTools`                  | portable `allowed-tools` 或 Neko capability dependency，按真实语义选择 |
| `operations` / `domain` / `tags` | 精简 portable metadata 或由 catalog 推导                               |

不允许把所有 legacy 字段原样搬入 `agents/neko.yaml`；否则只是把万能 manifest 改名。

## 与 Codex 的对比

| 方面               | Codex                                                       | Neko 决策                                                                                |
| ------------------ | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Portable core      | 开放 Agent Skills，`SKILL.md` 必需                          | 相同                                                                                     |
| Creator            | 系统 `skill-creator` 指导，也允许手工创建                   | 相同原则；另提供 typed 原生 `CreateSkill` 作为可靠默认写入路径                           |
| Host overlay       | 可选 `agents/openai.yaml`，承载界面、调用 policy 和工具依赖 | 可选 `agents/neko.yaml`，v1 只承载界面、Neko capability/profile 依赖和 Skill 关系        |
| Creation lifecycle | 没有 mandatory draft/review/apply protocol                  | 不引入 mandatory protocol                                                                |
| Discovery root     | Codex 支持 project/user `.agents/skills` 等位置             | Neko project/personal 新 canonical roots 采用 `.agents/skills`；其他 source 由 Host 管理 |
| Runtime authority  | Codex policy/sandbox/tool availability                      | Neko registry、trust、capability/tool/profile resolver 和 activation guard               |

Neko 不复制 Codex overlay 的所有字段。只有存在明确 Neko consumer 的字段才进入 `agents/neko.yaml`；例如 invocation policy 在 Neko 没有实现和测试真实消费者前，不作为 v1 schema 字段。

## 五层职责、依赖、接口、扩展与测试

| 层                            | 职责                                              | 依赖                             | 主要接口                                                      | 扩展方式                            | 测试                                                      |
| ----------------------------- | ------------------------------------------------- | -------------------------------- | ------------------------------------------------------------- | ----------------------------------- | --------------------------------------------------------- |
| L0 Portable contract          | parse/serialize/validate 开放 Skill core          | 零或通用 YAML/path 基础          | `PortableSkillInput`、`PortableSkillValidator`                | 跟随开放规范的兼容演进              | spec fixtures、round-trip、path safety                    |
| L1 Neko overlay               | parse/validate Neko v1 extension                  | L0 diagnostics                   | `NekoSkillOverlayInput`、`NekoOverlayValidator`               | schema version + 明确 consumer      | schema fixtures、unknown-version failure                  |
| L2 Host registry              | roots、source、provenance、compatibility、catalog | L0/L1 + registries/policy        | `SkillRootProvider`、`SkillCompatibilityResolver`、projection | 新 source/provider/registry adapter | discovery、conflict、compatibility tests                  |
| L3 Native creation            | typed preflight、原子写入、rescan                 | L0/L1/L2 + file service          | `CreateSkill`、可选 `ValidateSkill`                           | 新 resource encoder、host adapter   | full-input creation、conflict、rollback、legacy poison    |
| L4 Authoring guidance/quality | 写作方法、第一方 quality 和 forward tests         | Creator/validators，不拥有写权限 | system `skill-creator`、`NekoFirstPartyQualityValidator`      | 新模板/规则/fixtures                | generated fixture、prompt boundary、real Agent evaluation |

## 迁移策略

项目处于 prelaunch，可以清理 legacy contract，但不能静默删除有价值的本地 Skill：

1. 冻结并 poison 新请求对 `.neko/skills`、root `manifest.json`、`writeSkillManifest` 和 blank-skill create path 的依赖。
2. 提供显式 migration：扫描 legacy roots，解析 `SKILL.md` + `manifest.json`，生成 portable core 和最小必要 overlay，输出逐 Skill diagnostics 和 conflict plan。
3. 目标已存在、字段无法无损映射、overlay 依赖未知或资源路径非法时停止该 Skill 迁移，不覆盖目标。
4. 成功迁移后由新 Registry 只从 canonical roots 发现；legacy path 不得继续为新请求返回成功。
5. 用户确认或明确备份策略前，不删除 legacy 原文件。
6. 清理 `SkillManifest`、manifest validator、双读/双写、blank template、旧测试 fixture 和 catalog 字段复制链路。

迁移本身是独立数据保护操作，可以有预览和确认；不能因此把所有未来 `CreateSkill` 都绑定到 preview/apply 流程。

## 非目标

- 不把 Skill 变成 workflow engine、领域 compiler 或权限 package。
- 不规定其他宿主必须使用 Neko 的 discovery roots。
- 不保证声明脚本、工具或 Neko capability 的 Skill 在所有宿主上都可执行；保证的是 core 可解析、依赖缺失可诊断。
- 不用 first-party prompt quality 规则阻止用户读取或编辑外部标准 Skill。
- 不引入远程多租户审批、云端注册服务或分布式 Skill governance。
- 不把 Marketplace/plugin package manifest 一并删除；删除的是单个 Skill 根目录的 Neko-specific `manifest.json`。

## 后果

正向后果：

- Neko 与 Codex 等宿主共享同一种 portable Skill core，复制/导入无需格式转换。
- `manifest.json` 的重复字段回到真实 owner，Skill package 更小且职责清晰。
- Agent、用户和通用文件能力都能创建 Skill；typed `CreateSkill` 提供可靠性而不形成权限垄断。
- 格式、兼容性、第一方质量和激活 guard 可独立演进和测试。
- Host runtime facts 不再伪装成作者自描述配置。

代价：

- 需要迁移 `.neko/skills`、现有 `SkillManifest` 类型、loader、catalog projector、Extension create/duplicate 和相关测试。
- Neko-specific structured dependencies 需要新的 overlay schema、parser 和 compatibility resolver。
- 外部 Skill 可能格式有效但在 Neko 不兼容，UI 和 `GetContext` 必须展示明确状态而不是只给一个 boolean valid。

## 实现缺口与推荐顺序

1. 定义 portable、overlay、diagnostic、compatibility 和 create contracts。
2. 建立 `SkillRootProvider`，切换 project/personal canonical roots，并加入 legacy path poison tests。
3. 移除 `SkillManifest` 双读/写入链路，建立显式 migration。
4. 实现 `PortableSkillValidator` 与 `NekoOverlayValidator`。
5. 实现 `SkillCompatibilityResolver` 和 Host projection，重接 catalog/`GetContext`。
6. 实现 typed `CreateSkill`：完整输入、path safety、原子写入、conflict、rescan。
7. 更新 Dashboard/Extension create UX，不再只传名称或生成 blank placeholder。
8. 将 Neko 内置 prompt/locale/domain 规则收敛到 `NekoFirstPartyQualityValidator`。
9. 增加 system `skill-creator` 指导与聚焦 Agent evaluation，但不让它成为唯一创建入口。

## 验证要求

实现该 ADR 至少需要证明：

- 只有 `SKILL.md` 的最小标准 Skill 可被 Neko 发现。
- 带 `scripts/`、`references/`、`assets/`、`agents/openai.yaml` 的外部 Skill 无需转换即可读取，未知 host overlay 被保留。
- 不存在 `agents/neko.yaml` 时不生成空 sidecar；存在非法/未知 schema 时 Neko fail-visible。
- `CreateSkill` 能接收完整定义直接写入 canonical root，且不要求 draft/review/apply。
- 目标冲突、非法名称、连续连字符、path traversal、越界资源、部分写入均产生明确失败；原子写入失败不留下可发现的半成品。
- 通用文件能力或用户手工创建的合法 Skill 能被同一 Registry 发现；无效 Skill 产生 diagnostics。
- 创建成功不自动激活，不扩大 tools/capabilities/trust。
- 格式有效但缺失 capability/profile/runtime 的 Skill 被标为 incompatible，而不是 invalid 或静默成功。
- legacy `.neko/skills` 和 root `manifest.json` 不参与新 canonical 成功路径；迁移测试单独覆盖并保护旧数据。
- prompt、Skill、capability/tool routing 变更按 `.codex/skills/neko-agent-evaluation/SKILL.md` 运行聚焦 evaluation。

## 参考

- [Agent Skills Specification](https://agentskills.io/specification)
- [Codex: Build skills](https://learn.chatgpt.com/docs/build-skills)
