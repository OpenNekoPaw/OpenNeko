/**
 * Builtin Commands Tests
 *
 * Tests for builtin command registration and lookup.
 */

import { describe, it, expect } from 'vitest';
import {
  BUILTIN_COMMANDS,
  getCliCommands,
  getExtensionCommands,
  getBuiltinCommand,
  isBuiltinCommand,
  getAllCommandNames,
} from '../builtin-commands';

describe('BUILTIN_COMMANDS', () => {
  it('should have all required commands', () => {
    const commandNames = BUILTIN_COMMANDS.map((cmd) => cmd.name);
    expect(commandNames).toContain('help');
    expect(commandNames).toContain('status');
    expect(commandNames).toContain('clear');
    expect(commandNames).toContain('exit');
    expect(commandNames).toContain('config');
  });

  it('should have valid command structure', () => {
    for (const cmd of BUILTIN_COMMANDS) {
      expect(cmd.name).toBeTruthy();
      expect(cmd.description).toBeTruthy();
      expect(cmd.category).toBeTruthy();
      expect(typeof cmd.availableInCli).toBe('boolean');
      expect(typeof cmd.availableInExtension).toBe('boolean');
    }
  });

  it('should have unique command names', () => {
    const names = BUILTIN_COMMANDS.map((cmd) => cmd.name);
    const uniqueNames = new Set(names);
    expect(names.length).toBe(uniqueNames.size);
  });

  it('should have valid categories', () => {
    const validCategories = ['core', 'session', 'configuration', 'context', 'mode', 'resources'];
    for (const cmd of BUILTIN_COMMANDS) {
      expect(validCategories).toContain(cmd.category);
    }
  });
});

describe('getCliCommands', () => {
  it('should return only CLI-available commands', () => {
    const cliCommands = getCliCommands();
    expect(cliCommands.length).toBeGreaterThan(0);
    for (const cmd of cliCommands) {
      expect(cmd.availableInCli).toBe(true);
    }
  });

  it('should include help command', () => {
    const cliCommands = getCliCommands();
    const helpCmd = cliCommands.find((cmd) => cmd.name === 'help');
    expect(helpCmd).toBeDefined();
  });

  it('should include config command', () => {
    const cliCommands = getCliCommands();
    const configCmd = cliCommands.find((cmd) => cmd.name === 'config');
    expect(configCmd).toBeDefined();
  });

  it('should exclude extension-only commands', () => {
    const cliCommands = getCliCommands();
    const modelCmd = cliCommands.find((cmd) => cmd.name === 'model');
    expect(modelCmd).toBeUndefined();
  });
});

describe('getExtensionCommands', () => {
  it('should return only extension-available commands', () => {
    const extCommands = getExtensionCommands();
    expect(extCommands.length).toBeGreaterThan(0);
    for (const cmd of extCommands) {
      expect(cmd.availableInExtension).toBe(true);
    }
  });

  it('should include help command', () => {
    const extCommands = getExtensionCommands();
    const helpCmd = extCommands.find((cmd) => cmd.name === 'help');
    expect(helpCmd).toBeDefined();
  });

  it('should include model command', () => {
    const extCommands = getExtensionCommands();
    const modelCmd = extCommands.find((cmd) => cmd.name === 'model');
    expect(modelCmd).toBeDefined();
  });

  it('should exclude CLI-only commands', () => {
    const extCommands = getExtensionCommands();
    const configCmd = extCommands.find((cmd) => cmd.name === 'config');
    expect(configCmd).toBeUndefined();
  });
});

describe('getBuiltinCommand', () => {
  it('should find command by name', () => {
    const cmd = getBuiltinCommand('help');
    expect(cmd).toBeDefined();
    expect(cmd?.name).toBe('help');
  });

  it('should find command by alias', () => {
    const cmd = getBuiltinCommand('h');
    expect(cmd).toBeDefined();
    expect(cmd?.name).toBe('help');
  });

  it('should be case-insensitive', () => {
    const cmd = getBuiltinCommand('HELP');
    expect(cmd).toBeDefined();
    expect(cmd?.name).toBe('help');
  });

  it('should return undefined for unknown command', () => {
    const cmd = getBuiltinCommand('unknown');
    expect(cmd).toBeUndefined();
  });

  it('should find all aliases', () => {
    expect(getBuiltinCommand('help')).toBeDefined();
    expect(getBuiltinCommand('h')).toBeDefined();
    expect(getBuiltinCommand('?')).toBeDefined();
  });

  it('should find exit aliases', () => {
    expect(getBuiltinCommand('exit')).toBeDefined();
    expect(getBuiltinCommand('quit')).toBeDefined();
    expect(getBuiltinCommand('q')).toBeDefined();
  });
});

describe('isBuiltinCommand', () => {
  it('should return true for valid command', () => {
    expect(isBuiltinCommand('help')).toBe(true);
  });

  it('should return true for alias', () => {
    expect(isBuiltinCommand('h')).toBe(true);
  });

  it('should return false for unknown command', () => {
    expect(isBuiltinCommand('unknown')).toBe(false);
  });

  it('should be case-insensitive', () => {
    expect(isBuiltinCommand('HELP')).toBe(true);
  });
});

describe('getAllCommandNames', () => {
  it('should return all command names and aliases', () => {
    const names = getAllCommandNames();
    expect(names.length).toBeGreaterThan(BUILTIN_COMMANDS.length);
  });

  it('should include primary names', () => {
    const names = getAllCommandNames();
    expect(names).toContain('help');
    expect(names).toContain('status');
    expect(names).toContain('config');
  });

  it('should include aliases', () => {
    const names = getAllCommandNames();
    expect(names).toContain('h');
    expect(names).toContain('?');
    expect(names).toContain('cfg');
  });

  it('should not have duplicates', () => {
    const names = getAllCommandNames();
    const uniqueNames = new Set(names);
    expect(names.length).toBe(uniqueNames.size);
  });
});
