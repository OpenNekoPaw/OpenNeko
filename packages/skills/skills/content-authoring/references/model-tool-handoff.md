# Model and Tool Handoff Guide

## 中文指南

每个执行能力只提供交接与验收所需内容：当前步骤中的角色、用户输入或授权引用及其单一用途、可直接使用的提示词/操作意图、预期产物或状态、可观察验收检查，以及入选结果的下一个消费者。不附加不进入调用、验收或下游的背景解释。

声称执行前必须确认当前 availability、schema、model binding 和 permission。明确区分拟议指令、已提交、等待中和已确认结果；阻塞时报告确切缺失能力或决定和最小下一步，不静默切换 provider，也不枚举无关替代项。

## English guidance

For each capability that will perform work, provide only what is needed to execute and verify the handoff:

- its role in the current step;
- the user inputs or authorized references it needs;
- a directly usable prompt or operation intent;
- the expected artifact or state;
- an observable acceptance check.
- the next consumer of an accepted result.

Do not append background explanation that does not enter the call, acceptance, or downstream handoff.

Confirm current availability, schema, model binding, and permission before claiming execution. Clearly distinguish proposed instructions, submitted work, pending work, and confirmed results. If blocked, report the exact missing capability or decision and the minimum next action; do not silently switch provider or enumerate unrelated alternatives.
