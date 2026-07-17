import { describe, expect, it } from 'vitest';
import {
  resolveAgentAutoCompactTokenThreshold,
  resolveAgentTokenBudget,
} from '../agent-token-budget';

describe('resolveAgentTokenBudget', () => {
  it('treats contextWindow as the configured input window and keeps output caps separate', () => {
    const budget = resolveAgentTokenBudget({
      modelId: 'model-a',
      contextWindow: 128_000,
      modelMaxOutputTokens: 32_000,
      defaultMaxOutputTokens: 4_096,
      requestedMaxOutputTokens: 8_192,
      reasoningReserveTokens: 2_000,
      safetyMarginTokens: 1_000,
    });

    expect(budget.effectiveMaxOutputTokens).toBe(8_192);
    expect(budget.effectiveInputBudget).toBe(127_000);
    expect(budget.diagnostics).toEqual([]);
  });

  it('diagnoses and clamps requested output tokens above the model output cap', () => {
    const budget = resolveAgentTokenBudget({
      modelId: 'model-a',
      contextWindow: 256_000,
      modelMaxOutputTokens: 128_000,
      defaultMaxOutputTokens: 8_192,
      requestedMaxOutputTokens: 256_000,
    });

    expect(budget.effectiveMaxOutputTokens).toBe(128_000);
    expect(budget.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'requested-output-exceeds-model-cap',
        severity: 'error',
      }),
    );
  });

  it('reports unknown input budget when context window metadata is missing', () => {
    const budget = resolveAgentTokenBudget({
      modelId: 'custom-model',
      modelMaxOutputTokens: 32_000,
      defaultMaxOutputTokens: 8_192,
    });

    expect(budget.contextWindow).toBeUndefined();
    expect(budget.effectiveInputBudget).toBeUndefined();
    expect(budget.effectiveMaxOutputTokens).toBe(8_192);
    expect(budget.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'missing-context-window',
        severity: 'warning',
      }),
    );
  });

  it('uses the configured output default when the model output cap is unknown', () => {
    const budget = resolveAgentTokenBudget({
      modelId: 'custom-model',
      contextWindow: 64_000,
      defaultMaxOutputTokens: 12_000,
      safetyMarginTokens: 1_000,
    });

    expect(budget.modelMaxOutputTokens).toBeUndefined();
    expect(budget.effectiveMaxOutputTokens).toBe(12_000);
    expect(budget.effectiveInputBudget).toBe(63_000);
    expect(budget.diagnostics).toEqual([]);
  });

  it('diagnoses impossible input budgets where safety margin consumes the input window', () => {
    const budget = resolveAgentTokenBudget({
      modelId: 'tiny-model',
      contextWindow: 8_192,
      modelMaxOutputTokens: 8_192,
      defaultMaxOutputTokens: 8_192,
      safetyMarginTokens: 8_192,
    });

    expect(budget.effectiveInputBudget).toBe(0);
    expect(budget.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'impossible-input-budget',
        severity: 'error',
      }),
    );
  });

  it('derives auto-compact thresholds from effective input budget or smaller explicit settings', () => {
    expect(
      resolveAgentAutoCompactTokenThreshold({
        effectiveInputBudget: 100_000,
        defaultTokenThreshold: 80_000,
      }),
    ).toBe(85_000);

    expect(
      resolveAgentAutoCompactTokenThreshold({
        effectiveInputBudget: 100_000,
        explicitTokenThreshold: 50_000,
        defaultTokenThreshold: 80_000,
      }),
    ).toBe(50_000);
  });
});
