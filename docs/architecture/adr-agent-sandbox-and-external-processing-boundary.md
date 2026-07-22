# ADR: Agent 沙箱与外部处理器边界

状态：Accepted
日期：2026-06-23
范围：`neko-agent` 工具执行、文件访问、外部图片/视频处理器、用户脚本、Market/Skill 能力注入、Webview 资源投影。

本文记录 OpenNeko 对 Agent 沙箱、外部命令和用户处理器接口的稳定决策。它补充 [`agent.md`](agent.md)、[`cache-file-access-and-paths.md`](cache-file-access-and-paths.md)、[`webview-media-security.md`](webview-media-security.md) 与 [`marketplace.md`](marketplace.md)。

## 背景

OpenNeko 是本地 VS Code 创作工具，不是通用 coding agent。Agent 的核心任务是分析图片/文档、生成分镜、驱动 Canvas/Timeline/Asset/Engine typed tools，并把产物保存为可审计的资源引用。图片、视频、音频和脚本处理又确实需要接入 FFmpeg、ImageMagick、Blender、Python 脚本、ComfyUI、RIFE、Real-ESRGAN 等外部工具。

如果把外部处理能力直接暴露为任意 `bash -c`，Agent 可以读取任意本机绝对路径、继承 host 环境变量、写入系统临时目录或返回 Webview 不能投影的路径。这会绕过 Neko 已有的资源协议、CSP、`localResourceRoots`、Host-private derived storage 和项目事实路径约束。

近期图片问题暴露了同一类边界：文档图片先从系统 temp 路径展示，随后被 Webview CSP/local resource root 拒绝。修复路径是由 Host 内容层保存派生物并只投影稳定 locator，而不是让 Webview、Agent 或 processor contract 消费任意本机路径或 cache root。

## 外部参考

Codex 和 Claude Code 的沙箱设计提供了可参考的边界模型，但 Neko 不应照搬 coding agent 的任意 shell 工作流。

| 系统        | 公开模型                                                                                                                                                                                                                                                                                   | 对 Neko 的启发                                                                               |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| Codex       | 本地 CLI/IDE 使用 OS-enforced sandbox，默认网络关闭，`workspace-write` 限制写入 workspace；云端使用隔离容器；approval policy 负责越界审批；permission profiles 用 `read`/`write`/`deny` 描述文件系统和网络边界。参考 OpenAI Codex Agent approvals/security、Sandboxing、Permissions 文档。 | 沙箱必须作用于 spawned commands，不只作用于内置文件操作；资源边界和审批边界是两件事。        |
| Claude Code | 内置 sandboxed Bash tool 只限制 Bash 命令及其子进程；built-in file tools、MCP servers、hooks 默认仍运行在 host 上；若要完整隔离需把整个 Claude Code process 放入 sandbox runtime、container 或 VM。参考 Claude Code Sandboxing、Sandbox environments、Permissions 文档。                   | 仅沙箱化 Bash 不等于完整 Agent 沙箱；必须明确哪些能力被 sandbox 覆盖，哪些仍需 host policy。 |

参考链接：

- OpenAI Codex Agent approvals/security: <https://developers.openai.com/codex/agent-approvals-security>
- OpenAI Codex sandboxing: <https://developers.openai.com/codex/concepts/sandboxing>
- OpenAI Codex permissions: <https://developers.openai.com/codex/permissions>
- Claude Code sandboxed Bash tool: <https://code.claude.com/docs/en/sandboxing>
- Claude Code sandbox environments: <https://code.claude.com/docs/en/sandbox-environments>
- Claude Code permissions: <https://code.claude.com/docs/en/permissions>

## 决策

Neko Agent 采用“产品级资源/工具沙箱优先，执行级沙箱分阶段”的策略。

### 1. 普通创作 Agent 默认不暴露任意本地命令

普通创作模式不得默认注册或自动允许 `Bash(*)`、`sh -c`、`zsh -c`、`python script.py` 这类任意命令入口。执行本地命令、删除覆盖、外部网络、native plugin、未信任 Market capability 都是高风险能力，必须有明确 trust、policy 和 approval gate。

Agent 应优先调用 typed domain tools：

- 文档/图片读取：`ReadDocument`、`ReadImage`。
- Canvas/Timeline 修改：typed intent 或领域工具。
- 媒体生成和转码：`neko-engine`、media provider adapter 或受管 external processor。
- 产物交付：`ResourceRef`、artifact transfer、workspace-relative path 或 `${VAR}/path`。

### 2. 所有文件类工具必须进入统一 PathAccessPolicy

文件读取、目录列举、搜索、写入、图片/文档加载、外部处理器输入输出都必须经过统一路径授权。授权来源包括：

| Root                                   | 默认访问                        | 用途                                             |
| -------------------------------------- | ------------------------------- | ------------------------------------------------ |
| Workspace root                         | 读，按工具/审批写               | 项目文件、用户明确纳入项目的素材                 |
| `.neko/.cache/resources`               | 读写                            | Agent 运行时资源、生成图像、文档页图、处理器输出 |
| Extension `globalStorageUri/resources` | 读写受限                        | 无 workspace 时的 extension 私有运行时资源       |
| `neko/assets/<libraryName>`            | 读；link 管理由 Assets 显式操作 | 工作区 direct link 下的媒体库；不暴露物理 target |
| Provider/Engine descriptors            | 只通过 token/descriptor 访问    | 大型媒体、Range、stream、preview                 |

未授权绝对路径必须 fail-visible。不能把系统 temp、Downloads、Desktop、任意 `/Users/...` 或 `/tmp` 当作隐式可访问来源，也不能把 `asWebviewUri(...)`、`file:` URL、runtime token 或 cache path 写入长期项目事实。

