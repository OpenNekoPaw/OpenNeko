# ADR: Preview 3D 参考布置与用途隔离边界

- 状态：Accepted
- 日期：2026-07-19
- 范围：`neko-preview`、`neko-agent`、`neko-canvas`、Agent media platform、共享参考契约、VS Code Webview、Three.js、内置 3D/全景预设。
- 实施状态：架构决策已接受；具体实现与验收由 [`add-3d-reference-staging`](../../openspec/changes/add-3d-reference-staging/) 约束。

本文记录 OpenNeko 对 3D Preview 产品定位、四类参考用途、无模型引导会话、内置模型、角色隔离和下游路由的稳定决策。它补充 [`package-boundaries.md`](package-boundaries.md)、[`webview-media-security.md`](webview-media-security.md)、[`adr-ui-domain-panels-and-shared-primitives.md`](adr-ui-domain-panels-and-shared-primitives.md) 和 [`adr-agent-driven-avatar-preview-runtime-boundary.md`](adr-agent-driven-avatar-preview-runtime-boundary.md)。

现有 [`add-standard-3d-model-preview`](../../openspec/changes/add-standard-3d-model-preview/) 只实现真实标准模型的只读检查、临时 camera/light/transform 和通用截图上下文；本文不把尚未实施的内置素体、姿势编辑或全景环境描述成现有能力。

## 背景

3D Preview 的产品目标不是单一模型查看，而是为后续创作提供四类可验证参考：

1. 人物或物品的形象参考；
2. 角色动作参考；
3. 相机机位、景别和构图参考；
4. 720° 全景环境的场景参考。

这四类参考可能同时来自一个布置，也可能来自不同输入。真实角色 GLB 可以同时贡献形象和动作；预制中性素体只应贡献动作和机位；全景图贡献环境与方向；相机状态贡献结构化机位。

若继续把整个 3D 视口截图当作普通视觉参考，会产生两个错误：

- 无纹理素体仍可能被下游模型当作人物外观、体型或服装方向；
- pose、depth、camera 和 panorama 等控制语义会在 PNG 边界被擦除，再由 Agent 或 provider 猜测。

UI 文案无法单独解决这个问题。参考用途必须从 Preview staging、capture、共享 contract、Agent context、Canvas projection 到 media provider request 全程保留。

## 决策摘要

OpenNeko 将用户可见的 3D Preview 定位提升为 **3D 参考布置台（3D Reference Staging）**：

| 参考用途                   | 合法来源                                       | Canonical 输出                                           | 禁止路由                           |
| -------------------------- | ---------------------------------------------- | -------------------------------------------------------- | ---------------------------------- |
| 形象 `appearance`          | 授权真实模型、明确允许形象用途的内置模型       | RGB 外观预览、稳定 source ref                            | guide-only 素体、pose/depth 控制图 |
| 动作 `pose`                | 声明骨骼语义的真实模型、内置关节素体           | joint snapshot、pose/skeleton 或 depth control           | IP-Adapter、subject/style 普通参考 |
| 机位 `camera`              | 任意 live 3D Reference session                 | position、target、FOV、aspect、shot/composition evidence | 仅凭截图猜机位                     |
| 720° 场景 `panorama-scene` | 授权 equirectangular image/video、内置中性全景 | panorama resource、yaw/pitch/FOV、可选 viewport evidence | 角色形象参考                       |

四类用途是独立集合，不是互斥模式。当前 subject/environment 声明可用能力，用户选择本次输出子集。未选择或不允许的用途不得进入 payload。

## Preview 是 3D 参考会话 owner

`neko-preview` 继续拥有该能力，因为它已经承担：

- 模型和全景源的授权只读投影；
- Three.js Webview、camera/light/transform、capture 和 GPU 生命周期；
- 每面板独立 identity、revision、取消、消息和 dispose；
- Agent context handoff；
- 文档、媒体、全景和模型 Preview entry 的构建隔离。

