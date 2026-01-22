import { tool } from "@opencode-ai/plugin";

const API_BASE = process.env.BOBB_API_URL || "http://localhost:3001";
const AGENT_ID = process.env.AGENT_ID;

interface Member {
  id: string;
  name: string;
  persona?: string;
  can_mention: boolean;
}

export default tool({
  description: "List all available bots that can be mentioned in the channel. Use this to discover other bots you can tag.",
  args: {},
  async execute() {
    try {
      const response = await fetch(`${API_BASE}/api/discord/members`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });

      const result = await response.json();

      if (result.members) {
        // Filter out self
        const otherBots = result.members.filter(
          (m: Member) => m.id !== AGENT_ID
        );

        if (otherBots.length === 0) {
          return "No other bots are currently available to mention.";
        }

        const botList = otherBots
          .map(
            (m: Member) =>
              `- **${m.name}**: ${m.persona || "No description available"}`
          )
          .join("\n");

        return `Available bots you can mention:\n${botList}\n\nUse the mention_bots parameter in send_message to tag them (e.g., mention_bots: ["${otherBots[0]?.name || "botname"}"]).`;
      }

      return "Unable to fetch member list.";
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return `Error fetching members: ${message}`;
    }
  },
});
