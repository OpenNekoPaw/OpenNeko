## Context

Desktop 已有独立的 Agent Entry、Project Management、Workspace、Character Management 与 Character
Interaction Scene，也有 canonical Agent first-submit transaction。现有实现额外在 Agent Webview 中保存
`experienceMode`，并在模式点击时修改 Draft binding，形成了 Window 导航与业务 authority 的平行状态。

本变更把入口模式收敛为 Window Scene navigation：Scene 是唯一事实，selector 只是 projection。Agent
Webview 不再决定用户要进入哪个领域，也不保存一份可与 Scene 不一致的模式状态。

### 五层分析

| 层   | 结论                                                                                                                      |
| ---- | ------------------------------------------------------------------------------------------------------------------------- |
| 职责 | Desktop Window navigation 选择可见 Scene；Agent Draft 只负责输入与首次提交；Project/Chara/World 各自拥有领域 authority。  |
| 依赖 | selector 只依赖公开 Scene contract 与 typed transition intent；不访问文件系统、Draft binding 或领域事实。                 |
| 接口 | 复用现有 Scene intents；以纯 presenter 完成 `Scene → mode` 与 `mode → intent/disabled reason` 投影，不新增持久 contract。 |
| 扩展 | World 只有在 owner 提供 exact Scene intent 后才能原子启用；不得注册默认 handler 或 prompt fallback。                      |
| 测试 | presenter、Desktop composition、host parser/service、Agent Webview 删除断言与真实可见 UI 共同证明唯一导航和提交路径。     |

## Goals / Non-Goals

**Goals:**

- 在入口与管理 Scene 顶部提供 `助手 | 工作区 | 角色 | 世界` 中性 segmented selector。
- 让 Assistant、Project Management、Character Management 之间只通过 typed Scene intent 导航。
- Workspace 必须通过 Project Management 显式选择 Project 或授权目录，模式点击本身不授予 authority。
- 删除 Agent Webview 内重复的模式、旧入口 action 与死 Scene intent。
- 保持输入、页面布局和后台任务不被导航或 Agent 流式输出锁定。
- 保持唯一 first-submit transaction 与精确 Scene handoff。

**Non-Goals:**

- 不实现 World Scene、WorldRun 或 Character/Room 新 runtime。
- 不新增 Home Session、Workbench registry、mode snapshot 或隐藏 mounted Root。
- 不把 Project/Character/World identity 保存到 Window selector。
- 不改写 Agent execution mode、provider 配置或 Workspace grant 生命周期。

## Decisions

### 1. 当前 Scene 是模式的唯一事实源

入口模式不持久化，也不进入 Agent Draft snapshot。Desktop 由当前 Scene 投影选中项：

| 模式   | Scene                    | 点击行为                          |
| ------ | ------------------------ | --------------------------------- |
| 助手   | unbound Agent Entry      | `open-agent-entry`                |
| 工作区 | Project Management       | `open-project-management`         |
| 角色   | Character Management     | `open-character-management`       |
| 世界   | 尚无 authoritative Scene | disabled + owner-qualified reason |

selector 只在上述入口/管理 Scene 可见。Conversation、Project Workspace、Character Interaction 等真实
业务 Scene 不显示 selector；返回对应入口后再由 Scene 恢复选中态。不存在保存/恢复 mode 的第二事实源。

### 2. 工作区入口先选择项目，再进入 Workspace

点击“工作区”只进入 Project Management，不调用 Agent `bindTarget`，也不读取 active/current/recent Project。
用户显式选择已有 Project 后，`open-project-workspace(projectId)` 解析精确 Project authority 与 grant；
用户也可以在 Project Management 显式选择目录，Host 授权后通过 `open-workspace(workspaceGrantId)` 组合
Workspace Scene。Workspace 内的 Agent Draft 从该 Scene 的 exact scope 获得 binding。

因此输入框不需要为“工作区模式缺少项目”做跨领域验证：没有项目时用户仍在 Project Management，选择
失败只在该管理 Scene 局部显示。raw path、grant 和 Project facts 不进入 selector presentation。

### 3. Agent Entry 只有 Assistant canonical path

unbound Agent Entry 表示 Assistant 起点。它保留 textarea、引用、模型配置与 `计划 | 审批 | 自动`执行
模式。首次提交继续使用 application service 的原子顺序：

1. 验证 Draft、资源与配置；
2. materialize Conversation；
3. 将精确 Conversation attach 到当前 Scene；
4. 启动 provider execution。

删除 Webview 的 `entryAction`、experience presenter、mode switch binding 和 snapshot field。不得通过旧
`start-chat`、`roleplay`、`bind-agent-assistant` 或测试专用 handler 成功。

### 4. Character 可导航，World 明确不可用

“角色”进入已有 Character Management；选择具体 Character 后走 Chara-owned typed interaction intent。
World 尚无 authoritative Scene，因此 selector 中禁用并提供明确说明。disabled 项不发出 intent、不创建
Agent Conversation，也不编码 prompt。未来启用必须同一次更新 owner contract、producer、consumer 与测试。

### 5. selector 属于稳定 Window title region

Desktop 将 selector 组合进 `ControlledWorkbenchShell` 的 title region，使用共享 `SegmentedControl` 的
neutral appearance。真实 Project Workspace 继续使用现有 Workspace title controls；两者不叠加。窄窗口
允许容器收缩，四个 label 仍保持可辨识与键盘可访问。

### 6. 导航不拥有 runtime 生命周期

点击模式只更新当前 Window scene。它不会删除 Conversation、停止后台 task、重绑已创建实例或保存隐藏
Root。离开 Scene 后旧业务 Root 卸载；运行中 task 仍由 Agent application/session owner 按精确 identity
继续。任何单次 transition 失败只显示局部 diagnostic，不使 Shell 或其他记录不可用。

## Replaced Paths

- 删除 Agent Webview `experienceMode` state/snapshot/presenter/selector。
- 删除模式点击调用 `bindTarget` 的路径。
- 删除 Home `start-chat | roleplay` 旧 action 分支。
- 删除未使用的 Host `bind-agent-assistant` Scene intent 和 Agent launch bridge `bind-assistant`
  operation 及其 handler。
- 不保留 feature flag、compatibility parser、dual render 或旧 snapshot fallback。

## Risks / Trade-offs

- **Workspace 多一步目标选择：** 这是获得精确 authority 的必要显式步骤；Project Management 提供最近项、
  搜索、打开项目和目录授权，避免在 Agent composer 内复制 chooser。
- **World 暂时禁用：** 比跳转到无 owner 的通用聊天更准确；启用条件在 UI 中可见。
- **管理 Scene 与业务 Scene 的 selector 可见性不同：** 这是入口导航而非全局 tabs；避免暗示正在运行的
  Workspace/Conversation 可被无损“换模式”。
- **共享控件新增外观：** 使用向后兼容 props，默认外观和现有 consumer 不变，并补公共组件测试。

## User Data And Runtime Boundaries

本变更删除非 authoritative mode snapshot，不迁移或重写 Draft 输入、Conversation、Project、Character 或
其他 durable data。Scene transition 失败不会清理 catalog；Project 无效时继续由 Project owner 保持记录
可见并给出 diagnostic。Agent first-submit 失败不创建 Conversation，已存在后台任务不受入口导航影响。
