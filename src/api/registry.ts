import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

export interface AgentEntry {
  id: string;
  name: string;
  persona?: string;
  port: number;
  status: "pending_token" | "ready_to_start" | "active";
  token?: string | null;
  discord_user_id?: string;
  created_at?: string;
  activated_at?: string;
}

export interface Registry {
  agents: Record<string, AgentEntry>;
  next_port: number;
}

const REGISTRY_PATH = path.join(process.cwd(), "registry.json");
const ACTIVATIONS_DIR = path.join(process.cwd(), "agents", ".activations");

/**
 * Convert a name to a URL-safe slug (lowercase, hyphens, no special chars)
 */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-") // Replace non-alphanumeric with hyphens
    .replace(/^-+|-+$/g, "")      // Remove leading/trailing hyphens
    .slice(0, 50);                // Limit length
}

/**
 * Registry API - manages agent metadata.
 * Keeps registry at project root (outside agents/) for security.
 */
export class RegistryAPI {
  /**
   * Load the registry from disk
   */
  async load(): Promise<Registry> {
    try {
      const content = await readFile(REGISTRY_PATH, "utf-8");
      return JSON.parse(content);
    } catch {
      return { agents: {}, next_port: 4097 };
    }
  }

  /**
   * Save the registry to disk
   */
  async save(registry: Registry): Promise<void> {
    await writeFile(REGISTRY_PATH, JSON.stringify(registry, null, 2));
  }

  /**
   * List all agents
   */
  async listAgents(): Promise<AgentEntry[]> {
    const registry = await this.load();
    return Object.values(registry.agents);
  }

  /**
   * Get a single agent by ID
   */
  async getAgent(agentId: string): Promise<AgentEntry | null> {
    const registry = await this.load();
    return registry.agents[agentId] || null;
  }

  /**
   * Get agents with a specific status
   */
  async getAgentsByStatus(status: AgentEntry["status"]): Promise<AgentEntry[]> {
    const registry = await this.load();
    return Object.values(registry.agents).filter((agent) => agent.status === status);
  }

  /**
   * Find agent by name (case-insensitive partial match)
   */
  async findAgentByName(name: string): Promise<AgentEntry[]> {
    const registry = await this.load();
    const nameLower = name.toLowerCase();
    return Object.values(registry.agents).filter((agent) =>
      agent.name.toLowerCase().includes(nameLower)
    );
  }

  /**
   * Create a new agent entry
   * Uses slugified name as ID (e.g., "ChefBot" -> "chefbot")
   */
  async createAgent(
    name: string,
    persona: string
  ): Promise<{ agent: AgentEntry; agentId: string }> {
    const registry = await this.load();

    // Generate ID from name (slug)
    let baseSlug = slugify(name);
    if (!baseSlug) {
      baseSlug = "agent"; // Fallback if name is all special characters
    }

    // Handle collisions by appending a number
    let agentId = baseSlug;
    let counter = 2;
    while (registry.agents[agentId]) {
      agentId = `${baseSlug}-${counter}`;
      counter++;
    }

    // Allocate port
    const port = registry.next_port;
    registry.next_port = port + 1;

    const agent: AgentEntry = {
      id: agentId,
      name,
      persona,
      port,
      status: "pending_token",
      token: null,
      created_at: new Date().toISOString(),
    };

    registry.agents[agentId] = agent;
    await this.save(registry);

    return { agent, agentId };
  }

  /**
   * Update an agent's token and status
   */
  async activateAgent(
    agentId: string,
    token: string
  ): Promise<{ success: boolean; agent?: AgentEntry; error?: string }> {
    const registry = await this.load();
    const agent = registry.agents[agentId];

    if (!agent) {
      return { success: false, error: `Agent ${agentId} not found` };
    }

    if (agent.status === "active") {
      return { success: false, error: `Agent ${agentId} is already active` };
    }

    // Validate token format (3 dot-separated parts)
    const parts = token.split(".");
    if (parts.length !== 3) {
      return { success: false, error: "Invalid token format" };
    }

    agent.token = token;
    agent.status = "ready_to_start";
    agent.activated_at = new Date().toISOString();

    await this.save(registry);

    // Write activation signal file
    await this.writeActivationSignal(agent);

    return { success: true, agent };
  }

  /**
   * Write an activation signal file for the thin client to pick up
   */
  private async writeActivationSignal(agent: AgentEntry): Promise<void> {
    if (!existsSync(ACTIVATIONS_DIR)) {
      await mkdir(ACTIVATIONS_DIR, { recursive: true });
    }

    const activationFile = path.join(ACTIVATIONS_DIR, `${agent.id}.json`);
    await writeFile(
      activationFile,
      JSON.stringify(
        {
          agent_id: agent.id,
          name: agent.name,
          token: agent.token,
          port: agent.port,
          timestamp: new Date().toISOString(),
        },
        null,
        2
      )
    );
  }

  /**
   * Update agent status
   */
  async updateAgentStatus(agentId: string, status: AgentEntry["status"]): Promise<boolean> {
    const registry = await this.load();
    const agent = registry.agents[agentId];

    if (!agent) {
      return false;
    }

    agent.status = status;
    await this.save(registry);
    return true;
  }

  /**
   * Allocate the next available port (for creating agents)
   */
  async allocatePort(): Promise<number> {
    const registry = await this.load();
    const port = registry.next_port;
    registry.next_port = port + 1;
    await this.save(registry);
    return port;
  }

  /**
   * Update an agent's Discord User ID (set when bot connects to Discord)
   */
  async updateDiscordUserId(agentId: string, discordUserId: string): Promise<boolean> {
    const registry = await this.load();
    const agent = registry.agents[agentId];

    if (!agent) {
      // For special bots like OBB that aren't created through normal flow,
      // create a minimal entry if it doesn't exist
      if (agentId === "obb") {
        registry.agents[agentId] = {
          id: agentId,
          name: "OBB",
          persona: "Orchestration Bot - manages multi-bot interactions",
          port: 4095,
          status: "active",
          discord_user_id: discordUserId,
          created_at: new Date().toISOString(),
        };
        await this.save(registry);
        return true;
      }
      return false;
    }

    agent.discord_user_id = discordUserId;
    await this.save(registry);
    return true;
  }
}
