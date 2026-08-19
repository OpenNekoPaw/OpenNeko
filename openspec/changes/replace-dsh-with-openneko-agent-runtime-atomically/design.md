## Context

当前分支已经把 DSH 提升为 Agent loop、Session、Tool、Skill/MCP/plugin 和 Desktop projection 的 authority，
并为此删除 OpenNeko 原有的 Agent application/controller、Pi adapter、Capability registry、MCP manager、Skill
Host、领域 Tool provider 和 Webview typed protocol。DSH 同时要求独立 profile、subprocess supervisor、ACP
client、reverse Host Tool、permission/session Host 与 bundle closure，形成了与本地 Electron 产品边界不成比例
的协议层和重复生命周期。

DSH 引入前的 canonical 设计已经把职责分开：Pi 负责通用模型 loop、provider protocol、Skill parsing/read 和
Tool scheduling；OpenNeko Agent package 负责 Conversation/Turn/queue/permission、immutable configuration、
Capability registry、领域 Job 和 Desktop projection；领域 package 通过窄 public provider 提供行为。此设计
直接满足内容创作产品对模型选择、模式、上下文、Generation/Canvas/Cut 等能力的要求，并复用既有最终 UI。

本变更是 L4 prelaunch 原子替换。不能通过保留 DSH adapter、feature flag、dual registration 或失败后切换
runtime 分阶段上线。

## Five-layer analysis

- **Responsibility:** `@neko/agent-runtime` 拥有 Agent application/session/task；Pi adapter 拥有第三方 loop
  转换；各领域 package 拥有业务 operation；Desktop 只拥有 Electron trust/resource boundary；Webview 只
  渲染投影。
- **Dependency:** Agent runtime 依赖领域 public contract/port，不导入领域 Node repository internals；
  Desktop 注入 concrete file/credential/process/grant adapter；Renderer 不访问 Node、Electron 或物理路径。
- **Interface:** canonical Tool contract、Capability provider、Conversation identity、typed Host message 和
  immutable turn configuration 各只有一个 shape；删除 DSH/ACP shape，不增加 compatibility alias。
- **Extension:** 新领域通过 exact provider registration 接入同一 Capability registry；registry 禁止 wildcard、
  duplicate overwrite、try-next 和 active/current owner fallback。
- **Testing:** package contract/unit、Desktop producer-consumer、path poison、boundary gates、key-free Evaluation
  与可见真实 Desktop/provider lane 分层验证。

## Decisions

### 1. OpenNeko Agent application authority is canonical

恢复 `@neko/agent-runtime/application` 的 Conversation catalog/lifecycle、launch、queue、approval、configuration
和 domain binding service。Pi 仅位于真实第三方 runtime adapter 边界，不能成为 Workspace、Project、
Generation Job 或 Desktop scene authority。不存在 DSH subprocess、ACP client 或 Remote Tool Host。

### 2. Domain capabilities use one exact registry path

`ToolRegistry` 保存 exact Tool identity；`CapabilityRegistryRuntime` 消费 exact provider manifest 并注册当前
Conversation/Turn 允许的 Tool。Content、Generation、Canvas、Cut、Search 和 Automation 的 adapter 只做
Agent Tool args/result 与 owning public port 的格式转换。领域执行失败只终止当前 Tool call；不得切换 DSH、
MCP wrapper、其他 provider 或 raw file path。

MCP 和 Skill 是 Agent runtime 自身的受控扩展边界，不是领域能力的第二 owner。官方/用户显式配置的 MCP
server 通过唯一 MCP manager 注册 exact Tool；Skill 通过 Host-owned source/trust/catalog 与 Pi `read_skill`
加载。两者不得重新引入旧 activation protocol 或 DSH profile。

### 3. Reuse the existing Agent Webview

恢复 `@neko/agent-webview` public Root 和其 canonical typed Host message protocol。Desktop renderer 只组合该
Root；composer、模型选择、模式切换、上下文栏、消息/Tool timeline、usage 和 approval 继续由现有组件拥有。
本变更不创建新 Desktop Agent UI 组件，也不把旧 UI 复制到 app package。

### 4. DSH data remains untouched but cannot be a success source

代码和打包删除 DSH runtime，不删除用户目录。OpenNeko canonical Conversation/catalog 能解析的记录正常
显示；无法解析的记录保留 authoritative bytes/record，并在精确记录位置返回 unsupported diagnostic。不能
启动 DSH、读取旧 DSH projection、导入/转换 transcript、返回空 transcript 或选择最近 Conversation 来伪装
成功。若当前 catalog 不能投影这类失效记录，实施必须把该缺口记录为阻塞，不能宣称数据验收完成。

### 5. Atomic deletion and path-level proof

替换按一个代码提交原子切换生产边界：恢复 canonical producer/consumer 后，同一提交删除 DSH packages、
imports、exports、IPC、profile、runtime resource、scripts、quality inventory、dependency allowances 与测试。
poison gate 必须拒绝 production `dsh`/ACP registration，focused tests 必须证明 domain Tool 命中 exact provider
且毒化 DSH path 不参与。

## Evaluation disposition

能力注册、Tool 路由、provider/Skill/MCP/session 和 Desktop projection 都可能改变真实 Agent 行为，因此
需要更新 owning Agent Evaluation coverage。先运行 key-free schema/runner/all-suite gate；随后通过可见真实
Electron UI 和真实 provider 验证 composer、模型/模式/上下文以及至少一个领域 Tool。缺少配置、凭据、网络、
模型访问或成本授权时记录精确 `infrastructure-blocked`，不得用 direct runtime、mock 或最终文本替代。

## Risks / Trade-offs

- 恢复范围大，可能重新暴露 DSH cutover 期间删除后发生变化的 package contract；通过原子 producer/consumer
  恢复、全 typecheck、boundary 和 path poison 处理，不保留桥接层。
- DSH 期间创建的 transcript 不能被 canonical runtime 解码；数据不删除，但可用性必须局部 fail-visible，
  真实历史记录投影未验证前保持发布阻塞。
- Pi 仍是第三方 runtime adapter，初始兼容性问题需由 adapter contract/tests 解决；不能以此为理由再引入
  第二 Agent runtime。
- 真实 provider 与可见 Desktop 验收可能受本机配置和成本授权阻塞，必须明确记录剩余风险。

## Replacement plan

1. 固化本 OpenSpec、DSH 删除清单、用户数据边界和 Evaluation disposition。
2. 原子恢复 OpenNeko Agent contracts/runtime/Webview/Desktop producer-consumer，并删除全部 DSH 产品路径。
3. 恢复既有领域 capability providers、Skill 和 MCP 的 exact registration，补 path-level poison tests。
4. 运行 package tests/typecheck、Desktop focused tests、boundary/unused/debt/OpenSpec gates。
5. 运行 key-free Evaluation；尝试可见真实 Desktop/provider 验收并记录 blocker 或报告。

Rollback 只能整体回退本替换提交；不得单独恢复 DSH adapter、IPC 或 plugin 形成平行成功路径。
