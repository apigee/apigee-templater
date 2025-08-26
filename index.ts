import express, { response } from "express";
import { randomUUID } from "node:crypto";
import fs from "fs";
import * as YAML from "yaml";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { ApigeeConverter } from "./lib/converter.ts";
import { Proxy, ProxyFeature } from "./lib/interfaces.ts";
import { ApigeeTemplaterService } from "./lib/service.ts";

// Map to store transports by session ID
const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};

const converter = new ApigeeConverter();
const apigeeService = new ApigeeTemplaterService();
const app = express();
app.use(
  express.json({
    type: "application/json",
    limit: "2mb",
  }),
);
app.use(
  express.raw({
    type: "application/octet-stream",
    limit: "20mb",
  }),
);
app.use(
  express.text({
    type: "application/yaml",
    limit: "2mb",
  }),
);

app.post("/apigee-templater/convert", (req, res) => {
  if (!req.body) {
    return res.status(400).send("No data received.");
  }

  let requestType = req.header("Content-Type");
  let responseType = req.header("Accept");

  let tempFileName = Math.random().toString(36).slice(2);
  switch (requestType) {
    case "application/octet-stream":
      // Apigee proxy zip input, json output
      fs.mkdirSync("./data/temp", { recursive: true });
      let tempFilePath = "./data/temp/" + tempFileName + ".zip";
      fs.writeFileSync(tempFilePath, req.body);

      converter
        .zipToJson(tempFileName, tempFilePath)
        .then((result) => {
          fs.rmSync(tempFilePath);
          if (responseType == "application/yaml") {
            res.setHeader("Content-Type", "application/yaml");
            res.send(YAML.stringify(result));
          } else {
            res.setHeader("Content-Type", "application/json");
            res.send(JSON.stringify(result, null, 2));
          }
        })
        .catch((error) => {
          res.status(500).send(error.message);
        });
      break;
    case "application/json":
      // Apigee proxy json input, yaml or zip output
      if (responseType == "application/yaml") {
        res.setHeader("Content-Type", "application/yaml");
        res.send(YAML.stringify(req.body));
      } else {
        converter.jsonToZip(tempFileName, req.body).then((result) => {
          let zipOutputFile = fs.readFileSync(result);
          res.setHeader("Content-Type", "application/octet-stream");
          res.send(zipOutputFile);
        });
      }
      break;
    case "application/yaml":
      // Apigee proxy yaml input, json or zip output
      if (responseType == "application/json") {
        res.setHeader("Content-Type", "application/json");
        res.json(YAML.parse(req.body));
      } else {
        converter
          .jsonToZip(tempFileName, YAML.parse(req.body))
          .then((result) => {
            let zipOutputFile = fs.readFileSync(result);
            res.setHeader("Content-Type", "application/octet-stream");
            res.send(zipOutputFile);
          });
      }
      break;
  }
});

app.post("/apigee-templater/apply-feature", async (req, res) => {
  if (!req.body) {
    return res.status(400).send("No data received.");
  }

  let requestType = req.header("Content-Type");
  let responseType = req.header("Accept");

  if (
    (requestType == "*/*" || requestType == "application/json") &&
    (responseType == "*/*" || responseType == "application/json")
  ) {
    let proxy: Proxy = req.body["proxy"];
    let feature: ProxyFeature;
    if (typeof req.body["feature"] == "string") {
      feature = JSON.parse(
        fs.readFileSync("./features/" + req.body["feature"] + ".json", "utf8"),
      );
    } else {
      feature = req.body["feature"];
    }
    let parameters: { [key: string]: string } = req.body["parameters"]
      ? req.body["parameters"]
      : {};
    proxy = await converter.jsonApplyFeature(proxy, feature, parameters);

    res.json(proxy);
  } else {
    res.status(501).send("Not yet implemented.");
  }
});

app.post("/apigee-templater/remove-feature", (req, res) => {});

// MCP
app.post("/mcp", async (req, res) => {
  // Check for existing session ID
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  let transport: StreamableHTTPServerTransport;

  if (sessionId && transports[sessionId]) {
    // Reuse existing transport
    transport = transports[sessionId];
  } else if (!sessionId && isInitializeRequest(req.body)) {
    // New initialization request
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sessionId) => {
        // Store the transport by session ID
        transports[sessionId] = transport;
      },
      // DNS rebinding protection is disabled by default for backwards compatibility. If you are running this server
      // locally, make sure to set:
      enableDnsRebindingProtection: true,
      allowedHosts: ["127.0.0.1", "localhost", "localhost:8080"],
    });

    // Clean up transport when closed
    transport.onclose = () => {
      if (transport.sessionId) {
        delete transports[transport.sessionId];
      }
    };
    const server = new McpServer({
      name: "apigee-templater",
      version: "0.0.1",
    });

    server.registerResource(
      "proxies",
      "proxies://main",
      {
        title: "Proxies",
        description: "All proxies.",
      },
      async (uri) => {
        // load all proxies
        return apigeeService.proxiesList(uri);
      },
    );

    server.registerResource(
      "features",
      "features://main",
      {
        title: "Features",
        description: "All features.",
      },
      async (uri) => {
        // load all features
        return apigeeService.featuresList(uri);
      },
    );

    // ... set up server resources, tools, and prompts ...
    server.registerTool(
      "proxyCreate",
      {
        title: "Proxy Create Tool",
        description:
          "Create an empty API proxy with an optional target service URL.",
        inputSchema: {
          proxyName: z.string(),
          basePath: z.string(),
          targetUrl: z.string().optional(),
        },
      },
      async ({ proxyName, basePath, targetUrl }) => {
        return apigeeService.proxyCreate(
          proxyName,
          basePath,
          targetUrl,
          converter,
        );
      },
    );

    server.registerTool(
      "proxyAddEndpoint",
      {
        title: "Proxy Add Endpoint",
        description: "Add a proxy endpoint that can receive API traffic.",
        inputSchema: {
          proxyName: z.string(),
          endpointName: z.string(),
          basePath: z.string(),
          targetName: z.string(),
          targetUrl: z.string(),
          targetRouteRule: z
            .string()
            .describe("An optional target route rule to apply.")
            .optional(),
        },
      },
      async ({
        proxyName,
        endpointName,
        basePath,
        targetName,
        targetUrl,
        targetRouteRule,
      }) => {
        return apigeeService.proxyAddEndpoint(
          proxyName,
          endpointName,
          basePath,
          targetName,
          targetUrl,
          targetRouteRule,
          converter,
        );
      },
    );

    server.registerTool(
      "proxyAddTarget",
      {
        title: "Proxy Add Target Tool",
        description: "Add a backend target to a proxy.",
        inputSchema: {
          proxyName: z.string(),
          targetName: z.string(),
          targetUrl: z.string(),
          targetRouteRule: z.string(),
        },
      },
      async ({ proxyName, targetName, targetUrl, targetRouteRule }) => {
        return apigeeService.proxyAddTarget(
          proxyName,
          targetName,
          targetUrl,
          targetRouteRule,
          converter,
        );
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
});

// Reusable handler for GET and DELETE requests
const handleSessionRequest = async (
  req: express.Request,
  res: express.Response,
) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (!sessionId || !transports[sessionId]) {
    res.status(400).send("Invalid or missing session ID");
    return;
  }

  const transport = transports[sessionId];
  await transport.handleRequest(req, res);
};

// Handle GET requests for server-to-client notifications via SSE
app.get("/mcp", handleSessionRequest);

// Handle DELETE requests for session termination
app.delete("/mcp", handleSessionRequest);

app.listen("8080", () => {
  console.log(`apigee-templater listening on port 8080`);
});
