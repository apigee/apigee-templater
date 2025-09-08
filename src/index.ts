import express, { response } from "express";
import { randomUUID } from "node:crypto";
import fs from "fs";
import { ApigeeConverter } from "./lib/converter.js";
import { ApigeeTemplaterService } from "./lib/service.js";
import { McpService } from "./lib/mcp.js";
import { RestService } from "./lib/rest.js";

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
const restService = new RestService(converter, apigeeService);

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

// create default directories
fs.mkdirSync(rootStorageDir + "proxies", { recursive: true });
fs.mkdirSync(rootStorageDir + "features", { recursive: true });
fs.mkdirSync(rootStorageDir + "temp", { recursive: true });

// REST
app.get("/apigee-templater/proxies", (req, res) => {
  // apigeeService.
});
app.post("/apigee-templater/proxies", restService.proxyPost);
app.get("/apigee-templater/proxies/:proxy", restService.proxyGet);
app.delete("/apigee-templater/proxies/:proxy", restService.proxyDelete);
app.get("/apigee-templater/features/:feature", restService.featureGet);
app.delete("/apigee-templater/features/:feature", restService.featureDelete);
app.post(
  "/apigee-templater/proxies/:proxy/features/:feature",
  restService.proxyApplyFeature,
);
app.delete(
  "/apigee-templater/proxies/:proxy/features/:feature",
  restService.proxyRemoveFeature,
);
app.post("/apigee-templater/features", restService.featurePost);

// MCP
app.post("/mcp", mcpService.mcppost);
app.get("/mcp", mcpService.handleSessionRequest);
app.delete("/mcp", mcpService.handleSessionRequest);

app.listen("8080", () => {
  console.log(`apigee-templater listening on port 8080`);
});
