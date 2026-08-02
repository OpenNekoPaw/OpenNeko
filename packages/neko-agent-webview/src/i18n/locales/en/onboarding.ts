import type { MessageBundle } from '@neko/ui/i18n';

export const onboarding = {
  'onboarding.title': 'Get Started with AI',
  'onboarding.subtitle': 'Connect an AI service to start chatting.',
  'onboarding.ssoButton': 'Sign in with Neko Studio',
  'onboarding.or': 'or',
  'onboarding.openConfigButton': 'Open Config File',
  'onboarding.fileOpenedTitle': 'Config file opened',
  'onboarding.fileOpenedHint':
    'Add your API key to the config file. The changes will be detected automatically.',
  'onboarding.gotIt': 'Got it',
} as const satisfies MessageBundle;
