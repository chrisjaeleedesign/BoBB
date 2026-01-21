# Platform Summary

## Vision

A Discord-based **ambient intelligence platform** that transforms a Discord server into a living, queryable knowledge base. Users create personalized AI agents that observe conversations, understand context, and take action—turning passive chat spaces into intelligent workspaces.

The core insight: Discord servers are already where communities think, plan, and collaborate. Valuable information flows through channels daily—decisions made, questions answered, ideas proposed—but it's lost in the scroll. We capture, structure, and activate that knowledge.

---

## Core Value Proposition: The Database

**The primary asset is a structured, semantic database of all Discord activity.**

Every message that flows through the connected server becomes a queryable record with rich metadata—embeddings for semantic search, extracted topics, intent classification, and flexible user-defined fields.

### What This Enables

**For Agents**
- Semantic search across all server history
- Context retrieval for relevant past discussions
- Pattern recognition (recurring questions, unresolved threads)
- Relationship mapping (who knows what, who talks to whom)

**For Users (Direct Query)**
- "What did we decide about the pricing model?"
- "Show me all unresolved questions from #product this week"
- "Who has context on the AWS migration?"
- "Summarize the discussion around feature X"

**For Analytics**
- Conversation velocity and health metrics
- Topic trends over time
- Knowledge gap identification
- Team communication patterns

---

## Agents

Autonomous AI entities that operate on top of the database.

### Agent Definition

- **Persona**: Name, avatar, personality, communication style
- **Purpose**: What the agent is designed to help with
- **Triggers**: Conditions that activate the agent
- **Capabilities**: What actions the agent can take
- **Memory**: Agent-specific context and learned preferences

### Trigger Types

| Trigger | Example |
|---------|---------|
| Mention | @AgentName activates |
| Keyword | "help", "question", specific terms |
| Schedule | Daily at 9am, weekly on Monday |
| Pattern | Unanswered question older than 2 hours |
| Event | New thread created, user joins |
| Query result | "When messages matching X exceed threshold Y" |

### Agent Actions

- **Respond**: Send a message in channel
- **Query**: Search the database for context
- **Summarize**: Condense a time range or thread
- **Create**: Make tasks, notes, or records in external systems
- **Alert**: Notify specific users or channels
- **Update metadata**: Tag messages with custom fields

---

## Current Focus: Bot Builder

The immediate product is a **bot builder**—a streamlined interface for creating and deploying Discord agents that feed the shared database.

### User Flow

1. **Create Agent**
   - Define persona (name, avatar, personality description)
   - Set purpose and behavioral guidelines
   - Configure triggers

2. **Connect Bot**
   - User creates bot application in Discord Developer Portal
   - User provides bot token to the platform
   - Platform validates and stores token securely

3. **Deploy to Server**
   - Platform generates OAuth2 invite URL
   - User authorizes bot to their server
   - Bot begins ingesting messages into the database
   - Agent responds based on trigger configuration

4. **Query & Refine**
   - User can query the database directly
   - Monitor agent activity
   - Refine triggers and persona based on real usage

### Why Manual Bot Creation?

Discord provides **no API for programmatic bot creation**. All bots must be manually created via the Developer Portal. This is intentional for abuse prevention and verification. We accept this constraint and optimize the onboarding experience around it.

---

## Architecture: Thin Clients + OpenCode Servers

The key architectural insight: **Discord bots are thin clients. Intelligence lives in OpenCode.**

### How It Works

```
┌─────────────────────────────────────────────────────────────┐
│                      DISCORD SERVER                         │
└─────────────────────────┬───────────────────────────────────┘
                          │ messages (Gateway WebSocket)
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                 THIN CLIENT (Discord Bot)                   │
│                                                             │
│   - Connects to Discord Gateway (WebSocket)                 │
│   - Listens for MESSAGE_CREATE and other events             │
│   - Evaluates triggers (mentions, keywords, patterns)       │
│   - Forwards relevant messages to OpenCode server via HTTP  │
│   - Sends responses back to Discord via REST API            │
│   - No LLM calls, no business logic, no decision-making     │
│                                                             │
└─────────────────────────┬───────────────────────────────────┘
                          │ HTTP (OpenCode SDK)
                          ▼
┌─────────────────────────────────────────────────────────────┐
│               OPENCODE SERVER (per agent)                   │
│                                                             │
│   Started via: opencode serve --port {port}                 │
│   Accessed via: @opencode-ai/sdk                            │
│                                                             │
│   /agents/{agent-name}/                                     │
│   ├── opencode.json      (agent config, model, permissions) │
│   ├── AGENTS.md          (persona + purpose + rules)        │
│   ├── .opencode/                                            │
│   │   ├── agents/        (subagent definitions)             │
│   │   └── skill/         (reusable prompt patterns)         │
│   │       └── {skill-name}/                                 │
│   │           └── SKILL.md                                  │
│   └── tools/             (custom MCP tools or scripts)      │
│       ├── query_db.py                                       │
│       ├── send_message.py                                   │
│       └── ...                                               │
│                                                             │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                        POSTGRES                             │
│                   (shared message database)                 │
└─────────────────────────────────────────────────────────────┘
```

