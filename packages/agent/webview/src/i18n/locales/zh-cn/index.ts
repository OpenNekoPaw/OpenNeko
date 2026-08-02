import type { MessageBundle } from '@neko/ui/i18n';

import { accountBar } from './accountBar';
import { chat } from './chat';
import { characterRole } from './characterRole';
import { common } from './common';
import { errors } from './errors';
import { header } from './header';
import { history } from './history';
import { onboarding } from './onboarding';
import { preview } from './preview';
import { settings } from './settings';
import { toolCalls } from './toolCalls';

export const bundles: Record<string, MessageBundle> = {
  accountBar,
  chat,
  characterRole,
  common,
  errors,
  header,
  history,
  onboarding,
  preview,
  settings,
  toolCalls,
};
