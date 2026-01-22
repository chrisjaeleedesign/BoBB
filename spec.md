# BoBB Technical Specification

## Vision

BoBB (Bot Builder Bot) is a Discord bot that creates other Discord bots. Users interact with BoBB through natural conversation to define bot personas, and BoBB handles the technical setup. Each created bot runs as an independent AI agent powered by OpenCode.

---

## Architecture

```
Discord User
     │
     │ @BoBB or @ChildBot
     ▼
┌─────────────────────────────────────────────────────────────┐
│  Main Process (src/index.ts)                                │
│                                                             │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐ │
│  │  HTTP API       │  │  BotManager     │  │  OpenCode   │ │
│  │  (port 3456)    │  │  (Discord.js)   │  │  Manager    │ │
│  └────────┬────────┘  └────────┬────────┘  └──────┬──────┘ │
│           │                    │                   │        │
└───────────┼────────────────────┼───────────────────┼────────┘
            │                    │                   │
            │    ┌───────────────┴───────────────┐   │
            │    │                               │   │
            ▼    ▼                               ▼   ▼
     ┌─────────────────┐                 ┌─────────────────┐
     │ BoBB Discord    │                 │ Child Discord   │
     │ Client          │                 │ Clients         │
     └────────┬────────┘                 └────────┬────────┘
              │                                   │
              ▼                                   ▼
     ┌─────────────────┐                 ┌─────────────────┐
     │ BoBB OpenCode   │                 │ Child OpenCode  │
     │ Server          │                 │ Servers         │
     │ (port 4096)     │                 │ (port 4097+)    │
     └─────────────────┘                 └─────────────────┘
```

### Key Design Decisions

1. **Thin Discord Clients**: Discord bots are minimal—they receive messages, forward to OpenCode, and send responses. No business logic.

2. **HTTP API for Tools**: Instead of MCP tools, agents call HTTP endpoints to send messages and manage the registry. This simplifies tool definition and debugging.

3. **File-Based Registry**: Agent configuration stored in `registry.json`. Simple, no database required.

4. **One OpenCode Server Per Bot**: Each bot gets its own OpenCode server with isolated context and persona.

---

## Components

### BoBB (The Bot Builder)

The primary bot that users interact with to create other bots.

**Capabilities:**
- Create new agent configurations
- Guide users through Discord Developer Portal setup
- Store Discord tokens and activate bots
- List and manage existing agents

**Location:** `agents/bobb/AGENTS.md`

### Child Agents

Bots created by BoBB. Each has:
- Unique persona defined in `AGENTS.md`
- Own Discord bot token
- Own OpenCode server on dedicated port
- Access to `send_message` and `list_members` tools

**Template:** `agents/_template/AGENTS.md`

### HTTP API Server

Runs on port 3456. Provides tools for agents via HTTP endpoints.

**Discord Endpoints:**
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/discord/send` | POST | Send message to channel |
| `/api/discord/members` | GET | List available bots for tagging |

**Registry Endpoints:**
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/registry/agents` | GET | List all agents |
| `/api/registry/agents` | POST | Create new agent |
| `/api/registry/agents/:id` | GET | Get agent details |
| `/api/registry/agents/:id` | PUT | Update agent (token/status) |
| `/api/registry/agents/pending` | GET | Agents awaiting tokens |
| `/api/registry/agents/search` | GET | Search by name |

**Health:**
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Server status |

### Registry

JSON file storing agent configurations.

**Location:** `registry.json` (gitignored, contains tokens)
**Template:** `registry.example.json`

**Schema:**
```json
{
  "agents": {
    "agent-id": {
      "id": "agent-id",
      "name": "Display Name",
      "persona": "Agent personality description...",
      "port": 4097,
      "status": "active",
      "token": "discord-bot-token",
      "discord_user_id": "123456789",
      "created_at": "2026-01-01T00:00:00.000Z",
      "activated_at": "2026-01-01T00:00:00.000Z"
    }
  },
  "next_port": 4098
}
```

**Agent Statuses:**
| Status | Description |
|--------|-------------|
| `pending_token` | Created, awaiting Discord token |
| `ready_to_start` | Has token, ready to launch |
| `active` | Running |

---

## Bot-to-Bot Communication

Bots can interact with each other through Discord.

### Self-Identity

Each bot knows its own identity via the message context:
```
[Discord Channel 123456]
You are: Biden Bot (@biden_bot#1234)
From: trump_bot#5678 (User ID: 999) [BOT] (Bot Name: Trump Bot)
...
```

This prevents bots from tagging themselves.

### Tagging Other Bots

Use the `mention_bots` parameter in `send_message`:
```json
{
  "channel_id": "123456",
  "content": "What do you think about this?",
  "mention_bots": ["Biden Bot"]
}
```

The API resolves bot names to Discord user IDs and adds proper @mentions.

### Channel History

Bots receive recent channel history to understand conversation context:
```
--- Recent Channel History ---
[2m ago] Biden Bot [BOT]: I think we should focus on workers.
[3m ago] Trump Bot [BOT]: Nobody knows trade better than me.
[5m ago] chris#1234: @Trump @Biden debate about trade policy
--- End History ---
```