Canvas 与 Agent 是用途化参考结果的消费者，不拥有 Preview renderer，也不得直接导入 Preview 内部实现。Canvas 继续拥有创作工作台和生成控制 UI；Agent 继续拥有意图理解、provider/model capability negotiation 和媒体任务决策。

将素体能力直接搬进 Canvas 会创建第二套 Three.js、模型授权、全景加载、GPU 生命周期和 capture owner，因此不采用。只有未来出现持久 3D scene、可保存 pose、动画 timeline 或项目文件时，才需要重新定义 durable authoring owner；这不属于 Preview。

## 显式 session subject，不使用失败 fallback

每个 3D Reference session 必须明确选择一种 subject mode：

```text
source-model       授权用户模型
builtin-preset     内置 guide / appearance / prop / environment preset
environment-only   无人物/物品，仅布置 panorama 与 camera
```

“无模型时显示素体”只允许通过显式新建 guide session 或选择内置预设实现。真实模型缺失、未授权、格式不支持、依赖不安全或加载失败时必须显示 diagnostic；不得静默换成素体、立方体或其他默认模型。

这一区分既保护 fail-visible，也避免用户误以为当前 reference 仍代表所选角色/物品。

## 内置预设目录

Preview Extension 拥有一个固定、代码声明、不可变的内置预设目录。首期目录应保持小而明确：

1. 无面部、无服装、无纹理风格的抽象关节素体；
2. 立方体、圆柱体等尺寸与构图占位道具；
3. 简单房间或摄影棚 blockout；
4. 中性方向/经纬网格全景；
5. 仅在授权和包体价值明确后添加的形象示例模型。

每个预设必须声明：

- stable preset ID 与 schema/version；
- asset fingerprint 与确切 packaged dependency；
- `guide | appearance | prop | environment` kind；
- allowed reference purposes；
- default scale 与坐标/朝向约定；
- articulation、joint constraints、landmark、render-pass 等 capability；
- project-authored 或第三方 provenance、license、attribution 和 modification notice。

Webview 不扫描目录、不注册运行时插件、不猜 asset path。Extension 校验 catalog 后通过 `webview.asWebviewUri()` 投影精确文件。recoverable state 只保存 preset identity/version，不保存 Extension 绝对路径、Webview URI、blob URL 或 cache path。

guide-only preset 在 catalog 中不允许 `appearance`。这一限制必须在 UI、capture builder、context validator、Canvas/Agent projection 和 media request 边界重复验证。它们是独立序列化/信任边界，不属于掩盖内部错误的过度防御。

## Pose 能力来自声明，不来自名称猜测

内置素体必须声明稳定 joint identity、hierarchy、rotation constraints、landmarks 和 compatible presets。首期允许 pose preset、受约束 joint rotation、reset 和 control pass capture；不引入 animation timeline、keyframe、IK、retargeting、physics 或 source writeback。

普通 GLB/glTF 只有在明确 adapter 能生成稳定 humanoid/pose descriptor 时才能提供 pose。VRM 等格式可在对应 OpenSpec 中提供标准语义。OBJ、STL、PLY 或静态 GLB 的对象节点 transform 不得包装成角色 pose 成功。

现有 `generateHumanoidGlb` 只能作为 feasibility 参考：其低模层级有复用价值，但旧注释、mesh 行为和已移除 empty-model 项目语义必须审计。正式实现应把它重构为 guide-owned procedural asset，或用经过授权、测试和打包审计的 GLB 替换；不得用旧 helper 暗中恢复已移除产品路径。

## 用途化输出是唯一 canonical delivery

共享层定义 identity-bearing、serializable 的 purpose output union。概念形状如下：

```text
appearance
  -> RGB ResourceRef + authorized source identity

pose
  -> joint snapshot + control ResourceRef + pose/depth mode

camera
  -> camera identity + position/target/FOV/aspect + optional composition evidence

panorama-scene
  -> panorama ResourceRef + yaw/pitch/FOV + optional viewport evidence
```

