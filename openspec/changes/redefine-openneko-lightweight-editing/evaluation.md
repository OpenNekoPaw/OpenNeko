## Evaluation Scope

- Change/feature: OpenNeko 将确定性轻剪辑与 Engine 生产任务保留为 canonical path，并把生成视频、高级视觉处理收敛为 External Processor 产生 immutable candidate、显式接受后再进入 NKV 的路径。
- Decision and owning suite:
  - `update` `skill.video`: 现有 `generate-video` 只证明 Tool/task 完成，需增加 candidate ResourceRef、provider/model/task provenance、媒体 validator、source preservation 和 no timeline mutation 证据。
  - `update` `skill.video-editing`: 现有 dialogue case 依赖宽泛 J/L cut/transition 表述，需改为 lightweight profile 的 trim/split、bounded overlay、subtitle、hard cut/fade/cross-dissolve、fixed speed、basic color/audio 与 explicit revision validation。
  - `update` `skill.color-grading`: 需把 exposure/contrast/temperature/tint/saturation 分类为内建基础修正，把 LUT/Wheels/Curves/HSL/secondary/complex grade 分类为 professional processor，防止全拒绝或误塞 basic effect。
  - `reuse` `skill.audio-mixing`: dialogue/music case 覆盖保留的 gain、ducking、loudness 与交付验证；若闭合 DSP 方法或 Skill 正文实际变化再转为 update。
  - `reuse` `skill.subtitle-assistant`: timed CJK case 仍覆盖字幕方法；NKV 字段、字体 fallback 与渲染 parity 使用确定性/运行态测试。
  - `update` `agent-runtime.creative-media-workflow`: 该 suite 已拥有 generated-output、task observation 与 durable artifact workflow，增加 video candidate validate/reject/accept 和 generate→accept→export 顺序案例。
  - `create` `agent-runtime.media-job-routing`: 当前 indexed suite 没有 owner 能双向证明 basic proxy/transcode/export 留在 Engine job，而生成/高级处理进入 External Processor；实现时把 `capability-tool-routing` 和 `creative-media-workflow` coverage 映射补到该 suite。
  - `excluded` NKV/OTIO codec、RenderPlan、GPU-only decoder、preview/export parity、job QoS/atomic output、DSP parity 和 Webview UI：这些使用 Rust/TypeScript/path/golden/Extension Development Host 验证，Agent 最终回答不能证明正确性。
- Why real Evaluation is required: capability/tool routing、processor trust/approval、task lifecycle、candidate delivery、revisioned acceptance 与 mixed workflow 都会改变真实 Agent 行为；schema 测试不能证明 basic export 未被外置、AI 输出未直接 mutation NKV，或无 processor 时没有 hidden fallback。
- Canonical path and forbidden fallback:
  - Basic media: user intent → explicit document/revision or source ResourceRef → Cut/Engine capability → typed job → terminal facts → validated ResourceRef/provenance。
  - Generative/professional: user intent → capability catalog → External Processor resolve/trust/approval → task → validated immutable candidate → explicit revisioned accept/reject。
  - Mixed: processor candidate → owning validator → explicit accept creates NKV revision → deterministic Cut/Engine stages → export freezes final revision。
  - Forbidden: removed Engine/Cut action、arbitrary shell/package-local FFmpeg、raw argv/filter、CPU video decode、wrong active project、provider success without artifact validation、direct candidate-to-project mutation、basic job unnecessarily externalized、no processor 时 fabricated success。

## Cases

- Updated `skill.video/generate-video`:
  - User behavior: 生成一个短视频并报告可预览但尚未导入项目的 candidate。
  - Canonical path: builtin video Skill → GenerateVideo/External Processor binding → video task → media validation → immutable candidate ResourceRef。
  - Evidence: full Skill Host identity/fingerprint、effective video model/provider、Tool/task terminal facts、candidate ResourceRef/content hash、validator result、input/source preservation 和 no Cut mutation。
  - Expected fail-visible behavior: task 成功但输出缺失/损坏/未授权时不得交付 candidate。
- Updated `skill.video-editing/dialogue-scene-edit-plan`:
  - User behavior: 为对白、B-roll 和字幕制定不执行工具的 lightweight edit plan。
  - Evidence: Skill identity；结构化计划只包含 lightweight operations、明确 target/revision 前置条件、audio sync、preview/export validation。
  - Forbidden fallback: mask、arbitrary effect、generic keyframe、time-remap/reverse、complex transition、false mutation claim。
- Updated `skill.color-grading/basic-versus-professional-grade`:
  - User behavior: 区分曝光/白平衡基础修正与 LUT/曲线/二级调色的执行路径。
  - Evidence: Skill identity；basic typed correction 与 professional handoff 分类、验证和未执行声明。
  - Forbidden fallback: shader/LUT upload 到 Engine、把所有调色都拒绝、把复杂 grade 伪装成基础参数。
- Created `agent-runtime.media-job-routing/export-lightweight-nkv`:
  - User behavior: 导出明确 URI/revision 的合法 NKV。
  - Canonical path: capability catalog → typed `timeline-export` Engine job → progress/terminal state → validated output ResourceRef/provenance。
  - Evidence: effective target/model、document/revision、capability/tool identity、job kind/profile、terminal status、artifact validator、no processor/process fallback。
