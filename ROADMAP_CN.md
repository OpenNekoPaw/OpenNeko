# OpenNeko Desktop 开发路线图

状态：方向性路线，不承诺发布日期

更新日期：2026-08-30

本文只定义开发顺序、阶段边界和完成门禁。当前已发布/可运行事实仍以
[`README_CN.md`](README_CN.md)、[`docs/architecture/client-targets.md`](docs/architecture/client-targets.md)
和代码为准。Phase 1 领域接入仍在进行，因此 Desktop 尚不是受支持发布产品。原生 package /
release 目标已收敛为 `darwin-arm64`；macOS 已有通过验证的本地 ad-hoc DMG 路径，以普通
GitHub Release 发布并明确披露未公证状态，Developer ID/公证仍是阶段 2 门禁。GitHub Actions
不构建或上传 Desktop 原生 artifact；Windows x64 与 Linux 只运行确定性测试。Intel Mac 和
其他架构不支持。Desktop 已有 OpenNeko 自有的 Skill/扩展目录及受支持
Skill/MCP contribution 的 Agent 接入路径；通用扩展生态与专业工具集成尚未实现。

每个阶段中的产品功能变更必须拆成边界明确的 OpenSpec change，不允许用一个长期巨型 change 同时开发
Shell、跨平台、插件和全部专业工具。文档、架构整理、行为等价重构、测试与开发工具等非功能工作直接实施，
不得为路线图切片单独创建 OpenSpec。

## 产品重点与实验晋级

当前路线优先服务通用的 AI 辅助内容创作者，闭合“本地项目上下文 → Agent 规划/生成 →
素材与结果管理 → Canvas/Cut/Preview 轻量处理 → 导出或专业工具交接”的真实工作流。
“通用”指跨媒体、跨模型和可移植的高频个人创作路径，不表示在 OpenNeko 内复制完整
NLE、DCC、图像编辑器或覆盖所有创作行业。

Chara 与 Interactive World 是独立实验方向，不是当前阶段的承诺交付项。允许继续进行边界设计、
合成 fixture 和最小原型验证，但在满足以下条件前不得将它们提升为核心导航、发布能力或当前产品
卖点：

- 存在能够明确描述的目标用户和跨多个独立用户重复出现的任务；
- 用户已经在真实项目中以低效方式解决该问题，而不只是表达概念兴趣；
- 最小原型出现持续创建、再次体验、保存或分享等重复行为；
- 能定义并验证一条使用真实 owner、模型和持久事实的最小创作—体验闭环；
- 生产 Tool scope、Skill 指导和 Agent 行为验证 使用同一条 canonical 路径，不能用仅存在于
  fixture 或提示词中的 Assistant/global 创建路径代替真实 Desktop 行为。

Chara 的最小闭环必须覆盖“精确 Project 中创建并填充草稿 → 用户确认不可变版本 → 显式同步或导入
全局目录 → 选择精确版本进入 Dialogue/Room → 卸载并重开后继续”。World 的最小闭环必须覆盖“精确
Project 中创建并填充草稿 → 用户确认不可变版本 → 显式同步或导入全局目录 → 以精确版本启动确定性
Run → Save/branch → 重开”。如果 Story、Gameplay、Agent Play、实时生成或外部引擎尚无真实 producer、
consumer 和可验证 action contract，它们不得被计入 World 能力完成度。

实验未晋级时，CharacterProject/Version、Character room/Play、WorldProject、WorldExperience、
Run/Save/Branch 在 Development 中可继续验证；Release 必须隐藏产品入口，并让直接 Scene 调用保持
fail-visible unavailable。领域代码与用户数据继续保留。多角色 Play、VLA、游戏控制、
完整 3D/实时视频表现和社交分发不得作为验证基础需求提前扩大范围。OpenSpec 中存在设计或任务
不表示路线图已经承诺交付。

## 总体顺序

