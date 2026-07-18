# NekoAgent

> AI 大脑：接收自然语言意图，分发创作指令

## Context Summary

- 项目：OpenNeko - VSCode 创意工作套件
- 架构：Extension Host (Agent/Platform) + Webview (React 对话 UI) + Terminal TUI (Ink) / headless tools
- 详细架构：[ARCHITECTURE.md](./ARCHITECTURE.md)

## Quick Reference

- **职责**：自然语言 → 多模型 LLM 推理 → 工具调用 / AI 生成 API
- **入口**：`packages/extension/src/index.ts`（Extension）；Terminal TUI / headless 产品位于 `../../apps/neko-tui/src/tui/cli.tsx`
- **子包**：`agent`（运行时）、`platform`（LLM 路由）、`extension`（VSCode 宿主）、`webview`（对话 UI）
- **依赖**：`@neko/agent`、`@neko/platform`、`@neko/shared`
- **激活依赖**：neko-engine、neko-tools、neko-preview

## Architecture

```
用户自然语言输入
  │
  ├─ VSCode ──→ Webview (React) ──postMessage──→ Extension Host
  │                                                  │
  └─ Terminal ──→ Ink TUI / headless tools ──────────┤
                                                     │
                                               @neko/agent
                                          ReAct: Think → Act → Observe
                                                     │
                                    ┌────────────────┼────────────────┐
                                    │                │                │
                             @neko/platform    ToolRegistry      SkillSystem
                           (多模型 LLM 路由)   (内置/MCP/扩展)   (技能注入)
                                    │
                        ┌───────────┼───────────┐
                        │           │           │
                     Claude      OpenAI      Google/Ollama/Generic
```

### 包结构

```
packages/
├── agent/      # @neko/agent — Agent 运行时（零 VSCode 依赖，TUI/Extension 复用）
│   ├── executor/     ReAct 循环引擎（think-phase + act-phase + hook-runner）
│   ├── session/      Agent 会话生命周期 + 事件转换
│   ├── skill/        技能系统（SkillService + 3-track 原子注入 + ToolGuard + 显式技能激活）
│   ├── tools/        工具注册 + 双层注入（always/dynamic）+ 元工具
│   ├── mcp/          MCP Client（Stdio/HTTP）+ 工具桥接
│   ├── context/      分层上下文管理 + token 预算 + 对话压缩
│   ├── permission/   工具权限（plan/ask/auto 三模式）
│   ├── hooks/        可组合中间件（ExecutorHooks + factory）
│   ├── hook-loader/  Settings-based hooks（.neko/hooks 仅用于弃用诊断）
│   ├── prompt/       SystemPromptComposer + Builder（多语言）
│   ├── runtime/      统一 runtime bootstrap 契约 + helper
│   ├── plan/         Plan 管理器
│   ├── input/        InputProcessor（@ 文件引用解析）
│   ├── subagent/     子 Agent 委托
│   ├── task/         后台任务管理 + 持久化
│   ├── validation/   输出验证器（Image/Output/Mermaid/JSON/Length）
│   ├── memory/       项目记忆（.neko/memory.md）+ recall / extraction
│   ├── commands/     内置斜杠命令处理（help/status/clear/config/skills/tools/plan 等）
│   └── errors/       统一错误类型
├── platform/   # @neko/platform — AI 服务平台
│   ├── llm/adapter/  7 个 LLM 适配器（Anthropic/OpenAI/Google/Azure/Ollama/Generic + AI-SDK）
│   ├── config/       ConfigManager（用户配置 + 工作区 MCP 合并）+ 首次运行默认值
│   ├── media/        媒体生成服务（8 个适配器：Runway/Luma/MiniMax/Suno/Vidu/Midjourney/LibLib/OpenAI-compat）
│   ├── provider/     ProviderRegistry（适配器路由）+ PlatformError（错误分类）
│   ├── service/      IService 门面 + ModelSelector + PromptManager + ToolRegistry
│   └── core/         BaseRegistry + HttpClient + ConcurrencyPool
├── extension/  # @neko-agent/extension — VSCode 扩展宿主（纯胶水层）
│   ├── bootstrap/    服务初始化 + ServiceCollection
│   ├── chat/         ChatViewProvider + Webview 消息 Router + 专用桥接 Handler
│   ├── chat/message/ AgentMessageTurnHandler + AgentTurnBridge + AgentStreamProcessor
│   ├── ai/           AgentRunner（薄包装）+ AgentManager（runtime 多会话池）
│   ├── services/     ConfigBridge + SkillFileService + HookFileService
│   ├── editor/       EditorModel + EditorRegistry
│   └── tools/        扩展工具注册（NekoCut/NekoCanvas 桥接）
└── webview/    # @neko-agent/webview — React 对话 UI
│   ├── components/   ChatView + ContentBlocks 时序渲染 + SettingsView
│   ├── handlers/     消息处理注册（streaming/tool/conversation/config）
│   ├── hooks/        Zustand 状态管理（多会话隔离）
│   ├── messages/     type-safe postMessage 构建器
│   ├── config/       预设配置
│   └── i18n/         国际化
```

