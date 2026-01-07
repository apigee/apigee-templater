import datetime
import os
from zoneinfo import ZoneInfo

from fastapi.openapi.models import OAuth2, OAuthFlowAuthorizationCode, OAuthFlows
from google.adk.agents import Agent
from google.adk.auth import AuthCredential, AuthCredentialTypes, OAuth2Auth
from google.adk.tools.mcp_tool.mcp_toolset import (
    MCPToolset,
    StreamableHTTPConnectionParams,
)

apigeeUserMcpServer = (
    os.environ.get("APIGEE_USER_MCP_URL", "http://localhost:8080") + "/mcp"
)

root_agent = Agent(
    name="apigee_user_agent",
    model="gemini-2.5-flash",
    description=(
        "Agent to help users create and manage Apigee API apps & subscriptions."
    ),
    instruction=(
        "You are a helpful agent who can help users create and manage Apigee apps & subscriptions."
    ),
    tools=[
        MCPToolset(
            connection_params=StreamableHTTPConnectionParams(
                url=apigeeUserMcpServer,
            ),
        )
    ],
)
