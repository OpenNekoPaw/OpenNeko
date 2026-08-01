# ADR: Agent Skill 创建与校验边界

状态：Accepted

更新日期：2026-08-01

范围：开放 Skill 格式、Neko overlay、Desktop 创建 UI、校验、catalog、trust 与原子写入。

## 决策

Skill 由 portable core 与可选 Neko overlay 组成：

```text
skill/
  SKILL.md
  agents/neko.yaml   # optional structured Neko requirements
  references/        # optional
  scripts/           # optional, policy controlled
  assets/            # optional
```

`SKILL.md` 保存可移植的方法、判断、输出标准和写作规则；不得包含运行时工具协议、命令参数表、
Desktop UI 操作流程或 package 私有 schema。`agents/neko.yaml` 只声明结构化 capability/profile/runtime、
trust 和 UI metadata，不复制 prompt 正文。

## 校验层级

| 层级 | 回答 |
| --- | --- |
| Portable format | 目录、frontmatter、正文、链接、脚本和资源是否符合开放格式 |
| Neko overlay | overlay schema、identity 与依赖声明是否有效 |
| Availability | 当前 Desktop Host 是否满足 capability/profile/runtime/trust |
| First-party quality | builtin Skill 是否满足项目提示词边界、写作和 evaluation 要求 |

格式有效但当前能力缺失的 Skill 标记为 unavailable 并给出 diagnostic，不伪装成格式错误或静默执行。
metadata/tool hints 只参与 catalog 与 policy，不授予权限。

## 创建流程

Desktop UI 收集完整目标、适用条件、方法、输出、资源和可选结构化依赖，先执行 typed preflight，
再由 Desktop file service 原子创建目录与文件，最后触发 Skill Host rescan。目标存在、路径越界、
校验失败或写入冲突明确失败，不覆盖现有 Skill，不生成空 placeholder。

Creator 不直接启用或激活 Skill。发现、trust、enablement 与 activation 继续由 Skill Host/runtime
拥有。用户文件是有价值本地数据；删除、覆盖或移动必须有显式用户意图。

## 验证

- portable/overlay parse、round-trip、path safety、links、scripts 与 resources；
- availability resolver 覆盖 capability/profile/runtime/trust；
- preflight、atomic create、conflict、rollback、rescan 与 catalog projection；
- builtin Skill 防止工具协议回流的内容测试；
- Skill 行为质量使用聚焦 Agent evaluation。

相关决策见 [`adr-agent-skill-catalog-activation-boundary.md`](adr-agent-skill-catalog-activation-boundary.md)、
[`adr-agent-prompt-skill-validator-boundary.md`](adr-agent-prompt-skill-validator-boundary.md) 和
[`adr-pi-agent-runtime.md`](adr-pi-agent-runtime.md)。