`apps/neko-tui` 拥有 Ink 组件、TUI adapter/store/hook、Commander 命令、Node host composition、debug automation、测试和 executable；它通过以上公共 package 复用 host-neutral Agent/runtime 能力。

## TUI/Webview 工作区共享边界

Webview/Extension 与 Terminal TUI/headless 是不同本地宿主，功能差异需要保留：Webview 可以拥有 VS Code API、`postMessage`、Webview URI、watcher、memento/recovery 和 Extension command；TUI/headless 可以拥有 Ink 终端交互、进程生命周期、stdout/stderr 报告和真实 API 验证 lane。

共享的是同一工作区的业务逻辑和数据面，而不是 UI 表现。Webview 和 TUI 必须通过共享 runtime/config/catalog/task/cache contract 使用以下输入：`~/.neko/config.toml`、`.neko/config.toml`、workspace-scoped canonical conversation id、`~/.agents/skills`、`~/.neko/commands`、`.agents/skills`、`.neko/commands`、`~/.neko/neko.db` 中按 `workspaceId` 分区的 Task/Run、conversation/catalog 和 ResourceCache metadata、project memory、AGENTS overlays、context settings、授权读根，以及 `.neko/.cache/resources` 下的 project cache artifact bytes。运行时模型/参数选择只影响当前 session，不自动重写 TOML；`skillsDir` 之类非标准 Skill 来源不能让 TUI/headless 单独看到不同 catalog。

Host-private 能力不互通，也不能伪装为共享成功结果。VS Code handle、Webview URI、Extension-private cache、memento/recovery、TUI process handle、终端键盘状态和 headless 报告路径跨宿主请求时必须返回 host-private 或 unavailable diagnostic，不允许 no-op、转成普通 prompt、读取另一端私有缓存或回退旧实现。旧 `cli-*` conversation id 不作为 TUI resume 兼容输入；共享 command catalog 的 surface scope 使用 `tui` / `extension`。

## 多模型支持

Neko Agent 只使用本地用户配置：`~/.neko/config.toml` / 环境凭据 / 运行时导入凭据，支持 `direct`、`gateway`、`local` 分组。provider 缺失、模型不属于 provider、provider 未配置或模型无能力时，对话直接返回可见错误，不会选择首个模型或硬编码默认值。

Provider 配置区分连接模式和协议 profile。`type` 仍用于 adapter 路由，`connectionKind` 只用于区分中转、本地和官方直连路径。自建或第三方 endpoint 仍按实际路径配置为 `gateway` 或 `direct`，不会被自动转换到 NewAPI 网关。

| 连接模式  | MVP 状态     | 配置方式                           | 说明                                                                                                                                        |
| --------- | ------------ | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `gateway` | MVP          | 用户配置 `neko-gateway` + `newapi` | NewAPI 中转，需要显式配置 endpoint 与凭据。                                                                                                 |
| `local`   | MVP          | `ollama-local` + `ollama`          | 默认聊天入口。本地私有 LLM，无需 API key；需要本地服务地址。                                                                                |
| `direct`  | 显式配置支持 | 官方厂商 API                       | DeepSeek、GPT、Claude、Gemini、GLM 等官方直连按显式 `type` / `protocol_profile` 调用。默认预设和 provider-specific 参数仍需逐项验证后扩展。 |

**LLM 视觉理解**：不是所有 LLM 的强需求。文本聊天只要求 `chat` 能力；图像理解/多模态工作流必须选择声明了 `vision` 能力的模型。

**中转协议**：MVP 只把 NewAPI 作为默认中转协议。OneAPI/OpenRouter/SubAPI 等作为后续 profile/preset 支持，除非已有 adapter、参数映射和测试。

