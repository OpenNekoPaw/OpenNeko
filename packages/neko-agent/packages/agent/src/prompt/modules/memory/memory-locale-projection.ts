import type { PromptContext } from '../../context';

type PromptLocale = PromptContext['locale'];

const ZH_MEMORY_SECTION_LABELS: Readonly<Record<string, string>> = {
  'User Preferences': '用户偏好',
  'Recent Decisions': '近期决策',
  'Project Context': '项目上下文',
  'Recent Actions': '最近操作',
  'Project Architecture': '项目架构',
  'Key Conventions': '关键约定',
};

export function localizeMemoryContentForPrompt(content: string, locale: PromptLocale): string {
  if (locale !== 'zh') return content;

  return content
    .split('\n')
    .map((line) => localizeMemoryLineForPrompt(line))
    .join('\n');
}

function localizeMemoryLineForPrompt(line: string): string {
  const heading = line.match(/^(#{1,6})\s+(.+?)\s*$/);
  if (heading) {
    const marker = heading[1] ?? '##';
    const title = heading[2] ?? '';
    return `${marker} ${ZH_MEMORY_SECTION_LABELS[title] ?? title}`;
  }

  const prefixedHeading = line.match(/^(- \[[^\]]+\]\s+)(#{1,6})\s+(.+?)(\s+\(relevance: .+\))?$/);
  if (prefixedHeading) {
    const prefix = prefixedHeading[1] ?? '';
    const marker = prefixedHeading[2] ?? '##';
    const title = prefixedHeading[3] ?? '';
    const suffix = localizeMemoryLineLabel(prefixedHeading[4] ?? '');
    return `${prefix}${marker} ${ZH_MEMORY_SECTION_LABELS[title] ?? title}${suffix}`;
  }

  return localizeMemoryLineLabel(line.replace(/\bTool result:/g, '工具结果:'));
}

function localizeMemoryLineLabel(line: string): string {
  return line.replace(/\brelevance:/g, '相关度:');
}