```text
阶段 1：Desktop 前端与子包接入
  -> 稳定 Shell、状态协议和真实内容创作纵向路径

阶段 2：macOS 发布资格验证
  -> macOS 的真实安装、媒体、GPU、文件、签名、公证与发布证据

阶段 3：扩展生态与专业工具接入
  -> ComfyUI / NLE / Blender / Unity / Photoshop / Live2D 等受控集成
```

后续阶段可以提前做只读调研和 spike，但不得绕过前一阶段的公共契约和验收门禁进入产品路径。

## 阶段 1：前端界面与现有子包功能接入

产品功能提案与实施切片由当前 `openspec/changes/` 中的 focused change 分别承载；Phase 1 不再维护一份
重复子提案任务和过时 runtime 目标的总控提案，非功能整改也不进入该目录。

### 目标

完善 `apps/neko-desktop`，完成 Home、Project Tabs、Content Project 和 Context Dock，
并把现有保留子包通过公共入口和 host-neutral adapter 接入。第一阶段交付的是可完成真实创作
流程的 Desktop，不是静态原型或由 mock/no-op 支撑的页面集合。

产品功能的具体实施进度、阻塞和验证证据由适用的 OpenSpec change 记录；非功能整改直接在提交、PR 或
交付说明中记录，日期化状态文档只保存审计快照。本路线图不复制 task 级状态。所有 Phase 1 门禁通过前，
不声明 Phase 1 完成。

### 范围

| 能力                             | 第一阶段接入要求                                                                                                                             |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Desktop Shell                    | Electron main/preload/renderer、AppHost、typed IPC、安全自定义协议、窗口/菜单/文件选择、Home、Project Tabs、Context Dock、Activity/Attention |
| 前端状态                         | Host authoritative snapshot、按 owner 的 Renderer replica、Window/View store、snapshot-first attachment、sequence/revision/CAS、迟到响应拒绝 |
| Agent                            | 复用 DSH Agent/Session/Tool/Skill/MCP authority，通过 ACP application/projection 与 typed Host adapter 接入；不建立第二套 Agent runtime      |
| Assets / Content / Media Library | 复用 `ContentLocator`、workspace-linked library、缩略图/metadata 和受控文件授权；不复制 catalog                                              |
| Canvas                           | 接入完整 Canvas Root、`.nkc` 事实、节点/素材/候选操作和 Agent capability；不使用简化占位 surface                                             |
| Cut                              | 接入完整 Cut Root、OTIO、预览、音频、代理和 ExportJob；不恢复 Engine/client                                                                  |
| Preview / Media                  | 接入文档、图片、音视频和标准 3D 只读预览，使用 `@neko/media`、Node/FFmpeg 和安全 Range/PCM transport                                         |
| Generation / Quality             | 接入 GenerationJob、candidate/review、质量检查和明确失败诊断                                                                                 |
| Chara / Entity                   | Development 只验证精确 Project 草稿填充、版本/目录和 Dialogue/Room 有界闭环；Release 保持 unavailable，Agent 不直接创建全局角色              |
| Tools / Diagnostics              | 接入日志、诊断、能力状态和可恢复错误，不增加运行时控制台式产品表面                                                                           |
| Interactive World                | Development 只验证精确 Project 草稿填充、版本/目录与确定性 Foundation Runtime；Release 保持 unavailable，不得把它表述为完整 World Experience |

### 建议实施切片

1. Desktop bootstrap、application id、Electron 安全基线和 Host ports。
2. Shell、Project/Window/View identity、前端 projection attachment 与持久 Window state。
3. Agent + Home Conversation/Activity 首条纵向路径。
4. Media Library + Canvas 首条创作与 candidate 路径。
5. Cut + Preview + Generation/Quality 的预览、生成、导出闭环。
6. Chara/Entity 现有内核投影、实验隔离和 Tools/Diagnostics 接入。
7. Content Project 端到端验收、资源释放、崩溃恢复与可访问性收口。

