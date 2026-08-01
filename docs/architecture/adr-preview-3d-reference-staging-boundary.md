# ADR: Preview 3D 参考布置边界

状态：Accepted

更新日期：2026-08-01

范围：Preview、Agent、Canvas、Electron Renderer、Three.js、内置 3D/全景预设与下游参考输出。

## 决策

3D Reference 是 Preview-owned 的临时 staging session，用于姿态、机位、构图、光照和全景环境参考。
它不创建持久 3D 项目、动画时间线、关卡、骨骼编辑器或通用场景 runtime。

Session 可以组合：

- 明确授权的角色/物体模型或小型内置预设；
- pose、joint rotation、camera、light 和 environment 参数；
- 用途 role，例如 pose、composition、camera 或 environment；
- capture result、source fingerprint、catalog version 和 provenance。

Desktop Main 创建 session identity、校验 built-in catalog/用户资源并投影 exact descriptor；Renderer
拥有 Three.js scene、camera、controls、texture 和 capture state。Agent/Canvas 只消费 typed operation
与 capture/result ref，不持有 GPU object 或本地路径。

内置预设目录由代码和 manifest 固定声明，包含 identity、version、license、fingerprint、dependency、
用途与能力。Renderer 不扫描目录、不猜测 asset path、不运行插件。recoverable state 只保存稳定 preset
identity 与参数，不保存 resource URL、blob URL 或缓存路径。

## 验证

- catalog/fingerprint/license/dependency 与 source replacement 使用 package tests；
- pose/camera/light/environment、capture、role routing 和 provider rejection 使用路径测试；
- CSP、资源授权、真实交互、截图与 recursive disposal 使用 Electron Desktop fixture；
- 不支持的模型、缺失 dependency 或陈旧 session 返回明确 diagnostic。

相关边界见 [`adr-agent-driven-avatar-preview-runtime-boundary.md`](adr-agent-driven-avatar-preview-runtime-boundary.md)、
[`adr-ui-domain-panels-and-shared-primitives.md`](adr-ui-domain-panels-and-shared-primitives.md) 和
[`package-boundaries.md`](package-boundaries.md)。
