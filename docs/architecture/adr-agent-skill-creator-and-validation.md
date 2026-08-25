# ADR: Agent Skill 创建、扩展组合与校验边界

状态：Accepted

更新日期：2026-08-23

范围：开放 Skill 格式、校验与 trust。原本地 Plugin 安装、启停、详情和第三方执行设计已废弃；Desktop Extensions 仅保留 DSH-owned Skill/MCP 管理投影。

## 决策

最小且默认的扩展单元是 Agent Skills 兼容目录：

```text
skill/
  SKILL.md
  references/  # optional
  scripts/     # optional, policy controlled
  assets/      # optional
```

`SKILL.md` 保存可移植的方法、判断、输出标准和写作规则，也可以说明公开、稳定的模型或工具
如何参与该方法。Skill 文本不授予工具可见性、权限或 Host trust，不能把私有 ACP/MCP transport、
Desktop 授权流程或 package 私有 schema 伪装成 portable runtime 能力。OpenNeko 不为纯 Skill
增加私有 overlay，项目与个人 Skill 不需要 plugin manifest 或 marketplace entry。

Host policy 只在运行时按来源、精确 identity、trust 与 enablement 筛选 Skill；它不改写 portable
content，也不把 metadata/tool hints 解释为权限授予。领域 Tool、operation schema、validation、
资源绑定和 authoring lifecycle 继续由 package-owned capability injection、Tool schema 或对应 adapter 拥有。

## 历史 Plugin 组合层级（已废弃）

| 层级           | 必要文件             | 职责                                        | 不负责                                               |
| -------------- | -------------------- | ------------------------------------------- | ---------------------------------------------------- |
| Portable Skill | `SKILL.md`           | 可移植方法与相对资源                        | 安装、进程、MCP、权限、Host UI                       |
| 本地 Plugin    | 根目录 `plugin.json` | 共同安装、启用和删除可选 Skill/MCP/App 贡献 | 定义 Skill 内容或把 MCP 变成必选依赖                 |
| 用户状态       | `~/.neko/neko.db`    | Plugin 安装 lifecycle 与启用选择            | package bytes、凭据、runtime health 或 Skill content |

只有一个 portable Skill 时，不应创建组合包。只有多个贡献确实需要共享安装生命周期时，才使用
plugin manifest。P0 不提供 Marketplace；bundled Plugin 来自 Desktop 明确注入的 package root，本地
Plugin 只来自用户选择后安装并登记到 SQLite 的记录。项目 Skill、个人 Skill 和 builtin Skill 均不依赖
Plugin 或 MCP。

Plugin 使用通用根 manifest 结构的稳定 portable subset：`name`、publisher-owned `version` 与可选
发布元数据；OpenNeko 私有展示或 adapter 元数据只能放在 `extensions.io.openneko`。组件使用固定
`skills/` 与 `mcp.json`，不存在表示未贡献，不是错误。`.openneko-plugin`、`.codex-plugin` 和
`marketplace.json` 不参与发现。未来官方仓库必须通过独立 OpenSpec 增加 distribution adapter，
下载后的 package 仍进入同一本地安装路径，禁止 runtime 双读。

## 历史 Plugin 管理详情边界（已废弃）

Skill 与 Plugin 详情采用扩展管理概览，而不是包内容浏览器：Skill 展示名称、描述、来源和所属
Plugin；Plugin 展示发布 metadata、安装来源、贡献摘要与实际 readiness。Renderer 不接收 Skill
正文、manifest/MCP 原文、进程参数、SQLite 记录、fingerprint、locator 或物理路径。

当前 Extensions 管理面只投影 DSH 全局 Skill/MCP catalog，不提供打开、显示、安装、删除或任意路径编辑。未来若增加这些 mutation，必须使用不透明 Host identity、重新校验当前 DSH record 与 containment，并通过独立 OpenSpec 定义用户数据保护；不得从展示字段恢复物理路径。

## MCP 边界

MCP 只用于需要外部进程或远程服务提供 Tool 的可选 adapter。内建领域能力由 owning package
直接组合，不为了“统一扩展”再包装成 MCP。

