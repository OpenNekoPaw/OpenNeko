import type { MessageBundle } from '@neko/shared';

export const onboarding = {
  'onboarding.title': '开始使用 AI',
  'onboarding.subtitle': '连接 AI 服务以开始对话。',
  'onboarding.ssoButton': '使用 Neko Studio 账号登录',
  'onboarding.or': '或',
  'onboarding.openConfigButton': '打开配置文件',
  'onboarding.fileOpenedTitle': '配置文件已打开',
  'onboarding.fileOpenedHint': '将 API Key 添加到配置文件，更改将被自动检测。',
  'onboarding.gotIt': '好的',
} as const satisfies MessageBundle;
