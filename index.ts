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
import { Proxy, Feature } from "./lib/interfaces.ts";
import { ApigeeTemplaterService } from "./lib/service.ts";

// Map to store transports by session ID
const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};

const converter = new ApigeeConverter();
const apigeeService = new ApigeeTemplaterService();
const app = express();
app.use(express.static("public"));
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

app.post("/apigee-templater/proxies", (req, res) => {
  if (!req.body) {
    return res.status(400).send("No data received.");
  }

  let name: string = req.query["name"] ? req.query["name"].toString() : "";
  if (!name) name = Math.random().toString(36).slice(2);
  let requestType = req.header("Content-Type");
  let responseType = req.header("Accept");

  // let tempFileName = Math.random().toString(36).slice(2);
  switch (requestType) {
    case "application/octet-stream":
      // Apigee proxy zip input, json output
      fs.mkdirSync("./data/proxies", { recursive: true });
      let tempFilePath = "./data/proxies/" + name + ".zip";
      fs.writeFileSync(tempFilePath, req.body);

      converter
        .zipToJson(name.toString(), tempFilePath)
        .then((result) => {
          // fs.rmSync(tempFilePath);
          if (responseType == "application/yaml") {
            fs.writeFileSync(
              "./data/proxies/" + name + ".json",
              JSON.stringify(result, null, 2),
            );
            res.setHeader("Content-Type", "application/yaml");
            res.status(201).send(YAML.stringify(result));
          } else {
            fs.writeFileSync(
              "./data/proxies/" + name + ".json",
              JSON.stringify(result, null, 2),
            );
            res.setHeader("Content-Type", "application/json");
            res.status(201).send(JSON.stringify(result, null, 2));
          }
        })
        .catch((error) => {
          res.status(500).send(error.message);
        });
      break;
    case "application/json":
      name = req.body["name"] ? req.body["name"] : name;
      fs.writeFileSync(
        "./data/proxies/" + name + ".json",
        JSON.stringify(req.body, null, 2),
      );
      // Apigee proxy json input, yaml or zip output
      if (responseType == "application/yaml") {
        res.setHeader("Content-Type", "application/yaml");
        res.status(201).send(YAML.stringify(req.body));
      } else {
        converter.jsonToZip(name, req.body).then((result) => {
          let zipOutputFile = fs.readFileSync(result);
          res.setHeader("Content-Type", "application/octet-stream");
          res.status(201).send(zipOutputFile);
        });
      }
      break;
    case "application/yaml":
      // Apigee proxy yaml input, json or zip output
      if (responseType == "application/json") {
        fs.writeFileSync(
          "./data/proxies/" + name + ".json",
          JSON.stringify(YAML.parse(req.body), null, 2),
        );
        res.setHeader("Content-Type", "application/json");
        res.status(201).json(YAML.parse(req.body));
      } else {
        converter.jsonToZip(name, YAML.parse(req.body)).then((result) => {
          let zipOutputFile = fs.readFileSync(result);
          res.setHeader("Content-Type", "application/octet-stream");
          res.status(201).send(zipOutputFile);
        });
      }
      break;
  }
});

app.post(
  "/apigee-templater/proxies/:proxy/features/:feature",
  async (req, res) => {
    let proxyName = req.params.proxy;
    let featureName = req.params.feature;

    let parameters = {};
    if (req.body && req.body["parameters"]) {
      parameters = req.body["parameters"];
    }

    let proxy: Proxy | undefined = apigeeService.proxyApplyFeature(
      proxyName,
      featureName,
      parameters,
      converter,
    );

    if (!proxy) {
      return res
        .status(500)
        .send(
          "Error applying feature to proxy, maybe either the proxy or feature doesn't exist?",
        );
    } else {
      res.setHeader("Content-Type", "application/json");
      res.status(200).send(JSON.stringify(proxy, null, 2));
    }
  },
);

app.delete("/apigee-templater/proxies/:proxy/features/:feature", (req, res) => {
  let proxyName = req.params.proxy;
  let featureName = req.params.feature;

  let proxy: Proxy | undefined = apigeeService.proxyRemoveFeature(
    proxyName,
    featureName,
    converter,
  );

  if (!proxy) {
    return res
      .status(500)
      .send(
        "Error removing feature from proxy, maybe either the proxy or feature doesn't exist?",
      );
  } else {
    res.json(proxy);
  }
});

app.post("/apigee-templater/features", (req, res) => {
  if (!req.body) {
    return res.status(400).send("No data received.");
  }

  let feature = apigeeService.featureCreate(req.body);

  res.status(201).json(feature);
});

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
      "proxyImport",
      {
        title: "Proxy import file tool",
        description: "Import a proxy file.",
        inputSchema: {
          proxyFile: z.string(),
        },
      },
      async ({ proxyFile }) => {
        console.log(proxyFile);
        return {
          content: [
            {
              type: "text",
              text: `Thank you for uploading the proxy file.`,
            },
          ],
        };
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

    server.registerTool(
      "proxyAddFeature",
      {
        title: "Proxy Add Feature",
        description: "Add a feature to a proxy.",
        inputSchema: {
          proxyName: z.string(),
          featureName: z.string(),
        },
      },
      async ({ proxyName, featureName }) => {
        let proxy: Proxy | undefined = apigeeService.proxyApplyFeature(
          proxyName,
          featureName,
          {},
          converter,
        );
        if (proxy) {
          return {
            content: [
              {
                type: "text",
                text: `The feature ${featureName} has been added to proxy ${proxyName}.`,
              },
            ],
          };
        } else {
          return {
            content: [
              {
                type: "text",
                text: `The feature ${featureName} could not be added to proxy ${proxyName}, are you sure the names are correct?`,
              },
            ],
          };
        }
      },
    );

    server.registerTool(
      "proxyRemoveFeature",
      {
        title: "Proxy Remove Feature",
        description: "Remove a feature to a proxy.",
        inputSchema: {
          proxyName: z.string(),
          featureName: z.string(),
        },
      },
      async ({ proxyName, featureName }) => {
        let proxy: Proxy | undefined = apigeeService.proxyRemoveFeature(
          proxyName,
          featureName,
          converter,
        );
        if (proxy) {
          return {
            content: [
              {
                type: "text",
                text: `The feature ${featureName} has been removed from proxy ${proxyName}.`,
              },
            ],
          };
        } else {
          return {
            content: [
              {
                type: "text",
                text: `The feature ${featureName} could not be removed from proxy ${proxyName}, are you sure the names are correct?`,
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
