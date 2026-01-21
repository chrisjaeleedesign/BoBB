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

    client.once("ready", () => {
      instance.ready = true;
      console.log(`[${config.name}] Ready! Logged in as ${client.user?.tag}`);
    });

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
      if (client.user && message.mentions.has(client.user.id)) {
        console.log(
          `[${config.name}] Mentioned by ${message.author.tag}: ${message.content}`
        );

        if (this.messageHandler) {
          await this.messageHandler(message, instance);
        }
      }
    });

    await client.login(config.token);
    this.bots.set(config.id, instance);

    return instance;
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
