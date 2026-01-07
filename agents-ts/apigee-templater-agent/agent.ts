import {
  FunctionTool,
  MCPToolset,
  StreamableHTTPConnectionParams,
  LlmAgent,
} from "@google/adk";
import { z } from "zod";

let apigeeTemplaterMcpUrl = process.env.APIGEE_TEMPLATER_MCP_URL;
if (!apigeeTemplaterMcpUrl) apigeeTemplaterMcpUrl = "http://localhost:8080/mcp";

let connectionParams: StreamableHTTPConnectionParams = {
  type: "StreamableHTTPConnectionParams",
  url: apigeeTemplaterMcpUrl,
};

export const rootAgent = new LlmAgent({
  name: "apigee_templater_agent",
  model: "gemini-2.5-flash",
  description: "Helps the user build APIs from features and templates.",
  instruction: `You are a helpful assistant that helps the user query and build Apigee API proxy templates using features.`,
  tools: [new MCPToolset(connectionParams)],
});
