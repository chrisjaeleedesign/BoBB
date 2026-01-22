import { tool } from "@opencode-ai/plugin";

const API_BASE = process.env.BOBB_API_URL || "http://localhost:3001";
const AGENT_ID = process.env.AGENT_ID;

export default tool({
  description: "Send a message to a Discord channel. Can optionally mention other bots.",
  args: {
    channel_id: tool.schema.string().describe("The Discord channel ID to send the message to"),
    content: tool.schema.string().describe("The message content (max 2000 characters). Bot mentions will be prepended automatically if mention_bots is provided."),
    reply_to: tool.schema.string().optional().describe("Optional: Message ID to reply to (creates thread context)"),
    mention_bots: tool.schema.array(tool.schema.string()).optional().describe("Optional: Array of bot names to @mention (e.g., ['wobb', 'fobb']). The bot mentions will be prepended to your message."),
  },
  async execute(args) {
    const response = await fetch(`${API_BASE}/api/discord/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        channel_id: args.channel_id,
        content: args.content,
        reply_to: args.reply_to,
        bot_id: AGENT_ID,
        mention_bots: args.mention_bots,
      }),
    });

    const result = await response.json();

    if (result.success) {
      let successMsg = `Message sent successfully to channel ${args.channel_id}`;
      if (result.mentioned_bots && result.mentioned_bots.length > 0) {
        successMsg += ` (mentioned: ${result.mentioned_bots.join(", ")})`;
      }
      return successMsg;
    } else {
      return `Failed to send message: ${result.error}`;
    }
  },
});
