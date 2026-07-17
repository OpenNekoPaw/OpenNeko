import type { MessageBundle } from '@neko/shared';

import { accountBar } from './accountBar';
import { chat } from './chat';
import { common } from './common';
import { errors } from './errors';
import { header } from './header';
import { history } from './history';
import { onboarding } from './onboarding';
import { preview } from './preview';
import { settings } from './settings';
import { tasks } from './tasks';
import { toolCalls } from './toolCalls';

export const bundles: Record<string, MessageBundle> = {
  accountBar,
  chat,
  common,
  errors,
  header,
  history,
  onboarding,
  preview,
  settings,
  tasks,
  toolCalls,
};
