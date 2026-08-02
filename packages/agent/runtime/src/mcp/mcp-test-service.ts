/**
 * MCP Test Service - Tests MCP server connectivity
 *
 * Provides functionality to test MCP server connections by spawning
 * the server process and checking for successful startup.
 */

import { spawn, type ChildProcess } from 'child_process';

/**
 * MCP server test configuration
 */
export interface MCPTestConfig {
  /** Server ID */
  id: string;
  /** Server name */
  name: string;
  /** Command to start the server */
  command: string;
  /** Command arguments */
  args?: string[];
  /** Environment variables */
  env?: Record<string, string>;
  /** Test timeout in ms (default: 10000) */
  timeout?: number;
}

/**
 * MCP test result
 */
export interface MCPTestResult {
  /** Whether the test succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** Server ID that was tested */
  serverId: string;
}

/**
 * MCP Test Service
 *
 * Tests MCP server connectivity by spawning the server process
 * and checking for output or successful startup.
 */
export class MCPTestService {
  private defaultTimeout = 10000;

  /**
   * Test an MCP server connection
   *
   * Spawns the server process and waits for:
   * - Any stdout output (indicates server started)
   * - Process exit with code 0
   * - Timeout (if process still running, considered success)
   */
  async test(config: MCPTestConfig): Promise<MCPTestResult> {
    const timeout = config.timeout ?? this.defaultTimeout;

    return new Promise((resolve) => {
      let proc: ChildProcess | null = null;
      let stdout = '';
      let stderr = '';
      let resolved = false;

      const complete = (success: boolean, error?: string) => {
        if (resolved) return;
        resolved = true;

        // Kill the process
        if (proc && !proc.killed) {
          proc.kill();
        }

        resolve({
          success,
          error,
          serverId: config.id,
        });
      };

      try {
        proc = spawn(config.command, config.args || [], {
          env: { ...process.env, ...config.env },
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        proc.stdout?.on('data', (data: Buffer) => {
          stdout += data.toString();
          // MCP servers typically output JSON-RPC messages when ready
          // Check for any output as a sign the server started
          if (stdout.length > 0 && !resolved) {
            complete(true);
          }
        });

        proc.stderr?.on('data', (data: Buffer) => {
          stderr += data.toString();
        });

        proc.on('error', (err: Error) => {
          complete(false, `Failed to start: ${err.message}`);
        });

        proc.on('exit', (code: number | null) => {
          if (!resolved) {
            if (code === 0 || stdout.length > 0) {
              complete(true);
            } else {
              complete(false, stderr || `Process exited with code ${code}`);
            }
          }
        });

        // Timeout handling
        setTimeout(() => {
          if (!resolved) {
            // If process is still running after timeout, consider it working
            if (proc && !proc.killed) {
              complete(true);
            } else {
              complete(false, 'Connection timeout');
            }
          }
        }, timeout);
      } catch (error) {
        complete(false, error instanceof Error ? error.message : 'Unknown error');
      }
    });
  }

  /**
   * Test multiple MCP servers
   */
  async testAll(configs: MCPTestConfig[]): Promise<MCPTestResult[]> {
    return Promise.all(configs.map((config) => this.test(config)));
  }
}

/**
 * Singleton instance
 */
let mcpTestServiceInstance: MCPTestService | null = null;

/**
 * Get shared MCP test service instance
 */
export function getMCPTestService(): MCPTestService {
  if (!mcpTestServiceInstance) {
    mcpTestServiceInstance = new MCPTestService();
  }
  return mcpTestServiceInstance;
}
