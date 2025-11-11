import express from "express";
import cors from "cors";
import { randomUUID } from "node:crypto";
import fs from "fs";
import { ApigeeConverter } from "./lib/converter.js";
import { ApigeeTemplaterService } from "./lib/service.js";
import { McpService } from "./lib/mcp-admin.js";
import { McpUserService } from "./lib/mcp-user.js";
import { RestService } from "./lib/rest.js";
import {
  PortalService,
  type Error,
  type ApiHubApi,
  type ApiHubApiVersion,
  type ApiHubApiVersionSpecContents,
} from "apigee-portal-module";

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
    apigeeAgentUrl: process.env.APIGEE_AGENT_URL,
    authApiKey: process.env.AUTH_API_KEY,
    authDomain: process.env.AUTH_DOMAIN,
  });
});

app.get("/apis", async (req, res) => {
  let projectRegions = process.env.APIGEE_PROJECTS_REGIONS
    ? process.env.APIGEE_PROJECTS_REGIONS.split(",")
    : [];
  let result: { apis: ApiHubApi[]; versions: ApiHubApiVersion[] } = {
    apis: [],
    versions: [],
  };
  for (let projectRegion of projectRegions) {
    let projectParts = projectRegion.split(":");
    if (
      projectParts &&
      projectParts.length == 2 &&
      projectParts[0] &&
      projectParts[1]
    ) {
      let portalService = new PortalService(projectParts[0], projectParts[1]);
      let projectApis = await portalService.getApis();
      if (projectApis.data && projectApis.data.length > 0) {
        result.apis = result.apis.concat(projectApis.data);

        for (let api of result.apis) {
          let versions = await portalService.getApiVersions(
            api.name,
            `attributes.projects/${projectParts[0]}}/locations/${projectParts[1]}/attributes/portal-publish-flag.string_values.values:True`,
          );
          if (versions && versions.data && versions.data.length > 0)
            result.versions = result.versions.concat(versions.data);
        }
      }
    }
  }

  res.send(result);
});

app.get("/api-spec", async (req, res) => {
  let result: any | undefined = undefined;
  let projectRegions = process.env.APIGEE_PROJECTS_REGIONS
    ? process.env.APIGEE_PROJECTS_REGIONS.split(",")
    : [];
  let versionName = req.query.version?.toString()
    ? req.query.version.toString()
    : "";

  console.log(versionName);

  let portalService = new PortalService();

  let versionResult: { data: any; error: Error } =
    await portalService.getApiVersionSpecs(versionName);
  console.log(versionResult);
  if (
    versionResult.data &&
    versionResult.data.specs &&
    versionResult.data.specs.length &&
    versionResult.data.specs.length > 0
  ) {
    let specResult: { data: ApiHubApiVersionSpecContents; error: Error } =
      await portalService.getApiVersionSpecContents(
        versionResult.data.specs[0]["name"],
      );

    if (specResult.data) {
      result = specResult.data;
    }
  }

  if (result) res.send(result);
  else res.status(404).send("Spec not found");
});

app.post("/users", async (req, res) => {
  let projectRegions = process.env.APIGEE_PROJECTS_REGIONS
    ? process.env.APIGEE_PROJECTS_REGIONS.split(",")
    : [];
  let errorCode = 0;
  for (let projectRegion of projectRegions) {
    let projectParts = projectRegion.split(":");
    if (
      projectParts &&
      projectParts.length == 2 &&
      projectParts[0] &&
      projectParts[1]
    ) {
      let portalService = new PortalService(projectParts[0], projectParts[1]);
      let result = await portalService.createDeveloper(req.body);

      if (result.error) errorCode = result.error.code;
    }
  }

  if (errorCode) {
    res.status(errorCode).send("There was an error creating the user.");
  } else res.send(req.body);
});

app.get("/users/:email", async (req, res) => {
  let projectRegions = process.env.APIGEE_PROJECTS_REGIONS
    ? process.env.APIGEE_PROJECTS_REGIONS.split(",")
    : [];
  let result: { apis: ApiHubApi[]; versions: ApiHubApiVersion[] } = {
    apis: [],
    versions: [],
  };

  let email = req.params.email;

  for (let projectRegion of projectRegions) {
    let projectParts = projectRegion.split(":");
    if (
      projectParts &&
      projectParts.length == 2 &&
      projectParts[0] &&
      projectParts[1]
    ) {
      let portalService = new PortalService(projectParts[0], projectParts[1]);

      let apps = await portalService.getApps(email);
    }
  }
});

app.get("/apps/:email", async (req, res) => {
  let projectRegions = process.env.APIGEE_PROJECTS_REGIONS
    ? process.env.APIGEE_PROJECTS_REGIONS.split(",")
    : [];
  let result: { apis: ApiHubApi[]; versions: ApiHubApiVersion[] } = {
    apis: [],
    versions: [],
  };

  let email = req.params.email;

  for (let projectRegion of projectRegions) {
    let projectParts = projectRegion.split(":");
    if (
      projectParts &&
      projectParts.length == 2 &&
      projectParts[0] &&
      projectParts[1]
    ) {
      let portalService = new PortalService(projectParts[0], projectParts[1]);

      let apps = await portalService.getApps(email);
    }
  }
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
