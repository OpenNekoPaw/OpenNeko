## Why

OpenNeko 的 executable Skill/Capability/Extension 路径已经收敛到 Pi SkillHost、package-owned Capability Provider 与 OpenNeko plugin runtime，但稳定 ADR 仍描述已删除的 `agents/neko.yaml` overlay 和 availability resolver，仓库也缺少一份能由自动化检查证明“当前真正支持什么”的权威清单。当前文档还没有明确解释纯 Skill、组合包与 marketplace 分发索引为什么是三个独立层级，容易让维护者与扩展作者为简单 Skill 引入 OpenNeko 私有 manifest 或 MCP，并误把实验字段、未组合接口或 unsupported contribution 当成产品能力。

## What Changes

- 修正稳定 Skill ADR，使其与当前 Pi-only Skill runtime、portable roots、创建/管理路径和权限边界一致，删除已退出的 Neko overlay 与虚假 availability 承诺。
- 建立最小扩展原则：纯 Skill 只需要开放格式的 `SKILL.md`；`plugin.json` 只服务确实需要统一安装和生命周期的多贡献组合包；`marketplace.json` 只服务可替换的分发发现，不参与已安装内容的运行时有效性。
- 将 Skill、MCP Tool adapter 与 Host capability 视为独立贡献：MCP 不是 Skill 发现、加载、创建、校验或 marketplace catalog 的前置依赖，任一贡献失败只影响自身。
- 增加一份仓库拥有的机器可读 Agent 扩展能力清单，逐项区分 portable-standard、OpenNeko host extension、executable、management-only、unsupported 和 internal-experimental surface。
- 明确 Agent Skills、Agent Plugins 与 MCP 的开放规范兼容边界；只对已经满足的 portable core 作兼容声明，并把 OpenNeko 私有 manifest、安装状态、权限和 runtime readiness 标记为 Host extension。
- 增加自动化一致性检查，验证清单中的 Skill roots、plugin contribution、transport、Capability Provider consumer 和 unsupported surface 与当前 canonical production path 一致。
- 将清单及其验证命令接入架构导航和现有轻量边界门禁，不增加第二套 runtime registry、插件发现路径或兼容分支。
- 记录 Agent Evaluation disposition：本次只校正文档和静态事实验证，不改变 prompt、Skill 内容、Tool 注册或真实 Agent 行为。

## Capabilities

### New Capabilities

- `agent-extension-capability-contract`: 定义 OpenNeko 当前可执行 Skill、Capability 与 Extension surface 的机器可读事实、开放规范兼容层级、状态分类、一致性检查及文档同步要求。

### Modified Capabilities

<!-- None. Existing runtime behavior remains unchanged. -->

## Impact

- `docs/architecture/`：更新 Skill 创建/校验 ADR 与架构导航，稳定描述当前 canonical boundary。
- `quality/`：新增机器可读能力清单；它是审计输入，不是 runtime authority、安装 catalog 或第二套 capability registry。
- `scripts/` 与根 `package.json`：新增只读一致性检查及最小验证入口，阻止私有 Skill overlay、强制 MCP 依赖和 marketplace/runtime authority 回流，不改变生产包依赖或执行路径。
- `openspec/changes/align-skill-and-extension-capability-contracts/`：记录设计、需求、任务和 Evaluation disposition。
- 不修改 `apps/*` 或 `packages/*` 生产行为，不读取或迁移用户 Skill/Extension 数据，不改变 third-party version、Skill fingerprint、plugin identity 或 runtime readiness。
