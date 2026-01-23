import { Client, GatewayIntentBits, Partials, ChannelType, type Message } from "discord.js";

export interface BotConfig {
  id: string;
  name: string;
  token: string;
  opencodePort: number;
}

export interface BotInstance {
  config: BotConfig;
  client: Client;
  ready: boolean;
  discordUserId?: string;
}

type MessageHandler = (message: Message, bot: BotInstance) => Promise<void>;

export class BotManager {
  private bots: Map<string, BotInstance> = new Map();
  private messageHandler: MessageHandler | null = null;
  private dmHandler: MessageHandler | null = null;

  /**
   * Register a handler for incoming mentions across all bots
   */
  onMessage(handler: MessageHandler): void {
    this.messageHandler = handler;
  }

  /**
   * Register a handler for incoming DMs
   */
  onDM(handler: MessageHandler): void {
    this.dmHandler = handler;
  }

  /**
   * Start a new bot with the given configuration
   */
  async startBot(config: BotConfig): Promise<BotInstance> {
    if (this.bots.has(config.id)) {
      throw new Error(`Bot ${config.id} is already running`);
    }

    const client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
      ],
      // Partials are needed to receive DM events
      partials: [Partials.Channel, Partials.Message],
    });

    const instance: BotInstance = {
      config,
      client,
      ready: false,
    };

    client.on("messageCreate", async (message) => {
      // Ignore own messages
      if (message.author.id === client.user?.id) return;

      // Handle DMs
      if (message.channel.type === ChannelType.DM) {
        console.log(
          `[${config.name}] DM from ${message.author.tag}: ${message.content}`
        );

        if (this.dmHandler) {
          await this.dmHandler(message, instance);
        }
        return;
      }

      // Handle mentions in channels
      const isMentioned = client.user && message.mentions.has(client.user.id);
      const isHereMessage = message.content.includes("@here");

      // OBB should also listen for @here messages (to analyze if bot-directed)
      const isOBB = config.id === "obb";
      const shouldHandle = isMentioned || (isOBB && isHereMessage);

      if (shouldHandle) {
        const isFromBot = message.author.bot;

        // Check if this is an EXPLICIT mention in the message content
        // (Discord automatically adds replied-to user to mentions, but we want to
        // distinguish explicit @mentions from implicit reply pings for bot messages)
        const isExplicitMention = client.user && (
          message.content.includes(`<@${client.user.id}>`) ||
          message.content.includes(`<@!${client.user.id}>`)
        );

        // If from a bot and not explicitly mentioned (and not @here for OBB), ignore
        if (isFromBot && !isExplicitMention && !(isOBB && isHereMessage)) {
          console.log(
            `[${config.name}] Ignoring implicit mention from bot ${message.author.tag}`
          );
          return;
        }

        if (isOBB && isHereMessage && !isMentioned) {
          console.log(
            `[${config.name}] @here message received from ${message.author.tag}: ${message.content}`
          );
        } else {
          console.log(
            `[${config.name}] Mentioned by ${message.author.tag}${isFromBot ? " [BOT]" : ""}: ${message.content}`
          );
        }

        if (this.messageHandler) {
          await this.messageHandler(message, instance);
        }
      }
    });

    // Return a promise that resolves only after the bot is fully ready
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Bot ${config.name} failed to become ready within 30 seconds`));
      }, 30000);

      client.once("ready", () => {
        clearTimeout(timeout);
        instance.ready = true;
        instance.discordUserId = client.user?.id;
        console.log(`[${config.name}] Ready! Logged in as ${client.user?.tag} (ID: ${client.user?.id})`);
        this.bots.set(config.id, instance);
        resolve(instance);
      });

      client.login(config.token).catch((err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }

  /**
   * Stop a running bot
   */
  async stopBot(id: string): Promise<void> {
    const instance = this.bots.get(id);
    if (!instance) {
      throw new Error(`Bot ${id} is not running`);
    }

    await instance.client.destroy();
    this.bots.delete(id);
    console.log(`[${instance.config.name}] Stopped`);
  }

  /**
   * Get a bot instance by ID
   */
  getBot(id: string): BotInstance | undefined {
    return this.bots.get(id);
  }

  /**
   * Get all running bots
   */
  getAllBots(): BotInstance[] {
    return Array.from(this.bots.values());
  }

  /**
   * Check if a bot is running
   */
  hasBot(id: string): boolean {
    return this.bots.has(id);
  }

  /**
   * Stop all running bots
   */
  async stopAll(): Promise<void> {
    const stopPromises = Array.from(this.bots.keys()).map((id) =>
      this.stopBot(id)
    );
    await Promise.all(stopPromises);
  }
}
