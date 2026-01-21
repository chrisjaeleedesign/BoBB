#!/usr/bin/env python3
"""
MCP Agent Manager Tool - Creates and manages child Discord bot agents.

This MCP server exposes tools for creating new agent configurations
that can be activated with Discord bot tokens.
"""

import json
import sys
import uuid
from datetime import datetime
from pathlib import Path

# Paths
PROJECT_ROOT = Path(__file__).parent.parent
AGENTS_DIR = PROJECT_ROOT / "agents"
REGISTRY_FILE = AGENTS_DIR / "registry.json"

# Template for child agent's AGENTS.md
AGENTS_MD_TEMPLATE = """# {name}

## Persona
{persona}

## Purpose
Respond to Discord messages as {name}, staying in character based on the persona above.

## Rules
- Keep Discord messages under 2000 characters
- Stay in character at all times
- Be helpful and engaging
- Use the respond-discord skill when replying

## Response Format
Respond conversationally as {name}. Your responses will be sent to the Discord channel.
"""

# Template for child agent's opencode.json
OPENCODE_JSON_TEMPLATE = {
    "$schema": "https://opencode.ai/config.json",
    "model": "anthropic/claude-sonnet-4-20250514",
    "mcp": {
        "discord": {
            "command": "python3",
            "args": ["../../tools/mcp_discord.py"]
        }
    }
}

# Template for child agent's respond-discord skill
RESPOND_SKILL_TEMPLATE = """---
name: respond-discord
description: Format and send responses to Discord channels
---

# Respond Discord Skill

Use this skill when you need to send a message back to Discord.

## Guidelines

1. **Keep it concise** - Discord has a 2000 character limit per message
2. **Stay in character** - Match your defined persona
3. **Use the tool** - Always use the `send_message` MCP tool
4. **Include context** - Reference what the user said when relevant

## Tool Usage

```
send_message({{
  channel_id: "the channel ID from the incoming message",
  content: "your response text",
  reply_to: "optional message ID to reply to"
}})
```
"""


def ensure_dirs():
    """Ensure required directories exist."""
    AGENTS_DIR.mkdir(parents=True, exist_ok=True)


def load_registry() -> dict:
    """Load the agent registry."""
    if REGISTRY_FILE.exists():
        with open(REGISTRY_FILE) as f:
            return json.load(f)
    return {"agents": {}, "next_port": 4097}


def save_registry(registry: dict):
    """Save the agent registry."""
    with open(REGISTRY_FILE, "w") as f:
        json.dump(registry, f, indent=2)


def handle_create_agent(name: str, persona: str) -> dict:
    """
    Create a new agent configuration.

    Args:
        name: The bot's display name
        persona: Description of the bot's personality and purpose

    Returns:
        Status dict with agent_id or error
    """
    ensure_dirs()
    registry = load_registry()

    # Generate unique agent ID
    agent_id = str(uuid.uuid4())[:8]

    # Allocate port
    port = registry["next_port"]
    registry["next_port"] = port + 1

    # Create agent directory
    agent_dir = AGENTS_DIR / agent_id
    agent_dir.mkdir(parents=True, exist_ok=True)

    # Create skills directory
    skills_dir = agent_dir / ".opencode" / "skills" / "respond-discord"
    skills_dir.mkdir(parents=True, exist_ok=True)

    # Write AGENTS.md
    agents_md = AGENTS_MD_TEMPLATE.format(name=name, persona=persona)
    with open(agent_dir / "AGENTS.md", "w") as f:
        f.write(agents_md)

    # Write opencode.json
    with open(agent_dir / "opencode.json", "w") as f:
        json.dump(OPENCODE_JSON_TEMPLATE, f, indent=2)

    # Write respond-discord skill
    with open(skills_dir / "SKILL.md", "w") as f:
        f.write(RESPOND_SKILL_TEMPLATE)

    # Register the agent
    registry["agents"][agent_id] = {
        "id": agent_id,
        "name": name,
        "persona": persona,
        "port": port,
        "status": "pending_token",
        "token": None,
        "created_at": datetime.now().isoformat(),
    }
    save_registry(registry)

    return {
        "success": True,
        "agent_id": agent_id,
        "name": name,
        "port": port,
        "status": "pending_token",
        "message": f"Agent '{name}' created successfully. Awaiting Discord bot token.",
    }


def handle_list_agents() -> dict:
    """List all registered agents."""
    registry = load_registry()
    return {
        "agents": list(registry["agents"].values())
    }


