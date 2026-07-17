/**
 * Handler for effects and transitions:
 * ListEffects, AddEffect, UpdateEffect, RemoveEffect,
 * ListTransitions, SetTransition, RemoveTransition.
 */

import type { ProjectData, EffectParameterValue } from '@neko/shared';
import type { IToolHandler, ToolApplyResult } from './types';
import { findElement, updateElementAt, mergeElement } from './helpers';
import { BUILT_IN_EFFECTS, TRANSITION_PRESETS } from './constants';

export class EffectTransitionHandler implements IToolHandler {
  readonly toolNames = [
    'ListEffects',
    'AddEffect',
    'UpdateEffect',
    'RemoveEffect',
    'ListTransitions',
    'SetTransition',
    'RemoveTransition',
  ] as const;

  apply(project: ProjectData, toolName: string, params: Record<string, unknown>): ToolApplyResult {
    switch (toolName) {
      case 'ListEffects':
        return this.listEffects();
      case 'AddEffect':
        return this.addEffect(project, params);
      case 'UpdateEffect':
        return this.updateEffect(project, params);
      case 'RemoveEffect':
        return this.removeEffect(project, params);
      case 'ListTransitions':
        return this.listTransitions();
      case 'SetTransition':
        return this.setTransition(project, params);
      case 'RemoveTransition':
        return this.removeTransition(project, params);
      default:
        return { success: false, error: `Unknown tool: ${toolName}` };
    }
  }

  private listEffects(): ToolApplyResult {
    return {
      success: true,
      data: {
        effects: Object.entries(BUILT_IN_EFFECTS).map(([type, config]) => ({ type, ...config })),
      },
    };
  }

  private addEffect(project: ProjectData, params: Record<string, unknown>): ToolApplyResult {
    const {
      elementId,
      effectType,
      params: effectParams,
    } = params as {
      elementId?: string;
      effectType?: string;
      params?: Record<string, unknown>;
    };
    if (!elementId || !effectType)
      return { success: false, error: 'elementId and effectType are required' };
    if (!(effectType in BUILT_IN_EFFECTS))
      return { success: false, error: `Unknown effect type: ${effectType}` };

    const found = findElement(project, elementId);
    if (!found) return { success: false, error: `Element not found: ${elementId}` };

    const existingEffects = found.element.effects || [];

    const effectId = `effect-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    const newEffect = {
      id: effectId,
      type: effectType,
      enabled: true,
      parameters: (effectParams || {}) as Record<string, unknown>,
      order: existingEffects.length,
    };

    const updatedElement = mergeElement(found.element, {
      effects: [...existingEffects, newEffect],
    });

    const updatedProject = updateElementAt(
      project,
      found.trackIndex,
      found.elementIndex,
      updatedElement,
    );
    return {
      success: true,
      data: { effectId, message: 'Effect added successfully' },
      updatedProject,
    };
  }

  private updateEffect(project: ProjectData, params: Record<string, unknown>): ToolApplyResult {
    const {
      elementId,
      effectId,
      params: effectParams,
    } = params as {
      elementId?: string;
      effectId?: string;
      params?: Record<string, unknown>;
    };
    if (!elementId || !effectId || !effectParams) {
      return { success: false, error: 'elementId, effectId, and params are required' };
    }

    const found = findElement(project, elementId);
    if (!found) return { success: false, error: `Element not found: ${elementId}` };

    const effects = [...(found.element.effects || [])];
    const idx = effects.findIndex((e) => e.id === effectId);
    if (idx === -1) return { success: false, error: `Effect not found: ${effectId}` };

    const existingEffect = effects[idx]!;
    effects[idx] = {
      ...existingEffect,
      parameters: {
        ...(existingEffect.parameters || {}),
        ...(effectParams as Record<string, EffectParameterValue>),
      },
    };

    const updatedElement = mergeElement(found.element, { effects });
    const updatedProject = updateElementAt(
      project,
      found.trackIndex,
      found.elementIndex,
      updatedElement,
    );
    return {
      success: true,
      data: { effectId, message: 'Effect updated successfully' },
      updatedProject,
    };
  }

  private removeEffect(project: ProjectData, params: Record<string, unknown>): ToolApplyResult {
    const { elementId, effectId } = params as { elementId?: string; effectId?: string };
    if (!elementId || !effectId)
      return { success: false, error: 'elementId and effectId are required' };

    const found = findElement(project, elementId);
    if (!found) return { success: false, error: `Element not found: ${elementId}` };

    const effects = found.element.effects || [];
    const updatedEffects = effects.filter((e) => e.id !== effectId);
    if (updatedEffects.length === effects.length)
      return { success: false, error: `Effect not found: ${effectId}` };

    const updatedElement = mergeElement(found.element, { effects: updatedEffects });
    const updatedProject = updateElementAt(
      project,
      found.trackIndex,
      found.elementIndex,
      updatedElement,
    );
    return { success: true, data: { message: 'Effect removed successfully' }, updatedProject };
  }

  private listTransitions(): ToolApplyResult {
    return {
      success: true,
      data: {
        transitions: Object.entries(TRANSITION_PRESETS).map(([type, config]) => ({
          type,
          ...config,
        })),
      },
    };
  }

  private setTransition(project: ProjectData, params: Record<string, unknown>): ToolApplyResult {
    const {
      elementId,
      placement,
      type,
      duration,
      easing,
      params: transitionParams,
    } = params as {
      elementId?: string;
      placement?: 'in' | 'out';
      type?: string;
      duration?: number;
      easing?: string;
      params?: Record<string, unknown>;
    };

    if (!elementId || !placement || !type || duration === undefined) {
      return { success: false, error: 'elementId, placement, type, and duration are required' };
    }

    if (!(type in TRANSITION_PRESETS) && type !== 'none' && type !== 'custom') {
      return { success: false, error: `Unknown transition type: ${type}` };
    }

    const found = findElement(project, elementId);
    if (!found) return { success: false, error: `Element not found: ${elementId}` };

    const transitionId = `transition-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    const transition = {
      id: transitionId,
      type,
      duration,
      easing: easing || 'ease-in-out',
      params: transitionParams || {},
    };

    const transitionKey = placement === 'in' ? 'transitionIn' : 'transitionOut';
    const updatedElement = mergeElement(found.element, { [transitionKey]: transition });

    const updatedProject = updateElementAt(
      project,
      found.trackIndex,
      found.elementIndex,
      updatedElement,
    );
    return {
      success: true,
      data: { transitionId, placement, message: `Transition ${placement} set successfully` },
      updatedProject,
    };
  }

  private removeTransition(project: ProjectData, params: Record<string, unknown>): ToolApplyResult {
    const { elementId, placement } = params as { elementId?: string; placement?: 'in' | 'out' };
    if (!elementId || !placement)
      return { success: false, error: 'elementId and placement are required' };

    const found = findElement(project, elementId);
    if (!found) return { success: false, error: `Element not found: ${elementId}` };

    const transitionKey = placement === 'in' ? 'transitionIn' : 'transitionOut';
    const updatedElement = mergeElement(found.element, { [transitionKey]: undefined });

    const updatedProject = updateElementAt(
      project,
      found.trackIndex,
      found.elementIndex,
      updatedElement,
    );
    return {
      success: true,
      data: { message: `Transition ${placement} removed successfully` },
      updatedProject,
    };
  }
}
