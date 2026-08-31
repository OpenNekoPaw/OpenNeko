# Prompt Package Guide

## 中文指南

明确目标模型或 Tool 的角色、必需输入、每个引用的单一角色、一个可直接使用的提示词/操作意图、必要参数或负向约束、预期输出、可观察验收和入选结果的下一个消费者。只保留所选能力和任务相关细节，保留用户事实与引用角色，不伪造缺失输入。只有用户要求或比较本身是交付物时才生成变体、平台语法、镜头矩阵或参数扫描；单个提示词保持为可复制代码块和简短用法说明。没有明确消费者的分析不进入提示词包。

## English guidance

Identify the target model or Tool role, required inputs, one directly usable prompt or operation intent, necessary parameters or negative constraints, the expected output, and acceptance checks.

Also name each reference's single role and the next consumer of an accepted result. Exclude analysis without a named consumer.

Include only details relevant to the selected capability and task. Preserve user-provided facts and reference roles; do not fabricate unavailable inputs. Generate variants, platform-specific syntax, shot matrices, or parameter sweeps only when requested or when comparison is the deliverable.

Use a compact field table only when several prompts or model bindings need exact mapping. A single prompt should remain a copyable block with brief usage notes.
