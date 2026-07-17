/**
 * Base Tool Tests — createTool, buildTool, safety presets
 */

import { describe, it, expect, vi } from 'vitest';
import { createTool, buildTool, SAFETY_PRESETS } from '../base';

const dummyParams = { type: 'object' as const, properties: {} };
const dummyExecute = vi.fn().mockResolvedValue({ success: true });

// =============================================================================
// createTool — Fail-Closed defaults
// =============================================================================

describe('createTool', () => {
  it('should apply Fail-Closed defaults when no safety flags provided', () => {
    const tool = createTool({
      name: 'test',
      description: 'test tool',
      parameters: dummyParams,
      category: 'system',
      execute: dummyExecute,
    });

    expect(tool.isConcurrencySafe).toBe(false);
    expect(tool.isReadOnly).toBe(false);
    expect(tool.isDestructive).toBe(false);
    expect(tool.requiresConfirmation).toBe(false);
  });

  it('should respect explicitly provided flags', () => {
    const tool = createTool({
      name: 'test',
      description: 'test tool',
      parameters: dummyParams,
      category: 'system',
      isConcurrencySafe: true,
      isReadOnly: true,
      execute: dummyExecute,
    });

    expect(tool.isConcurrencySafe).toBe(true);
    expect(tool.isReadOnly).toBe(true);
    expect(tool.isDestructive).toBe(false);
  });

  it('should preserve declarative safety and query-before-mutate metadata', () => {
    const tool = createTool({
      name: 'ApplyContent',
      description: 'apply content',
      parameters: dummyParams,
      category: 'project',
      safetyKind: 'confirmation-gated',
      targetRequirements: {
        required: ['target'],
        allowedFallbacks: ['selection'],
        confirmationModes: ['replace'],
      },
      queryBeforeMutate: {
        preferredQueryTools: ['GetActiveContext'],
        reason: 'Resolve a stable target before applying content.',
      },
      execute: dummyExecute,
    });

    expect(tool.safetyKind).toBe('confirmation-gated');
    expect(tool.targetRequirements).toEqual({
      required: ['target'],
      allowedFallbacks: ['selection'],
      confirmationModes: ['replace'],
    });
    expect(tool.queryBeforeMutate).toEqual({
      preferredQueryTools: ['GetActiveContext'],
      reason: 'Resolve a stable target before applying content.',
    });
  });
});

// =============================================================================
// SAFETY_PRESETS
// =============================================================================

describe('SAFETY_PRESETS', () => {
  it('readOnly should be concurrent-safe and read-only', () => {
    expect(SAFETY_PRESETS.readOnly).toEqual({
      isConcurrencySafe: true,
      isReadOnly: true,
      isDestructive: false,
      requiresConfirmation: false,
    });
  });

  it('destructive should require confirmation', () => {
    expect(SAFETY_PRESETS.destructive).toEqual({
      isConcurrencySafe: false,
      isReadOnly: false,
      isDestructive: true,
      requiresConfirmation: true,
    });
  });

  it('aiGenerate should be concurrent-safe but not read-only', () => {
    expect(SAFETY_PRESETS.aiGenerate.isConcurrencySafe).toBe(true);
    expect(SAFETY_PRESETS.aiGenerate.isReadOnly).toBe(false);
    expect(SAFETY_PRESETS.aiGenerate.isDestructive).toBe(false);
  });
});

// =============================================================================
// buildTool — preset + override
// =============================================================================

