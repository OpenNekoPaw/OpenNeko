// =============================================================================
// Operation Errors — 操作错误类型
// =============================================================================

import { BaseError } from '../errors/base-error';

/**
 * 操作错误码
 */
export type OperationErrorCode =
  | 'TRACK_NOT_FOUND'
  | 'ELEMENT_NOT_FOUND'
  | 'SHAPE_NOT_FOUND'
  | 'KEYFRAME_NOT_FOUND'
  | 'EFFECT_NOT_FOUND'
  | 'MASK_NOT_FOUND'
  | 'NODE_NOT_FOUND'
  | 'LAYER_NOT_FOUND'
  | 'CONNECTION_NOT_FOUND'
  | 'MARKER_NOT_FOUND'
  | 'INVALID_INDEX'
  | 'INVALID_OPERATION'
  | 'TYPE_MISMATCH';

/**
 * 操作错误 — 当 apply/invert 遇到无效状态时抛出
 */
export class OperationError extends BaseError {
  readonly operationCode: OperationErrorCode;

  constructor(code: OperationErrorCode, message: string, context?: Record<string, unknown>) {
    super({
      category: 'validation',
      code: `OPERATION_${code}`,
      message,
      retryable: false,
      context,
    });
    this.name = 'OperationError';
    this.operationCode = code;
  }

  static trackNotFound(trackId: string): OperationError {
    return new OperationError('TRACK_NOT_FOUND', `Track not found: ${trackId}`, { trackId });
  }

  static elementNotFound(elementId: string, trackId?: string): OperationError {
    return new OperationError('ELEMENT_NOT_FOUND', `Element not found: ${elementId}`, {
      elementId,
      trackId,
    });
  }

  static shapeNotFound(shapeId: string): OperationError {
    return new OperationError('SHAPE_NOT_FOUND', `Shape not found: ${shapeId}`, { shapeId });
  }

  static keyframeNotFound(keyframeId: string): OperationError {
    return new OperationError('KEYFRAME_NOT_FOUND', `Keyframe not found: ${keyframeId}`, {
      keyframeId,
    });
  }

  static effectNotFound(effectId: string): OperationError {
    return new OperationError('EFFECT_NOT_FOUND', `Effect not found: ${effectId}`, { effectId });
  }

  static maskNotFound(maskId: string): OperationError {
    return new OperationError('MASK_NOT_FOUND', `Mask not found: ${maskId}`, { maskId });
  }

  static invalidIndex(index: number, max: number): OperationError {
    return new OperationError('INVALID_INDEX', `Index ${index} out of range [0, ${max}]`, {
      index,
      max,
    });
  }

  static invalidOperation(message: string): OperationError {
    return new OperationError('INVALID_OPERATION', message);
  }

  static nodeNotFound(nodeId: string): OperationError {
    return new OperationError('NODE_NOT_FOUND', `Node not found: ${nodeId}`, { nodeId });
  }

  static layerNotFound(layerId: string): OperationError {
    return new OperationError('LAYER_NOT_FOUND', `Layer not found: ${layerId}`, { layerId });
  }

  static connectionNotFound(connectionId: string): OperationError {
    return new OperationError('CONNECTION_NOT_FOUND', `Connection not found: ${connectionId}`, {
      connectionId,
    });
  }

  static markerNotFound(markerId: string): OperationError {
    return new OperationError('MARKER_NOT_FOUND', `Marker not found: ${markerId}`, { markerId });
  }
}
