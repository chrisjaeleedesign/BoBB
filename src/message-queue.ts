import { watch } from "fs";
import { readdir, readFile, unlink, mkdir } from "fs/promises";
import { join } from "path";

export interface PendingMessage {
  type: "send_message";
  channel_id: string;
  content: string;
  reply_to?: string;
  timestamp: string;
}

export type MessageHandler = (message: PendingMessage) => Promise<void>;

const PENDING_DIR = join(import.meta.dir, "..", "agents", ".pending");

/**
 * Watches for pending messages from MCP tools and processes them
 */
export class MessageQueue {
  private handler: MessageHandler | null = null;
  private watcher: ReturnType<typeof watch> | null = null;
  private processing = false;

  /**
   * Set the handler for processing pending messages
   */
  onMessage(handler: MessageHandler): void {
    this.handler = handler;
  }

  /**
   * Start watching for pending messages
   */
  async start(): Promise<void> {
    // Ensure the pending directory exists
    await mkdir(PENDING_DIR, { recursive: true });

    // Process any existing messages
    await this.processExisting();

    // Watch for new messages
    this.watcher = watch(PENDING_DIR, async (eventType, filename) => {
      if (eventType === "rename" && filename?.endsWith(".json")) {
        await this.processFile(join(PENDING_DIR, filename));
      }
    });

    console.log(`Message queue watching: ${PENDING_DIR}`);
  }

  /**
   * Stop watching for messages
   */
  stop(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
  }

  /**
   * Process any existing messages in the queue
   */
  private async processExisting(): Promise<void> {
    try {
      const files = await readdir(PENDING_DIR);
      for (const file of files) {
        if (file.endsWith(".json")) {
          await this.processFile(join(PENDING_DIR, file));
        }
      }
    } catch (error) {
      // Directory might not exist yet, that's ok
    }
  }

  /**
   * Process a single message file
   */
  private async processFile(filepath: string): Promise<void> {
    if (this.processing || !this.handler) return;

    try {
      this.processing = true;

      // Read the message
      const content = await readFile(filepath, "utf-8");
      const message: PendingMessage = JSON.parse(content);

      // Process it
      await this.handler(message);

      // Delete the file after processing
      await unlink(filepath);

      console.log(`Processed message from queue: ${filepath}`);
    } catch (error) {
      // File might have been deleted already or doesn't exist
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        console.error(`Error processing message ${filepath}:`, error);
      }
    } finally {
      this.processing = false;
    }
  }
}
