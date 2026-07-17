/**
 * Element Capabilities
 * 元素能力接口定义
 *
 * 遵循接口隔离原则 (ISP)，将元素能力拆分为独立的接口：
 * - IAnimatable: 动画能力
 * - IAudioCapable: 音频能力
 * - IEffectable: 效果能力
 *
 * 使用时通过接口组合来定义不同类型的元素
 */

import type { ElementTransform } from './animation';
import type { Transition } from './transition';
import type { SpeedProperties } from '../utils/speed';
import type { ColorCorrection } from './colorCorrection';
import type { EffectInstance } from './effects';
import type { MaskInstance } from './mask';
import type { AudioProperties } from './audio';
import type { BlendModeType } from '@neko/shared';

// =============================================================================
// 基础元素接口
// =============================================================================

/**
 * 时间线元素的基础属性
 * 所有元素类型都必须具有的核心属性
 */
export interface ITimelineElementBase {
  /** 唯一标识符 */
  id: string;
  /** 元素名称 */
  name: string;
  /** 原始时长（秒） */
  duration: number;
  /** 在时间线上的起始时间（秒） */
  startTime: number;
  /** 裁剪起始点（秒） */
  trimStart: number;
  /** 裁剪结束点（秒） */
  trimEnd: number;
  /** 是否隐藏 */
  hidden?: boolean;
}

// =============================================================================
// 能力接口 (Capability Interfaces)
// =============================================================================

/**
 * 动画能力接口
 * 支持变换动画的元素应实现此接口
 */
export interface IAnimatable {
  /** 变换动画属性（位置/缩放/旋转/透明度） */
  transform?: ElementTransform;
  /** 速度控制（变速/倒放/时间重映射） */
  speed?: SpeedProperties;
  /** 入场过渡效果 */
  transitionIn?: Transition;
  /** 出场过渡效果 */
  transitionOut?: Transition;
}

/**
 * 音频能力接口
 * 具有音频的元素应实现此接口
 */
export interface IAudioCapable {
  /** 音频属性 */
  audio?: AudioProperties;
  /** 是否静音 */
  muted?: boolean;
}

/**
 * 效果能力接口
 * 支持视觉效果的元素应实现此接口
 */
export interface IEffectable {
  /** 色彩校正设置 */
  colorCorrection?: ColorCorrection;
  /** 应用的视频效果列表 */
  effects?: EffectInstance[];
  /** 应用的遮罩列表 */
  masks?: MaskInstance[];
  /** 图层混合模式 */
  blendMode?: BlendModeType;
}

/**
 * 媒体源能力接口
 * 具有外部媒体源的元素应实现此接口
 */
export interface IMediaSource {
  /** 媒体文件路径 */
  src: string;
}

// =============================================================================
// 组合元素类型
// =============================================================================

/**
 * 媒体元素的完整能力集
 * 组合了所有适用于媒体元素的能力接口
 */
export type MediaElementCapabilities = ITimelineElementBase &
  IMediaSource &
  IAnimatable &
  IAudioCapable &
  IEffectable;

/**
 * 音频元素的完整能力集
 * 组合了所有适用于音频元素的能力接口
 */
export type AudioElementCapabilities = ITimelineElementBase & IMediaSource & IAudioCapable;

/**
 * 文本元素的完整能力集
 * 组合了所有适用于文本元素的能力接口
 */
export type TextElementCapabilities = ITimelineElementBase & IAnimatable & IEffectable;

// =============================================================================
// 类型守卫函数
// =============================================================================

/**
 * 检查元素是否具有动画能力
 */
export function isAnimatable(element: unknown): element is IAnimatable {
  return element !== null && typeof element === 'object';
}

/**
 * 检查元素是否具有音频能力
 */
export function isAudioCapable(element: unknown): element is IAudioCapable {
  return (
    element !== null && typeof element === 'object' && ('audio' in element || 'muted' in element)
  );
}

/**
 * 检查元素是否具有效果能力
 */
export function isEffectable(element: unknown): element is IEffectable {
  return (
    element !== null &&
    typeof element === 'object' &&
    ('colorCorrection' in element || 'effects' in element || 'masks' in element)
  );
}

/**
 * 检查元素是否具有媒体源
 */
export function hasMediaSource(element: unknown): element is IMediaSource {
  return (
    element !== null &&
    typeof element === 'object' &&
    'src' in element &&
    typeof (element as IMediaSource).src === 'string'
  );
}

// =============================================================================
// 能力检测辅助函数
// =============================================================================

/**
 * 获取元素的有效时长（考虑裁剪）
 */
export function getEffectiveDuration(element: ITimelineElementBase): number {
  const trimStart = element.trimStart ?? 0;
  const trimEnd = element.trimEnd ?? 0;
  return element.duration - trimStart - trimEnd;
}

/**
 * 获取元素在时间线上的结束时间
 */
export function getElementEndTime(element: ITimelineElementBase): number {
  return element.startTime + getEffectiveDuration(element);
}

/**
 * 检查给定时间是否在元素范围内
 */
export function isTimeInElement(element: ITimelineElementBase, time: number): boolean {
  return time >= element.startTime && time < getElementEndTime(element);
}
