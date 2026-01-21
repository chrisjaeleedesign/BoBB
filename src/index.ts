import { ChannelType, TextChannel } from "discord.js";
import path from "path";
import { readFile } from "fs/promises";
import { BotManager } from "./bot-manager";
import { OpenCodeBridge } from "./opencode-bridge";
import { MessageQueue } from "./message-queue";
import { ActivationWatcher } from "./activation-watcher";
import { BobbConfig, loadConfig } from "./config";
import { OpenCodeManager } from "./opencode-manager";

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

// Track OpenCode bridges for child agents
const bridges: Map<string, OpenCodeBridge> = new Map();

export interface RunMainAppOptions {
  config: BobbConfig;
  opencodeManager?: OpenCodeManager;
}

/**
 * Start any agents that are in ready_to_start state from registry
 */
async function startExistingAgents(
  manager: BotManager,
  opencodeManager: OpenCodeManager | undefined,
  bridgesMap: Map<string, OpenCodeBridge>
): Promise<void> {
  const registryPath = path.join(process.cwd(), "agents", "registry.json");

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
  const messageQueue = new MessageQueue();
  const activationWatcher = new ActivationWatcher();

  // Create OpenCode bridge for BoBB
  const bobbBridge = new OpenCodeBridge(config.bobbPort);
  bridges.set(BOBB_ID, bobbBridge);

  // Check if OpenCode server is running (only warn if not managed by orchestrator)
  if (!opencodeManager) {
    const isHealthy = await bobbBridge.isHealthy();
    if (!isHealthy) {
      console.warn(`Warning: OpenCode server not reachable at port ${config.bobbPort}`);
      console.warn(`Start it with: opencode serve --port ${config.bobbPort}`);
      console.warn("Continuing without OpenCode integration...\n");
    } else {
      console.log(`OpenCode server connected at port ${config.bobbPort}`);
    }
  }

  // Handle graceful shutdown
  const shutdown = async () => {
    console.log("\nShutting down...");
    messageQueue.stop();
    activationWatcher.stop();
    await manager.stopAll();

    // Stop OpenCode servers if managed by orchestrator
    if (opencodeManager) {
      await opencodeManager.stopAll();
    }

    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Helper function to forward message to OpenCode
  async function forwardToOpenCode(
    message: { channel: { id: string; type: ChannelType }; id: string; author: { id: string; tag: string }; content: string },
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

    try {
      const response = await bridge.sendMessage({
        channelId: message.channel.id,
        messageId: message.id,
        authorId: message.author.id,
        authorTag: message.author.tag,
        content: message.content,
        isDM,
      });

      if (response) {
        console.log(`OpenCode response received (${response.length} chars)`);
      } else {
        console.log("No response from OpenCode");
      }
    } catch (error) {
      console.error("Error forwarding to OpenCode:", error);
    }
  }

  // Set up message handler for mentions (Discord -> OpenCode)
  manager.onMessage(async (message, bot) => {
    console.log(`\n--- Message Received ---`);
    console.log(`Bot: ${bot.config.name}`);
    console.log(`Channel: ${message.channel.id}`);
    console.log(`Author: ${message.author.tag} (${message.author.id})`);
    console.log(`Content: ${message.content}`);
    console.log(`Message ID: ${message.id}`);
    console.log(`------------------------\n`);

    // Show typing indicator while processing
    if (message.channel.isTextBased()) {
      await message.channel.sendTyping();
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
    await message.channel.sendTyping();

    // Only BoBB handles DMs for token submission
    if (bot.config.id === BOBB_ID) {
      await forwardToOpenCode(message, BOBB_ID);
    }
  });

  // Set up handler for MCP tool messages (OpenCode -> Discord)
  messageQueue.onMessage(async (pendingMessage) => {
    console.log(`\n--- Sending to Discord ---`);
    console.log(`Channel: ${pendingMessage.channel_id}`);
    console.log(`Content: ${pendingMessage.content.substring(0, 100)}...`);
    console.log(`--------------------------\n`);

    // Find a bot that can send to this channel
    // Try BoBB first, then check child bots
    let sendingBot = manager.getBot(BOBB_ID);

    if (!sendingBot || !sendingBot.ready) {
      // Try to find any ready bot
      const allBots = manager.getAllBots();
      sendingBot = allBots.find((b) => b.ready);
    }

    if (!sendingBot) {
      console.error("No bot available to send message");
      return;
    }

    try {
      const channel = await sendingBot.client.channels.fetch(pendingMessage.channel_id);

      if (!channel || !channel.isTextBased()) {
        console.error(`Channel ${pendingMessage.channel_id} not found or not text-based`);
        return;
      }

      if (channel.type === ChannelType.DM) {
        await channel.send(pendingMessage.content);
      } else {
        const options: { content: string; reply?: { messageReference: string } } = {
          content: pendingMessage.content,
        };

        if (pendingMessage.reply_to) {
          options.reply = { messageReference: pendingMessage.reply_to };
        }

        await (channel as TextChannel).send(options);
      }

      console.log("Message sent to Discord successfully");
    } catch (error) {
      console.error("Error sending to Discord:", error);
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

  // Start the watchers
  await messageQueue.start();
  await activationWatcher.start();

  // Start BoBB
  console.log("Starting BoBB...");
  await manager.startBot({
    id: BOBB_ID,
    name: BOBB_NAME,
    token: config.discordToken,
    opencodePort: config.bobbPort,
  });

  // Start any existing agents that are ready_to_start
  await startExistingAgents(manager, opencodeManager, bridges);

  console.log("\n========================================");
  console.log("BoBB is running!");
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
