import type { MessageBundle } from '@neko/shared';

export const accountBar = {
  'accountBar.connectTitle': '连接 AI 服务',
  'accountBar.connectCta': '连接 AI',
  'accountBar.signOut': '退出登录',
  'accountBar.changeKey': '更换 API Key',
  'accountBar.modelGenerationConfig': '模型与生成配置',
  'accountBar.openConfigFile': '打开配置文件',
} as const satisfies MessageBundle;
