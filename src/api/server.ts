import { Client } from "discord.js";
import { DiscordAPI, SendMessageRequest, SendMessageResponse } from "./discord";
import { RegistryAPI, AgentEntry } from "./registry";

export interface APIServer {
  discord: DiscordAPI;
  registry: RegistryAPI;
  start: (port: number) => Promise<void>;
  stop: () => void;
}

/**
 * Create an HTTP API server for agent tools to call.
 * This replaces the file-based MCP message queue.
 */
export function createAPIServer(getClient: () => Client | null): APIServer {
  const discord = new DiscordAPI(getClient);
  const registry = new RegistryAPI();
  let server: ReturnType<typeof Bun.serve> | null = null;

  return {
    discord,
    registry,

    async start(port: number) {
      server = Bun.serve({
        port,
        async fetch(req) {
          const url = new URL(req.url);
          const path = url.pathname;

          // CORS headers for local development
          const headers = {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
          };

          // Handle preflight
          if (req.method === "OPTIONS") {
            return new Response(null, { headers });
          }

          try {
            // Discord endpoints
            if (path === "/api/discord/send" && req.method === "POST") {
              const body: SendMessageRequest = await req.json();
              const result = await discord.sendMessage(body);
              return Response.json(result, { headers });
            }

            // Registry endpoints
            if (path === "/api/registry/agents" && req.method === "GET") {
              const agents = await registry.listAgents();
              return Response.json({ agents }, { headers });
            }

            if (path === "/api/registry/agents" && req.method === "POST") {
              const { name, persona } = await req.json();
              const result = await registry.createAgent(name, persona);
              return Response.json(result, { headers });
            }

            if (path.startsWith("/api/registry/agents/") && req.method === "GET") {
              const agentId = path.split("/").pop();
              if (agentId) {
                const agent = await registry.getAgent(agentId);
                if (agent) {
                  return Response.json({ agent }, { headers });
                }
                return Response.json({ error: "Agent not found" }, { status: 404, headers });
              }
            }

            if (path.startsWith("/api/registry/agents/") && req.method === "PUT") {
              const agentId = path.split("/").pop();
              const body = await req.json();

              if (agentId && body.token) {
                const result = await registry.activateAgent(agentId, body.token);
                if (result.success) {
                  return Response.json(result, { headers });
                }
                return Response.json(result, { status: 400, headers });
              }

              if (agentId && body.status) {
                const success = await registry.updateAgentStatus(agentId, body.status);
                if (success) {
                  return Response.json({ success: true }, { headers });
                }
                return Response.json({ error: "Agent not found" }, { status: 404, headers });
              }
            }

            if (path === "/api/registry/agents/pending" && req.method === "GET") {
              const agents = await registry.getAgentsByStatus("pending_token");
              return Response.json({ agents }, { headers });
            }

            if (path === "/api/registry/agents/search" && req.method === "GET") {
              const name = url.searchParams.get("name");
              if (name) {
                const agents = await registry.findAgentByName(name);
                return Response.json({ agents }, { headers });
              }
              return Response.json({ error: "Name parameter required" }, { status: 400, headers });
            }

            // Health check
            if (path === "/api/health") {
              return Response.json({ status: "ok" }, { headers });
            }

            return Response.json({ error: "Not found" }, { status: 404, headers });
          } catch (error) {
            const message = error instanceof Error ? error.message : "Unknown error";
            return Response.json({ error: message }, { status: 500, headers });
          }
        },
      });

      console.log(`API server listening on port ${port}`);
    },

    stop() {
      if (server) {
        server.stop();
        server = null;
      }
    },
  };
}