- Created `agent-runtime.media-job-routing/basic-proxy-or-transcode`:
  - User behavior: 对授权素材创建受支持的 proxy 或 compatibility transcode。
  - Evidence: source ResourceRef、typed profile、Engine job facts、GPU decoder fact、new result ResourceRef/provenance、original source unchanged。
  - Forbidden fallback: External Processor、shell/argv、CPU decode、implicit project mutation。
- Created `agent-runtime.media-job-routing/delegate-advanced-video-processing`:
  - User behavior: 请求背景替换、tracking/upscale/interpolation 或 advanced grade/composition。
  - Canonical path: processor resolve → trust/approval → task terminal → media validation → immutable candidate。
  - Evidence: processor identity/version/trust、approval、input ResourceRefs、task state、candidate/provenance、no basic Engine/legacy action。
- Updated `agent-runtime.creative-media-workflow/video-candidate-acceptance`:
  - User behavior: 生成视频，等待真实 candidate，预览验证后以 matching document/revision 显式替换 selected clip。
  - Canonical path: generation task → candidate → validator → accept disposition → Cut authoring revision。
  - Evidence: process order、candidate and source identities、validation、document/expected/new revision、authoring receipt、undo capability、source not overwritten。
  - Boundary variant: stale revision preserves candidate and rejects mutation without active-editor retargeting。
- Updated `agent-runtime.creative-media-workflow/generate-accept-export`:
  - User behavior: 生成镜头、接受到 NKV、执行轻量音频/字幕调整并导出。
  - Evidence: ordered processor task → candidate validation → accept revision → deterministic authoring → Engine export frozen revision → output artifact；每阶段 ResourceRef/revision 连续。
  - Forbidden fallback: generation failure 后继续 export、未接受 candidate 直接进入 RenderPlan、final text 代替 artifact。
- Created `agent-runtime.media-job-routing/missing-professional-processor`:
  - User behavior: 无 eligible processor 时请求 profile-external 处理。
  - Evidence: resolve diagnostic、no Tool/process/job start、no candidate/artifact、no Engine/shell fallback。
  - Expected result: actionable unavailable-capability response，不声称完成或降级成功。
- Reused regressions:
  - `skill.audio-mixing/dialogue-music-mix-plan` 保护保留的音频 finishing 方法。
  - `skill.subtitle-assistant/timed-cjk-captions` 保护字幕内容方法。
  - `skill.media-production/missing-animation-capability` 仅保护缺能力 fail-visible 习惯，不替代本变更的 runtime path evidence。
- Missing observability: 实现前审计 TUI facts 是否暴露 capability/tool identity、document/revision、Engine job kind/profile/progress/terminal、GPU decode path、processor identity/trust/approval、candidate state、input/output ResourceRef/provenance、media validator、authoring receipt 和 invoked/forbidden path。缺失时只增加最小中立 runtime fact；无法观察的 case 标记 blocked，不得用文本匹配或 mock 替代。

## Verification

- Key-free validation: 实现阶段运行 change selector、`pnpm test:agent:eval`、coverage index 校验，以及所有 update/create case 的 indexed dry-run；校验 suite discovery、fingerprint、schema、assertion、artifact checker、report 和 retention policy。
- Real cases and reports: 通过 canonical TUI 和隔离 synthetic workspace 运行更新的 video/video-editing/color-grading cases，以及 media-job-routing、candidate acceptance、mixed workflow 和 missing-processor cases。基础媒体输出使用真实 Engine fixture 与 owning media validator；专业路径使用安全 synthetic processor fixture证明路由和生命周期，不据此声称真实专业软件质量。
- Blocked or unexecuted cases: 当前仅完成提案，未运行真实 case。若实现时缺少 credentials、network/model、GPU backend/media fixture、processor executable/sandbox、approval automation、artifact validator 或 runtime facts，记录 `infrastructure-blocked`、run attempt 和未验证行为；dry-run、mock、直接 turn injection 或手工文件不算验收。

## Interpretation

- 成功要求 basic authoring/job、professional processor、candidate acceptance 和 mixed workflow 各自命中唯一 canonical path，并具备 target revision、task/job terminal、artifact validation/provenance 和 no-fallback 证据。
- Skill 计划文本只证明方法和分类，不证明 Tool/job/process 执行；NKV/OTIO/GPU/renderer/Webview 正确性只由确定性与真实宿主测试证明。
- 任何 removed action、arbitrary command/filter、CPU decode、wrong project/revision、basic task externalization、advanced request 塞入 basic job、provider success 代替 validation、candidate direct mutation、缺 artifact identity 或 silent fallback 都是行为失败。
- 只有 owning media validator 或 suite-owned rubric/Judge 的真实输出可以形成质量结论；hard gates、延迟、token、cost 和单次成功不能替代内容质量或稳定性。

## Residual Risk

- Synthetic Engine/processor fixtures只能证明 OpenNeko 路由、生命周期、candidate 和 artifact contract，不能证明所有真实 codec、GPU driver、AI provider 或专业应用的输出质量。
- 三平台 GPU-only、三层性能和后台任务 QoS 仍需独立运行矩阵；Agent Evaluation 不能替代 Engine 性能验收。
- AI 生成具有非确定性；即使路径和 artifact 有效，也需要真实样本、owning validator 与可选 rubric 才能评价创意质量。
- OTIO adapter 差异、字体布局、编码器许可与输出质量仍由领域测试和分发审计承担。
