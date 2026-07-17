/**
 * PromptManager Unit Tests (Platform - Lightweight implementation)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { Prompt } from '@neko/shared';
import { PromptManager } from '../prompt-manager';

describe('PromptManager', () => {
  let manager: PromptManager;

  beforeEach(() => {
    manager = new PromptManager();
  });

  describe('initial state', () => {
    it('should start with no prompts', () => {
      const prompts = manager.list();
      expect(prompts.length).toBe(0);
    });
  });

  describe('list by category', () => {
    it('should list prompts by category', () => {
      manager.register({
        id: 'sys-1',
        name: 'System 1',
        description: 'System prompt',
        category: 'system',
        template: 'Test',
        variables: [],
        version: '1.0.0',
      });
      manager.register({
        id: 'custom-1',
        name: 'Custom 1',
        description: 'Custom prompt',
        category: 'custom',
        template: 'Test',
        variables: [],
        version: '1.0.0',
      });

      const systemPrompts = manager.listByCategory('system');
      expect(systemPrompts.every((p) => p.category === 'system')).toBe(true);
      expect(systemPrompts.length).toBe(1);
    });

    it('should return empty array for category with no prompts', () => {
      const customPrompts = manager.listByCategory('custom');
      expect(Array.isArray(customPrompts)).toBe(true);
      expect(customPrompts.length).toBe(0);
    });
  });

  describe('register and unregister', () => {
    it('should register custom prompt', () => {
      const customPrompt: Prompt = {
        id: 'custom-test',
        name: 'Custom Test',
        description: 'Test prompt',
        category: 'custom',
        template: 'Hello {{name}}!',
        variables: [{ name: 'name', description: 'Name', type: 'string', required: true }],
        version: '1.0.0',
      };

      manager.register(customPrompt);
      expect(manager.get('custom-test')).toBeDefined();
    });

    it('should unregister prompt', () => {
      const customPrompt: Prompt = {
        id: 'to-remove',
        name: 'To Remove',
        description: 'Will be removed',
        category: 'custom',
        template: 'Test',
        variables: [],
        version: '1.0.0',
      };

      manager.register(customPrompt);
      expect(manager.get('to-remove')).toBeDefined();

      manager.unregister('to-remove');
      expect(manager.get('to-remove')).toBeUndefined();
    });
  });

  describe('render', () => {
    it('should render prompt with variables', () => {
      const prompt: Prompt = {
        id: 'greeting',
        name: 'Greeting',
        description: 'Greet someone',
        category: 'custom',
        template: 'Hello {{name}}, welcome to {{place}}!',
        variables: [
          { name: 'name', description: 'Name', type: 'string', required: true },
          { name: 'place', description: 'Place', type: 'string', required: true },
        ],
        version: '1.0.0',
      };

      manager.register(prompt);
      const result = manager.render('greeting', { name: 'Alice', place: 'Wonderland' });

      expect(result.content).toBe('Hello Alice, welcome to Wonderland!');
      expect(result.warnings.length).toBe(0);
    });

    it('should use default values for missing optional variables', () => {
      const prompt: Prompt = {
        id: 'optional-test',
        name: 'Optional Test',
        description: 'Test optional vars',
        category: 'custom',
        template: 'Value: {{value}}',
        variables: [
          {
            name: 'value',
            description: 'Value',
            type: 'string',
            required: false,
            default: 'default',
          },
        ],
        version: '1.0.0',
      };

      manager.register(prompt);
      const result = manager.render('optional-test', {});

      expect(result.content).toBe('Value: default');
    });

    it('should add warning for missing required variables', () => {
      const prompt: Prompt = {
        id: 'required-test',
        name: 'Required Test',
        description: 'Test required vars',
        category: 'custom',
        template: 'Name: {{name}}',
        variables: [{ name: 'name', description: 'Name', type: 'string', required: true }],
        version: '1.0.0',
      };

      manager.register(prompt);
      const result = manager.render('required-test', {});

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('name');
    });

    it('should throw error for non-existent prompt', () => {
      expect(() => manager.render('non-existent', {})).toThrow("Prompt 'non-existent' not found");
    });

    it('should format object variables as JSON', () => {
      const prompt: Prompt = {
        id: 'json-test',
        name: 'JSON Test',
        description: 'Test JSON formatting',
        category: 'custom',
        template: 'Data: {{data}}',
        variables: [{ name: 'data', description: 'Data', type: 'object', required: true }],
        version: '1.0.0',
      };

      manager.register(prompt);
      const result = manager.render('json-test', { data: { key: 'value' } });

      expect(result.content).toContain('"key"');
      expect(result.content).toContain('"value"');
    });
  });
});
