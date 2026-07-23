import type { MessageBundle } from '@neko/shared';

import { common } from './common';
import { exportBundle } from './export';
import { preview } from './preview';
import { propertyPanel } from './propertyPanel';
import { speed } from './speed';
import { timeline } from './timeline';

export const bundles: Record<string, MessageBundle> = {
  common,
  exportBundle,
  preview,
  propertyPanel,
  speed,
  timeline,
};
