# 调研索引

`docs/research/` 保存带日期的技术调研、开源方案比较、竞品观察和 UX 分析。这里记录的是
决策输入，不是已经实施的架构事实；需要推进的结论必须进入 OpenSpec，稳定约束再提升到
`docs/architecture/` 或对应领域文档。

## 当前调研

| 日期       | 文档                                                                                                                           | 范围                                                                          |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| 2026-08-08 | [`markdown-authoring-and-agent-rendering-options-2026-08-08.md`](markdown-authoring-and-agent-rendering-options-2026-08-08.md) | GFM、Milkdown、CodeMirror、Streamdown 及 Agent Webview Markdown renderer 对比 |
| 2026-08-17 | [`agent-skill-prompt-migration-audit-2026-08-17.md`](agent-skill-prompt-migration-audit-2026-08-17.md)                         | Pi 迁移 owner 边界、当前 Prompt/Skill 清单、长素材与文档保存缺口及开源参考    |

## 写作要求

- 记录调研日期、来源、版本或观察时点，以及尚未通过本仓库验证的不确定性。
- 区分上游宣称、代码/依赖事实和 OpenNeko 运行证据。
- 不把 spike、benchmark、命令输出或临时判断写成 Accepted 架构事实。
- 结论进入实现前链接对应 `openspec/changes/<change>/`。
