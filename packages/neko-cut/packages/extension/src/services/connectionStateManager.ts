/**
 * Connection State Manager
 *
 * Manages connection status for MCP servers and Workflow engines.
 * Provides a unified interface for tracking, querying, and broadcasting connection states.
 */

import * as vscode from 'vscode';
import { getLogger } from '../base';

const logger = getLogger('ConnectionStateManager');

/**
 * Connection status enum
 */
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

/**
 * Connection state for a single service
 */
export interface ConnectionState {
  id: string;
  name: string;
  type: 'mcp' | 'workflow';
  status: ConnectionStatus;
  error?: string;
  lastChecked?: number;
}

/**
 * Connection state change event
 */
export interface ConnectionStateChangeEvent {
  id: string;
  type: 'mcp' | 'workflow';
  oldStatus: ConnectionStatus;
  newStatus: ConnectionStatus;
  error?: string;
}

/**
 * Connection state listener
 */
export type ConnectionStateListener = (event: ConnectionStateChangeEvent) => void;

/**
 * Connection State Manager
 *
 * Singleton service that manages connection states for MCP and Workflow services.
 */
export class ConnectionStateManager implements vscode.Disposable {
  private states: Map<string, ConnectionState> = new Map();
  private listeners: Set<ConnectionStateListener> = new Set();

  /**
   * Update connection state for a service
   */
  updateState(
    id: string,
    name: string,
    type: 'mcp' | 'workflow',
    status: ConnectionStatus,
    error?: string,
  ): void {
    const key = `${type}:${id}`;
    const existing = this.states.get(key);
    const oldStatus = existing?.status || 'disconnected';

    const newState: ConnectionState = {
      id,
      name,
      type,
      status,
      error,
      lastChecked: Date.now(),
    };

    this.states.set(key, newState);

    // Notify listeners if status changed
    if (oldStatus !== status) {
      this.notifyListeners({
        id,
        type,
        oldStatus,
        newStatus: status,
        error,
      });
    }
  }

  /**
   * Get connection state for a service
   */
  getState(id: string, type: 'mcp' | 'workflow'): ConnectionState | undefined {
    return this.states.get(`${type}:${id}`);
  }

  /**
   * Get all MCP connection states
   */
  getMCPStates(): ConnectionState[] {
    return Array.from(this.states.values()).filter((s) => s.type === 'mcp');
  }

  /**
   * Get all Workflow connection states
   */
  getWorkflowStates(): ConnectionState[] {
    return Array.from(this.states.values()).filter((s) => s.type === 'workflow');
  }

  /**
   * Get all connection states
   */
  getAllStates(): ConnectionState[] {
    return Array.from(this.states.values());
  }

  /**
   * Get states as a map for UI consumption
   */
  getStatesMap(): Record<string, { status: ConnectionStatus; error?: string }> {
    const result: Record<string, { status: ConnectionStatus; error?: string }> = {};
    for (const state of this.states.values()) {
      result[`${state.type}:${state.id}`] = {
        status: state.status,
        error: state.error,
      };
    }
    return result;
  }

  /**
   * Add a state change listener
   */
  addListener(listener: ConnectionStateListener): vscode.Disposable {
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  }

  /**
   * Remove state for a service
   */
  removeState(id: string, type: 'mcp' | 'workflow'): void {
    this.states.delete(`${type}:${id}`);
  }

  /**
   * Clear all states
   */
  clear(): void {
    this.states.clear();
  }

  private notifyListeners(event: ConnectionStateChangeEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        logger.error('Listener error:', error);
      }
    }
  }

  dispose(): void {
    this.states.clear();
    this.listeners.clear();
  }
}

// Service identifier for DI
import { createServiceId } from '../base';
export const IConnectionStateManager =
  createServiceId<ConnectionStateManager>('connectionStateManager');
