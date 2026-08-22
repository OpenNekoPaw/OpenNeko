## Context

OpenNeko 的模型设置由 Host settings owner 管理，Desktop DSH provider runtime 是把该产品配置转换成第三方 `llm-pi-ai` profile 的 concrete adapter。DSH 已提供 `maxRequestImageBytes`，超限时只在请求 materialization 阶段将最旧图片替换为固定提示，不改变 durable Session log。

## Goals / Non-Goals

**Goals:**

- 为所有 OpenNeko DSH provider route 设定可测试、统一的请求级图片预算。
- 保留最近图片的模型可见性并避免 durable 数据修改。

**Non-Goals:**

- 不限制用户在 Session 中可保存的图片总数。
- 不按 locator、文件类型或 provider 创建平行图片路径。
- 不替代 DSH 的 offload、attachment store 或 compaction。

## Decisions

### 1. 预算设为 12 MiB base64 payload

OpenNeko 将 `maxRequestImageBytes` 固定投影为 `12 * 1024 * 1024`。真实多图样本的 9 张成功图片合计约 9.14 MiB base64，12 MiB 保留一次同类分析的最近工作集与一定余量，同时比 DSH 默认 20 MiB 更早移出旧图片。该值不是 token 门禁；真正 token 占用仍由 DSH `contextPressure` 表达。

### 2. Desktop 只拥有第三方 profile adapter

应用组合根不判断图片、会话或上下文业务结果。`desktop-dsh-provider-runtime` 只在 Host settings → DSH provider-specific profile 的真实 adapter 边界添加字段；请求组装、超限选择和 placeholder 由唯一 DSH `llm-pi-ai` adapter 拥有。

Canonical path 是 Host provider/model settings → Desktop DSH profile projection → `llm-pi-ai` route → DSH request materialization。不存在 OpenNeko 侧 secondary offload 或失败后 provider fallback。

## User Data and Failure Semantics

- 预算不删除、修改或迁移 Session log、图片 attachment、ContentLocator 或源文件。
- 配置字段非法时 DSH profile load fail-visible；OpenNeko producer test 固定保证正整数。
- 单个 provider 无法投影时沿用现有 provider-local diagnostic，其他 route 保持可用。
