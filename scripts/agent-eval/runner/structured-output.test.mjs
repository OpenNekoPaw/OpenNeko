import { describe, expect, it } from 'vitest';
import {
  evaluateStructuredOutput,
  validateOutputSchemaDefinition,
} from './structured-output.mjs';

describe('deterministic structured output gates', () => {
  it('validates a complete JSON document, schema, fields, references, and locale', () => {
    const assertion = {
      format: 'json',
      schemaRef: 'schemas/storyboard.json',
      requiredFields: ['status', 'result.title'],
      forbiddenFields: ['secret'],
      requiredReferences: ['artifact:storyboard-1'],
      locale: 'zh-cn',
    };
    const outputSchemas = {
      'schemas/storyboard.json': validateOutputSchemaDefinition({
        type: 'object',
        required: ['status', 'result', 'reference'],
        additionalProperties: false,
        properties: {
          status: { type: 'string', enum: ['完成'] },
          result: {
            type: 'object',
            required: ['title'],
            additionalProperties: false,
            properties: { title: { type: 'string', minLength: 1 } },
          },
          reference: { type: 'string', pattern: '^artifact:' },
        },
      }),
    };
    const details = evaluateStructuredOutput(
      assertion,
      facts(
        JSON.stringify({
          status: '完成',
          result: { title: '雨夜分镜' },
          reference: 'artifact:storyboard-1',
        }),
      ),
      { outputSchemas },
    );
    expect(details).toMatchObject({ format: 'json', rootType: 'object', locale: 'zh-cn' });
  });

  it.each([
    ['fenced JSON', '```json\n{"status":"ok"}\n```', 'complete JSON document'],
    ['missing field', '{"status":"ok"}', 'required JSON field'],
    ['forbidden field', '{"status":"ok","secret":"x"}', 'forbidden JSON field'],
    ['wrong locale', '{"status":"ok"}', 'zh-cn language evidence'],
  ])('fails JSON output with %s', (_label, content, message) => {
    expect(() =>
      evaluateStructuredOutput(
        {
          format: 'json',
          requiredFields: ['status', ...(_label === 'missing field' ? ['result'] : [])],
          forbiddenFields: ['secret'],
          locale: 'zh-cn',
        },
        facts(content),
      ),
    ).toThrow(message);
  });

  it('validates Markdown tables and exact required references', () => {
    const details = evaluateStructuredOutput(
      {
        format: 'table',
        requiredFields: ['shot', 'action'],
        forbiddenFields: ['secret'],
        requiredReferences: ['artifact:board-1'],
        locale: 'en',
      },
      facts(
        '| shot | action | ref |\n| --- | --- | --- |\n| 1 | Run | artifact:board-1 |',
      ),
    );
    expect(details).toMatchObject({ format: 'table', columns: ['shot', 'action', 'ref'], rowCount: 1 });
  });

  it('distinguishes Markdown block output from deterministic plain text', () => {
    expect(
      evaluateStructuredOutput({ format: 'markdown', requiredFields: ['result'] }, facts('# Result\n\nDone.')),
    ).toMatchObject({ blockStructured: true });
    expect(
      evaluateStructuredOutput({ format: 'text', requiredFields: ['Result'] }, facts('Result: Done.')),
    ).toMatchObject({ length: 13 });
    expect(() => evaluateStructuredOutput({ format: 'text' }, facts('# Result'))).toThrow(
      'Markdown block syntax',
    );
  });

  it('rejects unsafe or unsupported JSON Schema keywords', () => {
    expect(() => validateOutputSchemaDefinition({ type: 'object', $ref: 'https://example.test' })).toThrow(
      'unsupported field',
    );
    expect(() => validateOutputSchemaDefinition({ type: 'string', pattern: '[' })).toThrow(
      'valid regular expression',
    );
  });

  it('fails when turn evidence is incomplete', () => {
    const value = facts('{"status":"ok"}');
    value.evidenceCompleteness.turns.droppedCount = 1;
    expect(() => evaluateStructuredOutput({ format: 'json' }, value)).toThrow(
      'complete turn evidence',
    );
  });
});

function facts(content) {
  return {
    turns: [{ id: 'assistant-1', role: 'assistant', content }],
    evidenceCompleteness: { turns: { limit: 512, droppedCount: 0 } },
  };
}
