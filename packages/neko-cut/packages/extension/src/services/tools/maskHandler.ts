/**
 * Handler for mask operations: AddMask, UpdateMask, RemoveMask.
 */

import type { ProjectData } from '@neko/shared';
import type { IToolHandler, ToolApplyResult } from './types';
import { findElement, updateElementAt, mergeElement } from './helpers';
import { createMaskInstance } from './shapeFactories';

export class MaskHandler implements IToolHandler {
  readonly toolNames = ['AddMask', 'UpdateMask', 'RemoveMask'] as const;

  apply(project: ProjectData, toolName: string, params: Record<string, unknown>): ToolApplyResult {
    switch (toolName) {
      case 'AddMask':
        return this.addMask(project, params);
      case 'UpdateMask':
        return this.updateMask(project, params);
      case 'RemoveMask':
        return this.removeMask(project, params);
      default:
        return { success: false, error: `Unknown tool: ${toolName}` };
    }
  }

  private addMask(project: ProjectData, params: Record<string, unknown>): ToolApplyResult {
    const {
      elementId,
      maskType,
      name,
      inverted,
      feather,
      params: nestedParams,
    } = params as {
      elementId?: string;
      maskType?: string;
      name?: string;
      inverted?: boolean;
      feather?: number;
      params?: Record<string, unknown>;
    };

    if (!elementId || !maskType)
      return { success: false, error: 'elementId and maskType are required' };
    const validTypes = ['rectangle', 'ellipse', 'polygon', 'bezier'];
    if (!validTypes.includes(maskType)) {
      return {
        success: false,
        error: `Invalid mask type: ${maskType}. Valid types: ${validTypes.join(', ')}`,
      };
    }

    const found = findElement(project, elementId);
    if (!found) return { success: false, error: `Element not found: ${elementId}` };

    const existingMasks = (found.element.masks || []) as Array<Record<string, unknown>>;

    const mask = createMaskInstance(maskType, name || `Mask ${existingMasks.length + 1}`);

    const mergedParams = { ...(nestedParams || {}), inverted, feather } as Record<string, unknown>;
    if (mergedParams.inverted !== undefined) mask.inverted = mergedParams.inverted;
    if (mergedParams.feather !== undefined) mask.feather = mergedParams.feather;
    mask.order = existingMasks.length;

    const updatedElement = mergeElement(found.element, {
      masks: [...existingMasks, mask],
    });
    const updatedProject = updateElementAt(
      project,
      found.trackIndex,
      found.elementIndex,
      updatedElement,
    );
    return {
      success: true,
      data: { maskId: mask.id, message: 'Mask added successfully' },
      updatedProject,
    };
  }

  private updateMask(project: ProjectData, params: Record<string, unknown>): ToolApplyResult {
    const {
      elementId,
      maskId,
      enabled,
      inverted,
      feather,
      expansion,
      opacity,
      params: nestedParams,
    } = params as {
      elementId?: string;
      maskId?: string;
      enabled?: boolean;
      inverted?: boolean;
      feather?: number;
      expansion?: number;
      opacity?: number;
      params?: Record<string, unknown>;
    };

    if (!elementId || !maskId)
      return { success: false, error: 'elementId and maskId are required' };

    const found = findElement(project, elementId);
    if (!found) return { success: false, error: `Element not found: ${elementId}` };

    const masks = [...(found.element.masks || [])] as Array<Record<string, unknown>>;
    const idx = masks.findIndex((m) => m.id === maskId);
    if (idx === -1) return { success: false, error: `Mask not found: ${maskId}` };

    const merged = {
      ...(nestedParams || {}),
      enabled,
      inverted,
      feather,
      expansion,
      opacity,
    } as Record<string, unknown>;
    masks[idx] = {
      ...masks[idx],
      ...(merged.enabled !== undefined && { enabled: merged.enabled }),
      ...(merged.inverted !== undefined && { inverted: merged.inverted }),
      ...(merged.feather !== undefined && { feather: merged.feather }),
      ...(merged.expansion !== undefined && { expansion: merged.expansion }),
      ...(merged.opacity !== undefined && { opacity: merged.opacity }),
    };

    const updatedElement = mergeElement(found.element, { masks });
    const updatedProject = updateElementAt(
      project,
      found.trackIndex,
      found.elementIndex,
      updatedElement,
    );
    return {
      success: true,
      data: { maskId, message: 'Mask updated successfully' },
      updatedProject,
    };
  }

  private removeMask(project: ProjectData, params: Record<string, unknown>): ToolApplyResult {
    const { elementId, maskId } = params as { elementId?: string; maskId?: string };
    if (!elementId || !maskId)
      return { success: false, error: 'elementId and maskId are required' };

    const found = findElement(project, elementId);
    if (!found) return { success: false, error: `Element not found: ${elementId}` };

    const masks = (found.element.masks || []) as Array<Record<string, unknown>>;
    const updatedMasks = masks.filter((m) => m.id !== maskId);
    if (updatedMasks.length === masks.length)
      return { success: false, error: `Mask not found: ${maskId}` };

    const updatedElement = mergeElement(found.element, { masks: updatedMasks });
    const updatedProject = updateElementAt(
      project,
      found.trackIndex,
      found.elementIndex,
      updatedElement,
    );
    return { success: true, data: { message: 'Mask removed successfully' }, updatedProject };
  }
}
