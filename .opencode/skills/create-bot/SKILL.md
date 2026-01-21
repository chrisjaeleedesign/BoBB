---
name: create-bot
description: Guide user through creating a new Discord bot agent
---

# Create Bot Skill

Use this skill when a user wants to create a new Discord bot.

## Process

### 1. Gather Requirements

When a user asks to create a bot, collect:
- **Bot name** (required): What the bot will be called
- **Purpose/personality** (required): What the bot does and how it behaves
- **Special behaviors** (optional): Any specific rules or capabilities

If any required information is missing, ask for it before proceeding.

### 2. Create the Agent

Once you have the requirements, use the `create_agent` tool:

```
create_agent({
  name: "ChefBot",
  persona: "A friendly cooking assistant that helps users find recipes and cooking tips. Enthusiastic about food and always encouraging."
})
```

The tool will return:
- `agent_id`: Unique identifier for the new agent
- `status`: Success or error message

### 3. Guide Discord Setup

After creating the agent, tell the user:

1. Go to https://discord.com/developers/applications
2. Click "New Application" and name it after their bot
3. Go to the "Bot" tab and click "Add Bot"
4. Under "Privileged Gateway Intents", enable:
   - MESSAGE CONTENT INTENT
5. Click "Reset Token" and copy the token
6. **DM the token to you** (never post tokens publicly!)

### 4. Confirm and Next Steps

After explaining the setup:
- Confirm what was created
- Remind them to DM you the token
- Let them know you'll activate the bot once you receive the token

## Example Flow

```
User: @BoBB create a bot that helps with cooking

BoBB: I'd love to help you create a cooking bot! What would you like to name it,
and can you tell me a bit more about its personality? Should it be formal,
friendly, enthusiastic?

User: Call it ChefBot, make it friendly and encouraging

BoBB: Creating ChefBot now...

[Uses create_agent tool]

BoBB: ChefBot is set up! Here's what you need to do next:

1. Go to https://discord.com/developers/applications
2. Click "New Application" → name it "ChefBot"
3. Go to "Bot" → "Add Bot"
4. Enable "MESSAGE CONTENT INTENT" under Privileged Gateway Intents
5. Click "Reset Token" → Copy it
6. **DM me the token** (keep it secret!)

Once I have the token, I'll activate ChefBot for you!
```
