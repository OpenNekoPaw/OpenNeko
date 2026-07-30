## Evaluation Scope

- Change/feature: Agent composer 省略参数入口且不再发送语义 preset；媒体直出模式保留精确产出规格；媒体模型页明确分出感知/生成模型。
- Decision and owning suite: `excluded`; deterministic Agent Webview、tab render realm 与 Desktop surface validation 负责该 presentation-only 变更。
- Why real Evaluation is or is not required: 感知/生成分区只修改 presentation；Agent composer 删除 LLM config 投影并由 Webview protocol/payload deterministic tests 证明缺席。本变更不修改设置/配置 owner 的 Provider 参数映射、prompt/Skill、Tool routing、permission 或 AgentSession，因此排除 provider-backed 行为 case。
- Canonical path and forbidden fallback: `InputArea` → shared `ComposerConfigMenu` → chat model selection or media parameters / existing media-understanding and media-generation callbacks。禁止 Agent 参数入口、语义 preset 默认值、旧 `MediaModelChip`、独立参数 overlay、首个兼容模型和跨类别 fallback。

## Cases

- Reused, updated, created, or excluded: provider-backed case excluded；更新 deterministic `InputArea`、`input-area-presenter`、`ChatWorkspace` 与 tab render runtime 覆盖。
- Evidence and coverage: Agent 只有模式/模型入口且发送 payload 不含 LLM config；三种媒体模式的参数入口命中同一个 dialog；媒体模型页的感知/生成单选分别命中精确 purpose callback；`auto`/`none` 保持显式语义；busy 状态锁定当前可见入口。
- Missing observability: 无。当前变化止于 Webview callback 之前，运行时有效模型 identity 没有 coverage delta。

## Verification

- Key-free validation: `pnpm test:agent:eval`。
- Deterministic validation: Agent Webview full tests、typecheck/build、Desktop surface tests、strict OpenSpec validation 和 `git diff --check`。
- Real cases and reports: 不运行 provider-backed TUI case，因为 canonical runtime model binding、effective configuration 和请求 payload 未改变。
- Blocked or unexecuted cases: provider credentials、网络、真实模型输出和内容质量不在本 UI 变更验收范围。

## Interpretation

- Result and quality comparison: deterministic path tests证明新共享入口仍产生相同精确 callback identity，并删除旧独立媒体模型 dropdown 成功路径。
- Confirmed failures vs attribution hypotheses: 若后续 Desktop 发现模型选择后 effective identity 错误，应归因到既有 callback/Host projection 并转入 `agent-runtime.model-binding`；当前没有该运行时变化证据。

## Residual Risk

- Desktop renderer 已在临时复制的签名应用包中验证 Agent 无参数入口、对话仅模型页、图片感知/生成模型分区、图片精确参数页和直接图片模式底栏；正式宿主重打包仍被同一工作区中未完成的全局媒体库契约迁移阻塞。
- 本次不评价 provider 输出质量，也不宣称 key-free harness 等同真实 Agent 行为验收。
