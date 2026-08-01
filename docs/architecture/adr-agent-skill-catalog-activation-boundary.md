# ADR: Agent Skill Catalog 与激活边界

状态：Accepted

更新日期：2026-08-01

范围：Agent Skill catalog、Desktop 输入、Skill metadata、trust、enablement 与 prompt 注入。

## 决策

Skill Host 是 Skill discovery、source、trust、enablement、fingerprint 和 catalog projection 的唯一
owner。Pi loader 负责读取标准 `SKILL.md`；模型根据用户意图、catalog metadata 或显式 `$skill`
输入选择 Skill。Desktop Renderer 不根据关键词、文件类型或候选分数预选 Skill。

```text
Skill roots
  -> Skill Host validation/trust/catalog
  -> turn snapshot metadata
  -> explicit $skill or Agent decision
  -> Pi loads full SKILL.md
```

Catalog 常驻上下文只包含稳定 identity、名称、描述、source、enablement 和必要 availability metadata。
完整正文按需加载。Skill 激活属于当前 turn/input，不建立跨 turn 可变 active-skill authority；重开、
branch 和恢复依赖 transcript 中真实用户输入与 Skill identity。

机器可读 metadata 可以声明 portable tool hints、所需 capability/profile/runtime 和 trust 条件，但
不授予权限。Runtime 在执行前重新解析当前 Tool snapshot、permission 和 dependency；缺失、禁用、
冲突或不受信 Skill 明确失败。

## 验证

- builtin/project/personal roots 的 discovery、冲突、trust、enablement 和 fingerprint；
- `$skill` 精确匹配、未知/禁用 Skill 和自然语言选择路径；
- 证明 Renderer 不做语义候选路由，完整正文只在选中后加载；
- Skill 或 routing 行为变更运行聚焦 Agent evaluation。

相关决策见 [`adr-pi-agent-runtime.md`](adr-pi-agent-runtime.md)、
[`adr-agent-skill-creator-and-validation.md`](adr-agent-skill-creator-and-validation.md) 和
[`adr-agent-prompt-skill-validator-boundary.md`](adr-agent-prompt-skill-validator-boundary.md)。
