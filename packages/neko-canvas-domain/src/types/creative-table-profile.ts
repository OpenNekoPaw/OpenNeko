export const CREATIVE_TABLE_FIELD_ROLES = ['approval', 'plan', 'execution'] as const;

export type CreativeTableFieldRole = (typeof CREATIVE_TABLE_FIELD_ROLES)[number];

export const CREATIVE_TABLE_VALUE_TYPES = [
  'text',
  'number',
  'duration',
  'boolean',
  'enum',
  'resource-token',
  'prompt',
  'action',
  'status',
  'result-ref',
] as const;

export type CreativeTableValueType = (typeof CREATIVE_TABLE_VALUE_TYPES)[number];

export const CREATIVE_TABLE_PROMPT_SCOPES = ['shot', 'scene'] as const;

export type CreativeTablePromptScope = (typeof CREATIVE_TABLE_PROMPT_SCOPES)[number];

export const CREATIVE_TABLE_PROMPT_MEDIA_TYPES = ['image', 'video', 'audio'] as const;

export type CreativeTablePromptMediaType = (typeof CREATIVE_TABLE_PROMPT_MEDIA_TYPES)[number];

export const CREATIVE_TABLE_PROMPT_OPERATIONS = ['generate', 'edit'] as const;

export type CreativeTablePromptOperation = (typeof CREATIVE_TABLE_PROMPT_OPERATIONS)[number];

export interface CreativeTableFieldLabel {
  readonly en: string;
  readonly 'zh-cn': string;
}

export interface CreativeTablePromptSlotDescriptor {
  readonly scope: CreativeTablePromptScope;
  readonly mediaType: CreativeTablePromptMediaType;
  readonly operation: CreativeTablePromptOperation;
}

export interface CreativeTableProductionMapping {
  readonly target:
    | 'storyboardPrompt.imagePromptDocument'
    | 'storyboardPrompt.videoPromptDocument'
    | 'storyboardPrompt.voicePromptDocument'
    | 'storyboardPrompt.generationParams'
    | 'review.metadata'
    | 'none';
}

export interface CreativeTableFieldDescriptor {
  readonly id: string;
  readonly role: CreativeTableFieldRole;
  readonly valueType: CreativeTableValueType;
  readonly labels: CreativeTableFieldLabel;
  readonly aliases: readonly string[];
  readonly promptSlot?: CreativeTablePromptSlotDescriptor;
  readonly enumValues?: readonly string[];
  readonly resourceColumn?: boolean;
  readonly productionMapping?: CreativeTableProductionMapping;
}

export interface CreativeTableOperationRequirement {
  readonly operationId:
    'image.shot.generate' | 'image.shot.edit' | 'video.scene.generate' | 'video.scene.edit';
  readonly label: string;
  readonly requiredFieldIds: readonly string[];
  readonly acceptedPromptFieldIds: readonly string[];
}

export interface CreativeTableProfileDescriptor {
  readonly profileId: string;
  readonly aliases: readonly string[];
  readonly displayName: string;
  readonly reviewKind: string;
  readonly unknownColumnPolicy: 'preserve' | 'reject';
  readonly recommendedHeaders: readonly string[];
  readonly minimumFieldGroups: readonly (readonly string[])[];
  readonly fields: readonly CreativeTableFieldDescriptor[];
  readonly operationRequirements: readonly CreativeTableOperationRequirement[];
}

export interface CreativeTableHeaderClassification {
  readonly matchedProfile: boolean;
  readonly knownFields: readonly CreativeTableFieldDescriptor[];
  readonly unknownHeaders: readonly string[];
  readonly missingMinimumGroups: readonly (readonly string[])[];
}

const STORYBOARD_DECISION_VALUES = [
  'keep',
  'skip',
  'merge',
  'split',
  'duplicate',
  'reference-only',
] as const;

const STORYBOARD_REVIEW_STATUS_VALUES = [
  'needs-review',
  'needs-panel-analysis',
  'needs-resource-binding',
  'needs-prompt',
  'approved',
  'rejected',
] as const;

