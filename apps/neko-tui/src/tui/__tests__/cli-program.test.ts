import { describe, expect, it } from 'vitest';
import { classifyCliCommandRuntime, createCliProgram } from '../cli';

import { createTestAgentTerminalInvocationContext } from '../presentation/testing';
describe('createCliProgram', () => {
  it('advertises Codex-style top-level prompt and command forms', () => {
    const help = createCliProgram(createTestAgentTerminalInvocationContext('en')).helpInformation();

    expect(help).toContain('Usage: neko [options] [prompt...]');
    expect(help).toContain('neko [options] <command> [args]');
    expect(help).toContain('[prompt...]');
    expect(help).toContain('--cd <dir>');
    expect(help).toContain('resume');
    expect(help).toContain('completion');
    expect(help).toContain('debug');
    expect(help).not.toContain('experiment');
    expect(help).not.toContain('real-api-suite');
    expect(help).not.toContain('eval');
    expect(help).not.toContain('run');
  });

  it('uses variadic prompt arguments for interactive and removes experiment aliases', () => {
    const program = createCliProgram(createTestAgentTerminalInvocationContext('en'));
    const interactive = program.commands.find((command) => command.name() === 'interactive');
    const debug = program.commands.find((command) => command.name() === 'debug');

    expect(interactive?.helpInformation()).toContain(
      'Usage: neko interactive|i [options] [workDir] [prompt...]',
    );
    expect(program.commands.some((command) => command.name() === 'run')).toBe(false);
    expect(program.commands.some((command) => command.name() === 'experiment')).toBe(false);
    expect(program.commands.flatMap((command) => command.aliases())).not.toContain('experiment');
    expect(program.commands.some((command) => command.name() === 'real-api-suite')).toBe(false);
    expect(program.commands.some((command) => command.name() === 'eval')).toBe(false);
    expect(debug?.helpInformation()).toContain('Local developer automation');
    const automation = debug?.commands.find((command) => command.name() === 'automation');
    expect(automation?.helpInformation()).toContain('local developer automation protocol');
    expect(automation?.helpInformation()).toContain('--stdio');
  });

  it('documents resume id, prompt, and latest-session options', () => {
    const resume = createCliProgram(createTestAgentTerminalInvocationContext('en')).commands.find(
      (command) => command.name() === 'resume',
    );
    const help = resume?.helpInformation() ?? '';

    expect(help).toContain('Usage: neko resume [options] [id] [prompt...]');
    expect(help).toContain('--last');
    expect(help).toContain('Optional prompt to submit after resume');
  });

  it('classifies utility commands separately from interactive TUI ownership', () => {
    expect(classifyCliCommandRuntime(undefined)).toBe('interactive-tui');
    expect(classifyCliCommandRuntime('interactive')).toBe('interactive-tui');
    expect(classifyCliCommandRuntime('resume')).toBe('interactive-tui');
    expect(classifyCliCommandRuntime('image')).toBe('direct-media');
    expect(classifyCliCommandRuntime('video')).toBe('direct-media');
    expect(classifyCliCommandRuntime('audio')).toBe('direct-media');
    expect(() => classifyCliCommandRuntime('experiment')).toThrow(
      'Unknown CLI command runtime class',
    );
    expect(classifyCliCommandRuntime('completion')).toBe('utility');
    expect(classifyCliCommandRuntime('debug')).toBe('utility');
    expect(() => classifyCliCommandRuntime('run')).toThrow('Unknown CLI command runtime class');
    expect(() => classifyCliCommandRuntime('real-api-suite')).toThrow(
      'Unknown CLI command runtime class',
    );
    expect(() => classifyCliCommandRuntime('eval')).toThrow('Unknown CLI command runtime class');
  });

  it('localizes top-level Commander help without changing command syntax', () => {
    const en = createCliProgram(createTestAgentTerminalInvocationContext('en')).helpInformation();
    const zh = createCliProgram(
      createTestAgentTerminalInvocationContext('zh-cn'),
    ).helpInformation();

    expect(en).toMatchInlineSnapshot(`
      "Usage: neko [options] [prompt...]
             neko [options] <command> [args]

      OpenNeko AI Agent — Professional Terminal UI

      Arguments:
        prompt                                         Optional user prompt to start the session

      Options:
        -C, --cd <dir>                                 Working directory for workspace config and file tools
        --cwd <dir>                                    Working directory for workspace config and file tools
        --work-dir <dir>                               Working directory for workspace config and file tools
        -p, --provider <provider>                      AI provider (anthropic, openai, deepseek)
        -m, --model <model>                            Model ID
        -k, --api-key <key>                            API key
        -v, --verbose                                  Enable verbose output
        --ui-locale <preference>                       Terminal language (auto, en, zh-cn)
        --prompt-locale <preference>                   Built-in Agent prompt language (auto, en, zh-cn)
        -r, --resume [id]                              Resume a previous conversation (omit id to continue the most recent)
        -V, --version                                  Output the version number
        -h, --help                                     Display help for command

      Commands:
        interactive|i [options] [workDir] [prompt...]  Start interactive TUI mode
        image [options] <prompt...>                    Generate an image directly without Agent execution
        video [options] <prompt...>                    Generate a video directly without Agent execution
        audio [options] <prompt...>                    Generate audio directly without Agent execution
        resume [options] [id] [prompt...]              Resume a previous interactive session
        completion [options] [shell]                   Generate shell completion scripts
        config                                         Manage configuration
        debug                                          Local developer automation and diagnostics
        help [command]                                 Display help for command
      "
    `);
    expect(zh).toMatchInlineSnapshot(`
      "用法： neko [options] [prompt...]
             neko [options] <command> [args]

      OpenNeko AI Agent — 专业终端界面

      参数：
        prompt                                         启动会话时可选提交的用户提示词

      选项：
        -C, --cd <dir>                                 工作区配置和文件工具使用的工作目录
        --cwd <dir>                                    工作区配置和文件工具使用的工作目录
        --work-dir <dir>                               工作区配置和文件工具使用的工作目录
        -p, --provider <provider>                      AI 提供者（anthropic、openai、deepseek）
        -m, --model <model>                            模型 ID
        -k, --api-key <key>                            API 密钥
        -v, --verbose                                  启用详细输出
        --ui-locale <preference>                       终端语言（auto、en、zh-cn）
        --prompt-locale <preference>                   内置 Agent 提示词语言（auto、en、zh-cn）
        -r, --resume [id]                              恢复之前的对话（省略 ID 则继续最近的对话）
        -V, --version                                  输出版本号
        -h, --help                                     显示命令帮助

      命令：
        interactive|i [options] [workDir] [prompt...]  启动交互式 TUI 模式
        image [options] <prompt...>                    不经过 Agent 直接生成图像
        video [options] <prompt...>                    不经过 Agent 直接生成视频
        audio [options] <prompt...>                    不经过 Agent 直接生成音频
        resume [options] [id] [prompt...]              恢复之前的交互会话
        completion [options] [shell]                   生成 shell 补全脚本
        config                                         管理配置
        debug                                          本地开发自动化与诊断
        help [command]                                 显示命令帮助
      "
    `);
    for (const stableSyntax of [
      'neko [options] [prompt...]',
      'neko [options] <command> [args]',
      '--ui-locale <preference>',
      '--prompt-locale <preference>',
      'interactive|i [options] [workDir] [prompt...]',
    ]) {
      expect(en).toContain(stableSyntax);
      expect(zh).toContain(stableSyntax);
    }
  });

  it('localizes Commander parse diagnostics and keeps the unknown option token unchanged', async () => {
    for (const locale of ['en', 'zh-cn'] as const) {
      let stderr = '';
      const program = createCliProgram(createTestAgentTerminalInvocationContext(locale));
      program.exitOverride();
      program.configureOutput({ writeErr: (value) => (stderr += value) });

      await expect(program.parseAsync(['node', 'neko', '--unknown-原文'])).rejects.toMatchObject({
        code: 'commander.unknownOption',
      });
      expect(stderr).toContain('--unknown-原文');
      expect(stderr).toContain(locale === 'en' ? 'error: unknown option' : '错误：未知选项');
    }
  });
});
