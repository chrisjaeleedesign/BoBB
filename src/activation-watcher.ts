import { watch } from "fs";
import { readdir, readFile, unlink, mkdir } from "fs/promises";
import { join } from "path";

export interface ActivationRequest {
  agent_id: string;
  name: string;
  token: string;
  port: number;
  timestamp: string;
}

export type ActivationHandler = (request: ActivationRequest) => Promise<void>;

const ACTIVATIONS_DIR = join(import.meta.dir, "..", "agents", ".activations");

/**
 * Watches for agent activation requests and processes them
 */
export class ActivationWatcher {
  private handler: ActivationHandler | null = null;
  private watcher: ReturnType<typeof watch> | null = null;

  /**
   * Set the handler for processing activation requests
   */
  onActivation(handler: ActivationHandler): void {
    this.handler = handler;
  }

  /**
   * Start watching for activation requests
   */
  async start(): Promise<void> {
    // Ensure the activations directory exists
    await mkdir(ACTIVATIONS_DIR, { recursive: true });

    // Process any existing activations
    await this.processExisting();

    // Watch for new activations
    this.watcher = watch(ACTIVATIONS_DIR, async (eventType, filename) => {
      if (eventType === "rename" && filename?.endsWith(".json")) {
        // Small delay to ensure file is fully written
        await new Promise((resolve) => setTimeout(resolve, 100));
        await this.processFile(join(ACTIVATIONS_DIR, filename));
      }
    });

    console.log(`Activation watcher started: ${ACTIVATIONS_DIR}`);
  }

  /**
   * Stop watching for activations
   */
  stop(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
  }

  /**
   * Process any existing activation files
   */
  private async processExisting(): Promise<void> {
    try {
      const files = await readdir(ACTIVATIONS_DIR);
      for (const file of files) {
        if (file.endsWith(".json")) {
          await this.processFile(join(ACTIVATIONS_DIR, file));
        }
      }
    } catch (error) {
      // Directory might not exist yet, that's ok
    }
  }

  /**
   * Process a single activation file
   */
  private async processFile(filepath: string): Promise<void> {
    if (!this.handler) return;

    try {
      // Read the activation request
      const content = await readFile(filepath, "utf-8");
      const request: ActivationRequest = JSON.parse(content);

      console.log(`Processing activation for agent: ${request.name} (${request.agent_id})`);

      // Process it
      await this.handler(request);

      // Delete the file after processing
      await unlink(filepath);

      console.log(`Activation processed: ${request.name}`);
    } catch (error) {
      // File might have been deleted already or doesn't exist
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        console.error(`Error processing activation ${filepath}:`, error);
      }
    }
  }
}
