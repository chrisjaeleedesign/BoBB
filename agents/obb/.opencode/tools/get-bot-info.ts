import { tool } from "@opencode-ai/plugin";

const API_BASE = process.env.BOBB_API_URL || "http://localhost:3001";

export default tool({
  description: "Get detailed information about a specific bot by name or ID. Useful for understanding a bot's capabilities before invoking it.",
  args: {
    bot_identifier: tool.schema.string().describe("The bot's name or ID to look up"),
  },
  async execute(args) {
    try {
      // First try to find by name
      const searchResponse = await fetch(
        `${API_BASE}/api/registry/agents/search?name=${encodeURIComponent(args.bot_identifier)}`,
        {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        }
      );

      let result = await searchResponse.json();

      // If not found by name, try by ID
      if (!result.agent) {
        const idResponse = await fetch(
          `${API_BASE}/api/registry/agents/${encodeURIComponent(args.bot_identifier)}`,
          {
            method: "GET",
            headers: { "Content-Type": "application/json" },
          }
        );
        result = await idResponse.json();
      }

      if (result.agent) {
        const bot = result.agent;
        return `Bot Info:
- **Name**: ${bot.name}
- **ID**: ${bot.id}
- **Status**: ${bot.status}
- **Persona**: ${bot.persona || "No description"}
- **Created**: ${bot.created_at || "Unknown"}`;
      }

      return `Bot "${args.bot_identifier}" not found.`;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return `Error fetching bot info: ${message}`;
    }
  },
});
