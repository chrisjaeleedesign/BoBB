import { ChannelType, TextChannel } from "discord.js";
import { BotManager } from "./bot-manager";
import { OpenCodeBridge } from "./opencode-bridge";
import { MessageQueue } from "./message-queue";
import { ActivationWatcher } from "./activation-watcher";

const BOBB_ID = "bobb";
const BOBB_NAME = "BoBB";
const BOBB_PORT = 4096;

// Track OpenCode bridges for child agents
const bridges: Map<string, OpenCodeBridge> = new Map();

async function main() {
  const token = process.env.BOBB_DISCORD_TOKEN;

  if (!token) {
    console.error("Error: BOBB_DISCORD_TOKEN environment variable is not set");
    console.error("Copy .env.example to .env and add your bot token");
    process.exit(1);
  }

  const manager = new BotManager();
  const messageQueue = new MessageQueue();
  const activationWatcher = new ActivationWatcher();

  // Create OpenCode bridge for BoBB
  const bobbBridge = new OpenCodeBridge(BOBB_PORT);
  bridges.set(BOBB_ID, bobbBridge);

  // Check if OpenCode server is running
  const isHealthy = await bobbBridge.isHealthy();
  if (!isHealthy) {
    console.warn(`Warning: OpenCode server not reachable at port ${BOBB_PORT}`);
    console.warn("Start it with: opencode serve --port 4096");
    console.warn("Continuing without OpenCode integration...\n");
  } else {
    console.log(`OpenCode server connected at port ${BOBB_PORT}`);
  }

  // Handle graceful shutdown
  process.on("SIGINT", async () => {
    console.log("\nShutting down...");
    messageQueue.stop();
    activationWatcher.stop();
    await manager.stopAll();
    process.exit(0);
  });

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
      console.log(`Note: Start its OpenCode server with: cd agents/${request.agent_id} && opencode serve --port ${request.port}`);
    } catch (error) {
      console.error(`Failed to activate agent ${request.name}:`, error);
      bridges.delete(request.agent_id);
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
    token: token,
    opencodePort: BOBB_PORT,
  });

  console.log("\n========================================");
  console.log("BoBB is running!");
  console.log("- Mention @BoBB in Discord to interact");
  console.log("- DM @BoBB with a bot token to activate an agent");
  console.log("========================================\n");
}

main().catch(console.error);
