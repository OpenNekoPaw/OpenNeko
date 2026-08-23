## Context

Generation owner 在创建 workspace/application job owner 时从同一 ConfigManager 解析 Provider、credential 和 `default_models`。Settings 只需要安全修改该事实。

五层分析：ConfigManager 验证 default binding，generation owner 消费；Renderer 不参与路由；typed contract 按 model type 精确更新；未来可增加新媒体类型而不改变 Provider authority；测试断言唯一 generation resolver 路径和类型不匹配拒绝。

## Decisions

### 1. 使用现有 default_models

图片、视频、音频分别写入 `default_models.image|video|audio`。不增加 generation settings 文件或 UI-local default。

### 2. 类型必须精确匹配

更新前验证 Provider/Model 启用且 `model.type` 与目标类型一致。缺失或非法绑定返回明确 diagnostic，不选择其他模型。

### 3. 只影响后续执行

默认值用于之后创建/路由的 generation 请求；已存在 job、产物和运行 owner 不被重写。

## Runtime Boundary

- Owner: `@neko/host/settings` ConfigManager.
- Producer: model-settings projection.
- Consumer: Settings overlay and canonical generation provider resolver.
- Canonical path: TOML `default_models` only.
- Replaced path: none; no parallel generation configuration.
- User-data impact: explicit default reference update only.
