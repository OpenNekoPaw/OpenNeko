import { render } from 'ink-testing-library';
import { describe, expect, it } from 'vitest';
import { TokenUsage } from './TokenUsage';

describe('TokenUsage', () => {
  it('shows input context usage against the combined input and output window', () => {
    const { lastFrame } = render(
      <TokenUsage
        usage={{ input: 45000, output: 5000, total: 50000 }}
        maxContextTokens={200000}
        maxOutputTokens={8192}
        modelMaxOutputTokens={128000}
      />,
    );

    const frame = lastFrame()!;
    expect(frame).toContain('ctx:45.0K/328.0K');
    expect(frame).not.toContain('out:8.2K/128.0K');
    expect(frame).not.toContain('ctx:50.0K/200.0K');
  });

  it('shows unknown context budget without using output cap as denominator', () => {
    const { lastFrame } = render(
      <TokenUsage usage={{ input: 45000, output: 5000, total: 50000 }} maxOutputTokens={8192} />,
    );

    const frame = lastFrame()!;
    expect(frame).toContain('ctx:45.0K/?');
    expect(frame).not.toContain('out:8.2K');
    expect(frame).not.toContain('200.0K');
    expect(frame).not.toContain('8.2K/8.2K');
  });
});
