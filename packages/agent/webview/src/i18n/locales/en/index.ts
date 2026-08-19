import type { MessageBundle } from '@neko/ui/i18n';

import { accountBar } from './accountBar';
import { chat } from './chat';
import { characterRole } from './characterRole';
import { commandDescriptions } from './commandDescriptions';
import { common } from './common';
import { errors } from './errors';
import { header } from './header';
import { history } from './history';
import { onboarding } from './onboarding';
import { preview } from './preview';
import { settings } from './settings';
import { skillDescriptions } from './skillDescriptions';
import { toolCalls } from './toolCalls';

export const bundles: Record<string, MessageBundle> = {
  accountBar,
  chat,
  characterRole,
  commandDescriptions,
  common,
  errors,
  header,
  history,
  onboarding,
  preview,
  settings,
  skillDescriptions,
  toolCalls,
};
