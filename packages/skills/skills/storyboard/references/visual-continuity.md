# Cross-shot Visual Continuity

## 中文指南

用于共享角色、道具或环境的多个镜头。写提示词前先确定每个授权参考的角色：分镜/构图参考控制框架与主体关系，场景参考控制拓扑、材质、时间、天气与动机光，角色/道具参考控制稳定身份和状态，色板/风格参考控制视觉系统但不替代来源事实。

按地点、时间、天气和主光分组；组内保持拓扑、出入口、地标、关键材质和主光方向，允许机位、景别、表演和剧情状态变化。跨组要明确转场，不强迫一个环境锚点覆盖不兼容场景。跟踪角色身份/服装、道具归属与状态、屏幕方向、动作阶段、天气、损伤、时间和光线进展；有意不连续必须明确。reference 顺序、identity 和输入数量只能来自当前 capability 与 Tool schema，不能发明别名、文件名、handle 或索引。

## English guidance

Use this guide for multiple shots that share characters, props or an environment.

Identify the role of every authorized reference before writing prompts:

- an existing Storyboard or composition reference controls framing and subject relationships;
- a scene reference controls spatial topology, materials, time, weather and motivated light;
- character references control identity, wardrobe and stable appearance;
- prop references control design and story state;
- a palette or style reference controls the intended visual system without replacing source facts.

Group shots by location, time, weather and primary light. Within a group, preserve room or terrain topology, entrances, windows, landmark positions, key materials and main light direction. Permit camera position, shot size, performance, local dressing and story-required state to change. Across groups, state the transition instead of forcing one environment anchor onto incompatible scenes.

When no approved scene reference exists, the first creator-approved environment result may become the group anchor. Until approval, it is a candidate output rather than project truth. One isolated shot still checks character, prop, scene and palette bindings; it does not require an extra anchor asset.

Track state that must cross edits: character identity and wardrobe, prop ownership/condition, screen direction, body/action phase, weather, damage, time and light progression. Make intentional discontinuities explicit.

Reference order, identifiers and supported input count come only from the current capability result and Tool schema. Never invent positional aliases, filenames, media handles or reference indices. Regeneration should preserve only the current authorized references and settings reported by the owning runtime, and a successful sibling shot does not prove continuity for an unreviewed result.
