import type { MessageBundle } from '@neko/ui/i18n';

export const onboarding = {
  'onboarding.title': '开始使用 AI',
  'onboarding.subtitle': '连接 AI 服务以开始对话。',
  'onboarding.ssoButton': '使用 Neko Studio 账号登录',
  'onboarding.or': '或',
  'onboarding.openConfigButton': '打开配置文件',
  'onboarding.fileOpenedTitle': '配置文件已打开',
  'onboarding.fileOpenedHint': '添加 Provider 与模型定义；需要凭据时，系统会通过受保护输入框请求。',
  'onboarding.gotIt': '好的',
} as const satisfies MessageBundle;
