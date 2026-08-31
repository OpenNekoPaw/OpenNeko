# AI production graph and iteration

## 中文指南

本方法用于镜头级图像、视频或音频生产。它是一张依赖图，不是固定流水线：复用仍有效的上游结果，并省略当前交付不需要的节点。

### 1. 锁定可复用证据

- 每个场景和镜头都绑定真实来源证据。
- 复用已批准的角色、地点、道具、色板、声音或运动参考。
- 每个参考只承担一个明确角色：身份、当前状态、空间/构图、风格或运动。写清操作必须继承和必须忽略的内容。
- 不得让方便使用的生成图静默替代角色、故事或镜头事实。

### 2. 先编译场景，再写提示词

存在空间或连续性风险时，先建立紧凑场景图：主体位置、出入口、朝向、视线方向、景深层次、机位侧和持续环境事实。随后定义镜头契约：

- 来源节拍和叙事变化；
- 主体在镜头开始与结束时的状态；
- 景别、机位关系、主体动作、环境响应和时长；
- 从前一个入选结果继承的连续性；
- 预期的图像、视频、音频或剪辑操作，以及使用它的下游。

操作和参考角色未确定前，不写生成提示词。

### 3. 编写操作专用提示词

只写所选操作需要的内容。推荐顺序是：主体/状态、动作或变化、环境、构图/机位、光线/风格、节奏或表演、参考继承、排除项。分开处理图像的外观与构图、视频的运动与机位、音频的结构。不要把多个可独立失败的镜头或转换塞进一个请求。

计划输出必须把这些内容组成可直接提交的调用包，而不是提示词写作建议。一个调用包只保留：

- 当前能力中的精确操作；
- 来源与参考输入，以及每个参考的单一角色；
- 可直接提交的 prompt 或结构化输入；
- 直接产物与可观察验收；
- 入选结果将进入的下一次调用或项目位置。

主题、风格、镜头或角色分析只有在被改写为调用输入、参考角色或验收条件后才保留。没有明确消费者的信息不输出。

调用执行后，不以新的总结文档取代它。保留一条可重放的生成记录：实际能力/模型操作、提交输入与参考角色、返回资产、可观察问题、入选/淘汰决定和下游绑定。后续处理必须能从该记录直接复用入选结果或修改一个输入后再生成。

### 4. 只展开当前生产前沿

- 默认只完整输出一个 `ready` 调用：它的全部来源和上游结果已经存在，且当前能力可以接收。
- 当前调用只验证一个主要创作问题。角色身份、外观、空间构图、尺度、风格、运动、表演、威胁、声音和剪辑节奏中仍未锁定的独立层不能塞进同一次调用；先生成成本最低、可控制下一调用的上游基准。
- 依赖未生成或未入选结果的节点标记为 `blocked`，只说明“什么结果通过后进入什么操作”，暂不编写提示词或验收细节。
- 用户明确要求总图时最多展示三个节点，但仍只有一个当前节点；前一节点通过后再展开下一节点。
- 对照最终声称的交付物做闭环检查。未被生成、剪辑、组装或验收的关键内容必须明确列为缺口；只验证空间、角色、运动或声音之一时，不得把它命名为完整样片方案。

### 5. 生成可观察的候选批次

- 通过当前已准入能力提交真实生成或编辑操作。
- 同一比较批次内保持来源绑定、参考角色、意图和关键设置稳定。
- 只有候选回答同一个创作问题时才并行生成。
- 等待终态并检查返回产物。已提交任务、提示词或任务状态都不是入选素材。

### 6. 根据可见结果选择或修复

依据镜头契约和下游用途检查真实结果。指出可观察失败，把它归到一个责任层，并且一次只改变一个主要层：

- 身份/状态失败 → 参考选择或继承；
- 构图/空间失败 → 场景图、调度或图像操作；
- 运动/表演失败 → 视频提示、节奏或首帧；
- 风格/光线失败 → 风格或照明指令；
- 剪辑/节奏失败 → 镜头边界、时长或时间线操作。

保留已经有效的部分。重复修复仍不收敛时，简化动作、拆分镜头、替换冲突参考，或返回创作者决策点，不要继续堆叠提示词条款。

