import { describe, expect, it } from 'vitest';
import { projectExternalResearchToolResult } from '../capability/external-research-projection';

describe('projectExternalResearchToolResult', () => {
  it('projects WebSearch results into session trace metadata without memory fields', () => {
    const projection = projectExternalResearchToolResult({
      toolName: 'WebSearch',
      approvalState: 'not-required',
      resultData: {
        query: 'visual references',
        providerId: 'mcp:research',
        mode: 'indexed',
        sources: [
          {
            url: 'https://example.com/source',
            providerId: 'mcp:research',
            mode: 'indexed',
            title: 'Source',
          },
        ],
      },
    });

    expect(projection).toEqual({
      toolName: 'WebSearch',
      mode: 'indexed',
      providerId: 'mcp:research',
      query: 'visual references',
      approvalState: 'not-required',
      sources: [expect.objectContaining({ url: 'https://example.com/source' })],
    });
    expect(projection).not.toHaveProperty('memory');
    expect(projection).not.toHaveProperty('canonicalFacts');
  });

  it('projects WebFetch results with URL and source metadata', () => {
    expect(
      projectExternalResearchToolResult({
        toolName: 'WebFetch',
        approvalState: 'approved',
        resultData: {
          url: 'https://example.com/source',
          providerId: 'mcp:research',
          mode: 'live',
          source: {
            url: 'https://example.com/source',
            providerId: 'mcp:research',
            mode: 'live',
          },
          content: 'Fetched content',
        },
      }),
    ).toEqual({
      toolName: 'WebFetch',
      mode: 'live',
      providerId: 'mcp:research',
      url: 'https://example.com/source',
      approvalState: 'approved',
      sources: [expect.objectContaining({ url: 'https://example.com/source' })],
    });
  });
});