媒体库 direct link、workspace-relative path 和 Host guard 规则以 [`asset-library.md`](asset-library.md#link-与安全边界) 与 [`cache-file-access-and-paths.md`](cache-file-access-and-paths.md#工作区-link-安全边界) 为准。`allowedInputRoots=["mediaLibrary"]` 只表示可读取通过 `neko/assets/<libraryName>/...` 声明且由当前 Host guard 授权的 source，不等于任意本机外部目录白名单，也不会向 processor 投影物理 target。

沙箱对工作区和媒体库的影响必须按 intent 精确控制，而不是一刀切阻断：

| 区域                                             | 默认读   | 默认写     | 说明                                                                      |
| ------------------------------------------------ | -------- | ---------- | ------------------------------------------------------------------------- |
| Workspace                                        | 允许     | 受控允许   | 项目文件、领域项目和明确产物；敏感路径、secret、`.git` 等应按 policy deny |
| `.neko/.cache/resources`                         | 允许     | 允许       | Agent、文档页图、生成图像和 processor 默认输出区                          |
| Media library roots                              | 允许     | 默认不允许 | 作为参考、输入和预览来源；写入必须显式 Create Asset / Promote / Link      |
| Extension `globalStorageUri/resources`           | 允许     | 受控允许   | 无 workspace 时的 extension 私有运行缓存，不写项目事实                    |
| 系统 temp / Downloads / Desktop / 未声明绝对路径 | 默认拒绝 | 默认拒绝   | 必须经用户选择、导入、配置变量或 Create Asset 进入受管路径                |

External Processor 的输入 root 与输出 ownership 分开建模：

| 输入 root                   | 默认访问                    | 用途                                          |
| --------------------------- | --------------------------- | --------------------------------------------- |
| `workspace`                 | 可读                        | 项目 source；写入仍由领域 writer 授权         |
| `mediaLibrary`              | 可读                        | 通过 workspace link guard 授权的媒体库 source |
| `extensionPrivateResources` | builtin/session policy 可读 | Host 私有 source，不是项目事实                |

| 输出 ownership | 生命周期                    | 用途                                                                |
| -------------- | --------------------------- | ------------------------------------------------------------------- |
| `intermediate` | 可重建、可 GC               | 链路中间结果                                                        |
| `debug`        | 按 debug policy 保留后可 GC | 失败诊断与重试证据                                                  |
| `candidate`    | 用户接受前可 GC             | 待确认的创作候选                                                    |
| `promoted`     | durable owner 管理          | 已由 generated output、package、project 或 export writer 接收的结果 |

Processor manifest 的输入/cwd root alias 枚举为 `workspace`、`mediaLibrary`、`extensionPrivateResources`；`resourceCache` 不再是公开 root，也不得出现在 input、output 或 cwd contract。输出由 Host 根据 ownership 分配内部路径并返回 `ProcessorOutputLocator`。跨包交付必须由 owning workflow 显式 promote 到 durable `ContentLocator`，不能把 Host 内部输出路径或 locator 的存在等同于已保存。

因此媒体库是可读来源，不是默认 scratch 区。processor 或 Agent 需要把结果复制到媒体库时，必须经过 Host 授权 writer，保存 `neko/assets/<libraryName>/...` locator 并触发 projection 刷新；不得写绝对 target、分配 Asset ID 或创建 catalog membership。

Agent、Webview、Canvas 和 Storyboard 的图片交接必须分清 stable identity 与 runtime display：

| 字段/形态                                                                | 允许进入长期 payload | 用途                                                                                                                             |
| ------------------------------------------------------------------------ | -------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `ResourceRef` / `cacheResourceRef` / `documentResourceRef`               | 是                   | 受管资源身份；Canvas、Storyboard、Composite artifact 和工具引用优先传递这些结构化引用。                                          |
| `ProcessorOutputLocator`                                                 | 否（promotion 前）   | processor chain 的短生命周期 opaque identity；可作为下一 processor 输入，但不得作为项目事实或 durable source。                   |
| workspace-relative path / `${VAR}/path`                                  | 是                   | 已纳管 source；由 Host 解析和授权。                                                                                              |
| 当前消息投影中的 `renderUri` / `src` 或 `display.runtimeOnly` diagnostic | 否                   | 当前 Webview 展示或诊断；不能复制到 Canvas、剪贴板稳定引用或项目事实。Host 内部 materialized path 不进入 Webview/Agent payload。 |
| legacy `cachePath`                                                       | 否                   | 只允许作为迁移/诊断 metadata；新 payload 写出前必须剥离。                                                                        |
| `/tmp`、`/var/folders/...`、Downloads、Desktop、`file:`、blob/object URL | 否                   | 未纳管或会话态路径；作为 Agent/Webview/Canvas/storyboard 成功路径时必须返回 diagnostic。                                         |

`neko-agent` 工具结果引用 JSON 使用 `protocolVersion: 2` 时，durable body 只放结构化 resource/source refs；当前 Webview 展示所需的 `renderUri`/`src` 只存在于 Host 投影后的消息或组件状态，不能进入复制引用、Canvas payload 或项目事实。从旧会话、剪贴板或工具结果恢复数据时，presenter 必须剥离 `cachePath`，并在缺少结构化引用时降级为文字诊断，而不是把运行时路径当作图片身份发送给 Canvas 或生成分镜。

### 3. 外部工具通过 ExternalProcessor manifest 暴露

用户确实需要接入外部图片、视频、音频和脚本工具，因此 Neko 提供受管 External Processor 接口，而不是提供任意 shell。

External Processor manifest 描述固定可执行入口、参数模板、输入类型、输出 ownership、授权输入/cwd root、环境变量、网络需求、超时、资源限制和审批策略。Manifest 不自证 trust；trust 由 registry source、Market 签名、用户显式启用、workspace trust 和 policy 共同投影。

Processor manifest 的 canonical 存储格式是 JSON，与 Market manifest、VS Code `package.json` contributes 和 Agent Capability manifest 的工具链保持一致。TOML/YAML 只能作为未来可选的作者体验输入，进入 registry 前必须转换为同一个 JSON contract；runtime 不维护多套 manifest schema。

```json
{
  "schema": "neko.externalProcessor",
  "schemaVersion": 2,
  "id": "upscale-image",
  "kind": "external-processor",
  "displayName": "Real-ESRGAN Upscale",
  "version": "1.0.0",
  "entry": {
    "executable": "${TOOLS}/realesrgan-ncnn-vulkan",
    "args": ["-i", "${input.image}", "-o", "${output.image}", "-s", "${params.scale}"]
  },
  "inputs": {
    "image": { "accepts": ["image/*"] }
  },
  "outputs": {
    "image": {
      "produces": ["image/png"],
      "ownership": "candidate",
      "pathHint": "generated"
    }
  },
  "params": {
    "scale": { "type": "number", "allowed": [2, 4] }
  },
  "policy": {
    "requiresApproval": true,
    "allowNetwork": false,
    "allowedInputRoots": ["workspace", "mediaLibrary"],
    "allowedOutputOwnerships": ["candidate"]
  },
  "envProfile": {
    "inherits": ["CUDA_VISIBLE_DEVICES"],
    "configured": ["PYTHONPATH"],
    "denySecrets": true
  }
}
```

Processor runtime 必须由 Host 分配输出路径。Agent 只得到 opaque `ProcessorOutputLocator`，processor 子进程只在单次执行参数中得到授权输入和 Host 分配的可写路径，二者都不能自行选择任意绝对路径。执行完成后返回 locator、ownership、diagnostic 和 provenance；只有 owning durable writer 的 promotion 返回可进入项目事实的 `ContentLocator`。schema v1 的 `resourceCache`/`allowedOutputRoots` manifest 必须 fail-visible，不做隐式兼容迁移。

Processor manifest 是能力声明，不是任意脚本扫描结果。发现与分发必须进入 registry/catalog，并与 Market、Skill 和 provider-card 的 trust 语义对齐：

| 来源范围         | 发现方式                                                                                                        | 投影到 AgentCapabilitySource     | Trust 投影                                                 | 约束                                                                      |
| ---------------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------- |
| Builtin          | owning package 或 Engine 显式注册                                                                               | `builtin`                        | `core`                                                     | 随代码发布，测试覆盖 schema、路径和输出资源                               |
| Project          | workspace `.neko/processors/*.neko-processor.json`                                                              | `local` + `sourceScope=project`  | 显式启用后最高为 `community`，否则 `untrusted`             | 仅当前 workspace 生效，必须可审计、可禁用；不自动成为团队信任             |
| Personal/local   | 用户通过 Settings/UI/CLI 显式添加 manifest 文件或目录，或托管到 `${NEKO_HOME}/processors/*.neko-processor.json` | `local` + `sourceScope=personal` | 显式启用后最高为 `community`，否则 `untrusted`             | 不自动分享，不进入其他 workspace；不做隐式 PATH/目录扫描                  |
| Market           | Market package install target 注册 processor capability                                                         | `market`                         | 使用 Market `trustLevel`，只能是 `community` / `untrusted` | 复用 Market manifest、版本、publisher、trustLevel、entitlement 和撤销机制 |
| Extension/plugin | 扩展贡献 processor capability                                                                                   | `plugin`                         | 由扩展来源和 policy 投影，不能自升为 `core`                | 只能通过 Extension Host registry 暴露，不由 Webview 直接加载              |

`project` 和 `personal/local` 是来源范围，不是新的 trust level。Capability Protocol 的 trust 仍只有 `core`、`community`、`untrusted`。Policy 判断必须同时看 `sourceScope`、`AgentCapabilitySource`、`trustLevel`、workspace trust、用户启用状态和 processor risk；不能把 project/local 来源等同于可信，也不能让 Market 或 extension manifest 自行声明 `core`。

ExternalProcessorRegistry 是唯一把五类来源统一投影给 Agent runtime 的 contract。具体发现路径可以由 Extension Host、Market install target 或插件贡献，但它们都必须归一化为同一种 registration projection：

```ts
interface ExternalProcessorRegistry {
  upsert(
    source: ExternalProcessorSource,
    manifest: ExternalProcessorManifest,
  ): ExternalProcessorRegistration;
  unregister(selector: ExternalProcessorSelector, reason: string): ExternalProcessorRegistryChange;
  setEnabled(
    selector: ExternalProcessorSelector,
    enabled: boolean,
    reason: string,
  ): ExternalProcessorRegistryChange;
  list(context: ExternalProcessorRegistryContext): ExternalProcessorCatalog;
  resolve(
    id: string,
    context: ExternalProcessorRegistryContext,
  ): ExternalProcessorRegistration | ExternalProcessorDiagnostic;
  onDidChange(
    listener: (event: ExternalProcessorRegistryChange) => void,
  ): ExternalProcessorRegistrySubscription;
}

type ExternalProcessorSourceScope = 'builtin' | 'project' | 'personal' | 'market' | 'extension';
type ExternalProcessorRegistryChangeKind =
  'registered' | 'updated' | 'unregistered' | 'enabled' | 'disabled' | 'diagnostics-changed';

interface ExternalProcessorRegistration {
  readonly id: string;
  readonly registrationId: string;
  readonly version: string;
  readonly manifest: ExternalProcessorManifest;
  readonly sourceScope: ExternalProcessorSourceScope;
  readonly agentCapabilitySource: AgentCapabilitySource;
  readonly trustLevel: AgentCapabilityTrustLevel;
  readonly enabled: boolean;
  readonly locationRef?: string;
  readonly packageId?: string;
  readonly diagnostics: readonly ExternalProcessorDiagnostic[];
}

interface ExternalProcessorRegistryChange {
  readonly revision: number;
  readonly kind: ExternalProcessorRegistryChangeKind;
  readonly registrationId: string;
  readonly reason?: string;
}
```

`upsert` 是 register 和 update 的唯一写入口：同一 `registrationId` 的 manifest 版本升级、Market 更新、project 文件变更或 extension contribution 变化都产生新的 immutable registration snapshot，并递增 catalog revision。进行中的 processor invocation 持有开始时的 snapshot，不被中途修改；后续 invocation 使用新 revision。

`unregister` 用于 Market 卸载、用户删除 personal manifest、project processor 文件删除、extension deactivation 或插件卸载。`setEnabled(..., false, ...)` 用于用户禁用、policy block、撤销或诊断隔离，它保留 registration 与 diagnostics 以便 UI 展示和恢复。Agent runtime、管理 UI 和 approval UI 不读取来源目录或 Market install record；它们通过 `onDidChange` 收到 revision 变化后重新 `list/resolve`。事件只通知 catalog 变化，不自动注入 processor 或改变当前 Agent turn 的 tool policy。

Project processor 的项目发现路径确定为 `.neko/processors/*.neko-processor.json`。如果未来迁移到 `neko/settings.json` 或 Market-style project package，迁移层也只能产生同一 `ExternalProcessorRegistration`，不能引入第二套 catalog。

Personal/local processor 的 UX 必须是显式添加：Settings 项、命令面板、管理 UI 或 CLI 可以写入同一个用户级 registry 记录，并把路径保存为 `${NEKO_HOME}/...`、`${TOOLS}/...` 或其他已声明变量。Neko 不扫描用户 HOME、`PATH`、Downloads 或工具安装目录来自动发现 processor。

Processor catalog 可以投影给 Agent 作为只读能力清单，但注册不等于注入、不等于允许执行。Agent 仍需经过 permission policy、trust policy 和 approval gate。

Manifest version 和 schema 必须显式声明。未知 schema、缺少 version、未知 processor kind、未知 root alias 或非法参数模板应 fail-visible。Processor manifest、portable Skill package / Host overlay、Market manifest 和 provider-card 可以有各自领域字段，但 trust、permission、host requirement、install target 和 diagnostics 必须映射到共享 Capability/Market contract，不能各自发明互不兼容的权限字段。

环境变量不使用全量继承。Processor manifest 必须声明 env profile：允许从 host 继承的 key、可由用户配置的 key、运行时注入的 key，以及必须剔除的 secret key。常见 GPU/工具链变量可以通过 profile 复用，例如 `CUDA_VISIBLE_DEVICES`、`HIP_VISIBLE_DEVICES`、`VIRTUAL_ENV`、`PATH` 的受限段、`PYTHONPATH` 的受限段、`BLENDER_USER_SCRIPTS`。Profile 是 processor contract 的一部分，不能让 Agent 在运行时任意追加 env。

Env 策略采用“显式 allowlist 先行，Host secret denylist 后置覆盖”。`envProfile.denySecrets` 省略时按 `true` 处理，非 core processor 不能关闭 Host baseline secret policy。Host baseline denylist 是代码/产品策略的一部分，可以被用户或组织策略追加更严格规则，但不能被 Market、project 或 personal manifest 放宽。Baseline 至少拒绝 token、secret、password、credential、cookie、SSH agent、cloud provider credential 和常见 CI/registry token 形态，例如 `*_TOKEN`、`*_SECRET`、`*_PASSWORD`、`AWS_*`、`GITHUB_TOKEN`、`NPM_TOKEN`、`SSH_AUTH_SOCK`。未知 key 默认不继承；即使 key 出现在 `inherits` 中，只要命中 secret denylist 也必须返回 diagnostic。需要外部服务 credential 的能力应通过 Auth/provider adapter 或明确 secret handle 设计进入，不通过继承 host env 暗送。

Processor manifest 只描述单步原子处理能力，不描述 shell pipeline，也不允许 processor 在 manifest 内调用其他 processor。链式处理必须由 Agent workflow、Skill 编排或未来 typed workflow graph 显式创建多个 processor invocation：

```text
Input ContentLocator / authorized source
  -> ProcessorInvocation(remove-background)
  -> ProcessorOutputLocator(intermediate) + provenance
  -> ProcessorInvocation(upscale-image)
  -> ProcessorOutputLocator(candidate) + provenance
  -> ProcessorInvocation(style-transfer)
  -> Promote -> durable ContentLocator
```

每一步都独立经过 registry resolve、PathAccessPolicy、approval、env profile、output ownership 分配和 diagnostic 记录。Skill 可以帮助 Agent 规划链路，但 prompt chain 不能隐式取得权限，也不能把多个高风险处理器折叠成一个不可审计命令。跨 processor DAG、重试、缓存复用和批处理调度属于后续 workflow/execution ADR；本 ADR 只规定单步 processor contract 与显式编排边界。

链式 processor 的中间 `ProcessorOutputLocator` 由 Host output storage 管理生命周期，Agent 或 Skill 不直接读取或删除物理文件。每个 invocation 输出携带 `processorRunId`、`stageId`、attempt、processor registration revision 和明确 ownership：

| Ownership      | 默认来源                                      | 生命周期                                                                    |
| -------------- | --------------------------------------------- | --------------------------------------------------------------------------- |
| `intermediate` | 链路中非最终 stage 输出                       | run 完成后标记 releasable，可被 GC；不写项目事实                            |
| `debug`        | 失败、取消或用户要求保留诊断时的 stage 输出   | 保留到 debug TTL、用户清理或缓存预算触发 GC；用于重试和问题定位             |
| `candidate`    | 等待用户接受或 workflow 决策的最终 stage 输出 | 接受前仍属 Host-private derived storage，可按候选策略回收                   |
| `promoted`     | durable writer 已接收的输出                   | 返回新的 durable `ContentLocator`；原 derived 文件可被 GC，不影响已接收内容 |

链路成功时，非最终中间产物使用 `intermediate` 并可回收；最终展示给用户但未保存的产物使用 `candidate`。链路失败时，上游已成功的中间产物可按 `debug` policy 保留，方便重试和诊断；它们仍不是 durable project source。需要长期保存的结果必须显式 promote，不能靠内部文件存在或 locator 可解析表示已保存。

`processorRunId` 标识一次 processor workflow run，不等同于单个 Agent turn。一个 run 可以由用户消息、Skill execution、Agent workflow 或显式继续操作创建；若中途需要用户审批、确认或补充参数，后续 turn 必须携带同一个 `processorRunId` 继续同一 chain。`stageId` 在同一 run 内唯一，表示一次原子 processor invocation；重试同一 stage 应保留 `stageId` 并增加 attempt metadata，替换输出时更新 provenance。用户改变目标、重新规划链路或从中间结果创建新的独立任务时，必须创建新的 `processorRunId`，并用 parent run/resource provenance 连接。

Agent runtime 不直接调用文件系统或 ResourceCacheService 实现。它只规划 output ownership、传递 `ProcessorOutputLocator` 并请求 owning workflow promotion。Extension Host 的 `ExternalProcessorOutputStorage` 分配和解析内部路径；generated output、package、project 或 export writer 执行 durable ingest 并返回 `ContentLocator`。processor contract 不查询 cache status、manifest、root 或 GC，也不拥有 promotion 后的 durable source。

P0/P1 必须提供基础 GC 策略，不能等待完整 workflow engine 后再处理空间增长。默认 GC 由 Host 在 processor run 完成、失败/取消、derived stats 超过预算、extension 启动后扫描或用户手动清理时触发。回收顺序采用 LRU，以 Host ledger 的访问时间为依据；只能删除仍由 derived owner 管理的 intermediate/debug/candidate。promotion 已复制或写入 durable owner，原 derived 文件是否回收不影响 promoted content。TTL 和预算是产品配置/用户设置，缺省值可以按本地产品保守设定，但实现必须至少支持：

| 策略项            | P0/P1 要求                                                                      |
| ----------------- | ------------------------------------------------------------------------------- |
| Budget trigger    | project/global/extension-private cache 至少支持 max bytes policy                |
| LRU order         | 超预算时优先删除最久未访问且可重建的 `intermediate` variant                     |
| Debug retention   | 失败链路输出至少保留到 debug TTL 或用户清理；预算压力可回收但要保留 diagnostic  |
| Active protection | 当前 Agent turn、approval UI 或后续 processor input 正在引用的 locator 必须跳过 |
| Ledger after GC   | 删除文件后 locator resolve 必须 fail-visible，不能继续返回成功路径              |

### 4. 执行级沙箱分阶段引入

Neko 不以完整 OS 沙箱作为第一阶段目标。当前优先级是完整资源/工具沙箱；执行级隔离按风险渐进：

| 阶段             | 覆盖能力                                                                                     | 目标                                                                         |
| ---------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| P0 资源/工具沙箱 | 所有内置文件工具、读图读文档、artifact/resource projection、external processor manifest 校验 | 未授权路径不可读写，普通创作 Agent 无任意 Bash                               |
| P1 受管进程执行  | user-configured external processor                                                           | 限制 cwd、env allowlist、timeout、Host-owned output allocation、网络默认关闭 |
| P2 强执行隔离    | untrusted Market processor、第三方脚本、native plugin、批量自动处理                          | OS sandbox、container、VM 或独立 worker process                              |
| P3 组织/策略治理 | 团队共享 Market、受管配置、CI/批处理                                                         | 管理员 enforced policy、审计日志、不可被用户配置放宽                         |

在 P0/P1 阶段，如果 execution sandbox 不可用，高风险 processor 不得自动退回 host full access。缺少沙箱、缺少授权 root、未知 processor、非法 manifest 或路径越界必须返回 diagnostic。

### 5. Developer Mode 是显式逃生口

Developer Mode 可以允许本地命令和更宽的 processor 调试能力，但必须满足：

- 用户显式开启，不随普通创作模式默认启用。
- Developer Mode 不允许绕过 processor manifest 直接成为自由 shell；它只能放宽诊断、dry-run、verbose logs、local-only processor 测试和显式 one-shot command。
- One-shot command 必须作为临时 processor request 进入同一 PathAccessPolicy、env allowlist、cwd 限制和 approval path，不能变成可持久化 `Bash(*)` allow rule。
- `Bash(*)` 不能被永久 `allow always`。
- `cwd` 限制在 workspace 或显式授权 processor workdir。
- `env` 走 allowlist，默认不继承 credential、token、SSH、cloud provider secret。
- 网络默认关闭或按 domain allowlist 开启。
- 每次越界都进入 approval 或 fail-closed diagnostic。

## 常见诊断

实现和 UI 应直接展示 processor/resource diagnostic，不用静默 fallback 到旧 temp/cache 路径。常见 setup failure 的含义和建议动作如下：

| Diagnostic code                               | 触发条件                                                                                                                              | 用户/开发者动作                                                                                                                                             |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `missing-executable`                          | `entry.executable` 不能通过 manifest 或 configured alias 解析为绝对 Host 路径，或位于系统 temp、Downloads、Desktop 等禁止位置。       | 在 Settings/UI/CLI 配置 `${TOOLS}` 等变量或重新安装 processor；不要把临时下载目录作为 executable root。                                                     |
| `blocked-env-key`                             | manifest 显式 allowlist 了命中 Host secret denylist 的 key，例如 token、secret、password、SSH agent、cloud credential。               | 改用 Auth/provider adapter 或 secret handle；非 core processor 不得继承这些 host env。                                                                      |
| `unknown-env-key` / `unsupported-env-request` | env key 未声明、来源不在 `inherits/configured/runtime` 中，或 manifest 尝试关闭 secret deny policy。                                  | 把 GPU、Python、Blender、ComfyUI 变量加入明确 profile；不要使用全量 `process.env`。                                                                         |
| `unauthorized-path` / `invalid-cwd`           | input 或 cwd 落在未声明 root、系统 temp、Downloads、Desktop、未授权绝对路径，或 media library 被用作 cwd。                            | 把素材放入 workspace 或创建 `neko/assets/<libraryName>` link，或通过 Create Asset/Promote 进入受管路径；cwd 使用 workspace 或 Host 默认 processor workdir。 |
| `illegal-output-ownership`                    | manifest policy、output declaration、invocation binding 或 result locator 的 ownership 不一致，或 manifest 请求 `promoted` 直接输出。 | 使用 `intermediate`、`debug` 或 `candidate`；长期保存必须由 owning durable writer 执行 promotion。                                                          |
| `network-policy-unavailable`                  | manifest 要求 network disabled，但当前 runner 不能证明网络已隔离。                                                                    | 使用可执行网络隔离的 runner，或显式允许网络并走 approval/policy；不能回退到 host full network。                                                             |
| `non-portable-output`                         | output `pathHint` 是绝对路径、越界、带 `file:`/runtime URL，或 Host 无法分配内部输出。                                                | 只提供便携 file-name hint，由 Host 分配内部输出；最终持久化走 owning workflow promotion。                                                                   |
| `disabled-processor` / `untrusted-processor`  | 用户禁用、policy block、Market 撤销/未授权，或 trust level 不满足当前 Agent session。                                                 | 在 processor 管理 UI 查看来源、版本、publisher、trust 和 diagnostics；需要显式启用或重新安装。                                                              |
| `missing-output`                              | 进程完成但声明的 output slot 没有产生文件，或 GC 后 variant 已被标记 missing。                                                        | 检查 processor stdout/stderr、参数和输出模板；可重建资源应重新 materialize，debug output 只作为诊断线索保留。                                               |
| `execution-timeout` / `execution-failed`      | 进程超时、非零退出、被取消或 Host adapter 运行失败。                                                                                  | 调整超时/资源策略，或在 Developer Mode 通过同一 processor policy 做一次性调试。                                                                             |

## 架构边界

| 层                             | 职责                                                                                                                                             |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `agent-types`                  | 定义 processor manifest v2、invocation/result locator、ownership、tool permission projection 与 diagnostic contract。                            |
| `agent` runtime                | 做 tool orchestration、permission mode、approval request、processor capability injection；只传递 locator/ownership intent，保持 host-agnostic。  |
| ExternalProcessorOutputStorage | Extension Host 内部分配/解析 processor output，并把 promotion 委托给 owning durable writer；不向 Agent 返回物理路径。                            |
| Extension Host                 | 实现 PathAccessPolicy、processor output storage、processor execution adapter、durable writer binding、VS Code URI/FS 权限和 Webview projection。 |
| Host derived maintenance       | 管理可回收 processor output/representation 的 ledger、quota 与 GC；不拥有 promoted durable source。                                              |
| Engine                         | 处理内置高性能媒体、stream、Range、probe、transcode/export；不是任意 shell 代理。                                                                |
| Webview                        | 只展示 projected resource、approval UI、diagnostic；不构造本地路径，不直接访问 FS。                                                              |
| Market/Skill                   | 声明 trust、permissions、allowed tools、processor requirements；不能靠 prompt 文案取得权限。                                                     |

## 非目标

- 不把 Neko Agent 做成通用 coding agent。
- 不默认支持任意 shell、包管理器、git hook、系统扫描或本机自动化。
- 不把 Webview localResourceRoots 当作 Agent 文件访问授权。
- 不把系统 temp 作为文档图片、处理器输出或 Canvas/storyboard 传输的默认位置。
- 不用 prompt 文案替代 PathAccessPolicy、processor manifest、approval gate 或 OS sandbox。
- 不为单用户本地产品引入远程多租户服务治理。

## 后果

正向后果：

- 图片、分镜、Canvas、Timeline 和生成资产可稳定引用 `.neko/.cache/resources` 或正式资源。
- 外部工具可用，但以 typed processor 形式进入审计、重跑、审批和 diagnostic。
- 资源投影、文件访问和项目事实路径不再各自实现私有 fallback。
- Market/Skill 能力更容易做 trust 和 permission review。

代价：

- 用户接入自定义脚本需要写 manifest，不能直接粘贴任意命令。
- 部分高级用户需要 Developer Mode 或 processor setup 才能复用既有 shell workflow。
- P1/P2 执行沙箱需要处理跨平台差异，例如 macOS Seatbelt、Linux bubblewrap、Windows/WSL/container。
- Env profile 会带来维护成本。GPU、Python venv、Blender、ComfyUI 等工具需要常见 profile 模板，否则用户会频繁遇到“工具在 shell 能跑，在 Neko processor 不能跑”的落差。

## 风险与待澄清项

| 项目                      | 风险                                                                                                                                                                             | 后续收敛要求                                                                                                                                                                                                                                                                       |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Registry 实现漂移         | 即使 ADR 已定义单一 `ExternalProcessorRegistry` projection，project、personal、Market、extension 的发现代码仍可能绕过 registry 直接注入 processor。                              | 所有来源只能写入 `ExternalProcessorRegistration`；Agent runtime 只读取 registry/catalog projection，不读取来源目录、Market install record 或 extension contribution 原始结构。                                                                                                     |
| Registry lifecycle        | Market 卸载、project 文件删除、personal manifest 移除、extension deactivation 和版本升级如果没有统一事件，Agent/UI 可能继续使用 stale processor。                                | Registry 必须用 `upsert`、`unregister`、`setEnabled` 和 `onDidChange` 管理生命周期；进行中的 invocation 使用启动时 snapshot，后续 invocation 使用新 revision。                                                                                                                     |
| Project/personal UX       | `.neko/processors/*.neko-processor.json` 和用户级 `${NEKO_HOME}/processors/` 已确定为初始入口，但 UI/CLI 仍可能暴露不一致的添加、禁用和诊断体验。                                | Settings、命令面板、管理 UI 和 CLI 必须共用同一用户级 registry 记录；不得扫描 HOME、`PATH`、Downloads 或工具安装目录。                                                                                                                                                             |
| Extension private input   | `extensionPrivateResources` 若被普通 project processor 使用，可能扩大可读范围。                                                                                                  | 该 alias 只允许 builtin/session policy 显式授权的输入或 cwd；它不是 output ownership，也不能成为 durable source。                                                                                                                                                                  |
| Manifest 格式迁移         | Canonical JSON 已确定；如果未来提供 TOML/YAML 作者输入，可能引入多 schema validator 或行为差异。                                                                                 | TOML/YAML 只能是转换输入，转换后必须落同一 JSON contract；runtime、Market install target 和测试只以 JSON contract 为准。                                                                                                                                                           |
| Market 对齐               | Provider-card、Skill Host projection 和 Market package 已有 trust/capability 语义，processor 若独立扩展会破坏能力治理。                                                          | Market processor package 必须复用 Market install target、publisher、trustLevel、version、entitlement、revocation 和 diagnostics，并映射到 Capability Protocol 的 `core` / `community` / `untrusted`。                                                                              |
| 链式编排边界              | 用户需要 remove background、upscale、style transfer 等链式工作流；如果 Skill 或 processor 把链路折叠成 shell pipeline，会失去逐步审批和 provenance。                             | 链式处理必须由 Agent workflow、Skill 显式规划或未来 typed workflow graph 创建多个 processor invocation；每一步独立 registry resolve、approval、output ownership 分配和 diagnostic。                                                                                                |
| 中间资源生命周期          | 链式处理成功或失败后，opaque output 如果没有 ownership/lifecycle，会导致空间膨胀；如果立即删除，又会破坏重试和调试。                                                             | 中间输出必须带 ownership、run/stage/provenance；intermediate/debug/candidate 可 GC，长期保存必须显式 promote 到 durable owner。                                                                                                                                                    |
| Host output owner         | 如果 Agent runtime 直接操作输出文件或各 processor 自行实现 cleanup，会重新出现路径泄漏和 GC 不一致问题。                                                                         | Agent runtime 只传 locator/ownership；Extension Host output storage 负责物理分配和 resolve，durable writer 独占 promotion。                                                                                                                                                        |
| GC 策略调优               | 不同项目规模、processor workflow 和磁盘容量会让预算与 TTL 需要产品化调优。                                                                                                       | processor output 必须纳入 Host derived maintenance；GC 只删除 intermediate/debug/candidate，不能把物理 derived 文件当作 durable ownership。                                                                                                                                        |
| Processor run scope       | 如果 `processorRunId` 只按 Agent turn 生成，跨 turn approval/继续执行会丢失链路 provenance；如果无限复用，又会让无关任务互相污染。                                               | `processorRunId` 表示一次 processor workflow run，可跨 turn 继续；目标改变或重新规划必须新建 run，并通过 parent provenance 关联。                                                                                                                                                  |
| Env allowlist 粒度        | 过严会让 ComfyUI、CUDA、Python venv、Blender 脚本不可用；过宽会泄露 token、SSH、cloud credential。                                                                               | 提供可复用 env profile 模板，并把 secret denylist 作为 Host policy，不允许 Market manifest 放宽。                                                                                                                                                                                  |
| Secret denylist 漏网      | `denySecrets: true` 如果只靠少量命名模式，可能漏掉非标准 credential；如果可被 manifest 关闭，会破坏沙箱边界。                                                                    | Host baseline denylist 必须作为不可被非 core manifest 放宽的 policy；未知 env 默认不继承，命中 secret pattern 的 allowlist entry 也返回 diagnostic。                                                                                                                               |
| Developer Mode 边界       | 若允许绕过 manifest 直接执行，本 ADR 会退化成“普通模式禁 Bash，开发模式全开”。                                                                                                   | Developer Mode 只能创建临时 processor request；所有路径、env、network、cwd 和 output ownership 仍走同一 policy。                                                                                                                                                                   |
| TempFileService 迁移      | 当前仍存在 package-local temp service；即使不再使用 `os.tmpdir()`，消费者也可能把临时产物当作可展示资源或项目事实。                                                              | 所有面向 Agent/Webview/Canvas/storyboard 的中间产物必须进入 `.neko/.cache/resources` 或 extension `globalStorageUri/resources`。TempFileService 只允许用于 owner package 内部短生命周期 scratch，不能作为 resource handoff。                                                       |
| Workspace ignore 简化     | Agent 文件工具会参考 `.gitignore` 与受管目录隐藏规则，但当前不是完整 gitignore interpreter；`!` negation 不会重新授权已隐藏路径。                                                | 这是保守的沙箱边界：`.gitignore` 只能收窄 Agent 可见范围，不能扩大授权。需要让 Agent 读取的文件应放入 workspace 可见路径、Media Library 授权根或由 Host 投影的受管 ResourceRef，而不是依赖 gitignore negation。                                                                    |
| PathAccessPolicy 实现收敛 | Agent core file tools 和 Extension Host external processor 需要不同 diagnostic 与 root alias 语义，但 forbidden path 与 root-contained 判定不能漂移。                            | 共享最低层纯路径判定 helper（forbidden unmanaged path、inside authorized roots），上层仍由 `CoreFileAccessPolicy` 和 `ExternalProcessorPathAccessPolicy` 分别负责各自的 root projection、diagnostic 和 tool contract。                                                             |
| Discovery bootstrap 覆盖  | Processor 五来源 discovery 如果只验证 registry DTO，而不验证 Extension activation/Market install target/command/event 链路，后续可能出现 catalog 已实现但未接入 runtime 的断层。 | Extension activation 必须创建 `ExternalProcessorRegistryService`、绑定 `externalProcessorRuntime`、注册 Market processor install target 并启动 refresh；测试需覆盖 project/personal/market 扫描、Market uninstall、extension contribution register/dispose 和 registry lifecycle。 |

## 验证要求

实现或修改相关能力时至少覆盖：

- 普通创作 Agent 默认无法调用 `Bash` 或任意 shell command。
- `Read`、`Grep`、`ListDirectory`、`ReadImage`、`ReadDocument`、`Write` 对未授权绝对路径返回 fail-visible diagnostic。
- 普通 `Read`、`Grep`、`ListDirectory`、`Write` 默认隐藏 `.neko/.cache`、`.neko/logs`、`.neko/tmp` 等 managed runtime 目录；`ReadImage`、`ReadDocument` 不按路径豁免 cache，只能通过结构化 `ResourceRef`/`DocumentArchiveResourceRef` 让 Host 内部统一内容访问服务物化受管资源。
- `.gitignore` 规则只能收窄 Agent 文件可见范围；测试必须覆盖常见 ignore、managed directory 和 `!` negation 不重新授权的行为。
- processor 输出只能写入 Host 分配的内部路径；Agent/Webview 只接收 stable locator，不接收 root、cache path 或系统 temp 路径。
- Webview 只接收授权 projection 或 stable durable reference；未 promoted 的 `ProcessorOutputLocator` 不能写入项目事实。
- Market/local/untrusted capability 不能把高风险 processor 或 command 加入默认 allowlist。
- Processor registry 测试必须覆盖 builtin、project、personal/local、Market 和 extension 来源的 `sourceScope`、`AgentCapabilitySource`、trust/version/schema projection。
- Processor registry lifecycle 测试必须覆盖 upsert/update、unregister、setEnabled、onDidChange revision、Market uninstall、project file deletion、personal manifest removal 和 extension deactivation。
- Processor discovery bootstrap 测试必须覆盖 `ExternalProcessorRegistryService` 把 project `.neko/processors`、personal `${NEKO_HOME}/processors`、Market installed package 和 extension contribution 投影到同一 registry，并确认 activation/Market install target 调用 refresh/unregister 命令。
- Processor manifest 测试必须以 JSON contract 为准；TOML/YAML 作者输入若存在，只测试转换结果进入同一 JSON validator。
- Processor ownership 测试必须覆盖 intermediate/debug/candidate 分配、legacy `resourceCache` schema v1 拒绝、locator 路径不泄露、ownership 篡改拒绝，以及 promotion 后才能跨包交付。
- Chain workflow 测试必须断言每个 processor invocation 独立经过 registry resolve、approval、output ownership 分配和 provenance 记录，不允许 shell pipeline 作为成功路径；`processorRunId` 必须覆盖跨 turn approval 继续、同 stage retry attempt 和目标改变新 run。
- Host adapter 测试必须断言 Agent runtime 不直接读写内部文件，`ProcessorOutputLocator` 可作为下一 processor 输入，只有 Host storage 解析物理路径。
- Promotion 测试必须断言 owning durable writer 已接收内容并返回 `ContentLocator`，随后 derived GC 不影响 durable source。
- Env profile 测试必须覆盖允许 GPU/venv/Blender 常见变量，同时拒绝 token、SSH、cloud credential、未声明变量和命中 Host baseline secret denylist 的显式 allowlist entry。
- Developer Mode、processor approval、network allowlist 和 env allowlist 有 focused tests。
- TempFileService、owner package scratch path 或物理 cache path 不得作为 Agent/Webview/Canvas/storyboard resource handoff 成功结果；相关测试应断言 opaque representation/output locator 与 Host projection/promotion 路径被命中，且 payload 不含物理路径。
- VS Code Webview 资源展示变更必须用 Extension Development Host 或 `vscode-extension-debugger` 验证；普通浏览器/Vite 不能作为最终 Webview sandbox 验收。