export const STORYBOARD_CREATIVE_TABLE_RECOMMENDED_HEADERS = [
  'scene',
  'shot',
  'source',
  'imagePrompt',
  'videoPrompt',
  'duration',
  'dialogue',
] as const;

export const STORYBOARD_CREATIVE_TABLE_PROFILE: CreativeTableProfileDescriptor = {
  profileId: 'storyboard',
  aliases: [
    'storyboard',
    'storyboard.ai-native',
    'canvas.tableProfile.storyboard',
    'creative-table.storyboard',
  ],
  displayName: 'Storyboard',
  reviewKind: 'storyboard',
  unknownColumnPolicy: 'preserve',
  recommendedHeaders: STORYBOARD_CREATIVE_TABLE_RECOMMENDED_HEADERS,
  minimumFieldGroups: [
    ['scene', 'shot'],
    ['visual', 'source', 'imagePrompt', 'prompt', 'videoPrompt'],
  ],
  operationRequirements: [
    {
      operationId: 'image.shot.generate',
      label: 'Generate shot image',
      requiredFieldIds: ['imagePrompt'],
      acceptedPromptFieldIds: ['imagePrompt', 'prompt'],
    },
    {
      operationId: 'image.shot.edit',
      label: 'Edit shot image',
      requiredFieldIds: ['imagePrompt'],
      acceptedPromptFieldIds: ['imagePrompt', 'prompt'],
    },
    {
      operationId: 'video.scene.generate',
      label: 'Generate scene video',
      requiredFieldIds: ['videoPrompt'],
      acceptedPromptFieldIds: ['videoPrompt'],
    },
    {
      operationId: 'video.scene.edit',
      label: 'Edit scene video',
      requiredFieldIds: ['videoPrompt'],
      acceptedPromptFieldIds: ['videoPrompt'],
    },
  ],
  fields: [
    approvalField('scene', 'Scene', '场景', ['场景', '场次']),
    approvalField('shot', 'Shot', '镜头', [
      'shot id',
      'shotid',
      '镜头',
      '镜头编号',
      '镜号',
      '分镜',
    ]),
    approvalField(
      'source',
      'Source',
      '来源',
      [
        'image',
        'images',
        'resource',
        'reference',
        'ref',
        'media',
        '来源',
        '源页',
        '来源页',
        '图片',
        '图像',
        '图像引用',
        '素材',
        '参考图',
      ],
      { valueType: 'resource-token', resourceColumn: true },
    ),
    approvalField('sourcePanel', 'Source Panel', '来源分格', [
      'source panel',
      'sourcepanel',
      'panel',
      'panel ref',
      'panelref',
      '来源分格',
      '分格',
      '分格位置',
      '对应分格',
      '裁切',
    ]),
    approvalField(
      'decision',
      'Decision',
      '决策',
      ['keep skip split', '保留决策', '决策', '处理', '画面判断'],
      {
        valueType: 'enum',
        enumValues: STORYBOARD_DECISION_VALUES,
      },
    ),
    planField('duration', 'Duration', '时长', ['time', 'seconds', '时长', '时长秒', '时长建议'], {
      valueType: 'duration',
    }),
    approvalField('visual', 'Visual', '画面', [
      'visual description',
      'visualdescription',
      'description',
      'content',
      '画面',
      '画面内容',
      '画面描述',
      '视觉',
      '分镜建议',
    ]),
    planField('motion', 'Motion', '运镜', [
      'camera',
      'camera movement',
      'cameramovement',
      '运镜',
      '镜头运动',
      '运动建议',
      '动作与节奏',
    ]),
    approvalField('audio', 'Audio', '音频', [
      'sound',
      'sfx',
      '音频',
      '声音',
      '音效',
      '声音/氛围',
      '氛围',
    ]),
    approvalField('characters', 'Characters', '人物', ['character', 'cast', '人物', '角色']),
    approvalField('dialogue', 'Dialogue', '对白', [
      'voiceover',
      'voice over',
      'text',
      '台词',
      '旁白',
      '对白',
      '文本/对白',
    ]),
    planField(
      'prompt',
      'Prompt',
      '提示词',
      [
        'generation prompt',
        'generationprompt',
        'visual prompt',
        '提示词',
        '生成提示词',
        '视觉提示词',
        '动画化提示',
      ],
      {
        valueType: 'prompt',
        promptSlot: { scope: 'shot', mediaType: 'image', operation: 'generate' },
        productionMapping: { target: 'storyboardPrompt.imagePromptDocument' },
      },
    ),
    planField(
      'imagePrompt',
      'Image Prompt',
      '图像提示词',
      [
        'image prompt',
        'keyframe prompt',
        'keyframeprompt',
        '关键帧提示词',
        '图像提示词',
        '图片提示词',
        '生图提示词',
        'image edit prompt',
        'imageeditprompt',
        'edit prompt',
        'redraw prompt',
        'inpaint prompt',
        '图像编辑提示词',
        '图片编辑提示词',
        '重绘提示词',
        '修图提示词',
        '补绘提示词',
        'scene style prompt',
        'scenestyleprompt',
        'style prompt',
        '场景风格提示词',
        '风格提示词',
      ],
      {
        valueType: 'prompt',
        promptSlot: { scope: 'shot', mediaType: 'image', operation: 'generate' },
        productionMapping: { target: 'storyboardPrompt.imagePromptDocument' },
      },
    ),
    planField(
      'videoPrompt',
      'Video Prompt',
      '视频提示词',
      [
        'video prompt',
        'videoprompt',
        'video edit prompt',
        'videoeditprompt',
        'scene video prompt',
        'scenevideoprompt',
        'scene video edit prompt',
        'scenevideoeditprompt',
        'scene edit prompt',
        '视频提示词',
        '视频编辑提示词',
        '视频重绘提示词',
        '局部视频编辑提示词',
        '场景视频提示词',
        '整场视频提示词',
        '长视频提示词',
        '场景视频编辑提示词',
        '整场视频编辑提示词',
        '长视频编辑提示词',
      ],
      {
        valueType: 'prompt',
        promptSlot: { scope: 'scene', mediaType: 'video', operation: 'generate' },
        productionMapping: { target: 'storyboardPrompt.videoPromptDocument' },
      },
    ),
    planField(
      'sceneDuration',
      'Scene Duration',
      '场景时长',
      ['scene duration', 'sceneduration', '场景时长', '总时长'],
      {
        valueType: 'duration',
        productionMapping: { target: 'storyboardPrompt.generationParams' },
      },
    ),
    approvalField(
      'reviewStatus',
      'Review Status',
      '审阅状态',
      ['review status', 'reviewstatus', 'status', '审阅状态', '状态'],
      {
        valueType: 'status',
        enumValues: STORYBOARD_REVIEW_STATUS_VALUES,
      },
    ),
    planField('nextAction', 'Next Action', '建议操作', [
      'next action',
      'nextaction',
      'action',
      'operation',
      '执行',
      '下一步',
      '下一步操作',
      '建议操作',
      '操作',
    ]),
    approvalField(
      'contentType',
      'Content Type',
      '内容类型',
      ['content type', 'contenttype', 'type', '内容类型', '类型'],
      {
        valueType: 'enum',
        enumValues: ['story', 'cover', 'metadata', 'reference', 'transition'],
      },
    ),
    planField('decisionReason', 'Decision Reason', '决策理由', [
      'decision reason',
      'decisionreason',
      'reason',
      '决策理由',
      '原因',
      '备注',
    ]),
    planField(
      'requiresSplit',
      'Requires Split',
      '需要拆分',
      ['requires split', 'requiressplit', 'split', '需要拆分', '是否拆分', '拆分'],
      {
        valueType: 'boolean',
      },
    ),
    approvalField('duplicateOf', 'Duplicate Of', '重复来源', [
      'duplicate of',
      'duplicateof',
      'duplicate',
      '重复来源',
      '重复于',
      '去重',
    ]),
    executionField(
      'actionId',
      'Action ID',
      '动作 ID',
      ['action id', 'actionid', '可信动作', '动作ID'],
      {
        valueType: 'action',
      },
    ),
    executionField(
      'resultRef',
      'Result Ref',
      '结果引用',
      ['result ref', 'resultref', '结果引用', '结果 ref'],
      {
        valueType: 'result-ref',
      },
    ),
    executionField(
      'executionStatus',
      'Execution Status',
      '执行状态',
      ['execution status', 'executionstatus', '执行状态'],
      {
        valueType: 'status',
      },
    ),
  ],
};

