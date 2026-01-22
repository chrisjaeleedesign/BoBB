import { ChannelType, Client, TextChannel } from "discord.js";
import { RegistryAPI } from "./registry";

export interface SendMessageRequest {
  channel_id: string;
  content: string;
  reply_to?: string;
  bot_id?: string;
  mention_bots?: string[];
}

export interface SendMessageResponse {
  success: boolean;
  message_id?: string;
  error?: string;
  mentioned_bots?: string[];
}

/**
 * Discord API handler - provides HTTP endpoints for Discord operations.
 * This allows OpenCode tools to send messages without needing MCP.
 */
export class DiscordAPI {
  private getClient: (botId?: string) => Client | null;
  private registry: RegistryAPI;

  constructor(getClient: (botId?: string) => Client | null, registry: RegistryAPI) {
    this.getClient = getClient;
    this.registry = registry;
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

      // Resolve bot names to Discord mentions
      let finalContent = req.content;
      const mentionedBots: string[] = [];

      if (req.mention_bots && req.mention_bots.length > 0) {
        const agents = await this.registry.listAgents();
        const mentions: string[] = [];

        for (const botName of req.mention_bots) {
          const agent = agents.find(
            (a) =>
              a.name.toLowerCase() === botName.toLowerCase() ||
              a.id.toLowerCase() === botName.toLowerCase()
          );

          if (agent?.discord_user_id) {
            mentions.push(`<@${agent.discord_user_id}>`);
            mentionedBots.push(agent.name);
          } else {
            console.warn(`[DiscordAPI] Could not find Discord ID for bot: ${botName}`);
          }
        }

        if (mentions.length > 0) {
          finalContent = `${mentions.join(" ")} ${req.content}`;
        }
      }

      let message;

      if (channel.type === ChannelType.DM) {
        message = await channel.send(finalContent);
      } else {
        const options: { content: string; reply?: { messageReference: string } } = {
          content: finalContent,
        };

        if (req.reply_to) {
          options.reply = { messageReference: req.reply_to };
        }

        message = await (channel as TextChannel).send(options);
      }

      return { success: true, message_id: message.id, mentioned_bots: mentionedBots };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: errorMessage };
    }
  }
}