交互用 shaded viewport screenshot 不是自动 appearance output。只有显式构造并通过 role eligibility 校验的 `appearance` variant 可以进入普通 image reference 或 provider 明确支持的 IP-Adapter 字段。

Pose/depth output 只能进入现有 `controlImage` / `controlMode` 语义。Camera 和 panorama 保持结构化字段和稳定资源身份。消费者不得因为 output 是 PNG 就把 control image 解释成 appearance。

## `3d-reference` 替换 `model-preview`

项目处于 prelaunch，现有 `model-preview` Agent context 是 transient context 且尚未形成有价值持久数据。新能力使用单一 `3d-reference` discriminator，携带：

- contract version；
- session、subject、preset/source/environment identity；
- staging revision；
- selected purpose set；
- exact purpose outputs；
- capability/role restrictions；
- correlated capture metadata 与 typed diagnostics。

实施必须先 poison/remove `model-preview` 的成功 parser、producer、consumer、fixture 和 generic image path，再接入 `3d-reference`。不得保留 `model-preview` + `3d-guide` 双通道，不得兼容映射旧 payload，也不得在新路径失败时回退旧成功。

Live Preview 可以从当前 source/preset/staging 重建 context；不迁移用户模型、全景源、项目事实或生成资产。

## Canonical 调用链

```text
用户打开 3D Reference
  -> Preview Extension 创建 instance/session identity
  -> 显式选择 source-model / builtin-preset / environment-only
  -> Extension 授权 source 或校验 built-in catalog
  -> 精确资源通过 asWebviewUri 投影到对应 Webview
  -> Webview 建立 panel-owned Three runtime 与临时 staging
  -> 用户选择 appearance / pose / camera / panorama-scene 用途
  -> Webview 生成对应 purpose outputs
  -> Extension 校验 identity/revision/role/resource/capture
  -> Preview 构建 3d-reference context
  -> Agent/Canvas 保留 output role
  -> media capability negotiation 校验 provider/model
  -> 支持时构造 reference/control/semantic request
  -> 不支持时在提交前 fail-visible
```

禁止以下路径：

- source load error -> default mannequin success；
- guide viewport RGB -> appearance/IP-Adapter；
- pose/depth PNG -> ordinary reference collection；
- camera/panorama -> 仅靠 prompt 文本或截图猜测；
- unsupported control -> drop、prompt-only、other-provider 或 ordinary-image fallback；
- Preview 直接选择 provider/model 或提交 media task；
- Webview 读取 raw local path、Extension path、cache manifest 或网络 preset；
- Agent/Canvas import Preview 内部实现；
- Rust Engine 恢复 Model/Scene authority。

## 全景场景边界

720° 场景参考指 equirectangular panoramic environment 及其方向/视角布置。3D Reference 应复用 Preview 已有 panorama detection、授权和 content-access 边界，但不在 `ModelPreviewProvider` 内实例化另一个 Custom Editor provider。

Three runtime 只消费 Extension 精确授权的 panorama descriptor，临时拥有 environment texture、orientation 和 capture state。源资源保持只读；Webview URI、GPU texture 和 viewport projection 不成为持久事实。

## UI 与主题边界

用户可见名称采用“3D 参考”或“3D 参考布置”，并持续显示当前 subject mode 与用途标签。

- guide-only 素体必须显示“动作/机位引导，不作为形象参考”；
- 发送前展示本次 active purposes；
- Agent context chip 和 Canvas generation controls 继续显示同一 role；
- disabled purpose 必须说明不支持原因；
- real source 与 built-in preset 不使用视觉上无法区分的空白 fallback。

Preview 继续复用共享 floating toolbar、TreeView shell、panel/section/property rows、axis、slider、segmented control、badge、empty state、focus/keyboard、theme token 和 i18n。Preset、pose、purpose、panorama 等领域组合留在 Preview；不得把领域模型推入 `@neko/ui`，也不得新建 package-local design system。

