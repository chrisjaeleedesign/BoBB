import { Subprocess } from "bun";

export interface OpenCodeProcess {
  id: string;
  port: number;
  process: Subprocess;
  cwd: string;
}

export class OpenCodeManager {
  private processes: Map<string, OpenCodeProcess> = new Map();
  private opencodeCommand: string;
  private healthCheckTimeout: number;

  constructor(opencodeCommand: string = "opencode", healthCheckTimeout: number = 30000) {
    this.opencodeCommand = opencodeCommand;
    this.healthCheckTimeout = healthCheckTimeout;
  }

  /**
   * Start an OpenCode server for a given agent
   */
  async startServer(id: string, port: number, cwd?: string): Promise<void> {
    if (this.processes.has(id)) {
      console.log(`OpenCode server for ${id} is already running on port ${port}`);
      return;
    }

    const workingDir = cwd || process.cwd();
    console.log(`Starting OpenCode server for ${id} on port ${port}...`);

    const proc = Bun.spawn([this.opencodeCommand, "serve", "--port", port.toString()], {
      cwd: workingDir,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        AGENT_ID: id,
      },
    });

    this.processes.set(id, {
      id,
      port,
      process: proc,
      cwd: workingDir,
    });

    // Wait for health check
    try {
      await this.waitForHealth(port);
      console.log(`OpenCode server for ${id} is ready on port ${port}`);
    } catch (error) {
      // Clean up if health check fails
      this.stopServer(id);
      throw error;
    }
  }

  /**
   * Wait for an OpenCode server to become healthy
   */
  async waitForHealth(port: number): Promise<void> {
    const startTime = Date.now();
    const url = `http://localhost:${port}/api/session`;

    while (Date.now() - startTime < this.healthCheckTimeout) {
      try {
        const response = await fetch(url);
        if (response.ok || response.status === 401) {
          // 401 is OK - means server is running but may need auth
          return;
        }
      } catch {
        // Server not ready yet, continue waiting
      }
      await Bun.sleep(500);
    }

    throw new Error(`OpenCode server on port ${port} failed to start within ${this.healthCheckTimeout}ms`);
  }

  /**
   * Check if a server is running
   */
  isRunning(id: string): boolean {
    return this.processes.has(id);
  }

  /**
   * Stop a specific OpenCode server
   */
  stopServer(id: string): void {
    const proc = this.processes.get(id);
    if (proc) {
      console.log(`Stopping OpenCode server for ${id}...`);
      proc.process.kill();
      this.processes.delete(id);
    }
  }

  /**
   * Stop all OpenCode servers
   */
  async stopAll(): Promise<void> {
    console.log(`Stopping ${this.processes.size} OpenCode server(s)...`);
    for (const [id] of this.processes) {
      this.stopServer(id);
    }
  }

  /**
   * Get all running server info
   */
  getRunningServers(): OpenCodeProcess[] {
    return Array.from(this.processes.values());
  }
}