### 7. 只提交入选结果

只有已观察并入选的结果才能进入下一次生成、Storyboard 绑定、时间线放置或导出。当前能力允许时，通过 owning authoring capability 应用；否则返回入选素材和精确的下游阻塞，不得声称已完成项目集成。

### 输出验收

交付前逐项检查：这条信息会被哪一次模型调用、候选选择、项目修改或创作者决定消费？无法命名消费者时删除。产物无法通过真实返回结果判定通过/失败时，该单元不可验收。

## English guidance

Use this method for shot-level image, video, or audio production. It is a dependency graph, not a mandatory pipeline: reuse valid upstream results and omit nodes that the requested deliverable does not need.

### 1. Lock reusable evidence

- Bind every scene and shot to actual source evidence.
- Reuse approved character, location, prop, palette, voice, or motion references.
- Assign each reference one role: identity, current state, spatial/composition control, style, or motion. State what the operation must inherit and what it must ignore.
- Do not let a convenient generated image silently replace a character, story, or shot fact.

### 2. Compile a scene before prompting

For scenes with spatial or continuity risk, establish a compact scene map: subject positions, entrances and exits, facing, screen direction, depth layers, camera side, and persistent environment facts. Then define each shot contract:

- source beat and narrative change;
- subjects and state at the shot start and end;
- framing, camera relation, subject action, environment response, and duration;
- continuity inherited from the previous selected result;
- intended image, video, audio, or edit operation and its downstream consumer.

Do not write a generation prompt until the operation and reference roles are known.

### 3. Build an operation-specific prompt

Write only what the selected operation needs. A useful order is subject/state, action or change, environment, composition/camera, light/style, timing or performance, reference inheritance, then exclusions. Separate image appearance/composition from video motion/camera and from audio structure. Do not combine several independently failing shots or transformations into one overloaded request.

For planning output, assemble that material into one directly submit-ready call packet: admitted operation, exact source/reference roles, prompt or structured input, direct artifact, observable acceptance, and next consumer. Keep analysis only after it has been converted into one of those fields.

### 4. Expand only the current production frontier

- Fully specify one `ready` call whose sources and selected upstream results already exist.
- Make the current call answer one primary creative uncertainty. Do not overload it with independently unlocked identity, appearance, composition, scale, style, motion, performance, threat, sound, and edit rhythm; start with the lowest-cost prerequisite that can control the next call.
- Mark calls that depend on ungenerated or unselected results as `blocked`; name only the transition that will unlock them.
- When the user explicitly requests a broader graph, show at most three nodes while keeping only one current node expanded.
- Check closure against the claimed deliverable. Name uncovered generation, assembly, edit, or validation work as a gap; do not call a single-aspect test a complete teaser, pilot, scene, or film plan.

### 5. Generate observable batches

- Submit a real generation or edit operation through the current admitted capability.
- Keep source bindings, reference roles, intent, and important settings stable inside one comparison batch.
- Generate parallel candidates only when they answer the same creative question.
- Wait for terminal results and inspect the returned artifacts. A submitted job, prompt text, or task status is not a selected asset.

Persist or return a replayable generation record for each completed call: actual capability/model operation, submitted prompt and reference roles, returned asset, observed issue, selection decision, and downstream binding. Do not replace that record with a narrative summary.

### 6. Select or repair from visible evidence

Evaluate the actual result against the shot contract and downstream use. Name the observable failure, assign it to one responsibility layer, and change one major layer at a time:

- identity/state failure -> reference choice or inheritance;
- composition/spatial failure -> scene map, blocking, or image operation;
- motion/performance failure -> video prompt, timing, or starting frame;
- style/light failure -> style or lighting instruction;
- edit/rhythm failure -> shot boundary, duration, or timeline operation.

Preserve what already works. If repeated repairs do not converge, simplify the action, split the shot, replace a conflicting reference, or return a creator decision instead of accumulating prompt clauses.

### 7. Commit only selected results

Only a selected, observed result may feed the next generation, Storyboard binding, timeline placement, or export. Apply it through the owning authoring capability when that operation is currently admitted. Otherwise return the selected asset plus the exact blocked downstream binding; do not claim project integration.
