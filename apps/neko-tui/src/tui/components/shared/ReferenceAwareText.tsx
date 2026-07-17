import React from 'react';
import { Text } from 'ink';
import { tokens } from '../../theme/tokens';

export interface ReferencePresentationSegment {
  readonly kind: 'text' | 'reference';
  readonly text: string;
  readonly source: string;
}

interface ReferenceAwareTextProps {
  readonly text: string;
  readonly bold?: boolean;
  readonly color?: string;
  readonly showCursor?: boolean;
}

/**
 * Projects reference tokens for terminal display while retaining the source text
 * in the editor/store. This component is presentation-only and must never be
 * used to construct the prompt sent to the Agent runtime.
 */
export function ReferenceAwareText({
  text,
  bold = false,
  color,
  showCursor = false,
}: ReferenceAwareTextProps): React.JSX.Element {
  const segments = projectReferencePresentation(text);

  return (
    <Text bold={bold} color={color}>
      {segments.map((segment, index) =>
        segment.kind === 'reference' ? (
          <Text key={`${segment.source}-${index}`} bold color={tokens.info}>
            {segment.text}
          </Text>
        ) : (
          segment.text
        ),
      )}
      {showCursor ? <Text color={tokens.muted}>▋</Text> : null}
    </Text>
  );
}

export function projectReferencePresentation(
  source: string,
): readonly ReferencePresentationSegment[] {
  const segments: ReferencePresentationSegment[] = [];
  let cursor = 0;

  for (const token of scanReferenceTokens(source)) {
    if (token.start > cursor) {
      const text = source.slice(cursor, token.start);
      segments.push({ kind: 'text', text, source: text });
    }
    segments.push({
      kind: 'reference',
      text: `@${formatReferenceLabel(token.value)}`,
      source: token.source,
    });
    cursor = token.end;
  }

  if (cursor < source.length || segments.length === 0) {
    const text = source.slice(cursor);
    segments.push({ kind: 'text', text, source: text });
  }

  return segments;
}

interface ScannedReferenceToken {
  readonly start: number;
  readonly end: number;
  readonly source: string;
  readonly value: string;
}

function scanReferenceTokens(source: string): readonly ScannedReferenceToken[] {
  const tokens: ScannedReferenceToken[] = [];
  let cursor = 0;

  while (cursor < source.length) {
    const start = source.indexOf('@', cursor);
    if (start === -1) break;

    const previous = start > 0 ? source[start - 1] : undefined;
    if (previous && !/\s/.test(previous)) {
      cursor = start + 1;
      continue;
    }

    const token =
      source[start + 1] === '"'
        ? readQuotedReference(source, start)
        : readUnquotedReference(source, start);
    if (!token) {
      cursor = start + 1;
      continue;
    }

    tokens.push(token);
    cursor = token.end;
  }

  return tokens;
}

function readUnquotedReference(source: string, start: number): ScannedReferenceToken | null {
  let end = start + 1;
  while (end < source.length && !/\s|@/.test(source[end] ?? '')) {
    end += 1;
  }
  if (end === start + 1) return null;

  return {
    start,
    end,
    source: source.slice(start, end),
    value: source.slice(start + 1, end),
  };
}

function readQuotedReference(source: string, start: number): ScannedReferenceToken | null {
  let end = start + 2;
  let value = '';

  while (end < source.length) {
    const character = source[end];
    if (character === '\\') {
      const escaped = source[end + 1];
      if (escaped) {
        value += escaped;
        end += 2;
        continue;
      }
    }
    if (character === '"') {
      return value
        ? {
            start,
            end: end + 1,
            source: source.slice(start, end + 1),
            value,
          }
        : null;
    }
    value += character;
    end += 1;
  }

  return readUnquotedReference(source, start);
}

function formatReferenceLabel(value: string): string {
  const normalized = value.replaceAll('\\', '/');
  const parts = normalized.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? value;
}
