# Kunpeng 创作 Skill 与提示词模板参考审计

- 日期：2026-08-23
- 上游仓库：<https://github.com/pengfeiqiao/kunpeng>
- 观察提交：`33e2831ecd2e544bb9277282416d43bb89634767`
- 许可证：MIT；若复制实质内容需保留其版权与许可证声明
- 状态：实现输入，不是 OpenNeko 稳定架构事实

## 已检查来源

- `aigc-memory/prompt-templates/`：GPT Image、Kling 与 Seedance 模板。
- `skills/film-master`、`scene-image-anchor`、`video-style-replication`：镜头设计、视觉锚定与参考片迁移。
- `skills/internet-ad-director`、`script-doctor`：渐进确认与证据优先分析。
- `skills/canvas-project-manager`、`jimeng-cli`：Tool schema、付费确认和异步终态边界。

## 可迁移方法

- 镜头先说明叙事任务，再确定主体动作、景别/机位理由、空间关系、光线和剪辑接点。
- 多镜头一致性依赖真实角色、场景、道具与色彩参考；同环境共享空间拓扑和主光方向。
- 参考片应抽取钩子、信息顺序、镜长、景别、机位、声音和包装规则，替换原片人物、品牌与受保护镜头内容。
- 视频提示词应区分主体、动作、空间、时间顺序、镜头、音频、参考角色和约束；精确语法由当前模型/Tool schema 决定。
- 分析建议优先采用“证据→根因→最小有效改动→预期效果”。
- references 按任务需要读取，而非将案例库和所有模式预载入正文。

## 不采用内容

- Kunpeng 私有 `displayName`、`category`、`visibility`、`triggers`、模板 `version` 等 package metadata。
- `~/.kunpeng`、`~/.openclaw`、本地脚本、API endpoint、密钥环境变量和私有 Tool 名。
- 自称“唯一权威”的模板入口、未附官方链接/日期的模型参数，以及固定供应商选择。
- 默认九宫格、自动镜头/焦段分配、强制完整评分报告和未经证据支持的量化效果声明。
- 将画布 schema、付费操作、异步任务协议或 provider fallback 写入创作 Skill。

## OpenNeko 映射与不确定性

- 电影镜头、视觉连续性和参考片方法进入 `storyboard` 按需 references。
- 单片段提示词语义进入 `video` 按需 reference；当前 capability/schema 拥有执行事实。
- 证据优先诊断进入 `content-authoring` 的分析报告 reference。
- 广告导演和剧本评估暂不新增 Skill；需要独立触发、组合价值、上下文成本和真实模型质量证据。
- Seedance 模板的官方来源、当前参数和引用语法未由本次审计从一手厂商文档复核，因此不得作为运行契约。
