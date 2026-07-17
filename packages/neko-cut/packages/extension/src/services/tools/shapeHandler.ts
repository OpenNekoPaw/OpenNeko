/**
 * Handler for shape operations: AddShape, UpdateShape.
 */

import type { ProjectData, TimelineTrack, ShapeType, Shape, ShapeInstance } from '@neko/shared';
import type { IToolHandler, ToolApplyResult } from './types';
import { normalizePercent, type ToolTrack } from './helpers';
import {
  createRectangleShape,
  createEllipseShape,
  createPolygonShape,
  createStarShape,
  createLineShape,
  createBezierShape,
  createDefaultShapeStyle,
  createShapeInstance,
  applyStyleOverrides,
} from './shapeFactories';

export class ShapeHandler implements IToolHandler {
  readonly toolNames = ['AddShape', 'UpdateShape'] as const;

  apply(project: ProjectData, toolName: string, params: Record<string, unknown>): ToolApplyResult {
    switch (toolName) {
      case 'AddShape':
        return this.addShape(project, params);
      case 'UpdateShape':
        return this.updateShape(project, params);
      default:
        return { success: false, error: `Unknown tool: ${toolName}` };
    }
  }

  private addShape(project: ProjectData, params: Record<string, unknown>): ToolApplyResult {
    const { trackId, shapeType, name, position, size, style, transform } = params as {
      trackId?: string;
      shapeType?: string;
      name?: string;
      position?: { x?: number; y?: number };
      size?: { width?: number; height?: number };
      style?: Record<string, unknown>;
      transform?: { x?: number; y?: number; scaleX?: number; scaleY?: number };
    };

    if (!trackId || !shapeType) {
      return { success: false, error: 'trackId and shapeType are required' };
    }

    const validTypes: ShapeType[] = ['rectangle', 'ellipse', 'polygon', 'star', 'line', 'bezier'];
    if (!validTypes.includes(shapeType as ShapeType)) {
      return {
        success: false,
        error: `Invalid shape type: ${shapeType}. Valid types: ${validTypes.join(', ')}`,
      };
    }

    const trackIndex = project.tracks.findIndex((t) => t.id === trackId);
    if (trackIndex === -1) return { success: false, error: `Track not found: ${trackId}` };

    const centerX = position?.x ?? normalizePercent(transform?.x, 50);
    const centerY = position?.y ?? normalizePercent(transform?.y, 50);

    const baseWidth = 20;
    const baseHeight = 20;
    const width = size?.width ?? (transform?.scaleX ? baseWidth * transform.scaleX : baseWidth);
    const height = size?.height ?? (transform?.scaleY ? baseHeight * transform.scaleY : baseHeight);

    let shape: Shape;
    switch (shapeType) {
      case 'rectangle':
        shape = createRectangleShape(centerX, centerY, width, height);
        break;
      case 'ellipse':
        shape = createEllipseShape(centerX, centerY, width / 2, height / 2);
        break;
      case 'polygon':
        shape = createPolygonShape(6);
        break;
      case 'star':
        shape = createStarShape(centerX, centerY, 5, Math.min(width, height) / 2);
        break;
      case 'line':
        shape = createLineShape(centerX - width / 2, centerY, centerX + width / 2, centerY);
        break;
      case 'bezier':
        shape = createBezierShape();
        break;
      default:
        shape = createRectangleShape(centerX, centerY, width, height);
        break;
    }

    const baseStyle = createDefaultShapeStyle();
    const resolvedStyle = applyStyleOverrides(baseStyle, style);
    const shapeInstance = createShapeInstance(shape, name, resolvedStyle);

    const track = project.tracks[trackIndex]! as ToolTrack;
    const existingShapes = track.shapes || [];

    const updatedTrack = {
      ...project.tracks[trackIndex]!,
      shapes: [...existingShapes, shapeInstance],
    } as TimelineTrack;

    const updatedTracks = [...project.tracks];
    updatedTracks[trackIndex] = updatedTrack;

    return {
      success: true,
      data: { shapeId: shapeInstance.id, message: 'Shape added successfully' },
      updatedProject: { ...project, tracks: updatedTracks },
    };
  }

  private updateShape(project: ProjectData, params: Record<string, unknown>): ToolApplyResult {
    const { shapeId, elementId, position, size, style, visible, locked } = params as {
      shapeId?: string;
      elementId?: string;
      position?: { x?: number; y?: number };
      size?: { width?: number; height?: number };
      style?: Record<string, unknown>;
      visible?: boolean;
      locked?: boolean;
    };

    const targetId = shapeId || elementId;
    if (!targetId) return { success: false, error: 'shapeId or elementId is required' };

    let targetTrackIndex = -1;
    let targetShapeIndex = -1;

    for (let i = 0; i < project.tracks.length; i++) {
      const track = project.tracks[i]! as ToolTrack;
      const trackShapes = track.shapes as unknown as ShapeInstance[] | undefined;
      if (!trackShapes) continue;
      const index = trackShapes.findIndex((s) => s.id === targetId);
      if (index !== -1) {
        targetTrackIndex = i;
        targetShapeIndex = index;
        break;
      }
    }

    if (targetTrackIndex === -1 || targetShapeIndex === -1) {
      return { success: false, error: `Shape not found: ${targetId}` };
    }

    const track = project.tracks[targetTrackIndex]! as ToolTrack;
    const shapes = track.shapes as unknown as ShapeInstance[];
    const sourceShape = shapes[targetShapeIndex]!;
    const shapeInstance = {
      ...sourceShape,
      shape: structuredClone(sourceShape.shape),
      style: structuredClone(sourceShape.style),
    };

    const shapeRecord = shapeInstance.shape as unknown as Record<string, unknown>;

    if (position && 'centerX' in shapeRecord && 'centerY' in shapeRecord) {
      if (typeof position.x === 'number') (shapeRecord as { centerX: number }).centerX = position.x;
      if (typeof position.y === 'number') (shapeRecord as { centerY: number }).centerY = position.y;
    }

    if (size) {
      if ('width' in shapeRecord && 'height' in shapeRecord) {
        if (typeof size.width === 'number') (shapeRecord as { width: number }).width = size.width;
        if (typeof size.height === 'number')
          (shapeRecord as { height: number }).height = size.height;
      } else if ('radiusX' in shapeRecord && 'radiusY' in shapeRecord) {
        if (typeof size.width === 'number')
          (shapeRecord as { radiusX: number }).radiusX = size.width / 2;
        if (typeof size.height === 'number')
          (shapeRecord as { radiusY: number }).radiusY = size.height / 2;
      }
    }

    shapeInstance.shape = shapeRecord as unknown as Shape;

    if (style) {
      const updatedStyle = applyStyleOverrides(structuredClone(shapeInstance.style), style);
      shapeInstance.style = updatedStyle;
    }

    if (visible !== undefined) shapeInstance.visible = visible;
    if (locked !== undefined) shapeInstance.locked = locked;

    const updatedShapes = [...shapes];
    updatedShapes[targetShapeIndex] = shapeInstance;

    const updatedTrack = {
      ...project.tracks[targetTrackIndex]!,
      shapes: updatedShapes,
    } as TimelineTrack;

    const updatedTracks = [...project.tracks];
    updatedTracks[targetTrackIndex] = updatedTrack;

    return {
      success: true,
      data: { shapeId: targetId, message: 'Shape updated successfully' },
      updatedProject: { ...project, tracks: updatedTracks },
    };
  }
}