### Why This Architecture

**Simplicity**: Discord bot code is trivial—just WebSocket event listening and HTTP calls. All complexity lives in OpenCode, which handles LLM orchestration natively.

**Flexibility**: Each agent gets its own OpenCode environment. Change behavior by editing markdown files (AGENTS.md, SKILL.md), not code.

**Standardization**: Tools and skills are templates. Bot builder duplicates them for each new agent, then customizes persona/purpose.

**Future-proof**: Local now, containerized later. Each agent directory becomes a container with OpenCode installed.

---

## Bot-to-Bot Communication

When multiple agents need to coordinate, **they communicate via Discord itself**.

### How It Works

Discord bots receive `MESSAGE_CREATE` events for ALL messages in channels they can see—including messages from other bots. By default, most bots ignore messages where `message.author.bot === true`, but our thin clients can be configured to process bot messages.

### Communication Patterns

**Direct Mention**: One agent can @mention another agent to trigger it
```
Agent A: @AgentB can you summarize the discussion above?
Agent B: [processes and responds]
```

**Designated Channel**: Agents can have a private `#agent-coordination` channel for inter-agent communication that users can optionally observe

**Message Tagging**: Agents can include structured metadata in their messages (e.g., in embeds or at the end of messages) that other agents can parse

### Why Discord for Inter-Agent Communication?

- **Transparency**: Users can observe agent coordination if desired
- **Simplicity**: No separate message bus or IPC mechanism needed
- **Debuggability**: All agent communication is logged in Discord
- **Natural**: Agents behave like team members communicating in channels

### Configuration

Each thin client has a flag: `processBotsMessages: boolean`
- `false` (default): Ignore messages from other bots
- `true`: Process messages from bots, enabling inter-agent communication

---

## OpenCode Integration Details

### Starting an OpenCode Server

```bash
# Start server for an agent
cd /agents/{agent-name}
opencode serve --port 4097
```

Or programmatically via SDK:
```typescript
import { createOpencode } from "@opencode-ai/sdk"

const { client, server } = await createOpencode({
  port: 4097,
  config: {
    model: "anthropic/claude-sonnet-4-20250514"
  }
})
```

### Sending Prompts to OpenCode

```typescript
import { createOpencodeClient } from "@opencode-ai/sdk"

const client = createOpencodeClient({
  baseUrl: "http://localhost:4097"
})

// Create or get session
const session = await client.session.create({
  body: { title: "Discord conversation" }
})

// Send message and get response
const result = await client.session.prompt({
  path: { id: session.id },
  body: {
    parts: [{ type: "text", text: userMessage }]
  }
})
```

### Agent Configuration (opencode.json)

```json
{
  "$schema": "https://opencode.ai/config.json",
  "model": "anthropic/claude-sonnet-4-20250514",
  "agent": {
    "discord-agent": {
      "description": "Responds to Discord messages with context from the database",
      "mode": "primary",
      "prompt": "{file:./AGENTS.md}",
      "tools": {
        "bash": false,
        "write": false,
        "edit": false
      },
      "permission": {
        "bash": "deny",
        "edit": "deny"
      }
    }
  },
  "mcp": {
    "database": {
      "command": "python",
      "args": ["tools/mcp_database.py"],
      "env": {
        "DATABASE_URL": "${DATABASE_URL}"
      }
    }
  }
}
```

### AGENTS.md Template

```markdown
# {Agent Name}

## Persona
{User-defined personality and communication style}

## Purpose
{What this agent is designed to help with}

## Rules
- Always query the database for context before responding
- Stay in character as defined in the persona
- Be concise in Discord messages (under 2000 characters)
- Use the send_message tool to respond to Discord
- {Additional user-defined rules}

## Available Tools
- `query_db`: Search the message database semantically
- `get_context`: Fetch recent messages from the current channel
- `send_message`: Send a response to Discord

## Response Format
When responding to Discord, always use the send_message tool with:
- channel_id: The channel to respond in
- content: Your response text
- reply_to: (optional) Message ID to reply to
```

