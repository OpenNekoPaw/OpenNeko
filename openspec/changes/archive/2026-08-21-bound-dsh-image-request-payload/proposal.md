## Why

DSH 会把历史图片重新编码到后续模型请求中。官方 provider adapter 默认允许 20 MiB base64 图片载荷；在 OpenNeko 的文档/漫画分析场景里，这会让大量历史图片在自动 compaction 的 80% 阈值前持续进入活动请求，增加请求体、视觉 token 与成本压力。

## What Changes

- 在 OpenNeko 生成的 DSH `llm-pi-ai` provider profile 上设置统一的活动图片请求载荷预算。
- 预算只约束每次 provider request 的 base64 图片载荷，超过时沿用 DSH 官方 oldest-first offload 语义；不删除 durable Session 图片和 locator。
- 增加 profile producer 测试，证明所有 OpenNeko 投影的 provider route 使用同一 canonical budget。

## Capabilities

### New Capabilities

- `dsh-image-request-payload-budget`: 定义 OpenNeko DSH provider route 的活动图片请求载荷边界。

### Modified Capabilities

无。

## Impact

- `apps/neko-desktop` 的 DSH provider-specific profile materialization adapter。
- DSH 官方 `llm-pi-ai` 继续拥有请求组装与 oldest-first offload；OpenNeko 不实现替代路径。
- 不改变 Webview UI、Content locator、ReadImage、Session durable storage 或用户文件。
