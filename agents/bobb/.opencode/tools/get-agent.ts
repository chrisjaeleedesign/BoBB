import { tool } from "@opencode-ai/plugin";

const API_BASE = process.env.BOBB_API_URL || "http://localhost:3001";

export default tool({
  description: "Get details for a specific agent by ID",
  args: {
    agent_id: tool.schema.string().describe("The agent's unique ID"),
  },
  async execute(args) {
    try {
      const response = await fetch(`${API_BASE}/api/registry/agents/${args.agent_id}`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });

      const result = await response.json();
      return JSON.stringify(result, null, 2);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return JSON.stringify({ error: message }, null, 2);
    }
  },
});
