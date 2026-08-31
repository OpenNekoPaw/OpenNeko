## Why

OpenNeko 当前把产品协议、Workspace/Character 上下文和角色行为混入同一种动态上下文，而 DSH 默认 system persona 仍面向 coding agent；这使“谁有权指示 Agent、指令作用于哪个会话、哪些内容只是数据”缺少可验证的产品边界。个人助手指令也已有配置形态却没有 canonical 注入路径，继续叠加文本会扩大越权、串域和不可观测失败风险。

## What Changes

- 建立单一 Prompt authority 模型，明确区分不可变产品 system policy、精确会话作用域的可信指令、用户可编辑的环境/助手指令，以及不可信运行数据。
- 由 DSH 统一组装真正的 system prompt；OpenNeko 提供产品 persona、通用产品协议和精确 Session policy，不再把这些内容伪装成 runtime data，也不建立第二套 Prompt composer。
- 将 Workspace 指令收敛为 DSH canonical `AGENTS.md` 发现语义，只影响对应工作目录；Workspace 文件内容不得授予 Tool、权限、Host authority 或跨 Workspace 访问。
- 将个人助手指令建模为 Assistant Space 的持久用户事实，只注入该 Space 拥有的 Assistant Conversation，不影响 Workspace、Character、Room 或其他 Assistant Space。
- 将 Character 提示拆分为 Chara 从精确模式、CharacterVersion 和知识/行为边界生成的可信角色 policy，以及仍按不可信数据处理的角色事实、连续性、关系、RoomView 和外部证据。
- 提供不泄露正文的 Prompt composition provenance 和局部诊断，使产品能够验证实际生效的层、来源、顺序和作用域。
- **BREAKING**：无作用域的通用“自定义系统提示词”不再拥有全局 system authority；既有用户内容必须保留可见，并在用户明确分配到个人助手作用域前保持不生效。
- **BREAKING**：移除 OpenNeko 私有的个人/项目 `AGENTS.md` 路径和重复加载路径，只保留 DSH canonical 工作目录发现路径。

## Capabilities

### New Capabilities

- `scoped-agent-prompt-authority`: 定义 System、Workspace、Personal Assistant 与 Character 四类 Prompt 来源的 owner、authority、精确作用域、组合顺序、数据隔离、失败语义和可观测验收。

### Modified Capabilities

无。

## Impact

- DSH bridge 继续拥有默认 Prompt 组装适配，并需要使用 DSH 的 system section、runtime context、AGENTS 和 Skill 公共契约表达不同 authority。
- Agent application/session owner 负责将精确 Conversation binding 解析为单一 scoped policy 与数据投影；Workspace/Assistant/Character 之间不得共享隐式 active context。
- Chara domain 负责角色模式、知识边界和行为约束的可信 role policy；Character 内容与 continuity 仍由 Chara 作为领域事实拥有。
- Assistant Space 与本地用户设置 authority 负责个人助手指令的持久化、编辑、失效展示和显式重新分配；Provider 设置不再拥有 Prompt authority。
- Desktop Main 只在 Electron trust boundary 组合上述 owner 并将 secret-free composition facts 投影给评测或诊断；Renderer 不参与 Prompt 拼接或权限判定。
- 受影响的运行边界包括 pinned DSH preset/profile、真实 Desktop Session assembly、Prompt composition evaluation，以及 Workspace、Assistant 和 Character Conversation 的端到端行为。
