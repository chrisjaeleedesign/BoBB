import { tool } from "@opencode-ai/plugin";

const API_BASE = process.env.BOBB_API_URL || "http://localhost:3001";

export default tool({
  description: "List all registered agents",
  args: {},
  async execute() {
    try {
      const response = await fetch(`${API_BASE}/api/registry/agents`, {
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
