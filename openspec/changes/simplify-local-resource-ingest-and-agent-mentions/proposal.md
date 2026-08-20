## Why

OpenNeko 已经把 Files、Media 和 Assets 作为资源浏览器的三个 owner-preserving 来源，但
Agent Composer 仍把 Asset identity 直接编码为 `AgentContextPayload`，同时正在引入一个
`openneko.assets` DSH Tool。这样同一素材会存在 `@`、Tool 和全局 Asset path 三条成功路径，
并把 Asset Library 生命周期泄漏给 DSH。Media Library 的 Workspace 受管链接也容易被误推广为
所有资源统一使用 symlink，导致素材替换、卸载和项目可移植性依赖全局目录。

## What Changes

- 冻结三层资源模型：File/Media/Asset 是基础资源，Entity 是语义层，Character/World 是领域对象；
  聚合搜索只统一展示，不统一 identity、authority 或生命周期。
- `@` 保持 Files、Media、Assets 的唯一 Agent 资源发现入口；查询无副作用，不能复制、挂载或写入
  Workspace。
- 选择可用 Asset 时，由 Assets owning service 从精确 Asset membership 复制普通文件到精确授权的
  Workspace `assets/` 目录，返回 canonical `WorkspaceFileContentLocator`；DSH 只接收该 locator 对应的
  ACP resource link。
- Asset materialization 不使用 symlink，不持久化 Asset-to-Workspace 同步状态，也不在源素材变化时
  自动更新副本。文件名冲突生成新的普通 Workspace 文件，不覆盖用户内容。
- Media Library 继续仅在用户显式连接时使用 `neko/assets/<libraryName>` 受管 symlink/junction；该 link
  是可重建授权投影，不是 Asset 的实现方式。
- 删除 `openneko.assets` Tool、DSH plugin、ACP Host adapter 和 profile/runtime closure 注册。Entity
  mention 继续使用严格的 `AgentContextPayload`，不与文件 materialization 混合。

## Capabilities

### New Capabilities

- `workspace-resource-agent-ingest`: 定义 Asset 选择时复制、Media 受管链接和 Agent `@` 资源提交的
  单一路径。

### Modified Capabilities

- `dsh-agent-runtime-authority`: 删除 Assets domain Tool，并把 Asset mention 从 context payload 改为
  选择时生成的 Workspace locator。

## Impact

- `@neko/assets-domain` 拥有 materialization request/result contract 和 Asset/Media policy；
  `@neko/assets-node` 拥有精确 membership 解析、源文件校验、冲突安全复制与 Workspace locator 结果。
- `@neko/agent-contracts` 拥有最小 mention selection contract；`@neko/agent-webview` 复用现有 Mention
  UI，只请求 Host materialize 被选择的 Asset，不解释文件路径或 Asset membership。
- `apps/neko-desktop` 只解析 sender-bound Agent Surface、精确 Workspace grant 并组合 Assets public port；
  不拥有复制策略、目标命名或 Agent resource authority。
- DSH/ACP 仅消费复制后的 Workspace resource link；不接收 Asset membership、全局路径、Media connection
  或同步/恢复状态。
- 现有 Asset Library 文件、membership、Media connection、Workspace link、Entity、Character 和 World
  用户数据均不修改或迁移。失败只影响当前素材选择，已复制的普通 Workspace 文件保持不变。
