# 3D Reference 与轻量 Shot Staging 完成度审计

- 日期：2026-07-25
- 范围：`neko-preview` Model Preview / 3D Reference、Agent/Canvas media projection、视频生成 contract
- 性质：当前工作区能力与验收状态快照，不作为长期架构事实
- 稳定边界：[`adr-preview-3d-reference-staging-boundary.md`](../architecture/adr-preview-3d-reference-staging-boundary.md)
- 活跃变更：[`add-3d-reference-staging`](../../openspec/changes/add-3d-reference-staging/)

## 证据来源

- 单主体 staging 状态：[`model-preview.ts`](../../packages/neko-types/src/types/model-preview.ts)
- 3D Reference subject/output contract：[`three-reference.ts`](../../packages/neko-types/src/types/three-reference.ts)
- 单 primary-subject 和非时间线设计：[`design.md`](../../openspec/changes/add-3d-reference-staging/design.md)
- 视频生成显式拒绝 3D Reference：[`mediaTurnBridge.ts`](../../apps/neko-vscode/src/features/agent/services/mediaTurnBridge.ts)
- 当前视频请求字段：[`contracts.ts`](../../packages/neko-generation/src/contracts.ts)
- 未完成任务与运行态阻塞：[`tasks.md`](../../openspec/changes/add-3d-reference-staging/tasks.md)、[`verification.md`](../../openspec/changes/add-3d-reference-staging/verification.md)

## 结论

当前完成度低于“轻量 AI 制片场面控制”的预期。

现有实现可以支撑标准模型检查、单主体节点变换、内置单素体静态姿势、静态机位/灯光/全景布置和用途化 PNG 输出。它不能支撑多角色与多道具同场布置、角色和道具关系、动作/摄影机时间线、参考视频导出，也不能把 `3d-reference` 控制提交给视频生成模型。

因此当前产品应描述为 **单主体静态 3D Reference**，不能描述为轻量 Scene Editor、Shot Staging、动作预演或 Seedance 控制面。

## 判定方法

本快照区分四种状态：

| 状态         | 判定                                                 |
| ------------ | ---------------------------------------------------- |
| 可用         | canonical 用户路径、真实宿主验收和下游消费均成立     |
| 部分可用     | 核心路径存在，但对象范围、provider 或验收仍受限制    |
| 已实现未验收 | 代码和聚焦测试存在，真实 Extension Host 场景尚未关闭 |
| 不可用       | 当前 contract、runtime 或下游路径明确不支持          |

不能以 UI 可见、类型存在、单元测试通过或 capture 文件生成代替端到端可用性。

## 当前能力矩阵

| 能力                                         | 当前状态     | 证据与限制                                                                       |
| -------------------------------------------- | ------------ | -------------------------------------------------------------------------------- |
| GLB/glTF/OBJ/STL/PLY 只读预览                | 部分可用     | 标准模型路径已存在；真实模型仍依赖受支持宿主和授权资源                           |
| 单主体节点 transform                         | 部分可用     | `ModelPreviewStagingState` 保存一个模型的 node transform patch，不是多资产 Scene |
| 内置男性/女性/儿童素体                       | 已实现未验收 | 程序化 runtime 和测试存在；OpenSpec 任务 2.5 的逐素体宿主测量未关闭              |
| 12 个 pose preset 与关节旋转                 | 部分可用     | 只适用于内置声明关节的单素体；普通用户模型没有通用 humanoid adapter              |
| Pose skeleton / depth PNG                    | 部分可用     | 静态 control pass 已实现；只接入声明精确 image control 的 provider/model         |
| 静态 camera/FOV/aspect                       | 部分可用     | 多个临时 camera 和结构化输出存在；没有 camera timeline                           |
| Camera/light viewport 拖动                   | 已实现未验收 | 代码和聚焦测试存在；OpenSpec 任务 5.8 因缺少有效 VS Code CDP endpoint 未关闭     |
| Directional light 与环境强度                 | 部分可用     | 不包含 point/spot/area light、阴影、物理衰减或持久灯光                           |
| 单个 panorama 环境                           | 部分可用     | 授权、方向和静态输出存在；没有已审计的 camera/panorama provider adapter          |
| Appearance/Pose/Camera/Panorama 角色隔离     | 部分可用     | contract、collector 和投影测试存在；真实 Agent/provider 行为验收仍有外部阻塞     |
| 多 actor / 多 prop 同场                      | 不可用       | mannequin 或 blockout 选择会替换唯一 primary-subject slot                        |
| 地面接触、look-at、手持/父子 attachment      | 不可用       | 无场景级 relationship/constraint contract                                        |
| 动画播放、裁剪、起止状态和简单关键帧         | 不可用       | 只统计模型 animation 数量；没有 mixer、timeline 或 keyframe owner                |
| 摄影机运动和多角色动作同步                   | 不可用       | 无时间模型、motion path 或 shot beat contract                                    |
| Per-entity ID/segmentation mask              | 不可用       | 当前 purpose output 只有 appearance、pose/depth、camera 和 panorama              |
| 低清灰盒参考视频导出                         | 不可用       | 没有 MediaRecorder/Engine render plan 或 reference-video artifact                |
| `3d-reference` 进入视频生成                  | 不可用       | `mediaTurnBridge` 对 video category 显式调用 `assertNoThreeReferenceControls`    |
| Seedance 式 image/video/audio reference pack | 不可用       | `VideoGenerationRequest` 只有首尾帧、单参考视频、参考图和文本镜头字段            |

## 完成度偏差来源

### Contract 完成被误读为产品完成

`ThreeReferenceOutput` 已能表达 appearance、pose、camera 和 panorama，且 Agent/Canvas 会保留角色语义。但这些 contract 主要接入图像生成；视频生成当前明确拒绝 3D Reference。Camera/panorama 字段存在也不代表 provider adapter 已有精确映射。

### “场景组合”实际只有一个主体

当前会话允许一个 primary subject、一个 environment、多个临时 camera 和 directional light。它不允许独立加载第二个角色或让素体与 blockout 道具共存。多个 appearance context 只能在下游累计图片，不能证明主体在同一 3D 空间完成了站位、遮挡和互动验证。

### 静态姿态被误读为动作控制

Pose preset 和关节旋转输出的是单帧 skeleton/depth。当前没有动画 clip 播放、retarget、IK、起止 pose、时间线、camera motion 或 MP4 导出，因此不能产生 Seedance R2V 所需的动作和镜头参考视频。

### 自动化通过被误读为运行态验收

OpenSpec verification 已记录大量聚焦测试和构建通过，但 `add-3d-reference-staging` 仍有任务 2.5、5.8、7.1、7.2、7.3 未完成。特别是 camera/light 新交互尚未在有效 Extension Development Host endpoint 中完成验收，不能声明整个 UI 路径已完成。

## 后续边界

要达到轻量 AI 制片控制，下一变更至少需要定义：

1. 多 actor/prop、稳定 identity、transform 与 attachment 的 Shot Stage contract。
2. 起止姿态、简单动作片段、camera 起止状态和 shot beat。
3. RGB、depth、pose、per-entity ID mask、首尾帧和低清参考视频输出。
4. 角色明确的 image/video/audio reference pack。
5. 视频 provider/model 精确 capability negotiation 与真实请求验收。
6. Storyboard/Canvas 持久 Shot 事实和 Preview Three.js renderer 之间的单向 snapshot/operation 边界。

这些能力不得作为当前 `add-3d-reference-staging` 的完成事实补写。进入实施前应创建独立 OpenSpec，并保留 Preview 作为唯一 Three.js、资源授权、capture 和 GPU 生命周期 owner。
