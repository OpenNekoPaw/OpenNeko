import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DirectGenerationStatus } from './DirectGenerationStatus';

vi.mock('../i18n/I18nContext', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string | number>) =>
      ({
        'chat.directGeneration.title': 'Generation job',
        'chat.directGeneration.running.image': 'Generating image...',
        'chat.directGeneration.succeeded': `Generated ${params?.['count']} result(s) in job ${params?.['jobId']}`,
      })[key] ?? key,
  }),
}));

describe('DirectGenerationStatus', () => {
  it('announces the running media kind without exposing an Agent message state', () => {
    render(<DirectGenerationStatus state={{ phase: 'running', mediaKind: 'image' }} />);

    expect(screen.getByRole('status').textContent).toContain('Generation job');
    expect(screen.getByRole('status').textContent).toContain('Generating image...');
  });

  it('projects the terminal Job and output count', () => {
    render(
      <DirectGenerationStatus
        state={{
          phase: 'completed',
          projection: {
            jobId: 'job-image',
            mediaKind: 'image',
            purpose: 'image.generate',
            providerId: 'image-provider',
            modelId: 'image-model',
            phase: 'succeeded',
            resultLocators: [
              {
                kind: 'generated-output',
                outputId: 'output-image',
                digest: 'sha256:image',
                path: 'generated/image/output.png',
              },
            ],
          },
        }}
      />,
    );

    expect(screen.getByRole('status').textContent).toContain(
      'Generated 1 result(s) in job job-image',
    );
  });

  it('exposes direct generation failures as an alert', () => {
    render(<DirectGenerationStatus state={{ phase: 'failed', message: 'Provider rejected.' }} />);

    expect(screen.getByRole('alert').textContent).toContain('Provider rejected.');
  });
});
