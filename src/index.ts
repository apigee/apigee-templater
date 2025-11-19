import express from "express";
import cors from "cors";
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
  let result: { apis: ApiHubApi[]; versions: ApiHubApiVersion[] } = {
    apis: [],
    versions: [],
  };
  let portalService = new PortalService(
    process.env.PROJECT_ID,
    process.env.REGION,
  );
  let projectApis = await portalService.getApis(
    "target_user.enum_values.values.display_name:Public",
  );
  if (projectApis.data && projectApis.data.length > 0) {
    result.apis = result.apis.concat(projectApis.data);

    for (let api of result.apis) {
      let versions = await portalService.getApiVersions(api.name);
      if (versions && versions.data && versions.data.length > 0)
        result.versions = result.versions.concat(versions.data);
    }
  }

  res.send(result);
});

app.get("/api-spec", async (req, res) => {
  let result: any = {};
  let versionName = req.query.version?.toString()
    ? req.query.version.toString()
    : "";
  let portalService = new PortalService(
    process.env.PROJECT_ID,
    process.env.REGION,
  );
  let namePieces = versionName.split("/");
  let apiName = "";
  if (namePieces.length > 5) apiName = namePieces[5] ?? "";
  if (apiName) {
    let apiResult = await portalService.getApi(apiName);
    if (apiResult && apiResult.data) result.api = apiResult.data;
  }
  let versionResult = await portalService.getApiVersion(versionName);
  if (versionResult && versionResult.data) {
    result.version = versionResult.data;
    if (result.version.deployments && result.version.deployments.length > 0) {
      // get deployment
      let deploymentResult = await portalService.getApiDeployment(
        result.version.deployments[0],
      );
      if (deploymentResult && deploymentResult.data) {
        result.deployment = deploymentResult.data;
      }
    }
  }
  let versionSpecResult: { data: any; error: Error } =
    await portalService.getApiVersionSpecs(versionName);
  if (
    versionSpecResult.data &&
    versionSpecResult.data.specs &&
    versionSpecResult.data.specs.length &&
    versionSpecResult.data.specs.length > 0
  ) {
    let specResult: { data: ApiHubApiVersionSpecContents; error: Error } =
      await portalService.getApiVersionSpecContents(
        versionSpecResult.data.specs[0]["name"],
      );

    if (specResult.data) {
      result.spec = specResult.data;
    }
  }

  if (result.version) res.send(result);
  else res.status(404).send("Spec not found");
});

app.post("/users", async (req, res) => {
  let errorCode = 0;

  let portalService = new PortalService(
    process.env.PROJECT_ID,
    process.env.REGION,
  );
  let user = req.body;
  let result = await portalService.createDeveloper(user);

  if (result.error) errorCode = result.error.code;

  if (errorCode) {
    res.status(errorCode).send("There was an error creating the user.");
  } else res.send(req.body);
});

app.get("/users/:email/apps", async (req, res) => {
  let email = req.params.email;
  let portalService = new PortalService(
    process.env.PROJECT_ID,
    process.env.REGION,
  );

  let apps = await portalService.getApps(email);
  if (apps.error) res.status(apps.error.code).send(apps.error.message);
  else res.status(200).send(JSON.stringify(apps.data));
});

app.post("/users/:email/apps", async (req, res) => {
  let email = req.params.email;
  let appName = req.body.name;
  let products = req.body.products;
  let portalService = new PortalService(
    process.env.PROJECT_ID,
    process.env.REGION,
  );

  let app = await portalService.createApp(email, appName);
  if (app.error) res.status(app.error.code).send(app.error.message);
  else res.status(200).send(JSON.stringify(app.data));
});

app.delete("/users/:email/apps/:appName", async (req, res) => {
  let email = req.params.email;
  let appName = req.params.appName;
  let portalService = new PortalService(
    process.env.PROJECT_ID,
    process.env.REGION,
  );

  let app = await portalService.deleteApp(email, appName);
  if (app.error) res.status(app.error.code).send(app.error.message);
  else res.status(200).send(JSON.stringify(app.data));
});

app.get("/products", async (req, res) => {
  let portalService = new PortalService(
    process.env.PROJECT_ID,
    process.env.REGION,
  );

  let productData = await portalService.getProducts();
  if (productData.error)
    res.status(productData.error.code).send(productData.error.message);
  else res.status(200).send(JSON.stringify(productData.data.apiProduct));
});

app.put(
  "/users/:email/apps/:appName/keys/:keyName/products/:productName",
  async (req, res) => {
    let email = req.params.email;
    let appName = req.params.appName;
    let keyName = req.params.keyName;
    let productName = req.params.productName;
    let portalService = new PortalService(
      process.env.PROJECT_ID,
      process.env.REGION,
    );

    let apps = await portalService.addAppKeyProducts(email, appName, keyName, [
      productName,
    ]);
    if (apps.error) res.status(apps.error.code).send(apps.error.message);
    else res.status(200).send(JSON.stringify(apps.data));
  },
);

app.delete(
  "/users/:email/apps/:appName/keys/:keyName/products/:productName",
  async (req, res) => {
    let email = req.params.email;
    let appName = req.params.appName;
    let keyName = req.params.keyName;
    let productName = req.params.productName;
    let portalService = new PortalService(
      process.env.PROJECT_ID,
      process.env.REGION,
    );

    let apps = await portalService.removeAppKeyProduct(
      email,
      appName,
      keyName,
      productName,
    );
    if (apps.error) res.status(apps.error.code).send(apps.error.message);
    else res.status(200).send(JSON.stringify(apps.data));
  },
);

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
