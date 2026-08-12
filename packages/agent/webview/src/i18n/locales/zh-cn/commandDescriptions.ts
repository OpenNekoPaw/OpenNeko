import type { MessageBundle } from '@neko/ui/i18n';

export const commandDescriptions = {
  'commandDescriptions.help': '显示帮助与可用命令',
  'commandDescriptions.status': '显示当前配置、模型与资源状态',
  'commandDescriptions.clear': '清除对话记录或屏幕内容',
  'commandDescriptions.exit': '退出交互模式或关闭当前会话',
  'commandDescriptions.as': '开始独立的角色对话会话',
  'commandDescriptions.exit-as': '退出当前角色对话会话',
  'commandDescriptions.new': '开始新对话',
  'commandDescriptions.resume': '显示可继续的最近对话',
  'commandDescriptions.config': '管理配置',
  'commandDescriptions.model': '显示模型选择器或切换模型',
  'commandDescriptions.settings': '打开设置面板',
  'commandDescriptions.permissions': '查看和管理权限',
  'commandDescriptions.init': '初始化项目配置',
  'commandDescriptions.compact': '压缩对话上下文以节省 Token',
  'commandDescriptions.plan': '切换计划模式（先设计再实现）',
  'commandDescriptions.skills': '列出和管理技能',
  'commandDescriptions.commands': '列出可用斜杠命令',
  'commandDescriptions.tools': '列出和搜索可用工具',
  'commandDescriptions.mcp': '显示 MCP 服务器配置',
} as const satisfies MessageBundle;
