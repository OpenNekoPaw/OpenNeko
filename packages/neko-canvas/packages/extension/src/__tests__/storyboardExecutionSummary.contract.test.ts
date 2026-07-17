import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const extensionSource = readFileSync(join(__dirname, '../extension.ts'), 'utf-8');
const providerSource = readFileSync(join(__dirname, '../editor/canvasEditorProvider.ts'), 'utf-8');
const apiSource = readFileSync(join(__dirname, '../api.ts'), 'utf-8');
const capabilityProviderSource = readFileSync(
  join(__dirname, '../agentCapabilityProvider.ts'),
  'utf-8',
);

describe('Canvas storyboard execution summary contracts', () => {
  it('exports a read-only storyboard summary API and command', () => {
    expect(apiSource).toContain('getExecutionSummary(');
    expect(extensionSource).toContain('getExecutionSummary: (request) =>');
    expect(extensionSource).toContain("'neko.canvas.getStoryboardExecutionSummary'");
  });

  it('projects summaries through the shared DTO utility instead of exposing raw nodes', () => {
    expect(providerSource).toContain('createCanvasStoryboardExecutionSummary({');
    expect(providerSource).toContain('getStoryboardExecutionSummary(');
    expect(providerSource).toContain("status: 'not-available'");
  });

  it('keeps scene correlation, empty results, and sanitization in the shared projection layer', () => {
    const sharedProjectionSource = readFileSync(
      join(__dirname, '../../../../../neko-types/src/utils/storyboardExecutionSummary.ts'),
      'utf-8',
    );

    expect(sharedProjectionSource).toContain('sceneMatchesRequest(');
    expect(sharedProjectionSource).toContain('status: scenes.length > 0');
    expect(sharedProjectionSource).toContain(": 'not-found',");
    expect(sharedProjectionSource).toContain('sanitizeStableRef(');
    expect(sharedProjectionSource).toContain("value.startsWith('blob:')");
    expect(sharedProjectionSource).toContain("value.startsWith('data:')");
    expect(sharedProjectionSource).toContain("value.includes('engineToken=')");
    expect(sharedProjectionSource).toContain("value.includes('access_token=')");
  });

  it('makes execution summaries available to Agent workflows as a read-only tool', () => {
    expect(capabilityProviderSource).toContain(
      'TOOL_NAMES_CANVAS.CANVAS_GET_STORYBOARD_EXECUTION_SUMMARY',
    );
    expect(capabilityProviderSource).toContain('api.storyboard.getExecutionSummary(request)');
  });
});
