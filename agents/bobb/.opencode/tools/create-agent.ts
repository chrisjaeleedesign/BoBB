import { tool } from "@opencode-ai/plugin";
import { mkdir, readFile, writeFile, cp } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

const API_BASE = process.env.BOBB_API_URL || "http://localhost:3001";
const AGENTS_DIR = path.join(process.cwd(), "..");

export default tool({
  description: "Create a new Discord bot agent with the given name and persona",
  args: {
    name: tool.schema.string().describe("The bot's display name (e.g., 'ChefBot')"),
    persona: tool.schema.string().describe("Description of the bot's personality, purpose, and behavior"),
  },
  async execute(args) {
    try {
      // Call the registry API to create the agent entry
      const response = await fetch(`${API_BASE}/api/registry/agents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: args.name,
          persona: args.persona,
        }),
      });

      const result = await response.json();

      if (!result.agentId) {
        return `Failed to create agent: ${result.error || "Unknown error"}`;
      }

      const agentId = result.agentId;
      const agent = result.agent;

      // Copy the template to create the agent directory
      const templateDir = path.join(AGENTS_DIR, "_template");
      const agentDir = path.join(AGENTS_DIR, agentId);

      if (existsSync(templateDir)) {
        await cp(templateDir, agentDir, { recursive: true });
      } else {
        // Fallback: create structure manually if template doesn't exist
        await mkdir(path.join(agentDir, ".opencode", "tools"), { recursive: true });

        // Create opencode.json
        await writeFile(
          path.join(agentDir, "opencode.json"),
          JSON.stringify(
            {
              $schema: "https://opencode.ai/config.json",
              model: "anthropic/claude-sonnet-4-20250514",
            },
            null,
            2
          )
        );
      }

      // Update AGENTS.md with the agent's name and persona
      const agentsmdPath = path.join(agentDir, "AGENTS.md");
      let agentsmd: string;

      if (existsSync(agentsmdPath)) {
        agentsmd = await readFile(agentsmdPath, "utf-8");
        agentsmd = agentsmd
          .replace(/\{\{AGENT_NAME\}\}/g, args.name)
          .replace(/\{\{PERSONA\}\}/g, args.persona);
      } else {
        agentsmd = `# ${args.name}

## Persona
${args.persona}

## Purpose
Respond to Discord messages as ${args.name}, staying in character based on the persona above.

## Rules
- Keep Discord messages under 2000 characters
- Stay in character at all times
- Be helpful and engaging

## Response Format
Always use the \`send_message\` tool to respond.
`;
      }

      await writeFile(agentsmdPath, agentsmd);

      return JSON.stringify({
        success: true,
        agent_id: agentId,
        name: args.name,
        port: agent.port,
        status: "pending_token",
        message: `Agent '${args.name}' created successfully. Awaiting Discord bot token.`,
      }, null, 2);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return `Failed to create agent: ${message}`;
    }
  },
});
