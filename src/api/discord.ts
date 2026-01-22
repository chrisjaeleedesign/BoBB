import { ChannelType, Client, TextChannel } from "discord.js";

export interface SendMessageRequest {
  channel_id: string;
  content: string;
  reply_to?: string;
  bot_id?: string;
}

export interface SendMessageResponse {
  success: boolean;
  message_id?: string;
  error?: string;
}

/**
 * Discord API handler - provides HTTP endpoints for Discord operations.
 * This allows OpenCode tools to send messages without needing MCP.
 */
export class DiscordAPI {
  private getClient: (botId?: string) => Client | null;

  constructor(getClient: (botId?: string) => Client | null) {
    this.getClient = getClient;
  }

  /**
   * Send a message to a Discord channel
   */
  async sendMessage(req: SendMessageRequest): Promise<SendMessageResponse> {
    const client = this.getClient(req.bot_id);

    if (!client) {
      return { success: false, error: "No Discord client available" };
    }

    try {
      const channel = await client.channels.fetch(req.channel_id);

      if (!channel || !channel.isTextBased()) {
        return {
          success: false,
          error: `Channel ${req.channel_id} not found or not text-based`,
        };
      }

      let message;

      if (channel.type === ChannelType.DM) {
        message = await channel.send(req.content);
      } else {
        const options: { content: string; reply?: { messageReference: string } } = {
          content: req.content,
        };

        if (req.reply_to) {
          options.reply = { messageReference: req.reply_to };
        }

        message = await (channel as TextChannel).send(options);
      }

      return { success: true, message_id: message.id };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: errorMessage };
    }
  }
}
