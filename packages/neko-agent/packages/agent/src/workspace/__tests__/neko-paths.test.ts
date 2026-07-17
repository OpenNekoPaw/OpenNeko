import { describe, it, expect } from 'vitest';
import {
  createNekoPaths,
  NEKO_CACHE_FILES,
  NEKO_LOG_FILES,
  NEKO_STATE_FILES,
  NEKO_SUBDIRS,
} from '../neko-paths';

describe('NekoPaths', () => {
  it('root is <projectRoot>/.neko', () => {
    const p = createNekoPaths('/home/user/proj');
    expect(p.root).toBe('/home/user/proj/.neko');
  });

  it('normalises trailing slash on the project root', () => {
    const p = createNekoPaths('/home/user/proj/');
    expect(p.root).toBe('/home/user/proj/.neko');
  });

  it('throws when projectRoot is empty', () => {
    expect(() => createNekoPaths('')).toThrow(/projectRoot is required/);
  });

  it('dir() returns canonical subdir paths', () => {
    const p = createNekoPaths('/r');
    expect(p.dir('sessions')).toBe(`/r/.neko/${NEKO_SUBDIRS.sessions}`);
    expect(p.dir('logs')).toBe(`/r/.neko/${NEKO_SUBDIRS.logs}`);
    expect(p.dir('cache')).toBe(`/r/.neko/${NEKO_SUBDIRS.cache}`);
    expect(p.dir('state')).toBe(`/r/.neko/${NEKO_SUBDIRS.state}`);
    expect(p.dir('archives')).toBe(`/r/.neko/${NEKO_SUBDIRS.archives}`);
  });

  it('file() uses managed runtime naming for session files only', () => {
    const p = createNekoPaths('/r');
    expect(p.file('sessions', 'run-a')).toBe('/r/.neko/sessions/session-run-a.md');
    expect(p.file('archives', '2026-04')).toBe('/r/.neko/archives/2026-04.md');
  });

  it('file() strips a duplicate session prefix / extension from the basename', () => {
    const p = createNekoPaths('/r');
    expect(p.file('sessions', 'session-run-a')).toBe('/r/.neko/sessions/session-run-a.md');
    expect(p.file('sessions', 'session-run-a.md')).toBe('/r/.neko/sessions/session-run-a.md');
  });

  it('file() rejects empty basename', () => {
    const p = createNekoPaths('/r');
    expect(() => p.file('sessions', '')).toThrow(/basename is required/);
  });

  it('log() returns canonical JSONL paths', () => {
    const p = createNekoPaths('/r');
    expect(p.log('modelCalls')).toBe(`/r/.neko/logs/${NEKO_LOG_FILES.modelCalls}`);
    expect(p.log('events')).toBe(`/r/.neko/logs/${NEKO_LOG_FILES.events}`);
    expect(p.log('audits')).toBe(`/r/.neko/logs/${NEKO_LOG_FILES.audits}`);
    expect(p.log('steps')).toBe(`/r/.neko/logs/${NEKO_LOG_FILES.steps}`);
  });

  it('conversationLog() returns conversation-owned JSONL paths', () => {
    const p = createNekoPaths('/r');
    expect(p.conversationLog('modelCalls', 'conv-a')).toBe(
      `/r/.neko/logs/conversations/conv-a/${NEKO_LOG_FILES.modelCalls}`,
    );
    expect(p.conversationLog('events', 'conv-a')).toBe(
      `/r/.neko/logs/conversations/conv-a/${NEKO_LOG_FILES.events}`,
    );
    expect(p.conversationLog('audits', 'conv-b')).toBe(
      `/r/.neko/logs/conversations/conv-b/${NEKO_LOG_FILES.audits}`,
    );
    expect(p.conversationLog('steps', 'conv-b')).toBe(
      `/r/.neko/logs/conversations/conv-b/${NEKO_LOG_FILES.steps}`,
    );
  });

  it('conversationLog() rejects unsafe conversation ids', () => {
    const p = createNekoPaths('/r');
    expect(() => p.conversationLog('events', '../conv-a')).toThrow(/invalid conversationId/);
    expect(() => p.conversationLog('events', 'conv/a')).toThrow(/invalid conversationId/);
    expect(() => p.conversationLog('events', '')).toThrow(/invalid conversationId/);
  });

  it('cache() returns canonical cache snapshot paths', () => {
    const p = createNekoPaths('/r');
    expect(p.cache('capabilityIndex')).toBe(`/r/.neko/.cache/${NEKO_CACHE_FILES.capabilityIndex}`);
    expect(p.cache('artifactIndex')).toBe(`/r/.neko/.cache/${NEKO_CACHE_FILES.artifactIndex}`);
  });

  it('state() returns canonical state file paths', () => {
    const p = createNekoPaths('/r');
    expect(p.state('sessionLock')).toBe(`/r/.neko/state/${NEKO_STATE_FILES.sessionLock}`);
  });
});