def handle_get_agent(agent_id: str) -> dict:
    """Get details for a specific agent."""
    registry = load_registry()
    agent = registry["agents"].get(agent_id)
    if agent:
        return {"agent": agent}
    return {"error": f"Agent {agent_id} not found"}


def handle_get_pending_agents() -> dict:
    """Get agents that are pending token activation."""
    registry = load_registry()
    pending = [
        agent for agent in registry["agents"].values()
        if agent.get("status") == "pending_token"
    ]
    return {"pending_agents": pending}


def handle_activate_agent(agent_id: str, token: str) -> dict:
    """
    Activate an agent with a Discord bot token.

    Args:
        agent_id: The agent's unique ID
        token: The Discord bot token

    Returns:
        Status dict with activation result
    """
    registry = load_registry()
    agent = registry["agents"].get(agent_id)

    if not agent:
        return {"success": False, "error": f"Agent {agent_id} not found"}

    if agent.get("status") == "active":
        return {"success": False, "error": f"Agent {agent_id} is already active"}

    # Validate token format (Discord tokens have a specific format)
    # Format: base64(bot_id).timestamp.hmac
    parts = token.split(".")
    if len(parts) != 3:
        return {"success": False, "error": "Invalid token format"}

    # Update the registry
    agent["token"] = token
    agent["status"] = "ready_to_start"
    agent["activated_at"] = datetime.now().isoformat()
    save_registry(registry)

    # Write activation signal for the thin client
    activation_dir = AGENTS_DIR / ".activations"
    activation_dir.mkdir(parents=True, exist_ok=True)

    activation_file = activation_dir / f"{agent_id}.json"
    with open(activation_file, "w") as f:
        json.dump({
            "agent_id": agent_id,
            "name": agent["name"],
            "token": token,
            "port": agent["port"],
            "timestamp": datetime.now().isoformat()
        }, f, indent=2)

    return {
        "success": True,
        "agent_id": agent_id,
        "name": agent["name"],
        "status": "ready_to_start",
        "message": f"Agent '{agent['name']}' activated! The bot will start shortly.",
    }


def handle_find_agent_by_name(name: str) -> dict:
    """Find an agent by name (case-insensitive partial match)."""
    registry = load_registry()
    name_lower = name.lower()

    matches = [
        agent for agent in registry["agents"].values()
        if name_lower in agent.get("name", "").lower()
    ]

    if len(matches) == 1:
        return {"agent": matches[0]}
    elif len(matches) > 1:
        return {"agents": matches, "message": "Multiple agents match that name"}
    else:
        return {"error": f"No agent found matching '{name}'"}


def handle_start_agent(agent_id: str) -> dict:
    """
    Start an agent that has already been activated with a token.

    Args:
        agent_id: The agent's unique ID

    Returns:
        Status dict with start result
    """
    registry = load_registry()
    agent = registry["agents"].get(agent_id)

    if not agent:
        return {"success": False, "error": f"Agent {agent_id} not found"}

    if not agent.get("token"):
        return {"success": False, "error": f"Agent {agent_id} has no token. Activate it first."}

    if agent.get("status") == "active":
        return {"success": False, "error": f"Agent {agent_id} is already running"}

    # Write activation signal file
    activation_dir = AGENTS_DIR / ".activations"
    activation_dir.mkdir(parents=True, exist_ok=True)

    activation_file = activation_dir / f"{agent_id}.json"
    with open(activation_file, "w") as f:
        json.dump({
            "agent_id": agent_id,
            "name": agent["name"],
            "token": agent["token"],
            "port": agent["port"],
            "timestamp": datetime.now().isoformat()
        }, f, indent=2)

    return {
        "success": True,
        "agent_id": agent_id,
        "name": agent["name"],
        "message": f"Starting {agent['name']}... The bot will be online shortly.",
    }


