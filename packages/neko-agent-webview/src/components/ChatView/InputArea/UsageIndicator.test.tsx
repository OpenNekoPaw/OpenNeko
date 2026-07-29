import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { UsageIndicator } from './UsageIndicator';

const translations: Record<string, string> = {
  'chat.usage.tokens': 'Context estimate',
  'chat.usage.unknownLimit': 'unknown',
  'chat.usage.used': 'occupied',
  'chat.usage.clickToCompress': 'Click to compress context',
};

vi.mock('@/i18n/I18nContext', () => ({
  useTranslation: () => ({
    t: (key: string) => translations[key] ?? key,
  }),
}));

describe('UsageIndicator', () => {
  it('uses the provided context window for the percentage and tooltip total', () => {
    render(<UsageIndicator tokenCount={50000} maxTokens={200000} onCompress={async () => {}} />);

    const button = screen.getByRole('button');
    fireEvent.mouseEnter(button);

    expect(button.className).toContain('agent-composer-tool-button');
    expect(document.querySelector('.agent-composer-tooltip')).toBeTruthy();
    expect(screen.getByText('Context estimate: 50,000 / 200,000')).toBeTruthy();
    expect(screen.getByText('25.0% occupied — 50.0K')).toBeTruthy();
  });

  it('shows unknown context budget instead of inventing a fallback denominator', () => {
    render(<UsageIndicator tokenCount={4096} onCompress={async () => {}} />);

    fireEvent.mouseEnter(screen.getByRole('button'));

    expect(screen.getByText('Context estimate: 4,096 / unknown')).toBeTruthy();
    expect(screen.queryByText(/8,192/)).toBeNull();
    expect(screen.queryByText(/100,000/)).toBeNull();
  });

  it('shows context usage against the combined input and output window', () => {
    render(
      <UsageIndicator
        tokenCount={50000}
        maxTokens={200000}
        maxOutputTokens={8192}
        modelMaxOutputTokens={128000}
        onCompress={async () => {}}
      />,
    );

    fireEvent.mouseEnter(screen.getByRole('button'));

    expect(screen.getByText('Context estimate: 50,000 / 328,000')).toBeTruthy();
    expect(screen.getByText('15.2% occupied — 50.0K')).toBeTruthy();
    expect(screen.queryByText('Max output: 8,192 / 128,000')).toBeNull();
  });
});