每个产品功能切片使用独立或边界清晰的一组 OpenSpec；子包接入必须先完成公共 UI/host adapter
复用审计。行为等价的边界整理直接实施，不能在 Desktop 复制 package-local store、文件 IO、媒体
client 或 DTO。

### 完成门禁

- `apps/neko-desktop` 通过 main/preload/renderer build、typecheck、package 和安全测试。
- Home → Content Project → Agent/Media Library/Canvas/Cut/Preview → Generation/Export 至少
  有一条使用真实 workspace 和真实 owning service 的完整路径。
- 仅有 Agent 计划、transcript 或文本回答不算创作闭环；至少一条 provider-backed 路径必须持久化可检查
  产物，由精确 Project 中的 Canvas/Cut/Preview 消费，并在导出及重开后仍能通过同一 owner identity 找回。
- Project Tab、Conversation、Run、Tool Call、Job、Window 和 View identity 不混用；快速
  切换/关闭、跨窗口订阅、自动保存、renderer reload 和 StrictMode 不产生重复执行或错写。
- 缺失 Character/World 能力返回 unavailable diagnostic，不创建空项目或 no-op success。
- Desktop 只消费 package public entry，不导入其他宿主或 package 的私有实现，也不建立平行组合层。
- 第一阶段只在适用功能 OpenSpec 或发布资格说明指定的参考平台做产品验收，不因此声明完整跨平台支持。

## 阶段 2：macOS 能力与发布资格

### 目标

在不分叉领域逻辑和 Renderer 的前提下，让 Desktop 应用通过 Apple Silicon macOS 的真实
发布资格验证。Electron 能启动、Forge package 成功或单元测试通过都不等于发布支持。

### 平台顺序

| 目标           | 计划         | 资格边界                                               |
| -------------- | ------------ | ------------------------------------------------------ |
| `darwin-arm64` | 唯一发布平台 | 签名、公证、Keychain、GPU/媒体、文件关联和真实创作流程 |

当前原生 package/release 闭集只有 `darwin-arm64`。Windows/Linux 只允许运行确定性 CI，
不得恢复 Desktop artifact、native runtime 或 fallback；Intel Mac 和其他架构不支持。

### 横切能力

- Electron/Node/native module 与 FFmpeg 打包；
- code signing、notarization、installer、update、deep link 和 file association；
- 路径、权限、secret storage、进程发现/启动、窗口标识和系统通知；
- Chromium/GPU、direct/remux/hardware-prepared file/PCM、Range、SDR baseline 与平台 capability snapshot；
- 10-bit/HDR、codec、显示器和色彩链的真实设备证据；
- 菜单、快捷键、输入法、字体、DPI、多屏、可访问性和崩溃恢复；
- 每个平台独立的日志、诊断、fixture 和发布 artifact 验证。

### 完成门禁

- 每个平台在真实 runner 或真实设备上完成安装、首次启动、升级和卸载验证。
- 同一隔离 fixture 通过 Shell、Agent、Canvas、Cut、Preview、媒体和导出 E2E。
- 平台差异只存在于窄 Host adapter/capability policy；领域包和项目格式不出现 OS 分叉。
- unsupported OS/architecture/version fail-visible，不尝试其他平台 artifact 或静默降级。
- 每个发布 artifact 有平台身份、依赖闭包、签名和校验信息。

## 阶段 3：扩展生态与专业工具接入

### 目标

在稳定 Desktop Host、状态协议和发布基线上，扩展现有 OpenNeko Skill/扩展目录及其受支持的
Skill/MCP contribution 路径，并建立受控专业工具集成。内置子包继续承担 AI 原生轻量创作；
高级剪辑、调色、分层图像、Live2D、3D、游戏工程和复杂节点工作流交给外部专业软件。

### 3.1 MCP 与贡献契约

- 复用现有唯一 MCP Manager、Agent Tool Call、Approval、Skill 和 capability catalog。
- MCP server/project 配置经过 schema、workspace trust、规范化 digest、权限和生命周期校验。
- UI “Open in…” 与 Agent automation 复用同一 Professional Tool application service。
- MCP/API 优先；Computer Use 是明确选择的补充 transport，不允许静默 fallback。

