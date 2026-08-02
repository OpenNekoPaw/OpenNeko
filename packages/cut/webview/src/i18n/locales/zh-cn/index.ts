import type { MessageBundle } from '@neko/ui/i18n';

import { common } from './common';
import { diagnostics } from './diagnostics';
import { exportBundle } from './export';
import { preview } from './preview';
import { propertyPanel } from './propertyPanel';
import { speed } from './speed';
import { timeline } from './timeline';

export const bundles: Record<string, MessageBundle> = {
  common,
  diagnostics,
  exportBundle,
  preview,
  propertyPanel,
  speed,
  timeline,
};
