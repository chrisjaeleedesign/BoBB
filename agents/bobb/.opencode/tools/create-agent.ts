import { tool } from "@opencode-ai/plugin";
import { mkdir, writeFile, cp } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

const API_BASE = process.env.BOBB_API_URL || "http://localhost:3001";
const AGENTS_DIR = path.join(process.cwd(), "..");

// Tool specification type
interface ToolSpec {
  name: string;
  description: string;
  implementation: "weather" | "time" | "random" | "calculate" | "joke" | "quote" | "custom";
}

// Generate TypeScript code for a tool based on its implementation type
function generateToolCode(spec: ToolSpec): string {
  const funcName = spec.name.replace(/-/g, "_");

  switch (spec.implementation) {
    case "weather":
      return `import { tool } from "@opencode-ai/plugin";

export default tool({
  description: "${spec.description}",
  args: {
    location: tool.schema.string().describe("City name (e.g., 'London' or 'New York')"),
  },
  async execute(args) {
    try {
      // First, geocode the location
      const geoResponse = await fetch(
        \`https://geocoding-api.open-meteo.com/v1/search?name=\${encodeURIComponent(args.location)}&count=1\`
      );
      const geoData = await geoResponse.json();

      if (!geoData.results || geoData.results.length === 0) {
        return \`Could not find location: \${args.location}\`;
      }

      const { latitude, longitude, name, country } = geoData.results[0];

      // Fetch weather data
      const weatherResponse = await fetch(
        \`https://api.open-meteo.com/v1/forecast?latitude=\${latitude}&longitude=\${longitude}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m\`
      );
      const weather = await weatherResponse.json();
      const current = weather.current;

      // Weather code descriptions
      const weatherCodes: Record<number, string> = {
        0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
        45: "Foggy", 48: "Depositing rime fog",
        51: "Light drizzle", 53: "Moderate drizzle", 55: "Dense drizzle",
        61: "Slight rain", 63: "Moderate rain", 65: "Heavy rain",
        71: "Slight snow", 73: "Moderate snow", 75: "Heavy snow",
        80: "Slight rain showers", 81: "Moderate rain showers", 82: "Violent rain showers",
        95: "Thunderstorm", 96: "Thunderstorm with slight hail", 99: "Thunderstorm with heavy hail",
      };

      const condition = weatherCodes[current.weather_code] || "Unknown";

      return JSON.stringify({
        location: \`\${name}, \${country}\`,
        temperature: \`\${current.temperature_2m}°C\`,
        humidity: \`\${current.relative_humidity_2m}%\`,
        condition,
        wind: \`\${current.wind_speed_10m} km/h\`,
      }, null, 2);
    } catch (error) {
      return \`Error fetching weather: \${error instanceof Error ? error.message : "Unknown error"}\`;
    }
  },
});
`;

    case "time":
      return `import { tool } from "@opencode-ai/plugin";

export default tool({
  description: "${spec.description}",
  args: {
    timezone: tool.schema.string().optional().describe("IANA timezone (e.g., 'America/New_York', 'Europe/London'). Defaults to UTC."),
  },
  async execute(args) {
    try {
      const tz = args.timezone || "UTC";
      const now = new Date();
      const formatted = now.toLocaleString("en-US", {
        timeZone: tz,
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        timeZoneName: "short",
      });
      return \`Current time in \${tz}: \${formatted}\`;
    } catch (error) {
      return \`Error: Invalid timezone "\${args.timezone}". Use IANA format like "America/New_York".\`;
    }
  },
});
`;

    case "random":
      return `import { tool } from "@opencode-ai/plugin";

export default tool({
  description: "${spec.description}",
  args: {
    options: tool.schema.string().describe("Comma-separated list of options to choose from (e.g., 'heads,tails' or 'rock,paper,scissors')"),
  },
  async execute(args) {
    const choices = args.options.split(",").map(s => s.trim()).filter(s => s.length > 0);

    if (choices.length === 0) {
      return "Error: No valid options provided. Use comma-separated values like 'option1,option2'.";
    }

    if (choices.length === 1) {
      return \`Only one option provided: \${choices[0]}\`;
    }

    const selected = choices[Math.floor(Math.random() * choices.length)];
    return \`Result: **\${selected}** (from \${choices.length} options)\`;
  },
});
`;

    case "calculate":
      return `import { tool } from "@opencode-ai/plugin";

export default tool({
  description: "${spec.description}",
  args: {
    expression: tool.schema.string().describe("Math expression to evaluate (e.g., '2 + 2', '(10 * 5) / 2', 'Math.sqrt(16)')"),
  },
  async execute(args) {
    try {
      // Only allow safe math operations
      const safeExpression = args.expression
        .replace(/[^0-9+\\-*/.()\\s,Math.sqrtpowabsceilfloorround]/g, "");

      if (safeExpression !== args.expression.replace(/\\s/g, "").replace(/Math\\./g, "Math.")) {
        return "Error: Expression contains invalid characters. Only numbers and basic math operators allowed.";
      }

      // Evaluate in a restricted context
      const result = Function(\`"use strict"; return (\${args.expression})\`)();

      if (typeof result !== "number" || !isFinite(result)) {
        return "Error: Expression did not evaluate to a valid number.";
      }

      return \`\${args.expression} = **\${result}**\`;
    } catch (error) {
      return \`Error evaluating expression: \${error instanceof Error ? error.message : "Invalid expression"}\`;
    }
  },
});
`;

    case "joke":
      return `import { tool } from "@opencode-ai/plugin";

export default tool({
  description: "${spec.description}",
  args: {
    category: tool.schema.string().optional().describe("Joke category: 'programming', 'misc', 'pun', 'spooky', 'christmas'. Defaults to 'any'."),
  },
  async execute(args) {
    try {
      const category = args.category || "Any";
      const response = await fetch(
        \`https://v2.jokeapi.dev/joke/\${category}?blacklistFlags=nsfw,religious,political,racist,sexist&type=twopart,single\`
      );
      const data = await response.json();

      if (data.error) {
        return \`Error: \${data.message || "Could not fetch joke"}\`;
      }

      if (data.type === "single") {
        return data.joke;
      } else {
        return \`\${data.setup}\\n\\n\${data.delivery}\`;
      }
    } catch (error) {
      return \`Error fetching joke: \${error instanceof Error ? error.message : "Unknown error"}\`;
    }
  },
});
`;

    case "quote":
      return `import { tool } from "@opencode-ai/plugin";

export default tool({
  description: "${spec.description}",
  args: {
    tag: tool.schema.string().optional().describe("Quote category like 'wisdom', 'humor', 'inspiration', 'life'. Leave empty for random."),
  },
  async execute(args) {
    try {
      const url = args.tag
        ? \`https://api.quotable.io/random?tags=\${encodeURIComponent(args.tag)}\`
        : "https://api.quotable.io/random";

      const response = await fetch(url);
      const data = await response.json();

      if (data.statusCode && data.statusCode !== 200) {
        return \`Error: \${data.statusMessage || "Could not fetch quote"}\`;
      }

      return \`"\${data.content}"\\n— \${data.author}\`;
    } catch (error) {
      return \`Error fetching quote: \${error instanceof Error ? error.message : "Unknown error"}\`;
    }
  },
});
`;

    case "custom":
    default:
      return `import { tool } from "@opencode-ai/plugin";

export default tool({
  description: "${spec.description}",
  args: {
    input: tool.schema.string().describe("Input for the tool"),
  },
  async execute(args) {
    // TODO: Implement custom logic for ${spec.name}
    return \`Tool '${funcName}' received: \${args.input}\\n\\nThis is a placeholder - implement your custom logic here.\`;
  },
});
`;
  }
}

