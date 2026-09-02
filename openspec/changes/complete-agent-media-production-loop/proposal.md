## Why

OpenNeko 已能完成创意设计、生成候选和局部剪辑操作，但尚不能让创作者沿同一条可观察路径完成视频候选审查、镜头结果绑定、时间线组装与成片交付。缺口必须由现有 Canvas、Content、Generation 与 Cut owner 补齐，而不是引入跨领域工作流状态机或审批系统。

## What Changes

- 让创作者在 Canvas 中比较生成候选，并在明确选择后把稳定素材引用写回 Markdown 镜头行；当前预览候选不自动成为下游事实。
- 为 Agent 提供有界的视频总览和指定时间段抽帧，使选片与修复建议建立在真实帧证据上。
- 让 Agent 通过 Cut 的 canonical authoring path 导入已选素材、调整排列、添加基础转场并形成可评审时间线。
- 在既有 Cut 导出基础上补齐成片技术 QC 与交付清单，未测量项目保持未验证状态。
- 保持“简洁整体路线 + 当前阶段产物 + 一个下一步”的人机协作方式，不增加独立审核关卡、批准对象、预算状态或全局生产状态机。

## Capabilities

### New Capabilities

- `agent-media-result-continuation`: 定义 Markdown 镜头表、Canvas 候选、创作者选择和后续生产动作之间的最小连续关系。

### Modified Capabilities

- `bounded-agent-visual-inspection`: 将有界瞬态视觉检查扩展到视频总览和指定时间段帧证据。
- `agent-generation-canvas-projection`: 区分当前预览候选与创作者明确选择后可供下游使用的稳定结果。
- `desktop-cut-node-media-runtime`: 补齐 Agent 可调用的素材组装、基础转场、成片 QC 与交付清单能力，同时保持 Cut 为唯一时间线与导出 owner。

## Impact

Content 领域拥有视频探测和有界抽帧表示；Generation 保持 Job 与候选输出 authority；Canvas 维护创作文档、候选投影及其关系；Cut 领域拥有时间线修改、导出和技术验证。Agent Runtime 与 Desktop 只组合精确 DSH Tool、Workspace authorization 和结果投影，不复制媒体事实或建立第二工作流 owner。
