import { describe, expect, it } from 'vitest';
import {
  TOOL_NAMES,
  TOOL_NAMES_PERCEPTION,
  createPerceptionEvidenceToolResult,
  isPerceptionEvidenceToolResult,
  type PerceptionEvidence,
  type ToolResult,
} from '../index';

describe('perception tool contracts', () => {
  it('registers optional perception tool names in unified TOOL_NAMES', () => {
    expect(TOOL_NAMES_PERCEPTION.PERCEIVE).toBe('perception.perceive');
    expect(TOOL_NAMES_PERCEPTION.IMAGE_UNDERSTAND).toBe('perception.image.understand');
    expect(TOOL_NAMES_PERCEPTION.DESCRIBE_INPUT).toBe('perception.describeInput');
    expect(TOOL_NAMES_PERCEPTION.AUDIO_TRANSCRIBE).toBe('perception.audio.transcribe');
    expect(TOOL_NAMES_PERCEPTION.IMAGE_SIMILARITY).toBe('perception.image.similarity');
    expect(TOOL_NAMES_PERCEPTION.IMAGE_CLASSIFY).toBe('perception.image.classify');
    expect(Object.values(TOOL_NAMES)).toContain(TOOL_NAMES_PERCEPTION.PERCEIVE);
    expect(Object.values(TOOL_NAMES)).toContain(TOOL_NAMES_PERCEPTION.DESCRIBE_INPUT);
    expect(Object.values(TOOL_NAMES)).toContain(TOOL_NAMES_PERCEPTION.AUDIO_TRANSCRIBE);
    expect(Object.values(TOOL_NAMES)).toContain(TOOL_NAMES_PERCEPTION.IMAGE_SIMILARITY);
    expect(Object.values(TOOL_NAMES)).toContain(TOOL_NAMES_PERCEPTION.IMAGE_CLASSIFY);
  });

  it('wraps PerceptionEvidence as a successful tool result', () => {
    const evidence: PerceptionEvidence = {
      id: 'evidence-1',
      source: 'tool',
      summary: 'The image contains a red umbrella.',
      toolName: TOOL_NAMES_PERCEPTION.DESCRIBE_INPUT,
      createdAt: 1,
      status: 'active',
    };
    const result = createPerceptionEvidenceToolResult(evidence);

    expect(result).toEqual({ success: true, data: evidence });
    expect(isPerceptionEvidenceToolResult(result)).toBe(true);
  });

  it('rejects generic successful tool results without PerceptionEvidence data', () => {
    const result: ToolResult = { success: true, data: { text: 'not evidence' } };

    expect(isPerceptionEvidenceToolResult(result)).toBe(false);
  });
});