export function normalizeCreativeTableHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '');
}

export function resolveCreativeTableField(
  profile: CreativeTableProfileDescriptor,
  header: string,
): CreativeTableFieldDescriptor | undefined {
  const normalized = normalizeCreativeTableHeader(header);
  const exactField = profile.fields.find((fieldDescriptor) =>
    [fieldDescriptor.id, fieldDescriptor.labels.en, fieldDescriptor.labels['zh-cn']].some(
      (candidate) => normalizeCreativeTableHeader(candidate) === normalized,
    ),
  );

  if (exactField) return exactField;

  return profile.fields.find((fieldDescriptor) =>
    fieldDescriptor.aliases.some((alias) => normalizeCreativeTableHeader(alias) === normalized),
  );
}

export function classifyCreativeTableHeaders(
  profile: CreativeTableProfileDescriptor,
  headers: readonly string[],
): CreativeTableHeaderClassification {
  const knownFields = headers
    .map((header) => resolveCreativeTableField(profile, header))
    .filter((fieldDescriptor): fieldDescriptor is CreativeTableFieldDescriptor =>
      Boolean(fieldDescriptor),
    );
  const knownIds = new Set(knownFields.map((fieldDescriptor) => fieldDescriptor.id));
  const unknownHeaders = headers.filter((header) => !resolveCreativeTableField(profile, header));
  const missingMinimumGroups = profile.minimumFieldGroups.filter(
    (group) => !group.some((fieldId) => knownIds.has(fieldId)),
  );

  return {
    matchedProfile: missingMinimumGroups.length === 0,
    knownFields,
    unknownHeaders,
    missingMinimumGroups,
  };
}

