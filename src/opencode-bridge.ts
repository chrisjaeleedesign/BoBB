import { createOpencodeClient } from "@opencode-ai/sdk";

export interface OpenCodeMessage {
  channelId: string;
  messageId: string;
  authorId: string;
  authorTag: string;
  content: string;
  isDM: boolean;
}

export class OpenCodeBridge {
  private client: ReturnType<typeof createOpencodeClient>;
  private sessionId: string | null = null;
  private port: number;

  constructor(port: number) {
    this.port = port;
    this.client = createOpencodeClient({
      baseUrl: `http://localhost:${port}`,
    });
  }

  /**
   * Get or create a session for this bridge
   */
  private async getSession(): Promise<string> {
    if (this.sessionId) {
      return this.sessionId;
    }

    const session = await this.client.session.create({
      body: { title: "Discord Bot Session" },
    });

    this.sessionId = session.data.id;
    return session.data.id;
  }

  /**
   * Send a Discord message to OpenCode and get the response
   */
  async sendMessage(message: OpenCodeMessage): Promise<string | null> {
    const sessionId = await this.getSession();

    const formattedMessage = this.formatDiscordMessage(message);

    const result = await this.client.session.prompt({
      path: { id: sessionId },
      body: {
        parts: [{ type: "text", text: formattedMessage }],
      },
    });

    // Extract text response from result.data.parts
    if (result.data?.parts && result.data.parts.length > 0) {
      const textParts = result.data.parts.filter(
        (p: { type: string }) => p.type === "text"
      );
      if (textParts.length > 0) {
        return (textParts[0] as { type: string; text: string }).text;
      }
    }

    return null;
  }

  /**
   * Format a Discord message for the LLM
   */
  private formatDiscordMessage(message: OpenCodeMessage): string {
    const context = message.isDM ? "Direct Message" : `Channel ${message.channelId}`;

    return `[Discord ${context}]
From: ${message.authorTag} (User ID: ${message.authorId})
Channel ID: ${message.channelId}
Message ID: ${message.messageId} (use this as reply_to)

${message.content}`;
  }

  /**
   * Check if the OpenCode server is healthy
   */
  async isHealthy(): Promise<boolean> {
    try {
      // Use session.list as a health check since global.health doesn't exist
      await this.client.session.list();
      return true;
    } catch {
      return false;
    }
  }
}
