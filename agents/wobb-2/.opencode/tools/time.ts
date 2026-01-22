import { tool } from "@opencode-ai/plugin";

export default tool({
  description: "Get the current time for a given location",
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
      return `Current time in ${tz}: ${formatted}`;
    } catch (error) {
      return `Error: Invalid timezone "${args.timezone}". Use IANA format like "America/New_York".`;
    }
  },
});
