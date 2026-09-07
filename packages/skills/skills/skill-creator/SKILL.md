---
name: skill-creator
description: '使用 DSH 原生布局、frontmatter、调用策略和可选资源创建或改进可复用 Skill；用于 Skill 设计、编写、验证与评审。'
whenToUse: '用于 DSH Skill 编写和 package 评审；普通一次性任务不需要此 Skill。'
---

# Skill 编写

## 中文方法

创建聚焦、可复用且不约束无关任务的 DSH Skill。保持用户任务意图，并以当前 Tool catalog、schema、permission 和 Host authority 作为执行边界。

1. 使用原生目录 `<name>/SKILL.md` 或 flat `<name>.md`；资源使用相对路径并保留无关用户内容。
2. frontmatter 必须有小写 kebab-case `name` 和能区分能力与触发条件的简短 `description`；只按真实意图使用 DSH 支持的可选字段，不新增 OpenNeko 私有 manifest/schema。
3. 主体保留共同目的、关键判断和路由；长流程、schema、示例或领域变体进入按需资源，不创建占位目录或重复指令。
4. 同时定义正向和负向真实请求，按需要验证发现、加载、scope、调用策略和复杂行为。
5. 目录/flat、多 Skill 组合及四种 model/user 调用组合均有效；不得强制主 Skill、固定数量、artifact 前置或通过正文授予 Tool 权限。

flat Skill 的资源共享所属根目录，应使用避免冲突的相对路径。仅按预期语义保留受支持的 `whenToUse`、`metadata`、`disable-model-invocation` 和 `user-invocable` 字段。开放性任务优先描述结果与判断条件，易错的确定性工作才提供精确步骤或脚本。

通过当前可用的 DSH 原生编写或文件系统入口验证，并确认精确作用域内的目录发现与加载结果。报告变更包、验证证据和剩余不确定性；没有对应运行结果，不声称已发布、已发现或已执行。