## 生命周期、性能与安全

每个 session 独立拥有 subject descriptor、pose、camera、environment、purposes、revision、renderer、loader、capture、message queue、abort scope 和 disposables。缺失、陈旧、跨 panel 或 disposed identity 必须失败；active editor 不构成 identity。

内置 asset 只在选中后 lazy load。Audio、video、document、普通 panorama 和未进入 3D Reference 的 model entry 不得加载 preset binary。实施必须记录实际 per-asset/aggregate package size、load timing、支持宿主的 GPU/资源释放证据，再决定默认预算；ADR 不在没有测量前固定假精确阈值。

第三方资产必须完成 redistribution/license/provenance 审计。未知、冲突或缺失授权的模型不得以“测试素材”或“示例”名义进入 package。真实用户模型的运行验收继续使用外部授权 workspace；不得复制用户模型到仓库 fixture、截图报告或提交产物。

Webview 仍遵守 CSP、exact resource projection、无 Node/VS Code API、无任意网络加载、bounded MIME/size/capture 和 recursive disposal。Built-in 不因为位于 Extension package 内就绕过相同的 identity、fingerprint 和 dependency validation。

## Agent、Canvas 与 Provider 边界

Preview 只提供 validated `3d-reference` context，不选择 provider、不上传原始模型、不直接创建媒体任务。

Agent 负责理解 reference purposes 和目标生成任务。Canvas 负责 Canvas-originated generation controls。Agent media platform 负责 provider/model capability negotiation 和实际 request projection。

Provider 不支持 pose、depth、camera 或 panorama control 时，操作必须在提交前返回 typed unsupported diagnostic。系统不得删除控制继续生成、转成普通图片、切换其他 provider、仅追加 prompt 文本或把 no-op 描述成成功。用户可以在看到限制后显式改变用途或 provider；这属于新的用户意图。

## 后果

正面后果：

- 3D Preview 的四类产品用途得到统一而不含糊的 contract；
- 无外部模型时可以用中性素体和 blockout 进行动作/机位布置；
- 真实模型、guide、camera 和 panorama 可以在一个临时场景组合；
- control image 与 appearance reference 从 UI 到 provider 全程隔离；
- Preview 保持唯一 renderer/resource/lifecycle owner，Canvas/Agent 不复制 3D runtime；
- 不需要新项目格式、Engine Model/Scene API 或大型内置素材系统。

负面后果与成本：

- `model-preview` context 和相关 fixture 需要一次显式破坏性替换；
- Preview package 增加 preset binary、license notice、pose/runtime 和环境投影复杂度；
- 需要真实 VS Code Webview、provider capability 和 Agent behavior 证据，不能只靠 jsdom；
- 任意用户模型的 pose 能力将长期受真实骨骼语义限制，不能承诺自动 rig/retarget；
- 形象模型与 guide 模型的目录治理、包体和授权需要持续审查。

## 实施与验收约束

具体实现必须遵循 [`add-3d-reference-staging`](../../openspec/changes/add-3d-reference-staging/)：

- 先完成/归档标准模型预览前置变更，再替换 context；
- 先做 mannequin procedural-vs-GLB feasibility 和真实测量，再确定生产 asset；
- contract、legacy poison、catalog/license、role routing 和 provider rejection 必须有 red/green tests；
- Webview 通过隔离合成 fixture 的 Extension Development Host 场景验收；
- 真实模型手工验收只能使用外部 `~/Git/neko-test/test.glb`，不得复制入仓库；
- Agent context/route 行为变更按 Agent Evaluation ADR 做 `reuse | update | create | excluded` 决策并提供真实或明确 blocked 证据；
- 最终 verification 记录 package size、load/disposal、CSP、role/no-fallback、provider capability、构建测试和剩余风险。
