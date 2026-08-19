// @vitest-environment jsdom

import type { PreviewMediaDescriptor } from '@neko/preview-domain';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AgentPreviewCollection } from './AgentPreviewCollection';

describe('AgentPreviewCollection', () => {
  it('keeps compact multi-output chrome in Agent while Preview owns each media body', () => {
    const { container } = render(
      <AgentPreviewCollection descriptors={[descriptor('output-1'), descriptor('output-2')]} />,
    );

    expect(container.querySelector('[data-agent-preview-count="2"]')).not.toBeNull();
    expect(container.querySelectorAll('[data-preview-ui="lightweight"]')).toHaveLength(2);
    expect(container.querySelectorAll('img')).toHaveLength(2);
  });

  it('isolates an expired descriptor diagnostic without hiding a valid sibling', () => {
    const expired = {
      ...descriptor('expired'),
      url: 'file:///private/expired.png',
    } as unknown as PreviewMediaDescriptor;
    const { container } = render(
      <AgentPreviewCollection descriptors={[expired, descriptor('valid')]} />,
    );

    expect(screen.getByRole('alert').textContent).toContain('authorized OpenNeko resource');
    expect(container.querySelector('img[alt="valid"]')).not.toBeNull();
  });
});

function descriptor(outputId: string): PreviewMediaDescriptor {
  return {
    descriptorId: `descriptor-${outputId}`,
    sourceFingerprint: `sha256-${outputId}`,
    contentLocator: { file: { authority: 'workspace', path: `neko/generated/${outputId}.png` } },
    url: `openneko://resource/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/${outputId}`,
    contentKind: 'image',
    mediaType: 'image/png',
    displayName: outputId,
    byteLength: 42,
  };
}
