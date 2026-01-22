import { tool } from "@opencode-ai/plugin";

const API_BASE = process.env.BOBB_API_URL || "http://localhost:3001";
const AGENT_ID = "obb";

export default tool({
  description: "Send a message to a Discord channel that @mentions specific bots, invoking them to respond. This is the primary way to orchestrate other bots.",
  args: {
    channel_id: tool.schema.string().describe("The Discord channel ID to send the message to"),
    message: tool.schema.string().describe("The message content to send (bot mentions will be prepended automatically)"),
    bot_names: tool.schema.array(tool.schema.string()).describe("Array of bot names to @mention and invoke (e.g., ['WeatherBot', 'NewsBot'])"),
    reply_to: tool.schema.string().optional().describe("Optional: Message ID to reply to (creates thread context)"),
  },
  async execute(args) {
    if (!args.bot_names || args.bot_names.length === 0) {
      return "Error: At least one bot name must be provided in bot_names";
    }

    const response = await fetch(`${API_BASE}/api/discord/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        channel_id: args.channel_id,
        content: args.message,
        reply_to: args.reply_to,
        bot_id: AGENT_ID,
        mention_bots: args.bot_names,
      }),
    });

    const result = await response.json();

    if (result.success) {
      const mentioned = result.mentioned_bots || args.bot_names;
      return `Successfully invoked bot(s): ${mentioned.join(", ")} in channel ${args.channel_id}`;
    } else {
      return `Failed to invoke bots: ${result.error}`;
    }
  },
});
