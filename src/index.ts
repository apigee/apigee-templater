import express from "express";
import cors from "cors";
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
  rootStorageDir + "templates/",
  rootStorageDir + "features/",
);
const apigeeService = new ApigeeTemplaterService(
  rootStorageDir + "temp/",
  rootStorageDir + "templates/",
  rootStorageDir + "features/",
);
const mcpService = new McpService(converter, apigeeService);
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
    limit: "2mb",
  }),
);

// create default directories
fs.mkdirSync(rootStorageDir + "templates", { recursive: true });
fs.mkdirSync(rootStorageDir + "features", { recursive: true });
fs.mkdirSync(rootStorageDir + "temp", { recursive: true });

// REST
app.post("/apigee-templater/templates", restService.templateCreate);
app.get("/apigee-templater/templates", restService.templatesList);
app.get("/apigee-templater/templates/:template", restService.templateGet);
app.post(
  "/apigee-templater/templates/:template/apigee-export",
  restService.templateExportToApigee,
);
app.post(
  "/apigee-templater/templates/:template/apigee-deploy",
  restService.templateDeployToApigee,
);
app.delete("/apigee-templater/templates/:template", restService.templateDelete);
app.post("/apigee-templater/features", restService.featureCreate);
app.get("/apigee-templater/features/:feature", restService.featureGet);
app.delete("/apigee-templater/features/:feature", restService.featureDelete);
app.post(
  "/apigee-templater/templates/:template/features/:feature",
  restService.templateApplyFeature,
);
app.delete(
  "/apigee-templater/templates/:template/features/:feature",
  restService.templateRemoveFeature,
);

// MCP
app.post("/mcp", mcpService.mcppost);
app.get("/mcp", mcpService.handleSessionRequest);
app.delete("/mcp", mcpService.handleSessionRequest);

app.listen("8080", () => {
  console.log(`apigee-templater listening on port 8080`);
});
