export type NekoMarkdownGenerationPromptPartKind =
  'intent' | 'reference' | 'operation' | 'camera' | 'dialogue' | 'constraint' | 'detail';

export interface NekoMarkdownGenerationPromptPart {
  readonly kind: NekoMarkdownGenerationPromptPartKind;
  readonly text: string;
}

export function projectNekoMarkdownGenerationPromptParts(
  value: string,
): readonly NekoMarkdownGenerationPromptPart[] {
  const trimmed = value.trim();
  if (!trimmed) return [];
  const intentMatch = /^([^：:]{2,32})[：:]\s*(.*)$/u.exec(trimmed);
  const parts: NekoMarkdownGenerationPromptPart[] = [];
  const body = intentMatch?.[2]?.trim() ?? trimmed;
  const intent = intentMatch?.[1]?.trim();
  if (intent) parts.push({ kind: 'intent', text: intent });
  const chunks = body
    .split(/[。；;，,]/u)
    .map((chunk) => chunk.trim())
    .filter(Boolean);
  for (const chunk of chunks.length > 0 ? chunks : [body]) {
    parts.push({ kind: classifyNekoMarkdownGenerationPromptPart(chunk), text: chunk });
  }
  return parts;
}

export function classifyNekoMarkdownGenerationPromptPart(
  value: string,
): NekoMarkdownGenerationPromptPartKind {
  const lower = value.toLocaleLowerCase();
  if (
    /(^|\s)(p\d+(?:#panel_\d+)?|page_\d+(?:#panel_\d+)?)(\s|$)/iu.test(value) ||
    /参考|来源|reference|source/u.test(lower)
  )
    return 'reference';
  if (
    /裁切|切分|旋转|校正|上色|去字|去文字|去除|清理|补全|遮挡|重绘|修复|扩图|放大|统一风格|crop|split|rotate|correct|colori[sz]e|remove|clean|inpaint|outpaint|redraw|repair|upscale|normalize/u.test(
      lower,
    )
  )
    return 'operation';
  if (
    /镜头|运镜|推近|推远|下移|上移|横移|摇镜|特写|视差|camera|dolly|pan|tilt|zoom|push-in|pull-back/u.test(
      lower,
    )
  )
    return 'camera';
  if (/对白|台词|无对白|旁白|dialogue|voice|silence|no dialogue/u.test(lower)) return 'dialogue';
  if (
    /保持|保留|不新增|不要|一致|约束|preserve|keep|consistent|constraint|do not|without adding/u.test(
      lower,
    )
  )
    return 'constraint';
  return 'detail';
}
