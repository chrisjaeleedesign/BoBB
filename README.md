# BoBB (Bot Builder Bot)

A Discord bot that creates other Discord bots. BoBB uses OpenCode to power AI agents, letting users create custom bots through natural conversation.

## Architecture

```
Discord User
     │
     │ @BoBB create a bot...
     ▼
┌─────────────────────────────────────────────────┐
│  BoBB (Thin Client)                             │
│  - Discord.js for gateway connection            │
│  - Forwards mentions to OpenCode                │
│  - Sends responses via MCP tool                 │
└─────────────────────┬───────────────────────────┘
                      │ HTTP (OpenCode SDK)
                      ▼
┌─────────────────────────────────────────────────┐
│  OpenCode Server (port 4096)                    │
│  - Claude Sonnet model                          │
│  - MCP tools: discord, agent-manager            │
│  - Skills: create-bot, respond-discord          │
└─────────────────────────────────────────────────┘
                      │
                      │ Creates child agents
                      ▼
┌─────────────────────────────────────────────────┐
│  Child Agent (e.g., ChefBot)                    │
│  - Own Discord bot token                        │
│  - Own OpenCode server (port 4097+)             │
│  - Custom persona and behavior                  │
└─────────────────────────────────────────────────┘
```

## Quick Start

### Prerequisites

- [Bun](https://bun.sh) runtime
- [OpenCode CLI](https://github.com/opencode-ai/opencode) installed globally
- Discord bot token for BoBB
- Anthropic API key

### Setup

1. Clone and install dependencies:
   ```bash
   cd BoBB
   bun install
   ```

2. Create `.env` file:
   ```bash
   cp .env.example .env
   ```

3. Fill in your credentials:
   ```
   BOBB_DISCORD_TOKEN=your_discord_bot_token
   ANTHROPIC_API_KEY=your_anthropic_key
   ```

4. Start BoBB:
   ```bash
   bun run start
   ```

This single command:
- Starts the OpenCode server on port 4096
- Waits for health check to pass
- Starts the Discord thin client
- Auto-starts any previously created agents

### NPM Scripts

| Script | Description |
|--------|-------------|
| `bun run start` | Production start (orchestrator) |
| `bun run dev` | Development with auto-reload |
| `bun run start:discord-only` | Start Discord client without orchestrator |

## Creating a Bot

1. Mention @BoBB in Discord:
   ```
   @BoBB create a bot that helps with cooking
   ```

2. BoBB will ask for details (name, personality)

3. Follow the Discord Developer Portal setup instructions BoBB provides

4. Send the bot token to BoBB (mention or DM)

5. BoBB activates and starts your bot

## Project Structure

```
BoBB/
├── src/
│   ├── startup.ts          # Orchestrator entry point
│   ├── index.ts            # Main application logic
│   ├── config.ts           # Environment configuration
│   ├── opencode-manager.ts # OpenCode server lifecycle
│   ├── bot-manager.ts      # Discord bot management
│   ├── opencode-bridge.ts  # OpenCode SDK client
│   ├── message-queue.ts    # MCP → Discord message queue
│   └── activation-watcher.ts # Agent activation signals
├── tools/
│   ├── mcp_discord.py      # Discord send_message MCP tool
│   └── mcp_agent_manager.py # Agent CRUD MCP tools
├── agents/
│   ├── registry.json       # Agent registry (ports, tokens, status)
│   ├── .activations/       # Activation signal files
│   ├── .pending/           # Pending Discord messages
│   └── {agent-id}/         # Per-agent directories
│       ├── opencode.json
│       ├── AGENTS.md
│       └── .opencode/skills/
├── .opencode/
│   └── skills/
│       ├── create-bot/     # Bot creation workflow
│       └── respond-discord/ # Discord response skill
├── opencode.json           # BoBB's OpenCode config
├── AGENTS.md               # BoBB's persona and rules
└── package.json
```

## MCP Tools

### BoBB Tools (agent-manager)

| Tool | Description |
|------|-------------|
| `create_agent` | Create new agent with name and persona |
| `activate_agent` | Store Discord token for an agent |
| `start_agent` | Start an activated agent |
| `list_agents` | List all registered agents |
| `get_agent` | Get agent details by ID |
| `get_pending_agents` | Get agents awaiting tokens |
| `find_agent_by_name` | Search agents by name |

### Discord Tools (all agents)

| Tool | Description |
|------|-------------|
| `send_message` | Send message to Discord channel |

## Configuration

Environment variables (`.env`):

| Variable | Description | Default |
|----------|-------------|---------|
| `BOBB_DISCORD_TOKEN` | BoBB's Discord bot token | Required |
| `ANTHROPIC_API_KEY` | Anthropic API key | Required |
| `BOBB_OPENCODE_PORT` | BoBB's OpenCode server port | 4096 |
| `BOBB_CHILD_PORT_START` | Starting port for child agents | 4097 |
| `OPENCODE_COMMAND` | OpenCode CLI command | opencode |
| `OPENCODE_HEALTH_TIMEOUT` | Health check timeout (ms) | 30000 |

## Agent Lifecycle

```
1. CREATE
   User: "Create a bot called ChefBot"
   → create_agent(name, persona)
   → Creates agents/{id}/ directory
   → Status: pending_token

2. ACTIVATE
   User: "Here's the token: xxx.xxx.xxx"
   → activate_agent(id, token)
   → Stores token in registry
   → Status: ready_to_start

3. START
   → start_agent(id)
   → Writes activation file
   → ActivationWatcher detects
   → Starts OpenCode server
   → Starts Discord bot
   → Status: active

4. RESTART (on BoBB restart)
   → Reads registry.json
   → Starts all ready_to_start agents
```

## Development

### Adding a New MCP Tool

1. Add handler function in `tools/mcp_agent_manager.py`
2. Add tool schema to `tools/list` response
3. Add tool routing to `tools/call` handler
4. Document in `AGENTS.md`

### Debugging

Check OpenCode server health:
```bash
curl http://localhost:4096/api/session
```

View agent registry:
```bash
cat agents/registry.json
```

Check running processes:
```bash
ps aux | grep opencode
```

## License

MIT
