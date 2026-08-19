import { describe, it, expect } from 'vitest';
import { getMCPCategories, getMCPCategoryName, getMCPCategoryIcon } from '../mcp-servers';

describe('mcp-servers config', () => {
  describe('getMCPCategories()', () => {
    it('should return all MCP categories', () => {
      const categories = getMCPCategories();
      expect(Array.isArray(categories)).toBe(true);
      expect(categories.length).toBe(7);
    });

    it('should include expected categories', () => {
      const categories = getMCPCategories();
      expect(categories).toContain('filesystem');
      expect(categories).toContain('database');
      expect(categories).toContain('api');
      expect(categories).toContain('development');
      expect(categories).toContain('productivity');
      expect(categories).toContain('ai');
      expect(categories).toContain('other');
    });
  });

  describe('getMCPCategoryName()', () => {
    it('should return display name for filesystem', () => {
      expect(getMCPCategoryName('filesystem')).toBe('File System');
    });

    it('should return display name for database', () => {
      expect(getMCPCategoryName('database')).toBe('Database');
    });

    it('should return display name for api', () => {
      expect(getMCPCategoryName('api')).toBe('API & Web');
    });

    it('should return display name for development', () => {
      expect(getMCPCategoryName('development')).toBe('Development');
    });

    it('should return display name for productivity', () => {
      expect(getMCPCategoryName('productivity')).toBe('Productivity');
    });

    it('should return display name for ai', () => {
      expect(getMCPCategoryName('ai')).toBe('AI & Memory');
    });

    it('should return display name for other', () => {
      expect(getMCPCategoryName('other')).toBe('Other');
    });
  });

  describe('getMCPCategoryIcon()', () => {
    it('should return icon for filesystem', () => {
      expect(getMCPCategoryIcon('filesystem')).toBe('📁');
    });

    it('should return icon for database', () => {
      expect(getMCPCategoryIcon('database')).toBe('🗄️');
    });

    it('should return icon for api', () => {
      expect(getMCPCategoryIcon('api')).toBe('🌐');
    });

    it('should return icon for development', () => {
      expect(getMCPCategoryIcon('development')).toBe('🛠️');
    });

    it('should return icon for productivity', () => {
      expect(getMCPCategoryIcon('productivity')).toBe('📊');
    });

    it('should return icon for ai', () => {
      expect(getMCPCategoryIcon('ai')).toBe('🤖');
    });

    it('should return icon for other', () => {
      expect(getMCPCategoryIcon('other')).toBe('📦');
    });

    it('should return string icons for all categories', () => {
      const categories = getMCPCategories();
      categories.forEach((category) => {
        const icon = getMCPCategoryIcon(category);
        expect(typeof icon).toBe('string');
        expect(icon.length).toBeGreaterThan(0);
      });
    });
  });
});