### Conversation Stopping

**Natural Stopping**: Bots use vibes-based prompting to recognize when conversations should end:
- Topic has been addressed
- Points are being repeated
- Other bot is wrapping up

**Human Control**: Users can say "stop", "enough", or "quiet" in the channel to end bot exchanges immediately.

### Loop Prevention

- Bots only respond to other bots when explicitly @mentioned
- Bots never tag themselves
- Bots can see conversation history to avoid redundant responses

---

## Agent Lifecycle

```
1. CREATE
   User: "@BoBB create a chef bot"
   → POST /api/registry/agents
   → Creates agents/{id}/AGENTS.md from template
   → Status: pending_token

2. ACTIVATE
   User sends Discord token via DM
   → PUT /api/registry/agents/:id {token}
   → Stores token in registry
   → Status: ready_to_start

3. START
   → Writes activation signal file
   → ActivationWatcher detects signal
   → Starts OpenCode server on assigned port
   → Starts Discord client with token
   → Status: active

4. ON RESTART
   → Reads registry.json
   → Starts all ready_to_start/active agents
   → Resumes normal operation
```

---

## Message Context Format

When a bot receives a Discord message, it's formatted as:

```
[Discord Channel 123456789]
You are: Chef Bot (@chefbot#1234)
From: username#5678 (User ID: 111222333)
Channel ID: 123456789
Message ID: 987654321 (use this as reply_to)
Is From Bot: false

--- Recent Channel History ---
[5m ago] username#5678: What should I cook tonight?
[3m ago] Chef Bot [BOT]: How about pasta? What ingredients do you have?
--- End History ---

I have chicken, tomatoes, and garlic.
```

**Fields:**
- **You are**: Bot's own identity (name + Discord tag)
- **From**: Message author with bot indicator if applicable
- **Channel/Message ID**: For replying
- **Is From Bot**: Whether sender is a bot
- **Recent History**: Last 10 messages for context
- **Content**: The actual message

---

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `BOBB_DISCORD_TOKEN` | BoBB's Discord bot token | Required |
| `ANTHROPIC_API_KEY` | Anthropic API key | Required |
| `BOBB_OPENCODE_PORT` | BoBB's OpenCode port | 4096 |
| `BOBB_CHILD_PORT_START` | Starting port for children | 4097 |
| `OPENCODE_COMMAND` | OpenCode CLI command | opencode |
| `OPENCODE_HEALTH_TIMEOUT` | Health check timeout (ms) | 30000 |

### OpenCode Configuration

Each agent has an `opencode.json` in its directory:
```json
{
  "$schema": "https://opencode.ai/config.json",
  "model": "anthropic/claude-sonnet-4-20250514"
}
```

### Agent Persona (AGENTS.md)

Defines the bot's personality, rules, and tool instructions. See `agents/_template/AGENTS.md` for the full template.

---

## File Structure

```
BoBB/
├── src/
│   ├── startup.ts          # Orchestrator entry point
│   ├── index.ts            # Main application logic
│   ├── config.ts           # Environment configuration
│   ├── opencode-manager.ts # OpenCode server lifecycle
│   ├── opencode-bridge.ts  # OpenCode SDK client wrapper
│   ├── bot-manager.ts      # Discord bot management
│   ├── activation-watcher.ts # Watches for agent activation signals
│   └── api/
│       ├── index.ts        # API exports
│       ├── server.ts       # HTTP server (Bun.serve)
│       ├── discord.ts      # Discord message sending
│       └── registry.ts     # Agent CRUD operations
├── agents/
│   ├── bobb/
│   │   └── AGENTS.md       # BoBB persona + tools
│   ├── _template/
│   │   └── AGENTS.md       # Template for new bots
│   └── {agent-id}/
│       └── AGENTS.md       # Created bot personas
├── registry.json           # Agent registry (gitignored)
├── registry.example.json   # Registry template
├── opencode.json           # BoBB's OpenCode config
├── package.json
├── tsconfig.json
└── .env                    # Environment variables (gitignored)
```

---

## Discord Requirements

### Intents

Bots require these Gateway Intents:
| Intent | Purpose |
|--------|---------|
| `GUILDS` | Access guild/server info |
| `GUILD_MESSAGES` | Receive message events |
| `MESSAGE_CONTENT` | Access message content (privileged) |
| `DIRECT_MESSAGES` | Receive DMs (for token submission) |

**Note**: `MESSAGE_CONTENT` is privileged. Bots in 100+ servers need verification.

### Bot Creation

Discord provides no API for programmatic bot creation. Users must:
1. Create application at Discord Developer Portal
2. Create bot under application
3. Generate and copy token
4. Send token to BoBB

---

## Security

- **Tokens in registry.json**: File is gitignored. Use `registry.example.json` as template.
- **Token submission**: Users should DM tokens to BoBB, not post in public channels.
- **No token logging**: Tokens are stored but never logged.

---

## Future Considerations

- **Database**: Could add Postgres for semantic search and analytics
- **Containerization**: Each agent could run in its own container
- **Triggers**: Could add keyword/schedule triggers beyond @mentions
- **Web UI**: Could add dashboard for agent management
