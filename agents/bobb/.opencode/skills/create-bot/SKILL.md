---
name: create-bot
description: Guide user through creating a new Discord bot agent with custom tools
---

# Create Bot Skill

Use this skill when a user wants to create a new Discord bot.

## Process

### 1. Gather Requirements

When a user asks to create a bot, collect:
- **Bot name** (required): What the bot will be called
- **Purpose** (required): What the bot should DO (not just what it is)
- **Personality** (required): How the bot should communicate

Ask probing questions to understand capabilities:
- "What tasks should this bot help with?"
- "Does it need to fetch external data (weather, jokes, quotes)?"
- "Should it do calculations, random picks, or time-related things?"

### 2. Infer Required Tools

Based on the user's needs, determine what tools the bot requires beyond `send_message`.

**Available tool types:**

| Need | Tool | What it does |
|------|------|--------------|
| Weather info | `get-weather` | Fetches weather from Open-Meteo (free, no API key) |
| Current time | `get-time` | Returns current time, supports timezones |
| Random choice | `random-choice` | Picks randomly from options (coin flip, dice, etc.) |
| Math/calculations | `calculate` | Evaluates math expressions |
| Jokes | `get-joke` | Fetches random jokes from JokeAPI (free) |
| Quotes | `get-quote` | Fetches random quotes from Quotable (free) |

### 3. Present the Plan

Before creating anything, present a structured plan to the user:

```
**Bot Creation Plan**

**Name:** {name}
**Personality:** {brief description}

**Tools I'll create:**
- `send_message` - Reply in Discord (always included)
- `{tool-name}` - {description}
- `{tool-name}` - {description}

Reply **yes** to proceed, or tell me what to change!
```

Keep the plan under 2000 characters for Discord.

### 4. Wait for Approval

**Do not proceed until the user explicitly approves.** Look for:
- "yes"
- "looks good"
- "go ahead"
- "create it"

If the user wants changes, update the plan and present it again.

### 5. Create the Agent with Tools

Once approved, use `create_agent` with the tools array:

```
create_agent({
  name: "WeatherBot",
  persona: "A cheerful weather assistant that helps users check the forecast.",
  tools: [
    {
      name: "get-weather",
      description: "Fetch current weather for a location",
      implementation: "weather"
    }
  ]
})
```

**Implementation types:**
- `weather` - Open-Meteo API
- `time` - Current time with timezone support
- `random` - Random selection from options
- `calculate` - Math expression evaluation
- `joke` - JokeAPI
- `quote` - Quotable API
- `custom` - Placeholder for manual implementation

### 6. Guide Discord Setup

After creating the agent, tell the user:

1. Go to https://discord.com/developers/applications
2. Click "New Application" and name it after their bot
3. Go to the "Bot" tab and click "Add Bot"
4. Under "Privileged Gateway Intents", enable:
   - MESSAGE CONTENT INTENT
5. Click "Reset Token" and copy the token
6. Send the token to BoBB (mention me with it, or DM it)

### 7. Receive Token and Activate Bot

When the user provides a token:
1. Find the agent using `find_agent_by_name` or `get_pending_agents`
2. Use `activate_agent` to store the token and start the bot
3. Confirm the bot is now online

## Example Flow

```
User: @BoBB I want a bot that tells me the weather and can flip coins

BoBB: I can help with that! A few questions:
- What should I call this bot?
- What personality - casual, professional, enthusiastic?

User: Call it SkyBot, make it friendly and casual

BoBB: Here's my plan:

**Bot Creation Plan**

**Name:** SkyBot
**Personality:** Friendly and casual weather companion

**Tools I'll create:**
- `send_message` - Reply in Discord (always included)
- `get_weather` - Fetch weather for any location (uses Open-Meteo, free)
- `random_choice` - Pick randomly from options (for coin flips)

Reply **yes** to create SkyBot!

User: yes

BoBB: Creating SkyBot now...

[Uses create_agent tool with tools array]

BoBB: SkyBot is ready with 3 tools! Here's what to do next:

1. Go to https://discord.com/developers/applications
2. Click "New Application" → name it "SkyBot"
3. Go to "Bot" → "Add Bot"
4. Enable "MESSAGE CONTENT INTENT" under Privileged Gateway Intents
5. Click "Reset Token" → Copy it
6. Send it to me (mention me or DM)

User: Here's the token: MTQ2...xxx

BoBB: Got it! Activating SkyBot now...

[Uses activate_agent tool]

BoBB: SkyBot is online! Mention @SkyBot to ask about the weather or flip a coin.
```

## Simple Bot (No Custom Tools)

If a user just wants a conversational bot with no special capabilities:

```
User: Create a bot that's just a friendly chat companion

BoBB: Here's my plan:

**Bot Creation Plan**

**Name:** ChatBuddy
**Personality:** Warm and friendly chat companion

**Tools:**
- `send_message` - Reply in Discord (only tool needed)

This bot will just chat - no special data fetching needed.

Reply **yes** to create ChatBuddy!
```
