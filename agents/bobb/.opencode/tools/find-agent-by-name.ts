import { tool } from "@opencode-ai/plugin";

const API_BASE = process.env.BOBB_API_URL || "http://localhost:3001";

export default tool({
  description: "Find an agent by name (useful for matching user requests)",
  args: {
    name: tool.schema.string().describe("The bot name to search for"),
  },
  async execute(args) {
    try {
      const response = await fetch(
        `${API_BASE}/api/registry/agents/search?name=${encodeURIComponent(args.name)}`,
        {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        }
      );

      const result = await response.json();

      if (result.agents?.length === 1) {
        return JSON.stringify({ agent: result.agents[0] }, null, 2);
      } else if (result.agents?.length > 1) {
        return JSON.stringify({
          agents: result.agents,
          message: "Multiple agents match that name",
        }, null, 2);
      } else {
        return JSON.stringify({
          error: `No agent found matching '${args.name}'`,
        }, null, 2);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return JSON.stringify({ error: message }, null, 2);
    }
  },
});
