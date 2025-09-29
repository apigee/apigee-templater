import express from "express";
import cors from "cors";
import { randomUUID } from "node:crypto";
import fs from "fs";
import { ApigeeConverter } from "./lib/converter.js";
import { ApigeeTemplaterService } from "./lib/service.js";
import { McpService } from "./lib/mcp-admin.js";
import { McpUserService } from "./lib/mcp-user.js";
import { RestService } from "./lib/rest.js";

const rootStorageDir = process.env.STORAGE_DIR
  ? process.env.STORAGE_DIR
  : "./data/";
const converter = new ApigeeConverter(rootStorageDir);
const apigeeService = new ApigeeTemplaterService(rootStorageDir);
const mcpService = new McpService(converter, apigeeService);
const mcpUserService = new McpUserService(converter, apigeeService);
const restService = new RestService(converter, apigeeService);

const app = express();
app.use(cors());
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
    limit: "8mb",
  }),
);

// create default directories
fs.mkdirSync(rootStorageDir + "templates", { recursive: true });
fs.mkdirSync(rootStorageDir + "features", { recursive: true });
fs.mkdirSync(rootStorageDir + "temp", { recursive: true });

// REST
app.get("/config", (req, res) => {
  res.json({
    serviceUrl: process.env.SERVICE_URL,
    mcpAdminUrl: process.env.MCP_ADMIN_URL,
    mcpUserUrl: process.env.MCP_USER_URL,
    authApiKey: process.env.AUTH_API_KEY,
    authDomain: process.env.AUTH_DOMAIN,
  });
});
app.post("/templates", restService.templateCreate);
app.put("/templates/:template", restService.templateUpdate);
app.get("/templates", restService.templatesList);
app.get("/templates/:template", restService.templateGet);
app.delete("/templates/:template", restService.templateDelete);
app.post(
  "/templates/:template/features/:feature",
  restService.templateApplyFeature,
);
app.delete(
  "/templates/:template/features/:feature",
  restService.templateRemoveFeature,
);
app.post(
  "/templates/:template/apigee-export",
  restService.templateExportToApigee,
);
app.post(
  "/templates/:template/apigee-deploy",
  restService.templateDeployToApigee,
);
app.post("/features", restService.featureCreate);
app.put("/features/:feature", restService.featureUpdate);
app.get("/features/:feature", restService.featureGet);
app.delete("/features/:feature", restService.featureDelete);

// MCP
app.post("/mcp", mcpService.mcppost);
app.get("/mcp", mcpService.handleSessionRequest);
app.delete("/mcp", mcpService.handleSessionRequest);
app.post("/user/mcp", mcpUserService.mcppost);
app.get("/user/mcp", mcpUserService.handleSessionRequest);
app.delete("/user/mcp", mcpUserService.handleSessionRequest);

app.listen("8080", () => {
  console.log(`apigee-templater listening on port 8080`);
});
