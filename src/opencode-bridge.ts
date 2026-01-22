import { createOpencodeClient } from "@opencode-ai/sdk";

export interface ChannelHistoryMessage {
  author: string;
  content: string;
  timestamp: Date;
  isBot: boolean;
}

export interface OpenCodeMessage {
  channelId: string;
  messageId: string;
  authorId: string;
  authorTag: string;
  content: string;
  isDM: boolean;
  isFromBot: boolean;
  authorBotName?: string;
  mentionedBots?: string[];
  recentHistory?: ChannelHistoryMessage[];
  selfBotName?: string;
  selfDiscordTag?: string;
}

export interface OpenCodeResponse {
  text: string | null;
  toolsInvoked: string[];
  hasResponse: boolean;
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

    this.sessionId = session.data?.id ?? null;
    return this.sessionId!;
  }

  /**
   * Send a Discord message to OpenCode and get the response
   */
  async sendMessage(message: OpenCodeMessage): Promise<OpenCodeResponse> {
    const sessionId = await this.getSession();

    const formattedMessage = this.formatDiscordMessage(message);

    const result = await this.client.session.prompt({
      path: { id: sessionId },
      body: {
        parts: [{ type: "text", text: formattedMessage }],
        // Disable code editing tools, only allow our custom Discord tools
        tools: {
          read: false,
          write: false,
          edit: false,
          bash: false,
          glob: false,
          grep: false,
          patch: false,
          webfetch: false,
          // Our custom tools should remain enabled by default
        },
      },
    });

    // Debug: log the full response structure
    console.log(`[OpenCodeBridge:${this.port}] Raw response:`, JSON.stringify(result.data, null, 2));

    // Extract both text and tool_use parts from response
    const parts = result.data?.parts || [];

    const textParts = parts.filter(
      (p: { type: string }) => p.type === "text"
    );
    const toolParts = parts.filter(
      (p: { type: string }) => p.type === "tool"
    );

    const text = textParts.length > 0
      ? (textParts[0] as { type: string; text: string }).text
      : null;

    const toolsInvoked = toolParts.map(
      (p: { type: string; tool?: string }) => p.tool || "unknown"
    );

    return {
      text,
      toolsInvoked,
      hasResponse: text !== null || toolsInvoked.length > 0,
    };
  }

  /**
   * Format time ago from a timestamp
   */
  private formatTimeAgo(timestamp: Date): string {
    const seconds = Math.floor((Date.now() - timestamp.getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  }

  /**
   * Format a Discord message for the LLM
   */
  private formatDiscordMessage(message: OpenCodeMessage): string {
    const context = message.isDM ? "Direct Message" : `Channel ${message.channelId}`;

    // Build self-identity line so bot knows who it is
    let selfIdentityLine = "";
    if (message.selfBotName) {
      selfIdentityLine = `You are: ${message.selfBotName}`;
      if (message.selfDiscordTag) {
        selfIdentityLine += ` (${message.selfDiscordTag})`;
      }
      selfIdentityLine += "\n";
    }

    // Build author line with bot indicator
    let authorLine = `From: ${message.authorTag} (User ID: ${message.authorId})`;
    if (message.isFromBot) {
      authorLine += " [BOT]";
      if (message.authorBotName) {
        authorLine += ` (Bot Name: ${message.authorBotName})`;
      }
    }

    // Build mentioned bots line if any
    let mentionedBotsLine = "";
    if (message.mentionedBots && message.mentionedBots.length > 0) {
      mentionedBotsLine = `\nOther Bots Mentioned: ${message.mentionedBots.join(", ")}`;
    }

    // Build recent history section if available
    let historySection = "";
    if (message.recentHistory && message.recentHistory.length > 0) {
      const historyLines = message.recentHistory.map((m) => {
        const timeAgo = this.formatTimeAgo(m.timestamp);
        const botTag = m.isBot ? " [BOT]" : "";
        return `[${timeAgo}] ${m.author}${botTag}: ${m.content}`;
      });
      historySection = `\n\n--- Recent Channel History ---\n${historyLines.join("\n")}\n--- End History ---`;
    }

    return `[Discord ${context}]
${selfIdentityLine}${authorLine}
Channel ID: ${message.channelId}
Message ID: ${message.messageId} (use this as reply_to)${mentionedBotsLine}
Is From Bot: ${message.isFromBot}${historySection}

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
    } catch (error) {
      console.log(`[OpenCodeBridge:${this.port}] Health check failed:`, error);
      return false;
    }
  }
}
