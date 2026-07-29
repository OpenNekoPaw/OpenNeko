/**
 * SuggestionChips — context-aware action suggestions above the input area.
 *
 * Derives suggestions purely from the currently attached context chips (no LLM).
 * Clicking a suggestion pre-fills the input box but does NOT auto-send.
 */

import type { AgentContextPayload } from '@neko/shared';

interface SuggestionChipsProps {
  contextChips: AgentContextPayload[];
  onSuggest: (text: string) => void;
}

interface Suggestion {
  label: string;
  text: string;
}

/** Derive context-aware UI suggestions from the attached chip types. */
function getSuggestions(chips: AgentContextPayload[]): Suggestion[] {
  const types = new Set(chips.map((c) => c.type));

  if (types.has('canvas-node')) {
    const hasShotNode = chips.some(
      (c) =>
        c.type === 'canvas-node' &&
        (c.label.startsWith('#') || c.summary.toLowerCase().includes('shot')),
    );
    if (hasShotNode) {
      return [
        { label: '批量生成图片', text: '为选中的所有镜头批量生成图片' },
        { label: '重构这场戏', text: '重新设计这场戏的镜头编排，调整节奏和情绪' },
        { label: '优化镜头描述', text: '优化这些镜头的视觉描述，使其更具电影感' },
      ];
    }
    return [
      { label: '生成全部镜头', text: '为选中节点生成图片' },
      { label: '优化内容', text: '优化选中节点的内容描述' },
    ];
  }

  if (types.has('story-selection')) {
    return [
      { label: '续写', text: '根据当前选段续写后续内容' },
      { label: '优化', text: '优化并改写当前选段，保持原意但提升表达' },
      { label: '生成分镜', text: '将当前选段拆分为分镜头列表，导入画布' },
    ];
  }

  if (types.has('cut-clip')) {
    return [
      { label: '理解内容', text: '分析这段素材的内容和情绪' },
      { label: '生成替换素材', text: '为这段时间线片段生成新的替换素材' },
    ];
  }

  return [];
}

export function SuggestionChips({ contextChips, onSuggest }: SuggestionChipsProps) {
  const suggestions = getSuggestions(contextChips);
  if (suggestions.length === 0) return null;

  return (
    <div className="flex items-center gap-1 px-3 pt-2 flex-wrap">
      <span
        className="text-[10px] mr-0.5 opacity-50"
        style={{ color: 'var(--vscode-descriptionForeground)' }}
      >
        💡
      </span>
      {suggestions.map((s) => (
        <button
          key={s.label}
          type="button"
          onClick={() => onSuggest(s.text)}
          className="inline-flex items-center px-2 py-0.5 rounded text-[11px] border cursor-pointer hover:opacity-80 transition-opacity"
          style={{
            borderColor: 'var(--vscode-focusBorder)',
            color: 'var(--vscode-foreground)',
            background: 'transparent',
            opacity: 0.75,
          }}
          title={s.text}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}
