import { tool } from "@opencode-ai/plugin";

const API_BASE = process.env.BOBB_API_URL || "http://localhost:3001";
const AGENT_ID = "obb";

export default tool({
  description: "Send a message to a Discord channel as OBB. Use sparingly - only for error notifications or when directly asked.",
  args: {
    channel_id: tool.schema.string().describe("The Discord channel ID to send the message to"),
    content: tool.schema.string().describe("The message content (max 2000 characters)"),
    reply_to: tool.schema.string().optional().describe("Optional: Message ID to reply to (creates thread context)"),
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
      }),
    });

    const result = await response.json();

    if (result.success) {
      return `Message sent successfully to channel ${args.channel_id}`;
    } else {
      return `Failed to send message: ${result.error}`;
    }
  },
});
