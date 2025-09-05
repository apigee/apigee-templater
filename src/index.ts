import express, { response } from "express";
import { randomUUID } from "node:crypto";
import fs from "fs";
import * as YAML from "yaml";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { ProxyOAuthServerProvider } from "@modelcontextprotocol/sdk/server/auth/providers/proxyProvider.js";
import { mcpAuthRouter } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { z } from "zod";
import { ApigeeConverter } from "./lib/converter.js";
import { Proxy, Feature } from "./lib/interfaces.js";
import { ApigeeTemplaterService } from "./lib/service.js";
import { McpService } from "./lib/mcp.js";

// Map to store transports by session ID
const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};

const rootStorageDir = process.env.STORAGE_DIR
  ? process.env.STORAGE_DIR
  : "./data/";
const converter = new ApigeeConverter(
  rootStorageDir + "temp/",
  rootStorageDir + "proxies/",
  rootStorageDir + "features/",
);
const apigeeService = new ApigeeTemplaterService(
  rootStorageDir + "temp/",
  rootStorageDir + "proxies/",
  rootStorageDir + "features/",
);
const mcpService = new McpService(converter, apigeeService);

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

// const proxyProvider = new ProxyOAuthServerProvider({
//   endpoints: {
//     authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
//     tokenUrl: "https://accounts.google.com/o/oauth2/v2/token",
//     revocationUrl: "https://accounts.google.com/o/oauth2/v2/revoke",
//   },
//   verifyAccessToken: async (token) => {
//     console.log("TOKEN RECEIVED: " + token);
//     return {
//       token,
//       clientId: "123",
//       scopes: ["openid", "email", "profile"],
//     };
//   },
//   getClient: async (client_id) => {
//     console.log("GET CLIENT RECEIVED: " + client_id);
//     return {
//       client_id,
//       redirect_uris: ["http://localhost:3000/callback"],
//     };
//   },
// });

// app.use(
//   mcpAuthRouter({
//     provider: proxyProvider,
//     issuerUrl: new URL("https://accounts.google.com"),
//     baseUrl: new URL("http://mcp.example.com"),
//     serviceDocumentationUrl: new URL("https://docs.example.com/"),
//   }),
// );

// create default directories
fs.mkdirSync(rootStorageDir + "proxies", { recursive: true });
fs.mkdirSync(rootStorageDir + "features", { recursive: true });
fs.mkdirSync(rootStorageDir + "temp", { recursive: true });

app.get("/apigee-templater/proxies", (req, res) => {
  // apigeeService.
});

// upload proxy in either zip, json or yaml format
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
      let tempFilePath = rootStorageDir + "proxies/" + name + ".zip";
      fs.writeFileSync(tempFilePath, req.body);

      converter
        .zipToJson(name.toString(), tempFilePath)
        .then((result) => {
          // fs.rmSync(tempFilePath);
          if (responseType == "application/yaml") {
            fs.writeFileSync(
              rootStorageDir + "proxies/" + name + ".json",
              JSON.stringify(result, null, 2),
            );
            res.setHeader("Content-Type", "application/yaml");
            res.status(201).send(YAML.stringify(result));
          } else {
            fs.writeFileSync(
              rootStorageDir + "proxies/" + name + ".json",
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
      } else if (responseType == "application/octet-stream") {
        converter.jsonToZip(name, req.body).then((result) => {
          let zipOutputFile = fs.readFileSync(result);
          res.setHeader("Content-Type", "application/octet-stream");
          res.status(201).send(zipOutputFile);
        });
      } else {
        res.setHeader("Content-Type", "application/json");
        res.status(201).send(JSON.stringify(req.body, null, 2));
      }
      break;
    case "application/yaml":
      let proxy = YAML.parse(req.body);
      apigeeService.proxyImport(proxy);
      if (responseType == "application/yaml") {
        res.setHeader("Content-Type", "application/yaml");
        res.status(201).send(YAML.stringify(proxy));
      } else if (responseType == "application/octet-stream") {
        converter.jsonToZip(name, proxy).then((result) => {
          let zipOutputFile = fs.readFileSync(result);
          res.setHeader("Content-Type", "application/octet-stream");
          res.status(201).send(zipOutputFile);
        });
      } else {
        res.setHeader("Content-Type", "application/json");
        res.status(201).json(JSON.stringify(proxy, null, 2));
      }
      break;
  }
});

app.get("/apigee-templater/proxies/:proxy", (req, res) => {
  let proxyName = req.params.proxy;
  let format =
    req.query.format && typeof req.query.format == "string"
      ? req.query.format.toLowerCase()
      : "";
  let proxy = apigeeService.proxyGet(proxyName);
  let responseType = req.header("Accept");

  if (proxy) {
    if (
      responseType == "application/yaml" ||
      format == "yaml" ||
      format == "yml"
    ) {
      res.setHeader("Content-Type", "application/yaml");
      res.status(201).send(YAML.stringify(proxy));
    } else if (
      responseType == "application/octet-stream" ||
      format == "zip" ||
      format == "xml"
    ) {
      converter.jsonToZip(proxyName, proxy).then((result) => {
        let zipOutputFile = fs.readFileSync(result);
        res.setHeader("Content-Type", "application/octet-stream");
        res.status(201).send(zipOutputFile);
      });
    } else {
      res.setHeader("Content-Type", "application/json");
      res.status(201).json(JSON.stringify(proxy, null, 2));
    }
  } else res.status(404).send("Proxy could not be found.");
});

// delete proxy
app.delete("/apigee-templater/proxies/:proxy", (req, res) => {
  let proxyName = req.params.proxy;
  let proxy = apigeeService.proxyGet(proxyName);
  apigeeService.proxyDelete(proxyName);

  if (proxy) {
    res.setHeader("Content-Type", "application/json");
    res.status(200).send(JSON.stringify(proxy, null, 2));
  } else res.status(404).send("Proxy could not be found.");
});

// get feature
app.get("/apigee-templater/features/:feature", (req, res) => {
  let featureName = req.params.feature;
  let feature = apigeeService.featureGet(featureName);
  let responseType = req.header("Accept");

  if (feature) {
    if (responseType == "application/yaml") {
      res.setHeader("Content-Type", "application/yaml");
      res.status(201).send(YAML.stringify(feature));
    } else {
      res.setHeader("Content-Type", "application/json");
      res.status(201).json(JSON.stringify(feature, null, 2));
    }
  } else res.status(404).send("Feature could not be found.");
});

// delete feature
app.delete("/apigee-templater/features/:feature", (req, res) => {
  let featureName = req.params.feature;
  let feature = apigeeService.featureGet(featureName);
  apigeeService.featureDelete(featureName);

  if (feature) {
    res.setHeader("Content-Type", "application/json");
    res.status(200).send(JSON.stringify(feature, null, 2));
  } else res.status(404).send("Feature could not be found.");
});

// apply feature to proxy
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

// remove feature from API proxy
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

// create a new feature
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
      let tempFilePath = rootStorageDir + "temp/" + name + ".zip";
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
app.post("/mcp", mcpService.mcppost);
app.get("/mcp", mcpService.handleSessionRequest);
app.delete("/mcp", mcpService.handleSessionRequest);

app.listen("8080", () => {
  console.log(`apigee-templater listening on port 8080`);
});