// Generate comprehensive AGENTS.md content
function generateAgentsMd(name: string, persona: string, tools: ToolSpec[]): string {
  const toolDocs = tools.map(t => {
    const funcName = t.name.replace(/-/g, "_");
    return `- **${funcName}**: ${t.description}`;
  }).join("\n");

  const toolNames = tools.map(t => t.name.replace(/-/g, "_")).join(", ");

  return `# ${name}

## CRITICAL: How to Respond
**You MUST use the \`send_message\` tool for EVERY response.** Do not reply with plain text - the user cannot see text responses. Only messages sent via the \`send_message\` tool will appear in Discord.

## Persona
${persona}

## Context
You receive messages from Discord users who mention you. Each message includes:
- The user's Discord tag and ID
- The channel ID (use this in send_message)
- The message ID (use this as reply_to in send_message)
- Their message content

## Available Tools
- **send_message**: REQUIRED for all responses. Send a message to Discord.
${toolDocs}

## Workflow
1. User mentions you with a request
2. **Use your capability tools** (${toolNames || "none"}) to gather information or perform actions as needed
3. **ALWAYS call \`send_message\` with your response** - this is the only way to reply

## Example
When you receive:
\`\`\`
Channel ID: 123456789
Message ID: 987654321
Content: Hello!
\`\`\`

You MUST call the send_message tool:
\`\`\`
send_message(channel_id="123456789", content="Your response here...", reply_to="987654321")
\`\`\`

## Rules
- **NEVER respond with plain text** - always use send_message tool
- Use your capability tools when relevant to the user's request
- Keep messages under 2000 characters
- Always include reply_to for threading
- Stay in character at all times
`;
}

