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
      apigeeService.proxyImport(req.body);
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
      let proxy = YAML.parse(req.body);
      apigeeService.proxyImport(proxy);
      if (responseType == "application/json") {
        res.setHeader("Content-Type", "application/json");
        res.status(201).json(YAML.parse(proxy));
      } else {
        converter.jsonToZip(name, proxy).then((result) => {
          let zipOutputFile = fs.readFileSync(result);
          res.setHeader("Content-Type", "application/octet-stream");
          res.status(201).send(zipOutputFile);
        });
      }
      break;
  }
});

app.delete("/apigee-templater/proxies/:proxy", (req, res) => {
  let proxyName = req.params.proxy;
  let proxy = apigeeService.proxyGet(proxyName);
  apigeeService.proxyDelete(proxyName);

  if (proxy) {
    res.setHeader("Content-Type", "application/json");
    res.status(200).send(JSON.stringify(proxy, null, 2));
  } else res.status(404).send("Proxy could not be found.");
});

app.delete("/apigee-templater/features/:feature", (req, res) => {
  let featureName = req.params.feature;
  let feature = apigeeService.featureGet(featureName);
  apigeeService.featureDelete(featureName);

  if (feature) {
    res.setHeader("Content-Type", "application/json");
    res.status(200).send(JSON.stringify(feature, null, 2));
  } else res.status(404).send("Feature could not be found.");
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

  let name: string = req.query["name"] ? req.query["name"].toString() : "";
  if (!name) name = Math.random().toString(36).slice(2);
  let requestType = req.header("Content-Type");
  let responseType = req.header("Accept");

  let newFeature: Feature | undefined = undefined;

  switch (requestType) {
    case "application/octet-stream":
      // Apigee proxy zip input, convert to feature
      fs.mkdirSync("./data/temp", { recursive: true });
      let tempFilePath = "./data/temp/" + name + ".zip";
      fs.writeFileSync(tempFilePath, req.body);

      converter
        .zipToJson(name.toString(), tempFilePath)
        .then((result) => {
          fs.rmSync(tempFilePath);
          newFeature = converter.jsonToFeature(result);
          if (responseType == "application/yaml") {
            apigeeService.featureImport(newFeature);
            res.setHeader("Content-Type", "application/yaml");
            res.status(201).send(YAML.stringify(newFeature));
          } else {
            apigeeService.featureImport(newFeature);
            res.setHeader("Content-Type", "application/json");
            res.status(201).send(JSON.stringify(newFeature, null, 2));
          }
        })
        .catch((error) => {
          res.status(500).send(error.message);
        });
      break;
    case "application/json":
      name = req.body["name"] ? req.body["name"] : name;
      newFeature = apigeeService.featureImport(req.body);
      if (responseType == "application/yaml") {
        res.setHeader("Content-Type", "application/yaml");
        res.status(201).send(YAML.stringify(newFeature));
      } else {
        res.status(201).send(JSON.stringify(newFeature, null, 2));
      }
      break;
    case "application/yaml":
      newFeature = apigeeService.featureImport(YAML.parse(req.body));
      if (responseType == "application/yaml") {
        res.setHeader("Content-Type", "application/yaml");
        res.status(201).send(YAML.stringify(newFeature));
      } else {
        res.setHeader("Content-Type", "application/json");
        res.status(201).send(JSON.stringify(newFeature, null, 2));
      }
      break;
  }

  if (!newFeature) res.status(500).send("Could not create feature.");
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
        return {
          contents: [
            {
              uri: uri.href,
              text: apigeeService.proxiesListText(),
            },
          ],
        };
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
        return {
          contents: [
            {
              uri: uri.href,
              text: apigeeService.featuresListText(),
            },
          ],
        };
      },
    );

    // ... set up server resources, tools, and prompts ...
    // proxyList
    server.registerTool(
      "proxyList",
      {
        title: "Proxy List Tool",
        description: "Lists all API proxies.",
        inputSchema: {},
      },
      async ({}) => {
        let proxyText = apigeeService.proxiesListText();
        if (proxyText) {
          return {
            content: [
              {
                type: "text",
                text: `Here is a list of all proxies:\n ${proxyText}`,
              },
            ],
          };
        } else {
          return {
            content: [
              {
                type: "text",
                text: `The proxies could not be created, maybe there is a conflicting base path?`,
              },
            ],
          };
        }
      },
    );

    // featureList
    server.registerTool(
      "featureList",
      {
        title: "Feature list tool",
        description: "List all features that can be applied to proxies.",
        inputSchema: {},
      },
      async () => {
        let featureText = apigeeService.featuresListText();
        if (featureText) {
          return {
            content: [
              {
                type: "text",
                text: `Here are all of the features:\n ${featureText}`,
              },
            ],
          };
        } else {
          return {
            content: [
              {
                type: "text",
                text: `No features were found.`,
              },
            ],
          };
        }
      },
    );

    // proxyDescribe
    server.registerTool(
      "proxyDescribe",
      {
        title: "Proxy Describe Tool",
        description: "Describes an API proxy.",
        inputSchema: {
          proxyName: z.string(),
        },
      },
      async ({ proxyName }) => {
        let proxy = apigeeService.proxyGet(proxyName);
        if (proxy) {
          let proxyText = converter.proxyToString(proxy);
          return {
            content: [
              {
                type: "text",
                text: `${proxyText}`,
              },
            ],
          };
        } else {
          return {
            content: [
              {
                type: "text",
                text: `The proxy could not be found, maybe the name is incorrect?`,
              },
            ],
          };
        }
      },
    );

    // featureDescribe
    server.registerTool(
      "featureDescribe",
      {
        title: "Feature Describe Tool",
        description: "Describes an API proxy feature.",
        inputSchema: {
          featureName: z.string(),
        },
      },
      async ({ featureName }) => {
        let feature = apigeeService.featureGet(featureName);
        if (feature) {
          let featureText = converter.featureToString(feature);
          return {
            content: [
              {
                type: "text",
                text: `${featureText}`,
              },
            ],
          };
        } else {
          return {
            content: [
              {
                type: "text",
                text: `The feature could not be found, maybe the name is incorrect?`,
              },
            ],
          };
        }
      },
    );

    // proxyCreate
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
        let proxy = apigeeService.proxyCreate(
          proxyName,
          basePath,
          targetUrl,
          converter,
        );
        if (proxy) {
          return {
            content: [
              {
                type: "text",
                text: `The proxy ${proxyName} was created. Here is the new proxy summary:\n ${converter.proxyToString(proxy)}`,
              },
            ],
          };
        } else {
          return {
            content: [
              {
                type: "text",
                text: `The proxy ${proxyName} could not be created, maybe there is a conflicting base path?`,
              },
            ],
          };
        }
      },
    );

    // proxyImport
    server.registerTool(
      "proxyImport",
      {
        title: "Proxy import file tool",
        description:
          "Import a proxy file either with JSON or a public URL to the file.",
        inputSchema: {
          proxyString: z.string(),
        },
      },
      async ({ proxyString }) => {
        let tempProxyString = proxyString;
        if (proxyString.toLowerCase().startsWith("http")) {
          let response = await fetch(proxyString);
          tempProxyString = await response.text();
        }
        let proxy: Proxy = JSON.parse(tempProxyString);
        if (!proxy) {
          // try to parse YAML
          proxy = YAML.parse(tempProxyString);
        }
        if (proxy) {
          apigeeService.proxyImport(proxy);
          return {
            content: [
              {
                type: "text",
                text: `The proxy ${proxy.name} has been imported.\n ${converter.proxyToString(proxy)}`,
              },
            ],
          };
        } else {
          return {
            content: [
              {
                type: "text",
                text: `The proxy could not be imported, was the sent data valid JSON or YAML?`,
              },
            ],
          };
        }
      },
    );

    // featureImport
    server.registerTool(
      "featureImport",
      {
        title: "Feature import file tool",
        description:
          "Import a feature file either with JSON or a public URL to a file.",
        inputSchema: {
          featureString: z.string(),
        },
      },
      async ({ featureString }) => {
        let tempFeatureString = featureString;
        if (featureString.toLowerCase().startsWith("http")) {
          let response = await fetch(featureString);
          tempFeatureString = await response.text();
        }
        let feature: Feature = JSON.parse(tempFeatureString);
        apigeeService.featureImport(feature);
        return {
          content: [
            {
              type: "text",
              text: `The feature ${feature.name} has been imported.\n ${converter.featureToString(feature)}`,
            },
          ],
        };
      },
    );

    // proxyAddEndpoint
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
        let proxy = apigeeService.proxyAddEndpoint(
          proxyName,
          endpointName,
          basePath,
          targetName,
          targetUrl,
          targetRouteRule,
          converter,
        );
        if (proxy) {
          return {
            content: [
              {
                type: "text",
                text: `The proxy ${proxyName} was updated with the new endpoint ${endpointName}. Here is the new proxy summary:\n ${converter.proxyToString(proxy)}`,
              },
            ],
          };
        } else {
          return {
            content: [
              {
                type: "text",
                text: `The proxy ${proxyName} could not be updated with the endpoint ${endpointName}, maybe there is a conflicting base path?`,
              },
            ],
          };
        }
      },
    );

    // proxyAddTarget
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
        let proxy = apigeeService.proxyAddTarget(
          proxyName,
          targetName,
          targetUrl,
          targetRouteRule,
          converter,
        );
        if (proxy) {
          return {
            content: [
              {
                type: "text",
                text: `The proxy ${proxyName} was updated with the new target ${targetName}. Here is the new proxy summary:\n ${converter.proxyToString(proxy)}`,
              },
            ],
          };
        } else {
          return {
            content: [
              {
                type: "text",
                text: `The proxy ${proxyName} could not be updated with the target ${targetName}, maybe there is a target name conflict?`,
              },
            ],
          };
        }
      },
    );

    // proxyEnableFeature
    server.registerTool(
      "proxyEnableFeature",
      {
        title: "Proxy Enable Feature",
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
                text: `The feature ${featureName} has been added to proxy ${proxyName}.\n Here is the new proxy summary: ${converter.proxyToString(proxy)}`,
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

    // proxyDisableFeature
    server.registerTool(
      "proxyDisableFeature",
      {
        title: "Proxy Disable Feature",
        description: "Remove a feature from a proxy.",
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
                text: `The feature ${featureName} has been removed from proxy ${proxyName}. Here is the new proxy summary:\n ${converter.proxyToString(proxy)}`,
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

    // proxyDelete
    server.registerTool(
      "proxyDelete",
      {
        title: "Proxy delete file tool",
        description: "Delete an API proxy.",
        inputSchema: {
          proxyName: z.string(),
        },
      },
      async ({ proxyName }) => {
        let proxy = apigeeService.proxyGet(proxyName);
        if (proxy) {
          apigeeService.proxyDelete(proxyName);
          return {
            content: [
              {
                type: "text",
                text: `The proxy ${proxy.name} has been deleted.\n ${converter.proxyToString(proxy)}`,
              },
            ],
          };
        } else {
          return {
            content: [
              {
                type: "text",
                text: `The proxy ${proxyName} could not be found, maybe the name is incorrect?`,
              },
            ],
          };
        }
      },
    );

    // featureDelete
    server.registerTool(
      "featureDelete",
      {
        title: "Feature delete file tool",
        description: "Delete an API feature.",
        inputSchema: {
          featureName: z.string(),
        },
      },
      async ({ featureName }) => {
        let feature = apigeeService.featureGet(featureName);
        if (feature) {
          apigeeService.featureDelete(featureName);
          return {
            content: [
              {
                type: "text",
                text: `The feature ${feature.name} has been deleted.\n ${converter.featureToString(feature)}`,
              },
            ],
          };
        } else {
          return {
            content: [
              {
                type: "text",
                text: `The feature ${featureName} could not be found, maybe the name is incorrect?`,
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
