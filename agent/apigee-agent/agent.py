import datetime
from zoneinfo import ZoneInfo
from google.adk.agents import Agent
from google.adk.tools.mcp_tool.mcp_toolset import MCPToolset, StreamableHTTPConnectionParams

root_agent = Agent(
    name="apigee_agent",
    model="gemini-2.5-flash",
    description=(
        "Agent to help users create and manage Apigee API proxies."
    ),
    instruction=(
        "You are a helpful agent who can help users create and manage Apigee API proxies."
    ),
    tools=[MCPToolset(
        connection_params=StreamableHTTPConnectionParams(
            url="http://localhost:8080/mcp",
            headers={"Authorization": "Bearer test_token"}
        )
    )],
)
