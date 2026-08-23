## Why

图片、视频和音频生成已经通过 generation runtime 使用 canonical Provider config，但 Settings 无法查看或修改各生成类型的默认模型。

## What Changes

- 在 Agent/模型设置中独立展示图片、视频、音频生成模型选择。
- 将选择写入现有 `default_models.image|video|audio`，由 generation provider resolver 消费。
- 只允许选择类型与能力匹配、启用且 Provider 可用的模型；缺失配置明确显示，不 fallback。

## Capabilities

### New Capabilities

- `desktop-generation-model-settings`: canonical generation 默认模型管理。

## Impact

- `@neko/host/settings` 增加经过验证的 type-default update；generation runtime 和 provider resolver 不增加第二条路由。
- Desktop Settings 只渲染/提交 typed model ref。
- 不修改已有 generation jobs、产物或 workspace 数据。