- Skill 发现、创建、校验和加载不得依赖 MCP。
- Skill/MCP management 只消费 DSH authority；已废弃的本地 Plugin 管理不得恢复为 MCP 的平行 consumer。
- Skill 与 MCP 是 sibling contribution；未声明 MCP 是完整支持状态，不是降级状态。
- 单个 MCP server 连接失败只产生该 contribution 的 diagnostic；有效 Skill和无关 capability
  继续可用。
- Skill 正文可以描述公开 MCP/Tool 的用户级使用方法，但 MCP server transport、连接 lifecycle、
  Host permission 和 package-private schema 仍由 DSH profile、Tool schema 与 owning adapter 管理；
  正文不能据此绕过当前 catalog、permission 或 approval。

## 校验层级

| 层级                   | 回答                                                                               |
| ---------------------- | ---------------------------------------------------------------------------------- |
| Portable format        | 目录、frontmatter、正文、链接、脚本和资源是否符合开放格式                          |
| Host policy            | 精确来源下的 trust 与 enablement 是否允许当前 Skill 被投影                         |
| Composition package    | 多贡献包的身份、路径、授权和安装生命周期是否有效                                   |
| Contribution readiness | 每个 Skill、MCP adapter 或 Host contribution 是否独立 ready，并提供局部 diagnostic |
| First-party quality    | builtin Skill 是否满足提示词边界、写作和 evaluation 要求                           |

格式错误与 Host policy 拒绝必须区分。一个 Skill 或 MCP contribution 失效不得清空 sibling
catalog、停用无关能力或阻止其他工作区运行。

## 创建流程

任意 eligible DSH turn 都可以请求通用、审批门控的 `CreateSkill` Tool；`skill-creator` 只提供方法论，不获得专用 runtime 分支。Tool 只接收 DSH layout、完整 Markdown 和安全相对资源，目标由 exact Conversation authority 决定：Assistant 写 DSH personal root，Workspace Conversation 写该 Workspace 的 `.agents/skills`。Desktop 在同一授权文件系统的隐藏 staging 中写候选字节，bridge 用短生命周期 `FileSystemSkillProvider` 隔离验证，Host no-replace 发布后再从当前 Session 的 DSH catalog 观察 winner。目标存在、路径越界、校验失败或写入冲突明确失败；不覆盖、不合并、不自动改名，也不生成 Plugin metadata。

Creator 不直接启用、注入或手工注册 Skill。发现、source precedence、调用策略和加载继续由 DSH Skill registry 拥有。用户文件是有价值本地数据；删除、覆盖或移动必须有显式用户意图。

## 机器可读事实与验证

[`../../quality/agent-extension-surface.json`](../../quality/agent-extension-surface.json) 记录当前
兼容层级与 canonical evidence。它只供质量检查读取，不是 runtime registry、安装 catalog、权限
authority、feature flag 或 compatibility dispatcher。

验证至少覆盖：

- DSH provider parse/load、path safety、resources、staging cleanup、no-replace publish 与 scoped observation；
- builtin Skill 防止私有 ACP/MCP transport、Host authorization、package-private schema 和私有
  overlay 被伪装成 portable runtime authority；公开工具指导本身不是格式失败；
- plugin、marketplace 与 MCP 均不是普通 Skill 的前置依赖；
- 一个 MCP connection 失败时有效 Skill 与无关能力仍可用；
- 机器可读清单中的 evidence path 与生产事实保持一致；
- Skill 行为或 activation 变化使用聚焦 Agent Evaluation；仅文档和静态审计变化不得伪装成行为证据。

相关决策见 [`adr-agent-skill-catalog-activation-boundary.md`](adr-agent-skill-catalog-activation-boundary.md)、
[`adr-agent-prompt-skill-validator-boundary.md`](adr-agent-prompt-skill-validator-boundary.md) 和
[`adr-dsh-cordis-replace-agent-extension-runtime.md`](adr-dsh-cordis-replace-agent-extension-runtime.md)。
