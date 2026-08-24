## Why

设置是短时修改 Desktop 偏好的辅助操作，不应替换、卸载或重定向用户当前正在使用的创作、管理或 Agent Scene。当前实现把设置建模为 Host-owned Scene，打开后会替换当前 Main composition，与期望的 overlay 语义不符。

## What Changes

- **BREAKING** 将设置从 Host Scene 改为当前 Window 的 Renderer-owned overlay；打开、分组切换和关闭不再发送 Scene transition。
- 原子移除 `settings` Scene context、`settings-main`/`settings-navigation` surface ref 与 `open-settings` intent，避免保留第二条成功路径。
- overlay 使用共享 Dialog primitive，包含遮罩、焦点约束、Escape/关闭按钮和内部设置导航。
- overlay 不显示额外的 Settings 顶部标题区；Dialog 标题与说明只保留为无障碍语义，视觉内容从分类导航和当前设置分组直接开始。
- 窄 overlay 自动收敛导航和设置行，保持控件可达且不横向溢出。
- Agent 模型设置把对话 Provider 与生成 Provider 作为两个直接目录呈现；每个目录拥有自己的新增入口，不再套用总 Provider 面板，也不生成“待配置 Provider”兜底分组。
- Provider 的模型族归属由 canonical Provider 配置持久化；已有未声明归属的 Provider 只从其 authoritative 模型事实与协议能力生成当前投影，不写入第二份 Renderer 分类状态。
- 自定义 Provider 可从详情中显式删除；删除继续由 Host authority 校验 builtin、关联模型与凭据清理，Renderer 不直接修改配置或密钥。

## Capabilities

### New Capabilities

- `desktop-settings-responsive-presentation`: 定义 Settings Window overlay 的所有权、信息层级、响应式与主题表现。

### Modified Capabilities

无。

## Impact

- `apps/neko-desktop/src/renderer`（Desktop Window overlay presentation owner）：拥有 overlay 的打开、当前分组和关闭状态；背景 Scene 保持 mounted 且 identity 不变。
- `@neko/host/application-settings` 继续拥有 preference projection、更新与 Agent 配置入口；Provider 模型族归属、独立新增与删除通过同一 canonical typed request/ConfigManager/credential authority 路径完成。
- `@neko/host` Desktop Scene contract/service 删除 Settings Scene 组合路径；Settings 不形成 durable record、Scene、Workbench instance 或 retained Root。
- canonical settings consumer 仍是 `DesktopSettingsSurface`；不新增设置 session、fallback 或 alternate save path。
- 用户偏好不迁移、不重置；被替代路径是 Host Settings Scene、独立 left dock/main 组合及其 transition。
