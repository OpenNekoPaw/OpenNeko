# ADR: Agent 驱动 Avatar 只读预览边界

状态：Accepted

更新日期：2026-08-01

范围：Preview、Agent、Electron Renderer、Live2D、VRM、GLB/glTF、TTS/STT 与 Three.js/PixiJS runtime。

## 决策

Avatar 是 Preview-owned、只读、短生命周期的渲染 session，不是项目事实或独立 Model/Scene 后端。
Agent 只能通过 typed Preview capability 操作明确 instance；Desktop Main 授权资源并管理 session，
Renderer 拥有 GPU object、动画状态和交互。

```text
Agent Tool Call
  -> Preview capability(instanceId, revision, operation)
  -> Desktop Main Preview session
  -> Renderer instance
  -> observation / capture / diagnostic
```

每个 operation 携带 `instanceId`、source fingerprint、revision 和 operation identity。缺失或陈旧
identity 直接失败，不回退到当前活动面板。Desktop Main 不解析模型渲染状态；Renderer 不读取目录、
本地路径、Agent runtime 或 provider SDK。

支持格式由 package capability catalog 和真实 fixture 决定。GLB/glTF、VRM、Live2D 或 MMD 的 loader、
license、依赖文件、动画和材质支持分别声明；静态打开成功不等于动作、表情、语音或 capture 可用。

TTS 由 provider/owning audio capability 生成受授权音频，再由 Preview session 播放并可选驱动 mouth
state。STT 只在明确转录或语音输入场景注册；缺少 provider 时不提供该能力或明确失败。

## 安全与生命周期

模型及依赖必须通过 exact resource descriptor 授权；不允许目录扫描、任意网络 URL、raw path 或
动态脚本。CSP、MIME/size limit、dependency validation、capture limit 和 recursive GPU disposal
适用于 built-in 与用户资源。

source replace、renderer reload、session close 和 app quit 必须停止音频、动画、worker，释放 texture、
geometry、material、object URL 和 resource registration。

## 验证

- parser/loader、dependency、animation、unsupported capability 和 license 使用 package tests；
- identity、revision、operation route、cancel 与 stale instance 使用集成测试；
- 真实模型动作、语音、capture、CSP 和释放使用隔离 fixture 的 Electron Desktop 场景；
- Agent 行为使用聚焦 evaluation，并断言 exact Preview instance 被命中。

相关边界见 [`media-runtime.md`](media-runtime.md)、
[`adr-neko-desktop-media-capability-and-security-boundary.md`](adr-neko-desktop-media-capability-and-security-boundary.md) 和
[`package-boundaries.md`](package-boundaries.md)。