### Skill Template Example (.opencode/skill/summarize/SKILL.md)

```markdown
---
description: Summarize a set of Discord messages
---

# Summarize Skill

When asked to summarize messages:

1. Query the database for the relevant time range or thread
2. Identify the key topics, decisions, and action items
3. Structure the summary as:
   - **Overview**: 1-2 sentence high-level summary
   - **Key Points**: Bullet list of main topics discussed
   - **Decisions Made**: Any conclusions or agreements
   - **Open Questions**: Unresolved items
4. Keep the summary concise (aim for <500 words)
5. Include message links for important references
```

---

## Bot Builder Creates

When a user creates a new agent, the bot builder:

1. **Creates agent directory**
   ```
   /agents/{agent-id}/
   ```

2. **Copies template files**
   - `opencode.json` (customized with model preferences)
   - `AGENTS.md` (customized with user's persona/purpose/triggers)
   - `.opencode/skill/` (standard skills: summarize, answer, extract)
   - `tools/` (standard MCP tools for database access)

3. **Stores configuration in database**
   - Bot token (encrypted)
   - Trigger rules
   - Agent metadata
   - OpenCode server port assignment

4. **Starts thin client process**
   - Spawns Discord bot with provided token
   - Connects to Discord Gateway
   - Begins listening for triggers

5. **Starts OpenCode server**
   - Spawns `opencode serve` for this agent
   - Points to agent directory
   - Assigns unique port
   - Ready to receive requests from thin client

---

## Thin Client Implementation

The thin client is intentionally minimal:

```typescript
// Pseudocode for thin client
import { Client, GatewayIntentBits } from 'discord.js'
import { createOpencodeClient } from '@opencode-ai/sdk'

const discord = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
})

const opencode = createOpencodeClient({
  baseUrl: `http://localhost:${AGENT_PORT}`
})

const config = loadAgentConfig() // triggers, processBotsMessages, etc.

discord.on('messageCreate', async (message) => {
  // Skip own messages
  if (message.author.id === discord.user.id) return
  
  // Skip bot messages unless configured to process them
  if (message.author.bot && !config.processBotsMessages) return
  
  // Check triggers
  if (!matchesTriggers(message, config.triggers)) return
  
  // Forward to OpenCode
  const response = await opencode.session.prompt({
    path: { id: sessionId },
    body: {
      parts: [{
        type: "text",
        text: formatDiscordMessage(message)
      }]
    }
  })
  
  // Response handling is done by OpenCode via send_message tool
})

discord.login(BOT_TOKEN)
```

### Required Discord Intents

For the thin client to work, the bot must request these Gateway Intents:

| Intent | Purpose |
|--------|---------|
| `GUILDS` | Access to guild/server information |
| `GUILD_MESSAGES` | Receive message events in server channels |
| `MESSAGE_CONTENT` | Access actual message content (privileged intent) |

**Note**: `MESSAGE_CONTENT` is a privileged intent. Bots in >100 servers must be verified and approved for this intent via Discord Developer Portal.

---

## Technical Context

- **Database**: Postgres (shared across all agents)
- **Scope**: Single Discord server
- **Bot tokens**: User-provided, stored encrypted
- **Runtime**: Local for now, containerized later
- **OpenCode**: One server process per agent, each on unique port
- **Communication**: Thin clients ↔ OpenCode via HTTP, Agents ↔ Agents via Discord

---

## Process Management (Local)

For local development, we need to manage multiple processes:

```
Platform Manager
├── Thin Client 1 (Discord bot process)
├── OpenCode Server 1 (port 4097)
├── Thin Client 2 (Discord bot process)
├── OpenCode Server 2 (port 4098)
└── ...
```

Options for local process management:
- **PM2**: Process manager for Node.js, handles restarts and logging
- **Simple spawn**: Node.js child_process for lightweight management
- **Docker Compose**: Even locally, can use containers for isolation

---

## Open Questions

- **Naming**: Platform needs a name
- **Port allocation**: How to assign and track OpenCode server ports?
- **Session management**: One long-running session per agent, or new session per conversation?
- **Error handling**: What happens when OpenCode server crashes?
- **Scaling**: When do we containerize? What's the trigger?