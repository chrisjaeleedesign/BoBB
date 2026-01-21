import { tool } from "@opencode-ai/plugin";

const API_BASE = process.env.BOBB_API_URL || "http://localhost:3001";

export default tool({
  description: "Activate an agent with a Discord bot token. Use this when a user DMs you a token. This will store the token and start the bot.",
  args: {
    agent_id: tool.schema.string().describe("The agent's unique ID"),
    token: tool.schema.string().describe("The Discord bot token"),
  },
  async execute(args) {
    try {
      const response = await fetch(`${API_BASE}/api/registry/agents/${args.agent_id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: args.token,
        }),
      });

      const result = await response.json();

      if (result.success) {
        return JSON.stringify({
          success: true,
          agent_id: args.agent_id,
          name: result.agent?.name,
          status: "ready_to_start",
          message: `Agent '${result.agent?.name}' activated! The bot will start shortly.`,
        }, null, 2);
      } else {
        return JSON.stringify({
          success: false,
          error: result.error || "Failed to activate agent",
        }, null, 2);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return JSON.stringify({
        success: false,
        error: message,
      }, null, 2);
    }
  },
});
