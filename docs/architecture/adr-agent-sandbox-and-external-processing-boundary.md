# ADR: Agent 沙箱与外部处理器边界

状态：Accepted

更新日期：2026-08-09

范围：Agent 工具执行、文件访问、外部图片/视频/音频处理器、用户脚本、资源投影、审批与 Desktop Host。

## 决策

Agent 不直接执行任意 shell、读取任意路径或加载任意插件代码。外部处理器只能作为 Desktop Host
受管、可取消、可审计的 Tool implementation；它们不构成第二套 Capability 系统或 Agent runtime。

```text
Agent Tool Call
  -> Capability policy + approval
  -> Desktop processor executor
  -> scoped input materialization
  -> bounded process/network execution
  -> quarantined output
  -> owning-domain validation and durable ingest
```

## Manifest 与发现

Processor manifest 使用一个版本化 JSON contract，声明 identity、来源、entrypoint、输入输出、
所需 executable、环境、网络、资源上限、取消和审批策略。发现、trust、enablement 与 lifecycle
由 Capability Host 管理；Renderer 和 Agent prompt 不直接加载 manifest 或实现文件。

重复 identity、未知版本、缺少 owner、entrypoint 不可解析、权限超出 policy 或签名/fingerprint
变化必须 fail-visible。开发期处理器不能自动升级为受信产品能力。

## 路径与输入

Processor 只接收 Host 解析后的 opaque resource、临时 materialized input 或明确授权的 workspace-
relative path。持久 contract 不保存绝对路径、resource URL、cache root 或 process handle。
PathAccessPolicy 拒绝越界、symlink escape、设备文件、程序配置与凭据目录。

Agent runtime 只传递 locator、intent 和 ownership，不调用文件系统或 cache 实现。Desktop output
storage 分配隔离临时目录；processor 不能选择 durable project/export 位置。

## 执行与审批

执行 snapshot 冻结 executable、arguments、environment allowlist、cwd、network policy、input digest、
output contract、timeout 与 resource limits。会改变项目、访问网络、运行用户代码、覆盖输出或产生
显著成本的操作需要明确审批；提交副作用前重新验证 identity、revision 和 permission。

stdout/stderr 有界采集并脱敏；退出码、signal、timeout、cancel、schema mismatch 和 output validation
分别返回 typed diagnostic。不得把部分输出、空文件或失败退出包装为成功。

### Agent 内容读取审批矩阵

内容处理先使用已授权资源与 immutable Turn capability snapshot 做确定性路由，模型不决定权限、provider
或处理器。普通本地只读操作不得逐次询问用户：已授权 Workspace 内的有界文本读取、文档 manifest/range、
图片 metadata、缩放、最多五张图片的 overview/detail/contact sheet，以及无网络的媒体 metadata/抽帧/OCR
属于自动允许的只读能力。

以下行为必须进入明确审批：扩大 Workspace 或资源 grant、访问网络、调用专用付费感知模型、预计产生显著
token/cost、执行用户代码或可执行文件、递归/大规模解包、覆盖或批量写入以及不可逆外部副作用。审批快照
必须冻结 exact Conversation/Turn/Tool、输入短引用解析出的 canonical locator、provider/model、成本等级、
读写范围与输出 owner。批准一个操作不得提升 sibling Tool、后续 Turn、其他 Conversation 或整个 Workspace
的权限。

权限拒绝、过期授权和单个处理器失败只拒绝当前 Tool Call 并返回可见 diagnostic；不得使 Agent Surface、
Window Shell 或 sibling Conversation 无法渲染。该矩阵是后续 permission runtime 收敛的架构约束；
`unify-agent-launch-and-domain-bindings` 的内容接口改造阶段只记录决策，不修改现有权限执行逻辑。

## 输出与生命周期

Processor 输出先进入隔离区。owning domain 校验 MIME、大小、结构、digest 和 provenance 后执行
durable ingest，并返回 `ContentLocator` 或领域 result。未接受输出由 Host 按 session/operation owner
清理；promote 后的 artifact 由目标 owner 管理，不再由 processor 删除。

cancel、timeout、Window/View detach、session replacement 和 app quit 必须终止进程树、关闭 stream、
撤销 resource registration 并清理未拥有临时文件。进程无法终止时产生高优先级 diagnostic。

## 验证

- manifest/schema/trust、路径逃逸、环境变量和 network policy 使用聚焦测试；
- timeout、cancel、进程树、partial output、invalid output 与 cleanup 使用真实子进程 fixture；
- producer/consumer 路径断言 Capability Tool、Desktop executor、validation 和 durable ingest；
- Renderer 资源展示与审批交互使用隔离 fixture 的真实 Electron 场景。

相关边界见 [`agent.md`](agent.md)、
[`cache-file-access-and-paths.md`](cache-file-access-and-paths.md)、
[`adr-agent-tool-call-domain-job-lifecycle-boundary.md`](adr-agent-tool-call-domain-job-lifecycle-boundary.md) 和
[`application-composition.md`](application-composition.md)。
