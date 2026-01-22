import { ChannelType } from "discord.js";
import path from "path";
import { readFile } from "fs/promises";
import { BotManager } from "./bot-manager";
import { OpenCodeBridge, OpenCodeResponse, ChannelHistoryMessage } from "./opencode-bridge";
import { ActivationWatcher } from "./activation-watcher";
import { BobbConfig, loadConfig } from "./config";
import { OpenCodeManager } from "./opencode-manager";
import { createAPIServer, type APIServer } from "./api";

interface AgentRegistry {
  agents: Record<string, {
    id: string;
    name: string;
    token: string;
    port: number;
    status: string;
  }>;
}

const BOBB_ID = "bobb";
const BOBB_NAME = "BoBB";
const OBB_ID = "obb";
const OBB_NAME = "OBB";
const API_PORT = 3001;

// Track OpenCode bridges for child agents
const bridges: Map<string, OpenCodeBridge> = new Map();

export interface RunMainAppOptions {
  config: BobbConfig;
  opencodeManager?: OpenCodeManager;
}

/**
 * Helper to persist Discord User ID to registry after bot starts
 */
async function persistDiscordUserId(
  manager: BotManager,
  agentId: string,
  apiServer: APIServer
): Promise<void> {
  const bot = manager.getBot(agentId);
  if (bot?.discordUserId) {
    await apiServer.registry.updateDiscordUserId(agentId, bot.discordUserId);
    console.log(`Persisted Discord User ID for ${agentId}: ${bot.discordUserId}`);
  }
}

/**
 * Start any agents that are in ready_to_start state from registry
 */
async function startExistingAgents(
  manager: BotManager,
  opencodeManager: OpenCodeManager | undefined,
  bridgesMap: Map<string, OpenCodeBridge>,
  apiServer: APIServer
): Promise<void> {
  const registryPath = path.join(process.cwd(), "registry.json");

  try {
    const content = await readFile(registryPath, "utf-8");
    const registry: AgentRegistry = JSON.parse(content);

    for (const agent of Object.values(registry.agents)) {
      if (agent.status === "ready_to_start" && agent.token) {
        console.log(`\n=== Starting existing agent: ${agent.name} ===`);

        if (manager.hasBot(agent.id)) {
          console.log(`Agent ${agent.name} is already running`);
          continue;
        }

        try {
          if (opencodeManager) {
            const agentDir = path.join(process.cwd(), "agents", agent.id);
            await opencodeManager.startServer(agent.id, agent.port, agentDir);
          }

          const childBridge = new OpenCodeBridge(agent.port);
          bridgesMap.set(agent.id, childBridge);

          await manager.startBot({
            id: agent.id,
            name: agent.name,
            token: agent.token,
            opencodePort: agent.port,
          });

          // Persist Discord User ID to registry
          await persistDiscordUserId(manager, agent.id, apiServer);

          console.log(`Agent ${agent.name} started successfully!`);
        } catch (error) {
          console.error(`Failed to start agent ${agent.name}:`, error);
          bridgesMap.delete(agent.id);
          if (opencodeManager) {
            opencodeManager.stopServer(agent.id);
          }
        }
      }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error("Error loading agent registry:", error);
    }
  }
}

/**
 * Main application logic - can be called from startup.ts or run directly
 */
