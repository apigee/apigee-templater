import express from "express";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { ProxyOAuthServerProvider } from "@modelcontextprotocol/sdk/server/auth/providers/proxyProvider.js";
import { mcpAuthRouter } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { any, z } from "zod";
import * as YAML from "yaml";
import { ApigeeConverter } from "./converter.js";
import { Template, Feature } from "./interfaces.js";
import { ApigeeTemplaterService } from "./service.js";

export class McpService {
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
    // console.log(req.headers.authorization);

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
        name: "apigee-templater",
        version: "0.0.1",
      });

      server.registerResource(
        "templates",
        "templates://main",
        {
          title: "Templates",
          description: "All templates.",
        },
        this.resourceTemplatesList,
      );

      server.registerResource(
        "features",
        "features://main",
        {
          title: "Features",
          description: "All features.",
        },
        this.resourceFeaturesList,
      );

      // templatesList
      server.registerTool(
        "templatesList",
        {
          title: "Templates List Tool",
          description: "Lists all API templates.",
          inputSchema: {},
        },
        async () => {
          let templatesList = await this.apigeeService.templatesList();
          if (templatesList) {
            return {
              content: [
                {
                  type: "text",
                  text: `${JSON.stringify(templatesList)}`,
                },
              ],
            };
          } else {
            return {
              content: [
                {
                  type: "text",
                  text: `No templates found.`,
                },
              ],
            };
          }
        },
      );

      // apigeeProxiesList
      server.registerTool(
        "apigeeProxiesList",
        {
          title: "Apigee Proxies List Tool",
          description: "Lists all Apigee API proxies in an org.",
          inputSchema: {
            apigeeOrg: z.string(),
          },
        },
        async ({ apigeeOrg }, authInfo) => {
          let token: string =
            authInfo.requestInfo?.headers.authorization &&
            typeof authInfo.requestInfo?.headers.authorization === "string"
              ? authInfo.requestInfo?.headers.authorization
              : "";
          let proxiesObject: any | undefined;
          if (token) {
            proxiesObject = await this.apigeeService.apigeeProxiesList(
              apigeeOrg,
              token,
            );
          }
          if (proxiesObject) {
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(proxiesObject),
                },
              ],
            };
          } else {
            return {
              content: [
                {
                  type: "text",
                  text: `No Apigee proxies found.`,
                },
              ],
            };
          }
        },
      );

      // apigeeProxyConvertToTemplate
      server.registerTool(
        "apigeeProxyConvertToTemplate",
        {
          title: "Apigee Proxy Convert to Template Tool",
          description: "Converts an Apigee proxy from an org into a template.",
          inputSchema: {
            proxyName: z.string(),
            apigeeOrg: z.string(),
          },
        },
        async ({ proxyName, apigeeOrg }, authInfo) => {
          let token: string =
            authInfo.requestInfo?.headers.authorization &&
            typeof authInfo.requestInfo?.headers.authorization === "string"
              ? authInfo.requestInfo?.headers.authorization
              : "";
          let proxiesObject: any | undefined;
          if (token) {
            let apigeeProxyPath = await this.apigeeService.apigeeProxyGet(
              proxyName,
              apigeeOrg,
              token,
            );

            if (apigeeProxyPath) {
              proxiesObject = await this.converter.zipToJson(
                proxyName,
                apigeeProxyPath,
              );
              if (proxiesObject) {
                this.apigeeService.templateImport(proxiesObject);
              }
            }
          }
          if (proxiesObject) {
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(proxiesObject),
                },
              ],
            };
          } else {
            return {
              content: [
                {
                  type: "text",
                  text: `No Apigee proxies found.`,
                },
              ],
            };
          }
        },
      );

      // templateExportToApigee
      server.registerTool(
        "templateExportToApigee",
        {
          title: "Template to Apigee Proxy Export Tool",
          description:
            "Converts and exports a template to an Apigee proxy in an org.",
          inputSchema: {
            proxyName: z.string(),
            apigeeOrg: z.string(),
          },
        },
        async ({ proxyName, apigeeOrg }, authInfo) => {
          let token: string =
            authInfo.requestInfo?.headers.authorization &&
            typeof authInfo.requestInfo?.headers.authorization === "string"
              ? authInfo.requestInfo?.headers.authorization
              : "";
          let apigeeProxyRevision = "";
          let proxy = await this.apigeeService.templateGet(proxyName);
          if (proxy && token) {
            let zipPath = await this.converter.jsonToZip(proxyName, proxy);

            apigeeProxyRevision = await this.apigeeService.apigeeProxyImport(
              proxyName,
              zipPath,
              apigeeOrg,
              token,
            );
          }
          if (apigeeProxyRevision) {
            return {
              content: [
                {
                  type: "text",
                  text: `Template ${proxyName} has been exported to Apigee org ${apigeeOrg} with revision id ${apigeeProxyRevision}.`,
                },
              ],
            };
          } else {
            return {
              content: [
                {
                  type: "text",
                  text: `The template ${proxyName} could not be exported to Apigee, maybe the name or org is incorrect?.`,
                },
              ],
            };
          }
        },
      );

      // apigeeProxyDeploy
      server.registerTool(
        "apigeeProxyDeploy",
        {
          title: "Deploy Apigee Proxy Revision Tool",
          description: "Deploys an Apigee revision to an org.",
          inputSchema: {
            proxyName: z.string(),
            apigeeOrg: z.string(),
            apigeeEnvironment: z.string(),
            serviceAccountEmail: z.string().default(""),
          },
        },
        async (
          { proxyName, apigeeOrg, apigeeEnvironment, serviceAccountEmail },
          authInfo,
        ) => {
          let token: string =
            authInfo.requestInfo?.headers.authorization &&
            typeof authInfo.requestInfo?.headers.authorization === "string"
              ? authInfo.requestInfo?.headers.authorization
              : "";
          let apigeeProxyRevision = "";
          if (token) {
            let apigeeProxyRevision = "";
            let proxy = await this.apigeeService.templateGet(proxyName);

            if (proxy) {
              let zipPath = await this.converter.jsonToZip(proxyName, proxy);

              apigeeProxyRevision = await this.apigeeService.apigeeProxyImport(
                proxyName,
                zipPath,
                apigeeOrg,
                token,
              );

              if (apigeeProxyRevision)
                apigeeProxyRevision =
                  await this.apigeeService.apigeeProxyRevisionDeploy(
                    proxyName,
                    apigeeProxyRevision,
                    serviceAccountEmail,
                    apigeeEnvironment,
                    apigeeOrg,
                    token,
                  );
            }
          }
          if (apigeeProxyRevision) {
            return {
              content: [
                {
                  type: "text",
                  text: `Apigee proxy ${proxyName} has been deployed to Apigee org ${apigeeOrg} and environment ${apigeeEnvironment} with revision id ${apigeeProxyRevision}.`,
                },
              ],
            };
          } else {
            return {
              content: [
                {
                  type: "text",
                  text: `The template ${proxyName} could not be deployed to Apigee, maybe the name or org is incorrect?.`,
                },
              ],
            };
          }
        },
      );

      // featureList
      server.registerTool(
        "featuresList",
        {
          title: "Features list tool",
          description: "List all features that can be applied to templates.",
          inputSchema: {},
        },
        async () => {
          let features = await this.apigeeService.featuresList();
          if (features) {
            return {
              content: [
                {
                  type: "text",
                  text: `${JSON.stringify(features)}`,
                },
              ],
            };
          } else {
            return {
              content: [
                {
                  type: "text",
                  text: `No features found.`,
                },
              ],
            };
          }
        },
      );

      // templateDescribe
      server.registerTool(
        "templateDescribe",
        {
          title: "Template Describe Tool",
          description: "Describes an API template.",
          inputSchema: {
            proxyName: z.string(),
          },
        },
        async ({ proxyName }) => {
          let proxy = await this.apigeeService.templateGet(proxyName);
          if (proxy) {
            let proxyText = this.converter.proxyToString(proxy);
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
                  text: `The template could not be found, maybe the name is incorrect?`,
                },
              ],
            };
          }
        },
      );

      // templateDownload
      server.registerTool(
        "templateDownload",
        {
          title: "Template Download Link Tool",
          description: "Get a link to download a template file.",
          inputSchema: {
            proxyName: z.string(),
            format: z
              .string()
              .describe(
                "You can download the template either in json, yaml, or zip formats.",
              )
              .default("json"),
          },
        },
        async ({ proxyName, format }) => {
          let proxy = await this.apigeeService.templateGet(proxyName);
          if (proxy) {
            let link = process.env.SERVICE_URL
              ? process.env.SERVICE_URL.replace("SERVICE_URL_", "") +
                "/apigee-templater/templates/" +
                proxy.name +
                "?format=" +
                format
              : "NOT_SUPPORTED";
            return {
              content: [
                {
                  type: "text",
                  text:
                    link === "NOT_SUPPORTED"
                      ? "Link downloads are not supported on this server, however here is the template JSON:\n" +
                        JSON.stringify(proxy, null, 2)
                      : `Here is the download link for template ${proxyName} in ${format} format: ${link}`,
                },
              ],
            };
          } else {
            return {
              content: [
                {
                  type: "text",
                  text: `The template could not be found, maybe the name is incorrect?`,
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
          let feature = await this.apigeeService.featureGet(featureName);
          if (feature) {
            let featureText = this.converter.featureToString(feature);
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

      // templateCreate
      server.registerTool(
        "templateCreate",
        {
          title: "Template Create Tool",
          description:
            "Create an empty API template with an optional target service URL.",
          inputSchema: {
            proxyName: z.string(),
            basePath: z.string().optional(),
            targetUrl: z.string().optional(),
          },
        },
        async ({ proxyName, basePath, targetUrl }) => {
          let proxy = this.apigeeService.templateCreate(
            proxyName,
            basePath,
            targetUrl,
            this.converter,
          );
          if (proxy) {
            return {
              content: [
                {
                  type: "text",
                  text: `The template ${proxyName} was created. Here is the new template summary:\n ${this.converter.proxyToString(proxy)}`,
                },
              ],
            };
          } else {
            return {
              content: [
                {
                  type: "text",
                  text: `The template ${proxyName} could not be created, maybe there is a conflicting base path?`,
                },
              ],
            };
          }
        },
      );

      // templateImport
      server.registerTool(
        "templateImport",
        {
          title: "Template import file tool",
          description:
            "Import a template file either with JSON or a public URL to the file.",
          inputSchema: {
            templateString: z.string(),
          },
        },
        async ({ templateString }) => {
          let tempProxyString = templateString;
          if (templateString.toLowerCase().startsWith("http")) {
            let response = await fetch(templateString);
            tempProxyString = await response.text();
          }
          let proxy: Template = JSON.parse(tempProxyString);
          if (!proxy) {
            // try to parse YAML
            proxy = YAML.parse(tempProxyString);
          }
          if (proxy) {
            this.apigeeService.templateImport(proxy);
            return {
              content: [
                {
                  type: "text",
                  text: `The template ${proxy.name} has been imported.\n ${this.converter.proxyToString(proxy)}`,
                },
              ],
            };
          } else {
            return {
              content: [
                {
                  type: "text",
                  text: `The template could not be imported, was the sent data valid JSON or YAML?`,
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
          this.apigeeService.featureImport(feature);
          return {
            content: [
              {
                type: "text",
                text: `The feature ${feature.name} has been imported.\n ${this.converter.featureToString(feature)}`,
              },
            ],
          };
        },
      );

      // proxyAddEndpoint
      server.registerTool(
        "templateAddEndpoint",
        {
          title: "Template Add Endpoint",
          description: "Add a template endpoint that can receive API traffic.",
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
          let proxy = this.apigeeService.templateAddEndpoint(
            proxyName,
            endpointName,
            basePath,
            targetName,
            targetUrl,
            targetRouteRule,
            this.converter,
          );
          if (proxy) {
            return {
              content: [
                {
                  type: "text",
                  text: `The template ${proxyName} was updated with the new endpoint ${endpointName}. Here is the new template summary:\n ${this.converter.proxyToString(proxy)}`,
                },
              ],
            };
          } else {
            return {
              content: [
                {
                  type: "text",
                  text: `The template ${proxyName} could not be updated with the endpoint ${endpointName}, maybe there is a conflicting base path?`,
                },
              ],
            };
          }
        },
      );

      // templateAddTarget
      server.registerTool(
        "templateAddTarget",
        {
          title: "Template Add Target Tool",
          description: "Add a backend target to a template.",
          inputSchema: {
            proxyName: z.string(),
            targetName: z.string(),
            targetUrl: z.string(),
            targetRouteRule: z.string(),
          },
        },
        async ({ proxyName, targetName, targetUrl, targetRouteRule }) => {
          let proxy = this.apigeeService.templateAddTarget(
            proxyName,
            targetName,
            targetUrl,
            targetRouteRule,
            this.converter,
          );
          if (proxy) {
            return {
              content: [
                {
                  type: "text",
                  text: `The template ${proxyName} was updated with the new target ${targetName}. Here is the new template summary:\n ${this.converter.proxyToString(proxy)}`,
                },
              ],
            };
          } else {
            return {
              content: [
                {
                  type: "text",
                  text: `The template ${proxyName} could not be updated with the target ${targetName}, maybe there is a target name conflict?`,
                },
              ],
            };
          }
        },
      );

      // templateEnableFeature
      server.registerTool(
        "templateEnableFeature",
        {
          title: "Template Enable Feature",
          description: "Add a feature to a template.",
          inputSchema: {
            templateName: z.string(),
            featureName: z.string(),
          },
        },
        async ({ templateName, featureName }) => {
          let proxy: Template | undefined =
            await this.apigeeService.templateApplyFeature(
              templateName,
              featureName,
              {},
              this.converter,
            );
          if (proxy) {
            return {
              content: [
                {
                  type: "text",
                  text: `The feature ${featureName} has been added to template ${templateName}.\n Here is the new template summary: ${this.converter.proxyToString(proxy)}`,
                },
              ],
            };
          } else {
            return {
              content: [
                {
                  type: "text",
                  text: `The feature ${featureName} could not be added to template ${templateName}, are you sure the names are correct?`,
                },
              ],
            };
          }
        },
      );

      // templateDisableFeature
      server.registerTool(
        "templateDisableFeature",
        {
          title: "Template Disable Feature",
          description: "Remove a feature from a template.",
          inputSchema: {
            proxyName: z.string(),
            featureName: z.string(),
          },
        },
        async ({ proxyName, featureName }) => {
          let proxy: Template | undefined =
            await this.apigeeService.templateRemoveFeature(
              proxyName,
              featureName,
              this.converter,
            );
          if (proxy) {
            return {
              content: [
                {
                  type: "text",
                  text: `The feature ${featureName} has been removed from template ${proxyName}. Here is the new template summary:\n ${this.converter.proxyToString(proxy)}`,
                },
              ],
            };
          } else {
            return {
              content: [
                {
                  type: "text",
                  text: `The feature ${featureName} could not be removed from template ${proxyName}, are you sure the names are correct?`,
                },
              ],
            };
          }
        },
      );

      // templateDelete
      server.registerTool(
        "templateDelete",
        {
          title: "Template delete file tool",
          description: "Delete an API template.",
          inputSchema: {
            proxyName: z.string(),
          },
        },
        async ({ proxyName }) => {
          let proxy = await this.apigeeService.templateGet(proxyName);
          if (proxy) {
            this.apigeeService.templateDelete(proxyName);
            return {
              content: [
                {
                  type: "text",
                  text: `The template ${proxy.name} has been deleted.\n ${this.converter.proxyToString(proxy)}`,
                },
              ],
            };
          } else {
            return {
              content: [
                {
                  type: "text",
                  text: `The template ${proxyName} could not be found, maybe the name is incorrect?`,
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
          let feature = await this.apigeeService.featureGet(featureName);
          if (feature) {
            this.apigeeService.featureDelete(featureName);
            return {
              content: [
                {
                  type: "text",
                  text: `The feature ${feature.name} has been deleted.\n ${this.converter.featureToString(feature)}`,
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
  };

  public resourceTemplatesList = async (uri: URL) => {
    // load all proxies
    return {
      contents: [
        {
          uri: uri.href,
          text: JSON.stringify(this.apigeeService.templatesList()),
        },
      ],
    };
  };

  public resourceFeaturesList = async (uri: URL) => {
    // load all features
    return {
      contents: [
        {
          uri: uri.href,
          text: JSON.stringify(this.apigeeService.featuresList()),
        },
      ],
    };
  };
}
