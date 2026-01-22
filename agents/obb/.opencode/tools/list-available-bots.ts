import { tool } from "@opencode-ai/plugin";

const API_BASE = process.env.BOBB_API_URL || "http://localhost:3001";

interface Agent {
  id: string;
  name: string;
  persona?: string;
  status: string;
}

export default tool({
  description: "List all available bots in the system with their names, personas, and status. Use this to discover which bots can be orchestrated.",
  args: {},
  async execute() {
    try {
      const response = await fetch(`${API_BASE}/api/registry/agents`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });

      const result = await response.json();

      if (result.agents) {
        // Filter to only active bots, exclude BoBB and OBB
        const availableBots = result.agents.filter(
          (a: Agent) => a.status === "active" && a.id !== "bobb" && a.id !== "obb"
        );

        if (availableBots.length === 0) {
          return "No bots are currently available for orchestration.";
        }

        const botList = availableBots
          .map(
            (a: Agent) =>
              `- **${a.name}** (id: ${a.id}): ${a.persona || "No description"}`
          )
          .join("\n");

        return `Available bots for orchestration:\n${botList}`;
      }

      return "Unable to fetch bot list.";
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return `Error fetching bots: ${message}`;
    }
  },
});
