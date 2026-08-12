import type { MessageBundle } from '@neko/ui/i18n';

export const skillDescriptions = {
  'skillDescriptions.audio-mixing':
    '音频混音与声音设计助手。适用于已确认需要混音、调整音量、添加或平衡音乐、响度标准化、淡入淡出或自动闪避的任务。',
  'skillDescriptions.character-creator':
    '根据用户构想、提示词或已授权的项目资料创建可审阅的角色草稿。适用于设计新角色、从资料整理角色设定，或填充新选择的角色创作目标；不会自动发布或开始角色扮演。',
  'skillDescriptions.color-grading':
    '调色与色彩校正助手。适用于已确认需要调整色彩、曝光、对比度、白平衡、LUT、饱和度或电影感风格的任务。',
  'skillDescriptions.image':
    '通过与具体服务无关的能力生成、编辑、扩展、增强、上色、合成、拆分或整理图像。',
  'skillDescriptions.media-production':
    '根据当前可用的领域能力与实际产出，灵活组织从源素材到交付成果的制作流程，并在每一步重新评估。',
  'skillDescriptions.media-quality-review':
    '使用绑定具体修订的证据与策略化质量门禁，审查创意素材、分镜、项目、最终剪辑和导出成果。',
  'skillDescriptions.scene-to-music':
    '分析时间线场景并规划匹配的背景音乐，在能力可用时交给音乐生成和时间线创作流程。适用于场景配乐、添加背景音乐或为时间线生成音乐。',
  'skillDescriptions.script-generation':
    '专业剧本创作助手，提供类型模板与迭代完善。适用于创作或修改电影剧本、Fountain 脚本、故事结构、角色弧光或剧本模板。',
  'skillDescriptions.script-to-timeline':
    '剧本转时间线助手。适用于将 Fountain 脚本或电影剧本转换为时间线或视频项目。',
  'skillDescriptions.skill-creator':
    '创建或更新可复用、可移植 Agent Skill 的指南。适用于设计、创建、完善、验证或前向测试 Skill 包，且不强制使用特定宿主的创作入口。',
  'skillDescriptions.storyboard':
    '以灵活的 Markdown 探索提示词、文本、剧本、文档、漫画、图像序列或现有分镜；仅在明确需要专业结构化创作时生成规范分镜。',
  'skillDescriptions.subtitle-assistant':
    '字幕与说明文字助手。适用于创建、编辑、校时、翻译、导入或导出 SRT、VTT 等字幕。',
  'skillDescriptions.video':
    '根据提示词、图像、关键帧或参考视频生成或转换单个视频片段，与时间线剪辑分开处理。',
  'skillDescriptions.video-editing':
    '面向时间线操作的视频剪辑助手。适用于裁剪或拆分片段、合并片段、添加转场或调整时序。',
} as const satisfies MessageBundle;
