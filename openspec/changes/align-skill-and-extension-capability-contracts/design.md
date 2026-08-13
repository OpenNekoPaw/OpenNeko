## Context

当前系统已经存在三种不同层级，但它们在稳定文档中没有被清楚分开：

1. Pi SkillHost 从 builtin、personal、plugin 和 project root 加载开放目录型 Skill；
2. OpenNeko plugin runtime 用 `.openneko-plugin/plugin.json` 组合可安装包中的 Skill、MCP server 和 Host interface metadata；
3. Desktop bundled marketplace 用 `marketplace.json` 列出可供安装的发布包。

三者分别回答“一个 Skill 是什么”“一个组合包包含什么”“从哪里发现发布包”，不应成为互相的前置条件。已完成的 `simplify-openneko-pi-skill-integration` 已删除 `agents/neko.yaml` overlay，但 Accepted ADR 仍把它描述为 canonical surface。MCP runtime 目前只是一种可选 Tool adapter，却容易在文档和目录模型中被理解为通用扩展基座。

本变更只校正架构事实并增加静态防回流门禁，不修改 production runtime。运行 owner 仍分别为 `packages/agent/runtime` 的 Pi SkillHost、Capability composition 与 Extension runtime；Desktop 仍只拥有 bundled marketplace 资源和 Host wiring。没有用户数据迁移。

### 五层分析

| 层级 | 结论                                                                                                                |
| ---- | ------------------------------------------------------------------------------------------------------------------- |
| 职责 | Skill 表达可移植方法；plugin manifest 组合安装单元；marketplace 只做发布发现；MCP 只适配外部 Tool。                 |
| 依赖 | Skill 加载不得依赖 plugin manifest、marketplace 或 MCP；已安装组合包运行不得依赖原 marketplace entry。              |
| 接口 | P0 用机器可读审计清单描述边界，不新增 runtime DTO、registry 或 IPC。                                                |
| 扩展 | 新宿主策略留在 Host extension；开放 Skill content 不吸收 capability、MCP、权限或 UI 协议。                          |
| 测试 | 静态检查验证目录、文档、清单与 production source 的事实一致；无 Agent 行为变化，不运行 provider-backed evaluation。 |

## Goals / Non-Goals

**Goals:**

- 让最简单且默认的扩展单元回到标准 `SKILL.md`，不要求 OpenNeko 私有文件。
- 把组合、分发和运行三个职责拆开，明确 `plugin.json` 与 `marketplace.json` 的有限用途。
- 将 MCP 限定为可选外部 Tool adapter，并规定它与 Skill、catalog 和 Host capability fail-local。
- 用单一机器可读审计清单和自动校验阻止文档再次漂移或定制化继续扩散。
- 对 Agent Skills、Agent Plugins 与 MCP 只声明当前已实现的兼容子集。

**Non-Goals:**

- P0 不采用仍处于 Working Draft 的 Agent Plugins 根 manifest，也不增加兼容读取或双 manifest 路径。
- 不删除当前 `.openneko-plugin/plugin.json`、bundled marketplace 或 Extension Management 产品能力。
- 不扩展 MCP Resources、Prompts、OAuth 或 transport surface。
- 不改变 Skill prompt、Tool 注册、权限、安装状态、用户文件或真实 Agent 行为。

## Decisions

### 1. 默认扩展单元是独立 Skill

一个纯 Skill 目录只需要 `SKILL.md` 及其可选相对资源。OpenNeko 私有 manifest、MCP 配置和 marketplace entry 均不得成为发现、加载、创建或校验前置条件。

没有选择把所有内容统一成 plugin，是因为这会让 prompt/content 扩展承担安装、进程、权限和分发复杂度，并降低 Agent Skills 生态的直接可移植性。

### 2. plugin manifest 只拥有组合包边界

`.openneko-plugin/plugin.json` 明确标记为当前 Host extension，而不是开放 Skill 格式。只有需要把多个独立贡献作为同一个安装、启用、更新和删除单元管理时才需要它。manifest 不得向 Skill content 注入工具协议，也不得使 MCP 成为包有效性的隐含必选项。

没有在 P0 原地改用 Agent Plugins manifest。该规范当前仍是 Working Draft；直接切换会触及 package parser、签名、安装、update、fixture 和用户已安装数据，按仓库单路径约束必须作为独立 OpenSpec 原子替换，不能增加兼容分支。

### 3. marketplace 是可替换的分发投影

`marketplace.json` 只列出 publisher 提供的不可变发布包。它不是 installed package、Skill catalog、权限或 runtime readiness 的 authority。项目 Skill、本地个人 Skill和直接安装的组合包均不依赖 marketplace；移除一个 marketplace source 不得使已安装包失效。

### 4. MCP 是可选、窄化的 Tool adapter

MCP 只在确实需要外部进程或远程服务提供 Tool 时使用。内建领域能力继续由 package-owned Capability Provider 直接组合，不经 MCP 自我包装。Skill 与 MCP 是 sibling contribution；Skill 不通过正文或私有 overlay声明 MCP 协议，MCP 连接失败不得阻止独立 Skill 加载或无关 capability 工作。

### 5. 审计清单不是第二 runtime registry

`quality/agent-extension-surface.json` 记录 standards compatibility、各层 required/optional 关系和 canonical evidence path。脚本只读 source、资源与文档进行检查，不被 production import，也不参与 runtime dispatch、安装、enablement 或 readiness。

## Risks / Trade-offs

- [Agent Plugins 后续稳定，而 OpenNeko 仍使用私有 manifest] → 清单明确标为 Host extension；后续独立 OpenSpec 评估一次性替换，不在 P0 增加兼容路径。
- [静态清单随代码演进过时] → 将检查接入 `check:agent-boundaries`，并验证关键路径、禁用依赖关系和文档措辞。
- [“MCP 可选”被误解为当前插件中无 MCP] → 清单分别记录机制依赖与当前 bundled package 实例；当前 Browser/Computer Use 可以恰好只贡献 MCP adapter，但不能反推通用扩展必须依赖 MCP。
- [P0 不立即删除既有定制 manifest] → 文档把其限制为组合与 Host policy，后续替换必须是单路径原子变更；本轮先阻止定制化继续进入 portable Skill 层。

## Migration Plan

1. 更新 Accepted Skill ADR 和关联导航，删除已退出 overlay。
2. 增加机器可读 surface 清单和一致性脚本。
3. 将脚本组合进现有 Agent boundary gate。
4. 运行 OpenSpec、边界检查和聚焦测试；失败时仅回退本变更的文档、清单和脚本，不涉及用户数据或 runtime rollback。

## Open Questions

- Agent Plugins 规范稳定后，是否以其 root `plugin.json` 原子替换 OpenNeko 私有 manifest，由后续 change 基于签名、安装和用户数据证据决定。
