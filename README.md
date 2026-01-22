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
│  - HTTP API for tool invocation                 │
└─────────────────────┬───────────────────────────┘
                      │ HTTP (OpenCode SDK)
                      ▼
┌─────────────────────────────────────────────────┐
│  OpenCode Server (port 4096)                    │
│  - Claude Sonnet model                          │
│  - Tools via HTTP API (port 3456)               │
│  - BoBB persona with bot-creation abilities     │
└─────────────────────────────────────────────────┘
                      │
                      │ Creates child agents
                      ▼
┌─────────────────────────────────────────────────┐
│  Child Agent (e.g., ChefBot)                    │
│  - Own Discord bot token                        │
│  - Own OpenCode server (port 4097+)             │
│  - Custom persona from AGENTS.md               │
│  - HTTP tools for Discord messaging             │
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

4. Create registry from template:
   ```bash
   cp registry.example.json registry.json
   ```
   Note: `registry.json` contains Discord tokens and is gitignored.

5. Start BoBB:
   ```bash
   bun run start
   ```

This single command:
- Starts the HTTP API server on port 3456
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

4. Send the bot token to BoBB (via DM for security)

5. BoBB activates and starts your bot

## Bot-to-Bot Interaction

Bots can communicate with each other:

- **Tagging**: Use `@BotName` in messages to invoke other bots
- **Debates**: Ask bots to debate or discuss topics with each other
- **Self-Awareness**: Bots know their own identity and won't tag themselves
- **Natural Stopping**: Bots use conversation context to end exchanges naturally

Example:
```
@TrumpBot debate climate change with @BidenBot
```

### Human Control

- Say "stop", "enough", or "quiet" in the channel to end bot exchanges
- Restart BoBB to fully reset all bot states

## Project Structure

```
BoBB/
├── src/
│   ├── startup.ts          # Orchestrator entry point
│   ├── index.ts            # Main application logic
│   ├── config.ts           # Environment configuration
│   ├── opencode-manager.ts # OpenCode server lifecycle
│   ├── opencode-bridge.ts  # OpenCode SDK client
│   ├── bot-manager.ts      # Discord bot management
│   ├── activation-watcher.ts # Agent activation signals
│   └── api/
│       ├── index.ts        # API exports
│       ├── server.ts       # HTTP API server
│       ├── discord.ts      # Discord API (send_message, list_members)
│       └── registry.ts     # Agent registry CRUD
├── agents/
│   ├── bobb/               # BoBB's persona
│   │   └── AGENTS.md       # BoBB instructions
│   ├── _template/          # Template for new bots
│   │   └── AGENTS.md       # Template instructions
│   └── {agent-id}/         # Per-agent directories
│       └── AGENTS.md       # Agent persona
├── registry.json           # Agent registry (gitignored, contains tokens)
├── registry.example.json   # Registry template
├── opencode.json           # BoBB's OpenCode config
└── package.json
```

## HTTP API

The API server runs on port 3456 and provides tools for agents.

### Discord Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/discord/send` | POST | Send message to Discord channel |
| `/api/discord/members` | GET | List available bots for tagging |

**Send Message Request:**
```json
{
  "channel_id": "123456789",
  "content": "Hello!",
  "reply_to": "987654321",
  "mention_bots": ["Bot Name"]
}
```

### Registry Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/registry/agents` | GET | List all agents |
| `/api/registry/agents` | POST | Create new agent |
| `/api/registry/agents/:id` | GET | Get agent by ID |
| `/api/registry/agents/:id` | PUT | Update agent (token/status) |
| `/api/registry/agents/pending` | GET | Get agents awaiting tokens |
| `/api/registry/agents/search?name=X` | GET | Search agents by name |

### Health Check

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Server health status |

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
   → POST /api/registry/agents
   → Creates agents/{id}/ directory with AGENTS.md
   → Status: pending_token

2. ACTIVATE
   User: "Here's the token: xxx.xxx.xxx"
   → PUT /api/registry/agents/:id with token
   → Stores token in registry
   → Status: ready_to_start

3. START
   → Writes activation file
   → ActivationWatcher detects
   → Starts OpenCode server
   → Starts Discord bot
   → Status: active

4. RESTART (on BoBB restart)
   → Reads registry.json
   → Starts all ready_to_start agents
```

## Message Context

When a bot receives a message, it gets rich context:

```
[Discord Channel 123456]
You are: ChefBot (@ChefBot#1234)
From: username#5678 (User ID: 123)
Channel ID: 123456
Message ID: 987654321 (use this as reply_to)
Is From Bot: false

--- Recent Channel History ---
[2m ago] OtherBot [BOT]: Previous message...
[5m ago] username#5678: Earlier message...
--- End History ---

Hey ChefBot, what should I cook?
```

This context includes:
- **Self-identity**: Bot knows its own name and Discord tag
- **Message metadata**: Channel, message IDs for replies
- **Bot indicator**: Whether the sender is a bot
- **Conversation history**: Recent messages for context

## Development

### Debugging

Check API server health:
```bash
curl http://localhost:3456/api/health
```

Check OpenCode server:
```bash
curl http://localhost:4096/api/session
```

View agent registry:
```bash
cat registry.json | jq
```

Check running processes:
```bash
ps aux | grep opencode
```

### Adding New API Endpoints

1. Add handler in `src/api/server.ts`
2. If needed, add business logic to `src/api/discord.ts` or `src/api/registry.ts`
3. Update tool instructions in `agents/bobb/AGENTS.md`

## Security Notes

- **registry.json** contains Discord tokens - it's gitignored by default
- Use **registry.example.json** as a template
- Bot tokens should be sent via DM to BoBB, not in public channels
- Never commit tokens to version control

## License

MIT