**生成模型**：MVP 通过 NewAPI gateway 配置图片、视频、音频和音乐模型；Suno、Seedance、Kling、GPT image 等具体模型是否可用取决于 gateway 暴露的能力。未配置 endpoint/凭据的 gateway 不会被路由为可用 provider。官方直连和本地生成模型运行时进入 Roadmap。

**模型展示**：Webview 按配置文件中的 provider 顺序分组展示模型；每组内部按 `llm`、`image`、`video`、`audio` 类型分开。音乐生成模型归入 `audio`，通过 `text_to_music` 等模型元数据表达用途；Neko 内部用途注册表会把它绑定到 `audio.music.generate` 产品用途。对话选择器隐藏空分组，配置/设置视图可以显示空 provider 并带诊断。

**模型选择**：对话运行时保留显式请求的 provider/model source identity；provider/model 不匹配或缺少所需能力会在 runner 配置前失败。文本聊天只要求 `chat` 能力，图片理解要求 `vision`，生成工作流要求对应生成能力。Webview 不提供全局 `auto` 选项，也不会用空 provider/model 清除或覆盖默认值；若用户显式配置 `custom-gateway:auto`，它只是普通模型 ID。

**Composer 级 Agent 模型配置**：Agent 输入框中的模型、推理深度、回复详略和创造性 preset 只作用于当前会话/turn，不会自动写回用户 TOML。Agent 模式右侧先切换要配置的模型类型（LLM/图片/视频/音频，只有已配置模型的类型才展示），再显示该类型的模型选择和参数；图片、视频、音频直生成模式只显示本类型模型和参数。普通 Agent turn 当前只使用 `primary` LLM 槽位；`fast`、`deep`、`summarizer`、`vision` 是预留合同，未被当前 runtime 支持时会返回可见诊断。自定义 provider 缺少能力元数据时默认采用保守控制，详见 [模型默认值配置指南](./docs/media-model-configuration.md#agent-composer-llm-配置)。

**模型默认值**：在 `~/.neko/config.toml` 中通过 `default_models.<type>` 为 LLM 和生成模型配置默认模型：

```toml
[default_models.llm]
provider_id = "ollama-local"
model_id = "ollama-local-llama3.2"

[default_models.image]
provider_id = "neko-gateway"
model_id = "neko-gateway-gpt-image-2"

[default_models.video]
provider_id = "neko-gateway"
model_id = "neko-gateway-seedance-lite"

[default_models.audio]
provider_id = "neko-gateway"
model_id = "neko-gateway-tts"
```

每个配置值显式绑定 `provider_id + model_id`。`default_models` 服务于产品模型选择器和直接媒体入口；Agent turn 会把主模型与 `default_model_purposes` 的显式绑定一次性归一化为扁平、不可变的 purpose snapshot。生成、理解等语义工具不会从 broad type 默认、首个兼容模型或 `agent.main` 推断缺失 purpose；缺少 provider/model/capability/credential 时直接返回可见错误。`ModelConfig.type` 字段（`llm` / `image` / `video` / `audio`）只控制目录分组。`capabilities` 继续描述模型能力，`agent.main`、`image.generate`、`video.generate`、`audio.music.generate` 等则是平铺的产品用途；二者不构成 fallback 层级。

**配置格式**：`config.toml` 是当前唯一读取的用户配置文件。旧的 `~/.neko/config.json` 不再作为运行时输入、迁移源或冲突诊断来源；如需保留旧配置，请手动迁移为 TOML。

## 核心概念

### 执行模式

| 模式   | 行为                                                      | 场景       |
| ------ | --------------------------------------------------------- | ---------- |
| `plan` | 生成计划后展示，逐步批准执行                              | 高风险操作 |
| `ask`  | 只读工具自动执行；写入、Shell、生成和外部副作用需用户确认 | 需要监督   |
| `auto` | 按规则自动执行工具                                        | 可信操作   |

### 技能系统

从 `.agents/skills/<name>/SKILL.md` 或 `~/.agents/skills/<name>/SKILL.md` 加载技能（YAML frontmatter + Markdown body），3-track 原子注入/移除：

| Track | 注入内容                                                  |
| ----- | --------------------------------------------------------- |
| A     | Skill prompt content section（SystemPromptComposer）      |
| B     | 权限允许规则（PermissionHooks）                           |
| C     | 机器可读 tool policy（ToolGuard，运行时 `isToolAllowed`） |

显式输入触发被拆成独立命名空间：

| 前缀     | 用途                                                                                       | 示例                                   |
| -------- | ------------------------------------------------------------------------------------------ | -------------------------------------- |
| `/`      | Agent、Host、Plugin 命令，以及 `.neko/commands/*.md` 命令工件                              | `/help`, `/status`, `/commit fix typo` |
| `$`      | 显式激活 Skill，按 canonical Skill name/id 分发到 Skill 注入路径                           | `$quality-review changed files`        |
| `@`      | 文件、素材、实体或上下文引用                                                               | `@scene.md`                            |
| 自然语言 | 普通对话输入，由 Agent 通过 `GetContext` 查看 Skill catalog 后自主判断是否 `ActivateSkill` | `帮我审一下这次修改`                   |

`/skills` 是 Skill 管理命令，用于查看、检查 active Skill 或清除 active Skill；直接应用某个 Skill 使用 `$skill-name`。普通 `.agents/skills/<name>/SKILL.md` 不再自动生成 `/skill` 入口，即使旧 frontmatter 里仍带 `command` 字段也只视为 prelaunch migration 元数据。需要 `/command` 体验时，应把提示词写成 `.neko/commands/<command>.md` 命令工件；命令工件复用 Skill 注入 runtime，并显式标记为 `entryPointKind: "command-artifact"`。

命令工件支持参数插值（`$ARGUMENTS`, `$1-$99`）。`$skill args` 会把尾随参数传给现有 Skill 注入路径；若存在同名 `/review` 命令和 `$review` Skill，前缀决定命名空间，二者不会互相兜底。

自然语言不会经过 Extension/Webview 关键词触发或代码侧候选路由，也不会在 Agent reasoning 前注入 Skill prompt、切换 active Skill、改变 model override 或 tool policy。用户新增 Skill 想让 Agent 更稳定地理解其用途，应在 `SKILL.md` frontmatter 中提供 Agent-readable 的 `description`、`domain`、`mediaWorkflow.useCases`、`nonGoals`、`inputArtifacts`、`producedArtifacts` 和 `operations`；详见 [`docs/skill-authoring.md`](docs/skill-authoring.md)。

Skill Markdown 正文只描述领域方法、创作语义、输出标准和示例；具体工具协议、命令参数、轮询/任务协议、资源授权、缓存/Webview/path 协议和子包 authoring lifecycle 归系统提示词、子包 capability prompt、tool schema 或 runtime catalog。

### 工具系统

- **所有工具始终可见**（1M context，无需动态注入）
- **元工具**：`GetContext` / `ActivateSkill` / `DeactivateSkill` — AI 自主发现和激活技能
- **来源**：内置 typed tools、MCP 服务器、扩展工具（NekoCut/NekoCanvas）和受管 External Processor
- **本地命令边界**：普通创作 Agent 不默认注入任意 `Bash`/shell。图片、视频、音频和脚本类本地工具通过 External Processor manifest、PathAccessPolicy、env allowlist、approval 和 `ResourceRef` 输出进入运行时；Developer Mode 的一次性命令也走同一策略，不生成持久 `Bash(*)` allow。
- **资源交接**：Agent Webview、Canvas、Storyboard 和 `neko-composite` 传递图片时使用 `ResourceRef`、`documentResourceRef`、source ref、workspace-relative path 或 `${VAR}/path`。Webview URI、blob/object URL、系统 temp、旧 `cachePath` 和 `.neko/.cache/resources` 下的实体路径只属于 runtime/display，不作为 durable identity。

### Package Authoring Transfer

Agent/plugin transfer 只选择能力和投影诊断，不直接调用领域 Webview 私有命令。生成媒体或分镜要写入保留的项目格式时，planner 输出 canonical package authoring command，并通过 host-neutral transfer adapter 执行：

| 目标                          | Canonical command                                                              |
| ----------------------------- | ------------------------------------------------------------------------------ |
| Cut generated clip            | `neko.cut.authoring.importGeneratedClip`                                       |
| Cut storyboard / Canvas draft | `neko.cut.authoring.importStoryboard` / `neko.cut.authoring.importCanvasDraft` |

Transfer payload 必须携带结构化 `target`、`reveal`、stable source/ref 和 provenance。命令返回 `ok: false` 时，Agent/Extension/TUI/Electron adapter 展示 diagnostic，不允许打开隐藏 Webview 或声称发送成功。

### Workspace Board 投影

Agent core 不保存 Canvas destination、会话 Board binding、Board index/scope、delivery runtime 或 Cut target。它只观察普通 Tool/Task/result、diagnostic 与 Approval；VS Code Host 将已声明的 creator-visible typed result 交给 owning capability。

Canvas projector 在没有显式目标时只写 `neko/boards/workspace.nkc`，显式目标则是调用方提供的普通 `.nkc`。它不读取活动/最近 Canvas、会话或文件名相似度。Markdown、稳定文件引用和已由 generated-output owner 保存到 `neko/generated/<kind>/` 的图片/音频/视频会成为顶层普通内容节点；稳定内容 revision 跨 delivery 去重，已证明的素材依赖显示为普通 Canvas connection。Inbox、Task 和 Run 不创建视觉 Group，AssetLibrary promotion 仍是可选整理动作，不是 Board 持久化前置条件。

推理、日志、provider scratch、未选搜索结果、runtime/cache handle 和失败中间态不会成为节点。投影冲突单独返回 diagnostic，生成结果仍可恢复且不改投其他 Canvas。显式历史/外部内容仍可使用 owning Import/Add Source；专业 Storyboard 继续要求明确 authoring intent 和 Canvas validator。

### Canvas 能力边界

`@neko/agent` 不拥有 Canvas creative run、work item、prompt/judge adapter、媒体调用、候选应用或 UI 生命周期。Canvas extension 在领域内解析 typed action、执行生成与评审，并通过 Canvas-owned apply adapter 写回候选。

Agent 只消费 Canvas Capability Provider 投影出的通用 Tool/schema；这允许 Agent 在用户对话中调用 Canvas 工具，但不会把 Canvas 的直接 UI 动作迁入 Agent。应用组合层只向 Canvas 注入 `purpose -> semantic request/result` 的窄端口，Canvas 不接收 Pi 对象、chat message、provider/model/credential 或 token/temperature 参数。

### MCP 集成

支持 Stdio 和 HTTP 两种传输协议，配置在 `~/.neko/config.toml` 或 `.neko/config.toml`（工作区）。

## 文档格式支持

NekoAgent 支持读取多种文档格式用于 AI 内容分析和视频生成工作流：

### 支持的格式

| 类型          | 格式                                               | 说明                                                                |
| ------------- | -------------------------------------------------- | ------------------------------------------------------------------- |
| **文本文档**  | PDF, DOC/DOCX, MD, TXT, Fountain, HTML, JSON, YAML | 提取文本和结构信息                                                  |
| **电子书**    | EPUB                                               | 提取章节文本；图像型 EPUB 返回受管图片资源引用和图片元数据          |
| **漫画档案**  | CBZ, CBR                                           | 提取图片页面、受管 `ResourceRef` 及宽高/MIME/大小信息供 AI 视觉分析 |
| **网页内容**  | URL (HTTP/HTTPS)                                   | 抓取网页主要内容                                                    |
| **演示/表格** | PPT/PPTX, XLS/XLSX                                 | 读取文本/表格数据，提取内嵌图片                                     |
| **专业剧本**  | Final Draft (FDX)                                  | 影视行业标准格式                                                    |

解析由扩展内部库完成，不要求创作者安装 Python、unzip、unrar 等外部命令行工具。图片页基础元数据通过 `ReadDocument.imageInfo` 返回，Skill 不应再调用外部命令探测尺寸。文档图片缓存对上层透明：跨包传递使用结构化 `imageInfo.resourceRef` / `documentResourceRef`，统一 documents resource cache 负责按需物化、MD5 去重和缓存重建。

### 法律声明

- **仅支持 DRM-free 内容**（DRM 保护的文件会被拒绝）
- 用户必须拥有文件的合法使用权
- 不支持盗版内容或未授权分发
- 本工具仅用于本地内容处理，不分发内容

详细文档：[DOCUMENT_FORMATS.md](./DOCUMENT_FORMATS.md)

## 开发

```bash
pnpm build:neko-agent       # 构建（extension + webview）
pnpm test                   # 运行测试
pnpm check                  # 代码质量检查
```

**调试**：

- Extension Host：项目 Logger / VS Code 输出面板
- Webview DevTools：`Cmd+Shift+P → Developer: Open Webview Developer Tools`
- Terminal TUI/headless：直接终端输出

## 测试

- 61 test files / 1192 tests（Vitest v4）
- 测试覆盖：executor、skill system、context、permission、validation、tools
- 已知：extension 3 files / 21 tests 历史失败（非 Vitest v4 引起）
