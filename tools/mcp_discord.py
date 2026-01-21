#!/usr/bin/env python3
"""
MCP Discord Tool - Provides Discord messaging capabilities to OpenCode agents.

This MCP server exposes a send_message tool that allows agents to send messages
back to Discord channels. The actual sending is handled by the thin client
which polls for pending messages.
"""

import json
import os
import sys
from datetime import datetime
from pathlib import Path

# Pending messages are written to a file that the thin client watches
PENDING_DIR = Path(__file__).parent.parent / "agents" / ".pending"


def ensure_pending_dir():
    """Ensure the pending messages directory exists."""
    PENDING_DIR.mkdir(parents=True, exist_ok=True)


def handle_send_message(channel_id: str, content: str, reply_to: str | None = None) -> dict:
    """
    Queue a message to be sent to Discord.

    Args:
        channel_id: The Discord channel ID to send to
        content: The message content
        reply_to: Optional message ID to reply to

    Returns:
        Status dict with success/error information
    """
    ensure_pending_dir()

    # Create a unique filename for this message
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
    filename = PENDING_DIR / f"msg_{timestamp}.json"

    message = {
        "type": "send_message",
        "channel_id": channel_id,
        "content": content,
        "reply_to": reply_to,
        "timestamp": datetime.now().isoformat(),
    }

    with open(filename, "w") as f:
        json.dump(message, f, indent=2)

    return {
        "success": True,
        "message": f"Message queued for channel {channel_id}",
        "queue_file": str(filename),
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
                "name": "discord-mcp",
                "version": "0.1.0"
            }
        }

    elif method == "tools/list":
        return {
            "tools": [
                {
                    "name": "send_message",
                    "description": "Send a message to a Discord channel",
                    "inputSchema": {
                        "type": "object",
                        "properties": {
                            "channel_id": {
                                "type": "string",
                                "description": "The Discord channel ID to send the message to"
                            },
                            "content": {
                                "type": "string",
                                "description": "The message content (max 2000 characters)"
                            },
                            "reply_to": {
                                "type": "string",
                                "description": "Optional: Message ID to reply to"
                            }
                        },
                        "required": ["channel_id", "content"]
                    }
                }
            ]
        }

    elif method == "tools/call":
        params = request.get("params", {})
        tool_name = params.get("name")
        arguments = params.get("arguments", {})

        if tool_name == "send_message":
            result = handle_send_message(
                channel_id=arguments.get("channel_id"),
                content=arguments.get("content"),
                reply_to=arguments.get("reply_to")
            )
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
                    "message": f"Unknown tool: {tool_name}"
                }
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
    # Read JSON-RPC messages from stdin, write responses to stdout
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