export async function runMainApp(options: RunMainAppOptions): Promise<void> {
  const { config, opencodeManager } = options;

  const manager = new BotManager();
  const activationWatcher = new ActivationWatcher();

  // Create API server - provides HTTP endpoints for tools
  let apiServer: APIServer | null = null;

  // Create OpenCode bridge for BoBB (runs from agents/bobb/)
  const bobbDir = path.join(process.cwd(), "agents", "bobb");
  const bobbBridge = new OpenCodeBridge(config.bobbPort);
  bridges.set(BOBB_ID, bobbBridge);

  // Create OpenCode bridge for OBB if configured
  let obbEnabled = false;
  if (config.obbDiscordToken) {
    const obbBridge = new OpenCodeBridge(config.obbPort);
    bridges.set(OBB_ID, obbBridge);
    obbEnabled = true;
    console.log(`OBB enabled on port ${config.obbPort}`);
  } else {
    console.log("OBB disabled (no OBB_DISCORD_TOKEN configured)");
  }

  // Check if OpenCode server is running (only warn if not managed by orchestrator)
  if (!opencodeManager) {
    const isHealthy = await bobbBridge.isHealthy();
    if (!isHealthy) {
      console.warn(`Warning: OpenCode server not reachable at port ${config.bobbPort}`);
      console.warn(`Start it with: cd agents/bobb && opencode serve --port ${config.bobbPort}`);
      console.warn("Continuing without OpenCode integration...\n");
    } else {
      console.log(`OpenCode server connected at port ${config.bobbPort}`);
    }
  }

  // Handle graceful shutdown
  const shutdown = async () => {
    console.log("\nShutting down...");
    activationWatcher.stop();
    await manager.stopAll();

    // Stop API server
    if (apiServer) {
      apiServer.stop();
    }

    // Stop OpenCode servers if managed by orchestrator
    if (opencodeManager) {
      await opencodeManager.stopAll();
    }

    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Helper function to forward message to OpenCode with bot context
  async function forwardToOpenCode(
    message: {
      channel: {
        id: string;
        type: ChannelType;
        isTextBased: () => boolean;
        messages?: {
          fetch: (options: { limit: number; before: string }) => Promise<Map<string, {
            author: { tag: string; bot: boolean };
            content: string;
            createdAt: Date;
          }>>;
        };
      };
      id: string;
      author: { id: string; tag: string; bot: boolean };
      content: string;
      mentions: { has: (id: string) => boolean };
    },
    botId: string
  ) {
    const bridge = bridges.get(botId);
    if (!bridge) {
      console.log(`No OpenCode bridge for bot ${botId}`);
      return;
    }

    if (!(await bridge.isHealthy())) {
      console.log(`OpenCode server not available for ${botId}`);
      return;
    }

    console.log(`Forwarding to OpenCode (${botId})...`);
    const isDM = message.channel.type === ChannelType.DM;

    // Determine if author is a known bot from our registry
    const allAgents = await apiServer!.registry.listAgents();
    const authorAgent = allAgents.find((a) => a.discord_user_id === message.author.id);

    // Find the receiving bot's info for self-identity
    const receivingBot = manager.getBot(botId);
    const receivingAgent = allAgents.find((a) => a.id === botId);

    // Find other bots mentioned in this message (excluding the receiving bot)
    const mentionedBots = allAgents
      .filter(
        (a) =>
          a.discord_user_id &&
          a.id !== botId &&
          message.mentions.has(a.discord_user_id)
      )
      .map((a) => a.name);

    // Fetch recent channel history (for bot-to-bot context)
    let recentHistory: ChannelHistoryMessage[] = [];
    if (!isDM && message.channel.isTextBased() && message.channel.messages) {
      try {
        const messages = await message.channel.messages.fetch({
          limit: 10,
          before: message.id,
        });
        recentHistory = Array.from(messages.values())
          .map((m) => ({
            author: m.author.tag,
            content: m.content.substring(0, 200), // Truncate long messages
            timestamp: m.createdAt,
            isBot: m.author.bot,
          }))
          .reverse(); // Oldest first
      } catch (e) {
        console.log("Could not fetch channel history:", e);
      }
    }

    try {
      const response = await bridge.sendMessage({
        channelId: message.channel.id,
        messageId: message.id,
        authorId: message.author.id,
        authorTag: message.author.tag,
        content: message.content,
        isDM,
        isFromBot: message.author.bot,
        authorBotName: authorAgent?.name,
        mentionedBots: mentionedBots.length > 0 ? mentionedBots : undefined,
        recentHistory: recentHistory.length > 0 ? recentHistory : undefined,
        selfBotName: receivingAgent?.name || receivingBot?.config.name,
        selfDiscordTag: receivingBot?.client.user?.tag,
      });

      if (response.toolsInvoked.length > 0) {
        console.log(`OpenCode invoked tools: ${response.toolsInvoked.join(", ")}`);
      }
      if (response.text) {
        console.log(`OpenCode text response (${response.text.length} chars)`);
      }
      if (!response.hasResponse) {
        console.log("Warning: OpenCode returned no tools and no text");
      }
    } catch (error) {
      console.error("Error forwarding to OpenCode:", error);
    }
  }

  /**
   * Check if a message should be handled by OBB (multi-bot orchestration)
   * Returns true if:
   * - Multiple bots are mentioned in the message
   * - @here is used (OBB will analyze if it's bot-directed)
   * - OBB is explicitly mentioned
   */
  async function shouldRouteToOBB(
    message: {
      content: string;
      mentions: { has: (id: string) => boolean };
    },
    callingBotName?: string
  ): Promise<boolean> {
    const logPrefix = callingBotName ? `[${callingBotName}]` : "[shouldRouteToOBB]";

    if (!obbEnabled) {
      console.log(`${logPrefix} OBB not enabled, skipping routing check`);
      return false;
    }

    const allAgents = await apiServer!.registry.listAgents();
    console.log(`${logPrefix} Checking routing for message, found ${allAgents.length} agents in registry`);

    // Check if OBB is explicitly mentioned
    const obbAgent = allAgents.find((a) => a.id === OBB_ID);
    if (obbAgent?.discord_user_id && message.mentions.has(obbAgent.discord_user_id)) {
      console.log(`${logPrefix} OBB explicitly mentioned, routing to OBB`);
      return true;
    }

    // Count how many bots are mentioned (excluding BoBB and OBB)
    const mentionedBots = allAgents.filter(
      (a) =>
        a.discord_user_id &&
        a.id !== BOBB_ID &&
        a.id !== OBB_ID &&
        message.mentions.has(a.discord_user_id)
    );
    const mentionedBotCount = mentionedBots.length;
    console.log(`${logPrefix} Found ${mentionedBotCount} mentioned bots: ${mentionedBots.map(b => b.name).join(", ")}`);

    // Route to OBB if multiple bots mentioned
    if (mentionedBotCount > 1) {
      console.log(`${logPrefix} Multiple bots mentioned (${mentionedBotCount}), routing to OBB`);
      return true;
    }

    // Check for @here (OBB will analyze context)
    if (message.content.includes("@here")) {
      console.log(`${logPrefix} @here detected, routing to OBB`);
      return true;
    }

    console.log(`${logPrefix} No OBB routing needed`);
    return false;
  }

  // Track messages already routed to OBB to avoid duplicate processing
  // This needs to be checked FIRST to prevent race conditions
  const obbRoutedMessages = new Set<string>();

  // Set up message handler for mentions (Discord -> OpenCode)
  manager.onMessage(async (message, bot) => {
    // FIRST: Check if this message was already claimed by another bot for OBB routing
    // This prevents race conditions where multiple bots try to route the same message
    if (obbRoutedMessages.has(message.id)) {
      console.log(`[${bot.config.name}] Message ${message.id} already routed to OBB, skipping`);
      return;
    }

    console.log(`\n--- Message Received ---`);
    console.log(`Bot: ${bot.config.name}`);
    console.log(`Channel: ${message.channel.id}`);
    console.log(`Author: ${message.author.tag} (${message.author.id})`);
    console.log(`Content: ${message.content}`);
    console.log(`Message ID: ${message.id}`);
    console.log(`------------------------\n`);

    // Show typing indicator while processing
    if (message.channel.isTextBased() && "sendTyping" in message.channel) {
      await message.channel.sendTyping();
    }

    // Check if this message should be routed to OBB for orchestration
    // But only if this is NOT the OBB bot receiving the message
    if (bot.config.id !== OBB_ID && await shouldRouteToOBB(message, bot.config.name)) {
      // Mark IMMEDIATELY after deciding to route - before any async work
      // This prevents race condition where another bot also decides to route
      obbRoutedMessages.add(message.id);

      // Clean up old entries after 1 minute
      setTimeout(() => obbRoutedMessages.delete(message.id), 60000);

      console.log(`[${bot.config.name}] Routing message ${message.id} to OBB for orchestration`);

      await forwardToOpenCode(message, OBB_ID);
      return;
    }

    await forwardToOpenCode(message, bot.config.id);
  });

  // Set up DM handler (for receiving bot tokens)
  manager.onDM(async (message, bot) => {
    console.log(`\n--- DM Received ---`);
    console.log(`Bot: ${bot.config.name}`);
    console.log(`From: ${message.author.tag} (${message.author.id})`);
    console.log(`Content: ${message.content.substring(0, 50)}...`);
    console.log(`-------------------\n`);

    // Show typing indicator while processing
    if ("sendTyping" in message.channel) {
      await message.channel.sendTyping();
    }

    // Only BoBB handles DMs for token submission
    if (bot.config.id === BOBB_ID) {
      await forwardToOpenCode(message, BOBB_ID);
    }
  });

  // Set up handler for agent activations
  activationWatcher.onActivation(async (request) => {
    console.log(`\n=== Activating Agent ===`);
    console.log(`Name: ${request.name}`);
    console.log(`ID: ${request.agent_id}`);
    console.log(`Port: ${request.port}`);
    console.log(`========================\n`);

    // Check if already running
    if (manager.hasBot(request.agent_id)) {
      console.log(`Agent ${request.name} is already running`);
      return;
    }

    try {
      // Auto-start OpenCode server for child agent if orchestrator is available
      if (opencodeManager) {
        const agentDir = path.join(process.cwd(), "agents", request.agent_id);
        await opencodeManager.startServer(request.agent_id, request.port, agentDir);
      }

      // Create OpenCode bridge for the new agent
      const childBridge = new OpenCodeBridge(request.port);
      bridges.set(request.agent_id, childBridge);

      // Start the Discord bot
      await manager.startBot({
        id: request.agent_id,
        name: request.name,
        token: request.token,
        opencodePort: request.port,
      });

      // Persist Discord User ID to registry
      await persistDiscordUserId(manager, request.agent_id, apiServer!);

      console.log(`Agent ${request.name} activated successfully!`);

      // Only show manual start message if not managed by orchestrator
      if (!opencodeManager) {
        console.log(`Note: Start its OpenCode server with: cd agents/${request.agent_id} && opencode serve --port ${request.port}`);
      }
    } catch (error) {
      console.error(`Failed to activate agent ${request.name}:`, error);
      bridges.delete(request.agent_id);

      // Clean up OpenCode server if it was started
      if (opencodeManager) {
        opencodeManager.stopServer(request.agent_id);
      }
    }
  });

  // Start the API server (for tools to call)
  apiServer = createAPIServer((botId?: string) => {
    // If a specific bot is requested, use that bot
    if (botId) {
      const requestedBot = manager.getBot(botId);
      if (requestedBot?.ready) {
        return requestedBot.client;
      }
      console.warn(`Requested bot ${botId} not ready, falling back`);
    }

    // Fallback: prefer BoBB for backwards compatibility
    const bobbBot = manager.getBot(BOBB_ID);
    if (bobbBot?.ready) {
      return bobbBot.client;
    }
    const allBots = manager.getAllBots();
    const readyBot = allBots.find((b) => b.ready);
    return readyBot?.client || null;
  });
  await apiServer.start(API_PORT);

  // Start the activation watcher
  await activationWatcher.start();

  // Start BoBB
  console.log("Starting BoBB...");
  await manager.startBot({
    id: BOBB_ID,
    name: BOBB_NAME,
    token: config.discordToken,
    opencodePort: config.bobbPort,
  });

  // Log BoBB's Discord User ID (not stored in registry to hide its capabilities from other bots)
  const bobbBot = manager.getBot(BOBB_ID);
  if (bobbBot?.discordUserId) {
    console.log(`BoBB Discord User ID: ${bobbBot.discordUserId}`);
  }

  // Start OBB if configured
  if (obbEnabled && config.obbDiscordToken) {
    console.log("\nStarting OBB (Orchestration Bot)...");

    // Start OpenCode server for OBB if managed by orchestrator
    if (opencodeManager) {
      const obbDir = path.join(process.cwd(), "agents", "obb");
      await opencodeManager.startServer(OBB_ID, config.obbPort, obbDir);
    }

    await manager.startBot({
      id: OBB_ID,
      name: OBB_NAME,
      token: config.obbDiscordToken,
      opencodePort: config.obbPort,
    });

    const obbBot = manager.getBot(OBB_ID);
    if (obbBot?.discordUserId) {
      console.log(`OBB Discord User ID: ${obbBot.discordUserId}`);
      // Store OBB's Discord User ID in registry for mention detection
      await apiServer.registry.updateDiscordUserId(OBB_ID, obbBot.discordUserId);
    }
  }

  // Start any existing agents that are ready_to_start
  await startExistingAgents(manager, opencodeManager, bridges, apiServer);

  console.log("\n========================================");
  console.log("BoBB is running!");
  if (obbEnabled) {
    console.log("OBB (Orchestration Bot) is running!");
  }
  console.log(`API server: http://localhost:${API_PORT}`);
  console.log("- Mention @BoBB in Discord to interact");
  console.log("- DM @BoBB with a bot token to activate an agent");
  console.log("========================================\n");
}

// Allow direct execution for backwards compatibility
async function main() {
  const config = loadConfig();
  await runMainApp({ config });
}

// Only run main if this file is executed directly
const isMainModule = import.meta.main ?? process.argv[1]?.includes("index.ts");
if (isMainModule) {
  main().catch(console.error);
}