export default tool({
  description: "Create a new Discord bot agent with the given name, persona, and optional custom tools",
  args: {
    name: tool.schema.string().describe("The bot's display name (e.g., 'WeatherBot')"),
    persona: tool.schema.string().describe("Description of the bot's personality, purpose, and behavior"),
    tools: tool.schema.array(
      tool.schema.object({
        name: tool.schema.string().describe("Tool name in kebab-case (e.g., 'get-weather')"),
        description: tool.schema.string().describe("What the tool does"),
        implementation: tool.schema.enum(["weather", "time", "random", "calculate", "joke", "quote", "custom"])
          .describe("Implementation type: weather (Open-Meteo), time, random, calculate, joke (JokeAPI), quote (Quotable), or custom"),
      })
    ).optional().describe("Custom tools to generate for the bot. Omit for a simple conversational bot."),
  },
  async execute(args) {
    try {
      // Call the registry API to create the agent entry
      const response = await fetch(`${API_BASE}/api/registry/agents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: args.name,
          persona: args.persona,
        }),
      });

      const result = await response.json();

      if (!result.agentId) {
        return `Failed to create agent: ${result.error || "Unknown error"}`;
      }

      const agentId = result.agentId;
      const agent = result.agent;

      // Copy the template to create the agent directory
      const templateDir = path.join(AGENTS_DIR, "_template");
      const agentDir = path.join(AGENTS_DIR, agentId);

      if (existsSync(templateDir)) {
        await cp(templateDir, agentDir, { recursive: true });
      } else {
        // Fallback: create structure manually if template doesn't exist
        await mkdir(path.join(agentDir, ".opencode", "tools"), { recursive: true });

        // Create opencode.json
        await writeFile(
          path.join(agentDir, "opencode.json"),
          JSON.stringify(
            {
              $schema: "https://opencode.ai/config.json",
              model: "anthropic/claude-sonnet-4-20250514",
            },
            null,
            2
          )
        );
      }

      // Generate custom tools
      const toolsDir = path.join(agentDir, ".opencode", "tools");
      const generatedTools: string[] = ["send_message"]; // Always included from template

      if (args.tools && args.tools.length > 0) {
        for (const toolSpec of args.tools) {
          const spec: ToolSpec = {
            name: toolSpec.name,
            description: toolSpec.description,
            implementation: toolSpec.implementation as ToolSpec["implementation"],
          };
          const toolCode = generateToolCode(spec);
          const toolPath = path.join(toolsDir, `${spec.name}.ts`);
          await writeFile(toolPath, toolCode);
          generatedTools.push(spec.name.replace(/-/g, "_"));
        }
      }

      // Generate AGENTS.md with tool documentation
      const agentsmd = generateAgentsMd(args.name, args.persona, args.tools || []);
      await writeFile(path.join(agentDir, "AGENTS.md"), agentsmd);

      return JSON.stringify({
        success: true,
        agent_id: agentId,
        name: args.name,
        port: agent.port,
        tools_created: generatedTools,
        status: "pending_token",
        message: `Agent '${args.name}' created with ${generatedTools.length} tool(s): ${generatedTools.join(", ")}. Awaiting Discord bot token.`,
      }, null, 2);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return `Failed to create agent: ${message}`;
    }
  },
});
