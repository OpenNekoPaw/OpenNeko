## 1. Host Model Settings

- [x] 1.1 定义严格的 Provider/LLM projection 与 mutation contract，响应不得包含 secret。
- [x] 1.2 实现复用 ConfigManager 和 ProviderCredentialAuthority 的 application service，并补唯一配置路径和 fail-local 测试。

## 2. Desktop And UI

- [x] 2.1 接入 sender-bound Main/preload bridge，并保留高级配置入口。
- [x] 2.2 实现 Provider 列表、编辑/API Key、模型目录与新会话默认对话模型 UI，显示重启边界。

## 3. Verification

- [x] 3.1 运行 host/Desktop focused tests、DSH profile tests、typecheck、OpenSpec 和 diff check。
- [x] 3.2 用真实 Electron 验证密钥不回显、Provider 保存、默认模型和错误展示；真实 API 路径不可用时明确记录 infrastructure-blocked。