def handle_request(request: dict) -> dict:
    """Handle an MCP request."""
    method = request.get("method")

    if method == "initialize":
        return {
            "protocolVersion": "2024-11-05",
            "capabilities": {
                "tools": {}
            },
            "serverInfo": {
                "name": "agent-manager-mcp",
                "version": "0.1.0"
            }
        }

    elif method == "tools/list":
        return {
            "tools": [
                {
                    "name": "create_agent",
                    "description": "Create a new Discord bot agent with the given name and persona",
                    "inputSchema": {
                        "type": "object",
                        "properties": {
                            "name": {
                                "type": "string",
                                "description": "The bot's display name (e.g., 'ChefBot')"
                            },
                            "persona": {
                                "type": "string",
                                "description": "Description of the bot's personality, purpose, and behavior"
                            }
                        },
                        "required": ["name", "persona"]
                    }
                },
                {
                    "name": "list_agents",
                    "description": "List all registered agents",
                    "inputSchema": {
                        "type": "object",
                        "properties": {}
                    }
                },
                {
                    "name": "get_agent",
                    "description": "Get details for a specific agent by ID",
                    "inputSchema": {
                        "type": "object",
                        "properties": {
                            "agent_id": {
                                "type": "string",
                                "description": "The agent's unique ID"
                            }
                        },
                        "required": ["agent_id"]
                    }
                },
                {
                    "name": "get_pending_agents",
                    "description": "Get agents that are waiting for a Discord bot token",
                    "inputSchema": {
                        "type": "object",
                        "properties": {}
                    }
                },
                {
                    "name": "activate_agent",
                    "description": "Activate an agent with a Discord bot token. Use this when a user DMs you a token.",
                    "inputSchema": {
                        "type": "object",
                        "properties": {
                            "agent_id": {
                                "type": "string",
                                "description": "The agent's unique ID"
                            },
                            "token": {
                                "type": "string",
                                "description": "The Discord bot token"
                            }
                        },
                        "required": ["agent_id", "token"]
                    }
                },
                {
                    "name": "find_agent_by_name",
                    "description": "Find an agent by name (useful for matching user requests)",
                    "inputSchema": {
                        "type": "object",
                        "properties": {
                            "name": {
                                "type": "string",
                                "description": "The bot name to search for"
                            }
                        },
                        "required": ["name"]
                    }
                },
                {
                    "name": "start_agent",
                    "description": "Start an agent that has been activated with a token. Call this after activate_agent to actually start the bot.",
                    "inputSchema": {
                        "type": "object",
                        "properties": {
                            "agent_id": {
                                "type": "string",
                                "description": "The agent's unique ID"
                            }
                        },
                        "required": ["agent_id"]
                    }
                }
            ]
        }

    elif method == "tools/call":
        params = request.get("params", {})
        tool_name = params.get("name")
        arguments = params.get("arguments", {})

        if tool_name == "create_agent":
            result = handle_create_agent(
                name=arguments.get("name"),
                persona=arguments.get("persona")
            )
        elif tool_name == "list_agents":
            result = handle_list_agents()
        elif tool_name == "get_agent":
            result = handle_get_agent(arguments.get("agent_id"))
        elif tool_name == "get_pending_agents":
            result = handle_get_pending_agents()
        elif tool_name == "activate_agent":
            result = handle_activate_agent(
                agent_id=arguments.get("agent_id"),
                token=arguments.get("token")
            )
        elif tool_name == "find_agent_by_name":
            result = handle_find_agent_by_name(arguments.get("name"))
        elif tool_name == "start_agent":
            result = handle_start_agent(arguments.get("agent_id"))
        else:
            return {
                "error": {
                    "code": -32601,
                    "message": f"Unknown tool: {tool_name}"
                }
            }

        return {
            "content": [
                {
                    "type": "text",
                    "text": json.dumps(result, indent=2)
                }
            ]
        }

    else:
        return {
            "error": {
                "code": -32601,
                "message": f"Unknown method: {method}"
            }
        }


def main():
    """Main MCP server loop using stdio transport."""
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue

        try:
            request = json.loads(line)
            request_id = request.get("id")

            result = handle_request(request)

            response = {
                "jsonrpc": "2.0",
                "id": request_id,
            }

            if "error" in result:
                response["error"] = result["error"]
            else:
                response["result"] = result

            print(json.dumps(response), flush=True)

        except json.JSONDecodeError as e:
            error_response = {
                "jsonrpc": "2.0",
                "id": None,
                "error": {
                    "code": -32700,
                    "message": f"Parse error: {e}"
                }
            }
            print(json.dumps(error_response), flush=True)
        except Exception as e:
            error_response = {
                "jsonrpc": "2.0",
                "id": request.get("id") if 'request' in dir() else None,
                "error": {
                    "code": -32603,
                    "message": f"Internal error: {e}"
                }
            }
            print(json.dumps(error_response), flush=True)


if __name__ == "__main__":
    main()
