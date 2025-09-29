import datetime
import os
from zoneinfo import ZoneInfo
from google.adk.agents import Agent
from google.adk.tools.mcp_tool.mcp_toolset import (
    MCPToolset,
    StreamableHTTPConnectionParams,
)
from fastapi.openapi.models import OAuth2
from fastapi.openapi.models import OAuthFlowAuthorizationCode
from fastapi.openapi.models import OAuthFlows
from google.adk.auth import AuthCredential
from google.adk.auth import AuthCredentialTypes
from google.adk.auth import OAuth2Auth

apigeeUserMcpServer = (
    os.environ.get("APIGEE_TEMPLATER_MCP_URL", "http://localhost:8080") + "/user/mcp"
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