### 3.2 插件运行与 UI

- 版本化 manifest、兼容范围、来源、签名/校验、安装、启用、更新、卸载和诊断。
- Node 扩展运行在独立、受控进程；插件面板运行在 sandbox/Webview 和专属 partition。
- 插件只通过 capability/contribution slot 提交 intent，不获取 Shell store、任意 IPC、
  runtime token、绝对路径或领域私有对象。
- 权限撤销、卸载或崩溃会推进 capability/attachment epoch，并拒绝迟到消息。
- 第一版槽位限于 Tool/Capability、conversation inline result、Context Dock facet、
  editor surface 和管理页 projection；不得任意增加顶层导航或修改 Shell DOM。

### 3.3 专业工具接入

每个适配器按实际能力声明支持等级：

```text
L1 Discover / Launch
L2 Export and Open
L3 MCP or stable vendor API automation
L4 Explicit Computer Use for remaining visible UI
L5 Round-trip import / relink / review with evidence
```

计划按以下切片交付：

| 切片 | 工具                                   | 最小目标                                                                                       |
| ---- | -------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 3A   | ComfyUI                                | 发现本地服务、受控 workflow/input、API/MCP 执行、进度、输出归档和显式导入                      |
| 3B   | DaVinci Resolve 与一个剪映/CapCut 目标 | 从 Cut frozen revision 导出稳定交换包、启动/打开、可验证自动化和 round-trip review             |
| 3C   | Blender                                | 受控工程/素材交换、稳定 API/MCP/脚本入口、明确 scene/document identity 和产物回收              |
| 3D   | Unity                                  | 受控 project/package handoff、Editor/CLI/MCP 操作、明确 project/scene identity 和构建/导出证据 |
| 3E   | Photoshop、Live2D Cubism 等            | 按各自公开稳定接口和交换格式增加 adapter，不通过私有格式猜测或像素坐标宏伪造支持               |

精确交换格式、支持版本、平台矩阵和自动化接口由每个工具的产品功能 OpenSpec 决定。一个工具
在某个平台只有 L1/L2 时必须如实展示，不能因为另一个平台达到 L3/L5 就宣称全平台完整支持。

### Computer Use 门禁

- 绑定 Tool Call、应用、进程、窗口、文档、target epoch 和 observation revision。
- 高风险动作进入现有 Approval；Pause、Stop、Take over 必须可见且即时生效。
- 用户接管、焦点/文档变化或应用重启会使旧动作失效。
- 结果优先使用 API/MCP、产物或语义 UI 证据；截图和鼠标位置不能单独证明完成。
- 不记录无关窗口、凭据或跨应用观察，不允许任意全桌面坐标宏。

### 完成门禁

- MCP、插件和专业工具不创建第二套 Agent、Task、MCP Manager 或项目事实源。
- 插件安装/卸载/权限/崩溃和旧消息有隔离、恢复和安全测试。
- ComfyUI、一个 NLE、Blender 和 Unity 各完成至少一条真实纵向集成；剪映/CapCut、
  Photoshop、Live2D 按上述切片完成各自声明的 capability level。
- 每个适配器在真实软件版本和真实目标平台验证 discover、launch、交换、自动化、失败诊断
  与适用的 round-trip；未安装、版本不兼容和 outcome unknown 均 fail-visible。

## 不进入三阶段默认范围

- 云端多租户控制面、团队同步和远程执行平台；
- 复制 DaVinci、Photoshop、Blender、Unity 或 ComfyUI 的完整内置专业能力；
- Code OSS Workbench、任意 DOM 插件或第二套 Extension Host；
- 未通过用户证据晋级门槛的完整 Chara/Interactive World 产品化，或任何空壳 World surface；
- 仅依据 mock、截图、交叉编译或开发机偶然成功作出的支持声明。
