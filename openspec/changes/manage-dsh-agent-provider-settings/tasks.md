## 1. Host Model Settings

- [x] 1.1 定义严格的 Provider/LLM projection 与 mutation contract，响应不得包含 secret。
- [x] 1.2 实现复用 ConfigManager 和 ProviderCredentialAuthority 的 application service，并补唯一配置路径和 fail-local 测试。

## 2. Desktop And UI

- [x] 2.1 接入 sender-bound Main/preload bridge，并保留高级配置入口。
- [x] 2.2 实现 Provider 列表、编辑/API Key、模型目录与新会话默认对话模型 UI，显示重启边界。
- [x] 2.3 将对话模型与生成模型明确分组，并把 Provider/模型目录改为按需展开的渐进式配置。
- [x] 2.4 移除独立默认模型选择区，在模型目录卡片中标识并切换各类型默认模型。
- [x] 2.5 合并 Provider 与模型管理入口，实现 Provider-scoped 表单、高级字段按需展开及局部模型目录。
- [x] 2.6 移除重复的 Agent 高级设置区块，将 canonical 配置入口放入标题栏，并将 Provider 内的对话/生成模型响应式分为左右两组。
- [x] 2.7 从 Provider 列表层按 canonical 模型能力派生对话、生成、多能力和待配置分组；宽布局左右排列且不得复制多能力 Provider。

## 3. Verification

- [x] 3.1 运行 host/Desktop focused tests、DSH profile tests、typecheck、OpenSpec 和 diff check。
- [x] 3.2 用真实 Electron 验证密钥不回显、Provider 保存、默认模型和错误展示；真实 API 路径不可用时明确记录 infrastructure-blocked。