describe('buildTool', () => {
  it('should apply readOnly preset flags', () => {
    const tool = buildTool({
      name: 'GetInfo',
      description: 'read info',
      parameters: dummyParams,
      category: 'timeline',
      safety: 'readOnly',
      execute: dummyExecute,
    });

    expect(tool.isConcurrencySafe).toBe(true);
    expect(tool.isReadOnly).toBe(true);
    expect(tool.isDestructive).toBe(false);
    expect(tool.requiresConfirmation).toBe(false);
  });

  it('should apply destructive preset flags', () => {
    const tool = buildTool({
      name: 'DeleteTrack',
      description: 'delete a track',
      parameters: dummyParams,
      category: 'timeline',
      safety: 'destructive',
      execute: dummyExecute,
    });

    expect(tool.isDestructive).toBe(true);
    expect(tool.requiresConfirmation).toBe(true);
    expect(tool.isConcurrencySafe).toBe(false);
  });

  it('should apply aiGenerate preset flags', () => {
    const tool = buildTool({
      name: 'GenerateImage',
      description: 'generate image',
      parameters: dummyParams,
      category: 'generation',
      safety: 'aiGenerate',
      execute: dummyExecute,
    });

    expect(tool.isConcurrencySafe).toBe(true);
    expect(tool.isReadOnly).toBe(false);
    expect(tool.isDestructive).toBe(false);
  });

  it('should allow explicit flags to override preset', () => {
    const tool = buildTool({
      name: 'ExpensiveQuery',
      description: 'expensive read-only query',
      parameters: dummyParams,
      category: 'analysis',
      safety: 'readOnly',
      isConcurrencySafe: false, // override preset
      execute: dummyExecute,
    });

    // isConcurrencySafe overridden to false
    expect(tool.isConcurrencySafe).toBe(false);
    // isReadOnly still from preset
    expect(tool.isReadOnly).toBe(true);
  });

  it('should use Fail-Closed defaults when safety is "custom"', () => {
    const tool = buildTool({
      name: 'Unknown',
      description: 'unknown tool',
      parameters: dummyParams,
      category: 'system',
      safety: 'custom',
      execute: dummyExecute,
    });

    expect(tool.isConcurrencySafe).toBe(false);
    expect(tool.isReadOnly).toBe(false);
    expect(tool.isDestructive).toBe(false);
    expect(tool.requiresConfirmation).toBe(false);
  });

  it('should use Fail-Closed defaults when no safety specified', () => {
    const tool = buildTool({
      name: 'NoPreset',
      description: 'no preset',
      parameters: dummyParams,
      category: 'system',
      execute: dummyExecute,
    });

    expect(tool.isConcurrencySafe).toBe(false);
    expect(tool.isReadOnly).toBe(false);
    expect(tool.isDestructive).toBe(false);
  });

  it('should preserve traits when provided', () => {
    const traits = {
      cost: 'expensive' as const,
      reversible: false,
      locality: 'network' as const,
      impactLevel: 'high' as const,
    };
    const tool = buildTool({
      name: 'GenVideo',
      description: 'generate video',
      parameters: dummyParams,
      category: 'generation',
      safety: 'aiGenerate',
      traits,
      execute: dummyExecute,
    });

    expect(tool.traits).toEqual(traits);
  });

  it('should preserve runtime requirements when provided', () => {
    const tool = createTool({
      name: 'GenerateImage',
      description: 'generate image',
      parameters: dummyParams,
      category: 'generation',
      requirements: { mediaService: true, contentAccess: true },
      execute: dummyExecute,
    });

    expect(tool.requirements).toEqual({ mediaService: true, contentAccess: true });
  });

  it('should preserve extended planning metadata', () => {
    const tool = buildTool({
      name: 'UpdateNode',
      description: 'update node',
      parameters: dummyParams,
      category: 'project',
      safety: 'safeWrite',
      safetyKind: 'confirmation-gated',
      targetRequirements: { required: ['nodeId'] },
      queryBeforeMutate: { preferredQueryTools: ['GetNode'] },
      execute: dummyExecute,
    });

    expect(tool.safetyKind).toBe('confirmation-gated');
    expect(tool.targetRequirements).toEqual({ required: ['nodeId'] });
    expect(tool.queryBeforeMutate).toEqual({ preferredQueryTools: ['GetNode'] });
  });

  it('should set correct name, description, parameters, category', () => {
    const tool = buildTool({
      name: 'MyTool',
      description: 'My description',
      parameters: { type: 'object', properties: { path: { type: 'string' } } },
      category: 'file',
      safety: 'safeWrite',
      execute: dummyExecute,
    });

    expect(tool.name).toBe('MyTool');
    expect(tool.description).toBe('My description');
    expect(tool.parameters.properties).toHaveProperty('path');
    expect(tool.category).toBe('file');
  });
});
