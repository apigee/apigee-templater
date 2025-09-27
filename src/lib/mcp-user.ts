import fs from "fs";
import express from "express";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { any, z } from "zod";
import * as YAML from "yaml";
import { ApigeeConverter } from "./converter.js";
import { Proxy, Template, Feature } from "./interfaces.js";
import { ApigeeTemplaterService } from "./service.js";

export class McpUserService {
  // Map to store transports by session ID
  public transports: { [sessionId: string]: StreamableHTTPServerTransport } =
    {};
  public converter: ApigeeConverter;
  public apigeeService: ApigeeTemplaterService;

  constructor(converter: ApigeeConverter, service: ApigeeTemplaterService) {
    this.converter = converter;
    this.apigeeService = service;
  }

  public handleSessionRequest = async (
    req: express.Request,
    res: express.Response,
  ) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (!sessionId || !this.transports[sessionId]) {
      res.status(400).send("Invalid or missing session ID");
      return;
    }

    const transport = this.transports[sessionId];
    await transport.handleRequest(req, res);
  };

  public mcppost = async (req: express.Request, res: express.Response) => {
    // Check for existing session ID
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    let transport: StreamableHTTPServerTransport;

    if (sessionId && this.transports[sessionId]) {
      // Reuse existing transport
      transport = this.transports[sessionId];
    } else if (!sessionId && isInitializeRequest(req.body)) {
      // New initialization request
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sessionId) => {
          // Store the transport by session ID
          this.transports[sessionId] = transport;
        },
        // DNS rebinding protection is disabled by default for backwards compatibility. If you are running this server
        // locally, make sure to set:
        enableDnsRebindingProtection: false,
        allowedHosts: ["127.0.0.1", "localhost:8080", "*"],
      });

      // Clean up transport when closed
      transport.onclose = () => {
        if (transport.sessionId) {
          delete this.transports[transport.sessionId];
        }
      };
      const server = new McpServer({
        name: "apigee-user",
        version: "3.0.5",
      });

      // appsList
      server.registerTool(
        "appsList",
        {
          title: "Apps List Tool",
          description: "Lists all app subscriptions.",
          inputSchema: {},
        },
        async () => {
          let appList = [
            {
              appId: "1",
              name: "App 1",
              apis: ["API 1", "API 2"],
            },
            {
              appId: "2",
              name: "App 2",
              apis: ["API 2"],
            },
            {
              appId: "3",
              name: "App 3",
              apis: ["API 1", "API 3"],
            },
          ];
          if (appList) {
            return {
              content: [
                {
                  type: "text",
                  text: `${JSON.stringify(appList)}`,
                },
              ],
            };
          } else {
            return {
              content: [
                {
                  type: "text",
                  text: `No apps found.`,
                },
              ],
            };
          }
        },
      );

      // Connect to the MCP server
      await server.connect(transport);
    } else {
      // Invalid request
      res.status(400).json({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Bad Request: No valid session ID provided",
        },
        id: null,
      });

      return;
    }

    // Handle the request
    await transport.handleRequest(req, res, req.body);
  };
}
