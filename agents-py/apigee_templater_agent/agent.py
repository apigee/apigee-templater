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

apigeeTemplaterMcpServer = (
    os.environ.get("APIGEE_TEMPLATER_MCP_URL", "http://localhost:8080") + "/mcp"
)

auth_scheme = OAuth2(
    flows=OAuthFlows(
        authorizationCode=OAuthFlowAuthorizationCode(
            authorizationUrl="https://accounts.google.com/o/oauth2/auth",
            tokenUrl="https://oauth2.googleapis.com/token",
            scopes={"https://www.googleapis.com/auth/cloud-platform": "cloud scope"},
        )
    )
)
auth_credential = AuthCredential(
    auth_type=AuthCredentialTypes.OAUTH2,
    oauth2=OAuth2Auth(
        client_id=os.environ.get("GOOGLE_CLIENT_ID", ""),
        client_secret=os.environ.get("GOOGLE_CLIENT_SECRET", ""),
    ),
)

root_agent = Agent(
    name="apigee_templater_agent",
    model="gemini-2.5-flash",
    description=("Agent to help users create and manage Apigee API proxies."),
    instruction=(
        "You are a helpful agent who can help users create and manage Apigee API proxies."
    ),
    tools=[
        MCPToolset(
            connection_params=StreamableHTTPConnectionParams(
                url=apigeeTemplaterMcpServer,
            )
        )
    ],
)