export function getCreativeTableOperationRequirement(
  profile: CreativeTableProfileDescriptor,
  operationId: string | undefined,
): CreativeTableOperationRequirement | undefined {
  if (!operationId) return undefined;
  return profile.operationRequirements.find(
    (requirement) => requirement.operationId === operationId,
  );
}

function approvalField(
  id: string,
  en: string,
  zhCn: string,
  aliases: readonly string[],
  options: Partial<Omit<CreativeTableFieldDescriptor, 'id' | 'role' | 'labels' | 'aliases'>> = {},
): CreativeTableFieldDescriptor {
  return field(id, 'approval', en, zhCn, aliases, options);
}

function planField(
  id: string,
  en: string,
  zhCn: string,
  aliases: readonly string[],
  options: Partial<Omit<CreativeTableFieldDescriptor, 'id' | 'role' | 'labels' | 'aliases'>> = {},
): CreativeTableFieldDescriptor {
  return field(id, 'plan', en, zhCn, aliases, options);
}

function executionField(
  id: string,
  en: string,
  zhCn: string,
  aliases: readonly string[],
  options: Partial<Omit<CreativeTableFieldDescriptor, 'id' | 'role' | 'labels' | 'aliases'>> = {},
): CreativeTableFieldDescriptor {
  return field(id, 'execution', en, zhCn, aliases, options);
}

function field(
  id: string,
  role: CreativeTableFieldRole,
  en: string,
  zhCn: string,
  aliases: readonly string[],
  options: Partial<Omit<CreativeTableFieldDescriptor, 'id' | 'role' | 'labels' | 'aliases'>>,
): CreativeTableFieldDescriptor {
  return {
    id,
    role,
    valueType: options.valueType ?? 'text',
    labels: { en, 'zh-cn': zhCn },
    aliases: [id, ...aliases],
    ...(options.promptSlot ? { promptSlot: options.promptSlot } : {}),
    ...(options.enumValues ? { enumValues: options.enumValues } : {}),
    ...(options.resourceColumn ? { resourceColumn: options.resourceColumn } : {}),
    ...(options.productionMapping ? { productionMapping: options.productionMapping } : {}),
  };
}
