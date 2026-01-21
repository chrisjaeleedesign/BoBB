---
name: respond-discord
description: Format and send responses to Discord channels
---

# Respond Discord Skill

Use this skill when you need to send a message back to Discord.

## Guidelines

1. **Keep it concise** - Discord has a 2000 character limit per message
2. **Stay in character** - Match the agent's defined persona
3. **Use the tool** - Always use the `send_message` MCP tool to actually send the message
4. **Include context** - Reference what the user said when relevant

## Tool Usage

Use the `send_message` tool from the `discord` MCP server:

```
send_message({
  channel_id: "the channel ID from the incoming message",
  content: "your response text",
  reply_to: "optional message ID to reply to"
})
```

## Formatting Tips

- Use Discord markdown: **bold**, *italic*, `code`, ```code blocks```
- Keep responses focused and actionable
- Break long responses into logical sections
- Avoid excessive emojis unless the persona calls for it
