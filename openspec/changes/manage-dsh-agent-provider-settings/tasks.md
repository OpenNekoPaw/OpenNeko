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
- [x] 2.8 移除 Provider 汇总卡片与外层展开包装，直接展示能力分组目录并保持具体 Provider 表单按需打开。

## 3. Verification

- [x] 3.1 运行 host/Desktop focused tests、DSH profile tests、typecheck、OpenSpec 和 diff check。
- [x] 3.2 用真实 Electron 验证密钥不回显、Provider 保存、默认模型和错误展示；真实 API 路径不可用时明确记录 infrastructure-blocked。

## 4. Local Providers And Safe Removal

- [x] 4.1 扩展严格 settings contract，投影本地来源与免凭据状态，并增加精确 Provider/model 删除命令；配置文件预置元数据不得进入 Renderer projection。
- [x] 4.2 将 canonical Ollama Provider 投影到设置目录，并通过唯一 DSH profile materializer 映射其 OpenAI-compatible 本地执行端点。
- [x] 4.3 在 Host owner 中拒绝删除仍有模型的 Provider 和默认模型；所有 config-backed Provider 均可删除，成功后清理精确 Provider credential。
- [x] 4.4 在 Provider/model 卡片中展示本地/云端标识与按需删除确认，不增加第三种能力分组。
- [x] 4.5 运行 focused contract/service/runtime/UI 测试、Agent Evaluation key-free gate、typecheck、OpenSpec 与真实 Electron 验收；真实 Electron 新场景因共享开发进程占用启动锁明确记录为 blocked。
