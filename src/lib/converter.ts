import * as xmljs from "xml-js";
import yauzl from "yauzl";
import yazl from "yazl";
import { JSONPath } from "jsonpath-plus";
import path from "path";
import fs from "fs";
import vm from "vm";
import {
  Proxy,
  Endpoint,
  ProxyEndpoint,
  Route,
  Flow,
  Step,
  Policy,
  Target,
  ProxyTarget,
  Resource,
  Feature,
  Template,
  Parameter,
  FaultRule,
  Product,
  Products,
  ProductOperationConfig,
  ProductLlmOperationConfig,
  ProductPayloadOperationConfig,
  ProductAttribute,
  User,
  Users,
  UserApp,
  UserCredential,
  UserAttribute,
} from "./interfaces.js";

export class ApigeeConverter {
  tempPath: string = "./data/temp/";
  templatesPath: string = "./data/templates/";
  featuresPath: string = "./data/features/";
  productsPath: string = "./data/products/";
  usersPath: string = "./data/users/";
  constructor(basePath: string = "", subDirs: boolean = true) {
    if (basePath && subDirs) {
      this.tempPath = basePath + "temp/";
      this.templatesPath = basePath + "templates/";
      this.featuresPath = basePath + "features/";
      this.productsPath = basePath + "products/";
      this.usersPath = basePath + "users/";
    } else {
      this.tempPath = basePath;
      this.templatesPath = basePath;
      this.featuresPath = basePath;
      this.productsPath = basePath;
    }
  }

  public async apigeeZipToProxy(
    name: string,
    inputFilePath: string,
    importParameters: boolean = true,
  ): Promise<Proxy> {
    return new Promise((resolve, reject) => {
      let tempOutputDir = this.tempPath + name;
      yauzl.open(inputFilePath, { lazyEntries: true }, (err, zipfile) => {
        if (err) throw err;
        zipfile.readEntry();
        zipfile.on("entry", (entry) => {
          const fullPath = path.join(tempOutputDir, entry.fileName);
          if (/\/$/.test(entry.fileName)) {
            // Entry is a directory
            fs.mkdirSync(fullPath, { recursive: true });
            zipfile.readEntry();
          } else {
            // Entry is a file
            fs.mkdirSync(path.dirname(fullPath), { recursive: true });
            zipfile.openReadStream(entry, (err, readStream) => {
              if (err) throw err;
              const writeStream = fs.createWriteStream(fullPath);
              readStream.pipe(writeStream);
              readStream.on("end", () => {
                zipfile.readEntry();
              });
            });
          }
        });
        zipfile.on("close", () => {
          // proxies
          let newProxy: Proxy = this.apigeeFolderToProxy(name, tempOutputDir, importParameters);
          fs.rmSync(tempOutputDir, { recursive: true });
          resolve(newProxy);
        });
      });
    });
  }

  public apigeeFolderToProxy(
    name: string,
    inputPath: string,
    importParameters: boolean = true,
  ): Proxy {
    if (inputPath.includes("apiproxy")) {
      inputPath = inputPath.replace("apiproxy", "");
    }

    let proxies: string[] = fs.readdirSync(inputPath + "/apiproxy/proxies");
    let newProxy = new Proxy();
    newProxy.name = name;
    newProxy.displayName = name;
    newProxy.description = name;
    for (let proxy of proxies) {
      let newEndpoint = new ProxyEndpoint();
      let proxyPath = path.join(inputPath, "apiproxy/proxies", proxy);
      let proxyContents = fs.readFileSync(proxyPath, "utf8");

      let proxyJsonString = xmljs.xml2json(proxyContents, {
        compact: true,
        spaces: 2,
      });
      let proxyJson = JSON.parse(proxyJsonString);

      newEndpoint.name = proxyJson["ProxyEndpoint"]["_attributes"]["name"];
      newEndpoint.basePath = proxyJson["ProxyEndpoint"]["HTTPProxyConnection"]["BasePath"]["_text"];

      // routes
      if (proxyJson["ProxyEndpoint"]["RouteRule"].length > 0) {
        for (let routeRule of proxyJson["ProxyEndpoint"]["RouteRule"]) {
          let newRoute = new Route();
          newRoute.name = routeRule["_attributes"]["name"];
          if (routeRule["TargetEndpoint"]) newRoute.target = routeRule["TargetEndpoint"]["_text"];
          if (routeRule["Condition"]) newRoute.condition = routeRule["Condition"]["_text"];
          newEndpoint.routes.push(newRoute);
        }
      } else {
        let newRoute = new Route();
        newRoute.name = proxyJson["ProxyEndpoint"]["RouteRule"]["_attributes"]["name"];
        if (proxyJson["ProxyEndpoint"]["RouteRule"]["TargetEndpoint"])
          newRoute.target = proxyJson["ProxyEndpoint"]["RouteRule"]["TargetEndpoint"]["_text"];
        if (proxyJson["ProxyEndpoint"]["RouteRule"]["Condition"])
          newRoute.condition = proxyJson["ProxyEndpoint"]["RouteRule"]["Condition"]["_text"];
        newEndpoint.routes.push(newRoute);
      }

      // flows
      let requestPreFlow = this.flowXmlToJson("PreFlow", "Request", proxyJson["ProxyEndpoint"]);
      if (requestPreFlow && requestPreFlow.steps.length > 0) newEndpoint.flows.push(requestPreFlow);

      let responsePreFlow = this.flowXmlToJson("PreFlow", "Response", proxyJson["ProxyEndpoint"]);
      if (responsePreFlow && responsePreFlow.steps.length > 0)
        newEndpoint.flows.push(responsePreFlow);

      let requestPostFlow = this.flowXmlToJson("PostFlow", "Request", proxyJson["ProxyEndpoint"]);
      if (requestPostFlow && requestPostFlow.steps.length > 0)
        newEndpoint.flows.push(requestPostFlow);

      let responsePostFlow = this.flowXmlToJson("PostFlow", "Response", proxyJson["ProxyEndpoint"]);
      if (responsePostFlow && responsePostFlow.steps.length > 0)
        newEndpoint.flows.push(responsePostFlow);

      let responseEventFlow = this.flowXmlToJson(
        "EventFlow",
        "Response",
        proxyJson["ProxyEndpoint"],
      );
      if (responseEventFlow) newEndpoint.flows.push(responseEventFlow);

      // conditional flows
      let conditionalFlows = this.flowsXmlToJson(proxyJson["ProxyEndpoint"]);
      if (conditionalFlows.length > 0)
        newEndpoint.flows = newEndpoint.flows.concat(conditionalFlows);

      // fault rules
      if (
        proxyJson["ProxyEndpoint"]["FaultRules"] &&
        proxyJson["ProxyEndpoint"]["FaultRules"]["FaultRule"] &&
        proxyJson["ProxyEndpoint"]["FaultRules"]["FaultRule"].length
      ) {
        for (let faultXml of proxyJson["ProxyEndpoint"]["FaultRules"]["FaultRule"]) {
          let faultRule = this.flowXmlNodeToJson(faultXml["_attributes"]["name"], "", faultXml);
          if (faultXml["Condition"]) faultRule.condition = faultXml["Condition"]["_text"];
          if (faultRule && newEndpoint.faultRules) {
            newEndpoint.faultRules.push(faultRule);
          } else if (faultRule) {
            newEndpoint.faultRules = [faultRule];
          }
        }
      } else if (
        proxyJson["ProxyEndpoint"]["FaultRules"] &&
        proxyJson["ProxyEndpoint"]["FaultRules"]["FaultRule"]
      ) {
        let faultRule = this.flowXmlNodeToJson(
          proxyJson["ProxyEndpoint"]["FaultRules"]["FaultRule"]["_attributes"]["name"],
          "",
          proxyJson["ProxyEndpoint"]["FaultRules"]["FaultRule"],
        );
        if (proxyJson["ProxyEndpoint"]["FaultRules"]["FaultRule"]["Condition"])
          faultRule.condition =
            proxyJson["ProxyEndpoint"]["FaultRules"]["FaultRule"]["Condition"]["_text"];
        if (faultRule && newEndpoint.faultRules) {
          newEndpoint.faultRules.push(faultRule);
        } else if (faultRule) {
          newEndpoint.faultRules = [faultRule];
        }
      }
      // default fault rule
      if (proxyJson["ProxyEndpoint"]["DefaultFaultRule"]) {
        newEndpoint.defaultFaultRule = this.flowXmlNodeToJson(
          proxyJson["ProxyEndpoint"]["DefaultFaultRule"]["_attributes"]["name"],
          "",
          proxyJson["ProxyEndpoint"]["DefaultFaultRule"],
        ) as FaultRule;
        if (proxyJson["ProxyEndpoint"]["DefaultFaultRule"]["AlwaysEnforce"]) {
          newEndpoint.defaultFaultRule.alwaysEnforce =
            proxyJson["ProxyEndpoint"]["DefaultFaultRule"]["AlwaysEnforce"]["_text"];
        }
      }

      // push endpoint
      newProxy.endpoints.push(newEndpoint);
    }

    // policies
    let policies: string[] = [];
    if (fs.existsSync(inputPath + "/apiproxy/policies"))
      policies = fs.readdirSync(inputPath + "/apiproxy/policies");
    for (let policy of policies) {
      let policyContents = fs.readFileSync(inputPath + "/apiproxy/policies/" + policy, "utf8");
      let policyJsonString = xmljs.xml2json(policyContents, {
        compact: true,
        spaces: 2,
      });
      let policyJson = JSON.parse(policyJsonString);
      let newPolicy = new Policy();
      newPolicy.type = this.policyGetType(policyJson);
      newPolicy.name = policyJson[newPolicy.type]["_attributes"]["name"];
      if (policyJson["_declaration"]) delete policyJson["_declaration"];
      if (policyJson["_comment"]) delete policyJson["_comment"];
      // clean-structure
      policyJson = this.cleanXmlToJson(policyJson);
      newPolicy.content = policyJson;
      newProxy.policies.push(newPolicy);
    }

    // targets
    let targets: string[] = [];
    if (fs.existsSync(inputPath + "/apiproxy/targets"))
      targets = fs.readdirSync(inputPath + "/apiproxy/targets");
    for (let target of targets) {
      let newTarget = new ProxyTarget();
      let targetContent = fs.readFileSync(inputPath + "/apiproxy/targets/" + target, "utf8");

      let targetJsonString = xmljs.xml2json(targetContent, {
        compact: true,
        spaces: 2,
      });
      let targetJson = JSON.parse(targetJsonString);
      // console.log(targetJsonString);
      newTarget.name = targetJson["TargetEndpoint"]["_attributes"]["name"];
      if (
        targetJson["TargetEndpoint"]["HTTPTargetConnection"] &&
        targetJson["TargetEndpoint"]["HTTPTargetConnection"]["URL"]
      )
        newTarget.url = targetJson["TargetEndpoint"]["HTTPTargetConnection"]["URL"]["_text"];
      // Google Access Token
      if (
        targetJson["TargetEndpoint"]["HTTPTargetConnection"] &&
        targetJson["TargetEndpoint"]["HTTPTargetConnection"]["Authentication"] &&
        targetJson["TargetEndpoint"]["HTTPTargetConnection"]["Authentication"]["GoogleAccessToken"]
      ) {
        newTarget.auth = "GoogleAccessToken";
        newTarget.scopes = ["https://www.googleapis.com/auth/cloud-platform"];
      }
      // save original target XML
      if (targetJson["TargetEndpoint"]["HTTPTargetConnection"]) {
        let targetXml = targetJson["TargetEndpoint"]["HTTPTargetConnection"];
        // clean-structure
        newTarget.httpTargetConnection = this.cleanXmlToJson(targetXml);
      } else if (targetJson["TargetEndpoint"]["LocalTargetConnection"]) {
        let targetXml = targetJson["TargetEndpoint"]["LocalTargetConnection"];
        // clean-structure
        newTarget.localTargetConnection = targetXml;
      }
      // request pre flow
      let requestPreFlow = this.flowXmlToJson("PreFlow", "Request", targetJson["TargetEndpoint"]);
      if (requestPreFlow && requestPreFlow.steps.length > 0) newTarget.flows.push(requestPreFlow);
      // response pre flow
      let responsePreFlow = this.flowXmlToJson("PreFlow", "Response", targetJson["TargetEndpoint"]);
      if (responsePreFlow && responsePreFlow.steps.length > 0)
        newTarget.flows.push(responsePreFlow);
      // request post flow
      let requestPostFlow = this.flowXmlToJson("PostFlow", "Request", targetJson["TargetEndpoint"]);
      if (requestPostFlow && requestPostFlow.steps.length > 0)
        newTarget.flows.push(requestPostFlow);
      // response post flow
      let responsePostFlow = this.flowXmlToJson(
        "PostFlow",
        "Response",
        targetJson["TargetEndpoint"],
      );
      if (responsePostFlow && responsePostFlow.steps.length > 0)
        newTarget.flows.push(responsePostFlow);
      // event flow
      let eventFlow = this.flowXmlToJson("EventFlow", "Response", targetJson["TargetEndpoint"]);
      if (eventFlow) newTarget.flows.push(eventFlow);
      // fault rules
      if (
        targetJson["TargetEndpoint"]["FaultRules"] &&
        targetJson["TargetEndpoint"]["FaultRules"]["FaultRule"] &&
        targetJson["TargetEndpoint"]["FaultRules"]["FaultRule"].length
      ) {
        for (let faultXml of targetJson["TargetEndpoint"]["FaultRules"]["FaultRule"]) {
          let faultRule = this.flowXmlNodeToJson(faultXml["_attributes"]["name"], "", faultXml);
          if (faultXml["Condition"]) faultRule.condition = faultXml["Condition"]["_text"];
          if (faultRule && newTarget.faultRules) {
            newTarget.faultRules.push(faultRule);
          } else if (faultRule) {
            newTarget.faultRules = [faultRule];
          }
        }
      } else if (
        targetJson["TargetEndpoint"]["FaultRules"] &&
        targetJson["TargetEndpoint"]["FaultRules"]["FaultRule"]
      ) {
        let faultRule = this.flowXmlNodeToJson(
          targetJson["TargetEndpoint"]["FaultRules"]["FaultRule"]["_attributes"]["name"],
          "",
          targetJson["TargetEndpoint"]["FaultRules"]["FaultRule"],
        );
        if (targetJson["TargetEndpoint"]["FaultRules"]["FaultRule"]["Condition"])
          faultRule.condition =
            targetJson["TargetEndpoint"]["FaultRules"]["FaultRule"]["Condition"]["_text"];
        if (faultRule && newTarget.faultRules) {
          newTarget.faultRules.push(faultRule);
        } else if (faultRule) {
          newTarget.faultRules = [faultRule];
        }
      }
      // default fault rule
      if (targetJson["TargetEndpoint"]["DefaultFaultRule"]) {
        newTarget.defaultFaultRule = this.flowXmlNodeToJson(
          targetJson["TargetEndpoint"]["DefaultFaultRule"]["_attributes"]["name"],
          "",
          targetJson["TargetEndpoint"]["DefaultFaultRule"],
        ) as FaultRule;
        if (targetJson["TargetEndpoint"]["DefaultFaultRule"]["AlwaysEnforce"]) {
          newTarget.defaultFaultRule.alwaysEnforce =
            targetJson["TargetEndpoint"]["DefaultFaultRule"]["AlwaysEnforce"]["_text"];
        }
      }
      newProxy.targets.push(newTarget);
    }

    // resources
    if (fs.existsSync(inputPath + "/apiproxy/resources")) {
      let resTypes: string[] = fs.readdirSync(inputPath + "/apiproxy/resources");
      for (let resType of resTypes) {
        let resFiles: string[] = fs.readdirSync(inputPath + "/apiproxy/resources/" + resType);

        for (let resFile of resFiles) {
          if (resFile === "metadata.js") {
            let manifestContent = fs.readFileSync(
              inputPath + "/apiproxy/resources/" + resType + "/" + resFile,
              "utf8",
            );
            if (manifestContent) {
              const sandbox = { metadata: undefined };
              vm.createContext(sandbox);
              vm.runInContext(manifestContent, sandbox);

              if (sandbox.metadata) {
                if (sandbox.metadata["description"])
                  newProxy.description = sandbox.metadata["description"];
                if (sandbox.metadata["documentation"])
                  newProxy.documentation = sandbox.metadata["documentation"];
                if (sandbox.metadata["uid"]) newProxy.uid = sandbox.metadata["uid"];
                if (sandbox.metadata["parameters"])
                  newProxy.parameters = sandbox.metadata["parameters"];
                if (sandbox.metadata["priority"]) newProxy.priority = sandbox.metadata["priority"];
                if (sandbox.metadata["displayName"])
                  newProxy.displayName = sandbox.metadata["displayName"];
                if (sandbox.metadata["categories"])
                  newProxy.categories = sandbox.metadata["categories"];
              }
            }
          } else {
            let newFile = new Resource();
            newFile.name = resFile;
            newFile.type = resType;
            newFile.content = fs.readFileSync(
              inputPath + "/apiproxy/resources/" + resType + "/" + resFile,
              "utf8",
            );
            newProxy.resources.push(newFile);

            // if propertyset, add as parameters
            if (resType === "properties" && importParameters) {
              let newPropertiesContent = "";
              let props = newFile.content.split("\n");
              for (let prop of props) {
                if (prop) {
                  let propPieces = prop.split("=");
                  if (
                    propPieces &&
                    propPieces.length >= 1 &&
                    propPieces[0] &&
                    newProxy.parameters.findIndex((x) => x.name === propPieces[0]) === -1
                  ) {
                    newProxy.parameters.push({
                      name: propPieces[0],
                      displayName: propPieces[0],
                      description: "Configuration input for " + propPieces[0],
                      default: propPieces.length == 2 && propPieces[1] ? propPieces[1] : "",
                      examples: [],
                      maps: {},
                    });
                  }

                  // set value to use parameter in the future
                  if (propPieces && propPieces.length >= 1) {
                    newPropertiesContent += propPieces[0] + "={" + propPieces[0] + "}\n";
                  }
                }
              }

              newFile.content = newPropertiesContent;
            }
          }
        }
      }
    }

    return newProxy;
  }

  public async apigeeSharedFlowZipToProxy(name: string, inputFilePath: string): Promise<Proxy> {
    return new Promise((resolve, reject) => {
      let tempOutputDir = this.tempPath + name;
      yauzl.open(inputFilePath, { lazyEntries: true }, (err, zipfile) => {
        if (err) throw err;
        zipfile.readEntry();
        zipfile.on("entry", (entry) => {
          const fullPath = path.join(tempOutputDir, entry.fileName);
          if (/\/$/.test(entry.fileName)) {
            // Entry is a directory
            fs.mkdirSync(fullPath, { recursive: true });
            zipfile.readEntry();
          } else {
            // Entry is a file
            fs.mkdirSync(path.dirname(fullPath), { recursive: true });
            zipfile.openReadStream(entry, (err, readStream) => {
              if (err) throw err;
              const writeStream = fs.createWriteStream(fullPath);
              readStream.pipe(writeStream);
              readStream.on("end", () => {
                zipfile.readEntry();
              });
            });
          }
        });
        zipfile.on("close", () => {
          // proxies
          let newProxy: Proxy = this.apigeeSharedFlowFolderToProxy(name, tempOutputDir);
          fs.rmSync(tempOutputDir, { recursive: true });
          resolve(newProxy);
        });
      });
    });
  }

  public apigeeSharedFlowFolderToProxy(name: string, inputPath: string): Proxy {
    let sharedFlows: string[] = fs.readdirSync(inputPath + "/sharedflowbundle/sharedflows");
    let newProxy = new Proxy();
    newProxy.name = name;
    for (let flow of sharedFlows) {
      let newEndpoint = new ProxyEndpoint();
      let proxyPath = path.join(inputPath, "sharedflowbundle/sharedflows", flow);
      let flowContents = fs.readFileSync(proxyPath, "utf8");

      let sharedFlowJsonString = xmljs.xml2json(flowContents, {
        compact: true,
        spaces: 2,
      });
      let sharedFlowJson = JSON.parse(sharedFlowJsonString);

      newEndpoint.name = sharedFlowJson["SharedFlow"]["_attributes"]["name"];

      // flows
      let sharedFlow = this.flowXmlToJson("PreFlow", "SharedFlow", {
        PreFlow: sharedFlowJson,
      });
      if (sharedFlow && sharedFlow.steps.length > 0) {
        // set to Request for now, make a parameter in the future...
        sharedFlow.mode = "Request";
        newEndpoint.flows.push(sharedFlow);
      }

      // push endpoint
      newProxy.endpoints.push(newEndpoint);

      // policies
      let policies: string[] = [];
      if (fs.existsSync(inputPath + "/sharedflowbundle/policies"))
        policies = fs.readdirSync(inputPath + "/sharedflowbundle/policies");
      for (let policy of policies) {
        let policyContents = fs.readFileSync(
          inputPath + "/sharedflowbundle/policies/" + policy,
          "utf8",
        );
        let policyJsonString = xmljs.xml2json(policyContents, {
          compact: true,
          spaces: 2,
        });
        let policyJson = JSON.parse(policyJsonString);
        let newPolicy = new Policy();
        newPolicy.type = this.policyGetType(policyJson);
        newPolicy.name = policyJson[newPolicy.type]["_attributes"]["name"];
        if (policyJson["_declaration"]) delete policyJson["_declaration"];
        if (policyJson["_comment"]) delete policyJson["_comment"];
        // policyJson = this.cleanXmlJson(policyJson);
        newPolicy.content = policyJson;
        newProxy.policies.push(newPolicy);
      }

      // resources
      if (fs.existsSync(inputPath + "/sharedflowbundle/resources")) {
        let resTypes: string[] = fs.readdirSync(inputPath + "/sharedflowbundle/resources");
        for (let resType of resTypes) {
          let resFiles: string[] = fs.readdirSync(
            inputPath + "/sharedflowbundle/resources/" + resType,
          );

          for (let resFile of resFiles) {
            let newFile = new Resource();
            newFile.name = resFile;
            newFile.type = resType;
            newFile.content = fs.readFileSync(
              inputPath + "/sharedflowbundle/resources/" + resType + "/" + resFile,
              "utf8",
            );
            newProxy.resources.push(newFile);
          }
        }
      }
    }

    return newProxy;
  }

  public async proxyToApigeeZip(input: Proxy, removeDir: boolean = true): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      var zipfile = new yazl.ZipFile();
      let tempFilePath = this.tempPath + input.name;
      fs.mkdirSync(tempFilePath, { recursive: true });

      // endpoints
      for (let endpoint of input.endpoints || []) {
        let endpointXml: any = {
          ProxyEndpoint: {
            _attributes: {
              name: endpoint["name"],
            },
            HTTPProxyConnection: {
              BasePath: {
                _text: endpoint["basePath"] ?? "/" + (input.name || "default").toLowerCase().replaceAll(" ", "-"),
              },
            },
          },
        };

        // request preflow and postflow
        endpointXml["ProxyEndpoint"]["PreFlow"] = {
          _attributes: {
            name: "PreFlow",
          },
          Request: {},
          Response: {},
        };
        endpointXml["ProxyEndpoint"]["PostFlow"] = {
          _attributes: {
            name: "PostFlow",
          },
          Request: {},
          Response: {},
        };

        let conditionalFlows: Flow[] = [];
        for (let flow of endpoint.flows || []) {
          if (!flow.condition && flow.mode && (flow.name == "PreFlow" || flow.name == "PostFlow")) {
            if (!endpointXml["ProxyEndpoint"][flow.name]) {
              endpointXml["ProxyEndpoint"][flow.name] = {
                _attributes: {
                  name: flow.name,
                },
                Response: {},
              };
            }

            endpointXml["ProxyEndpoint"][flow.name][flow.mode] = this.flowJsonToXml(flow);
          } else {
            conditionalFlows.push(flow);
          }
        }
        if (conditionalFlows.length === 1 && conditionalFlows[0] && conditionalFlows[0].mode) {
          endpointXml["ProxyEndpoint"]["Flows"] = {
            Flow: {
              _attributes: {
                name: conditionalFlows[0]?.name,
              },
              Condition: {
                _text: conditionalFlows[0]?.condition,
              },
            },
          };
          endpointXml["ProxyEndpoint"]["Flows"]["Flow"][conditionalFlows[0].mode] =
            this.flowJsonToXml(conditionalFlows[0]);
        } else if (conditionalFlows.length > 1) {
          for (let conditionalFlow of conditionalFlows) {
            if (!endpointXml["ProxyEndpoint"]["Flows"])
              endpointXml["ProxyEndpoint"]["Flows"] = {
                Flow: [],
              };

            let endpointConditionFlow = endpointXml["ProxyEndpoint"]["Flows"]["Flow"].find(
              (x: any) => x["_attributes"]["name"] === conditionalFlow.name,
            );
            if (!endpointConditionFlow) {
              endpointConditionFlow = {
                _attributes: {
                  name: conditionalFlow.name,
                },
                Condition: {
                  _text: conditionalFlow.condition,
                },
              };
              endpointXml["ProxyEndpoint"]["Flows"]["Flow"].push(endpointConditionFlow);
            }
            if (conditionalFlow.mode)
              endpointConditionFlow[conditionalFlow.mode] = this.flowJsonToXml(conditionalFlow);
          }
        }

        // routes
        if (endpoint["routes"] && endpoint["routes"].length > 1) {
          endpointXml["ProxyEndpoint"]["RouteRule"] = [];
          for (let route of endpoint["routes"]) {
            let newRouteRule: any = {
              _attributes: {
                name: route["name"],
              },
            };
            if (route["target"]) {
              newRouteRule["TargetEndpoint"] = {
                _text: route["target"],
              };
            }
            if (route["condition"]) {
              newRouteRule["Condition"] = {
                _text: route["condition"],
              };
            }
            endpointXml["ProxyEndpoint"]["RouteRule"].push(newRouteRule);
          }
        } else if (endpoint["routes"] && endpoint["routes"].length === 1 && endpoint["routes"][0]) {
          endpointXml["ProxyEndpoint"]["RouteRule"] = {
            _attributes: {
              name: endpoint["routes"][0]["name"],
            },
          };
          if (endpoint["routes"][0]["target"]) {
            endpointXml["ProxyEndpoint"]["RouteRule"]["TargetEndpoint"] = {
              _text: endpoint["routes"][0]["target"],
            };
          }
          if (endpoint["routes"][0]["condition"]) {
            endpointXml["ProxyEndpoint"]["RouteRule"]["Condition"] = {
              _text: endpoint["routes"][0]["condition"],
            };
          }
        }

        // fault rules
        if (endpoint.faultRules && endpoint.faultRules.length > 1) {
          endpointXml["ProxyEndpoint"]["FaultRules"] = { FaultRule: [] };
          for (let faultRule of endpoint.faultRules) {
            let newFaultRule = this.flowJsonToXml(faultRule);
            newFaultRule["_attributes"] = {
              name: faultRule.name,
            };
            if (faultRule.condition)
              newFaultRule["Condition"] = {
                _text: faultRule.condition,
              };

            endpointXml["ProxyEndpoint"]["FaultRules"]["FaultRule"].push(newFaultRule);
          }
        } else if (
          endpoint.faultRules &&
          endpoint.faultRules.length == 1 &&
          endpoint.faultRules[0]
        ) {
          endpointXml["ProxyEndpoint"]["FaultRules"] = {
            FaultRule: this.flowJsonToXml(endpoint.faultRules[0]),
          };
          endpointXml["ProxyEndpoint"]["FaultRules"]["FaultRule"]["_attributes"] = {
            name: endpoint.faultRules[0].name,
          };
          if (endpoint.faultRules[0].condition) {
            endpointXml["ProxyEndpoint"]["FaultRules"]["FaultRule"]["Condition"] = {
              _text: endpoint.faultRules[0].condition,
            };
          }
        }

        // default fault rule
        if (endpoint.defaultFaultRule) {
          endpointXml["ProxyEndpoint"]["DefaultFaultRule"] = this.flowJsonToXml(
            endpoint.defaultFaultRule,
          );
          endpointXml["ProxyEndpoint"]["DefaultFaultRule"]["_attributes"] = {
            name: endpoint.defaultFaultRule.name,
          };
          if (endpoint.defaultFaultRule.alwaysEnforce) {
            endpointXml["ProxyEndpoint"]["DefaultFaultRule"]["AlwaysEnforce"] = {
              _text: "true",
            };
          }
        }

        fs.mkdirSync(tempFilePath + "/apiproxy/proxies", { recursive: true });
        let xmlString = xmljs.json2xml(JSON.stringify(endpointXml), {
          compact: true,
          spaces: 2,
        });
        fs.writeFileSync(
          tempFilePath + "/apiproxy/proxies/" + endpoint["name"] + ".xml",
          xmlString,
        );
        zipfile.addFile(
          tempFilePath + "/apiproxy/proxies/" + endpoint["name"] + ".xml",
          "apiproxy/proxies/" + endpoint["name"] + ".xml",
        );
      }

      // targets
      for (let target of input.targets || []) {
        let targetXml: any = {
          TargetEndpoint: {
            _attributes: {
              name: target["name"],
            },
          },
        };

        if (target.httpTargetConnection) {
          let targetJson = target.httpTargetConnection;
          // clean-structure
          targetJson = this.cleanJsonToXml(targetJson);
          targetXml["TargetEndpoint"]["HTTPTargetConnection"] = targetJson;
        } else if (target.localTargetConnection) {
          let targetJson = target.localTargetConnection;
          // clean-structure
          targetJson = this.cleanJsonToXml(targetJson);
          targetXml["TargetEndpoint"]["LocalTargetConnection"] = targetJson;
        } else if (target.url) {
          targetXml["TargetEndpoint"]["HTTPTargetConnection"] = {
            URL: {
              _text: target.url,
            },
          };
        }

        // GoogleAccessToken
        if (
          target.auth === "GoogleAccessToken" &&
          targetXml["TargetEndpoint"]["HTTPTargetConnection"]
        ) {
          targetXml["TargetEndpoint"]["HTTPTargetConnection"]["Authentication"] = {
            GoogleAccessToken: {
              Scopes: {
                Scope: {
                  _text: "https://www.googleapis.com/auth/cloud-platform",
                },
              },
            },
          };
        }

        targetXml["TargetEndpoint"]["PreFlow"] = {
          _attributes: {
            name: "PreFlow",
          },
          Request: {},
          Response: {},
        };
        targetXml["TargetEndpoint"]["PostFlow"] = {
          _attributes: {
            name: "PostFlow",
          },
          Request: {},
          Response: {},
        };

        for (let flow of target.flows || []) {
          if (!flow.condition && flow.mode) {
            if (!targetXml["TargetEndpoint"][flow.name] && flow.name == "EventFlow") {
              targetXml["TargetEndpoint"]["EventFlow"] = {
                _attributes: {
                  name: "EventFlow",
                  "content-type": "text/event-stream",
                },
                Response: {},
              };
            }
            targetXml["TargetEndpoint"][flow.name][flow.mode] = this.flowJsonToXml(flow);
          }
        }

        // fault rules
        if (target.faultRules && target.faultRules.length > 1) {
          targetXml["TargetEndpoint"]["FaultRules"] = { FaultRule: [] };
          for (let faultRule of target.faultRules) {
            let newFaultRule = this.flowJsonToXml(faultRule);
            newFaultRule["_attributes"] = {
              name: faultRule.name,
            };
            if (faultRule.condition)
              newFaultRule["Condition"] = {
                _text: faultRule.condition,
              };
            targetXml["TargetEndpoint"]["FaultRules"]["FaultRule"].push(newFaultRule);
          }
        } else if (
          target.faultRules &&
          target.faultRules.length == 1 &&
          target.faultRules[0]
        ) {
          targetXml["TargetEndpoint"]["FaultRules"] = {
            FaultRule: this.flowJsonToXml(target.faultRules[0]),
          };
          targetXml["TargetEndpoint"]["FaultRules"]["FaultRule"]["_attributes"] = {
            name: target.faultRules[0].name,
          };
          if (target.faultRules[0].condition) {
            targetXml["TargetEndpoint"]["FaultRules"]["FaultRule"]["Condition"] = {
              _text: target.faultRules[0].condition,
            };
          }
        }

        // default fault rule
        if (target.defaultFaultRule) {
          targetXml["TargetEndpoint"]["DefaultFaultRule"] = this.flowJsonToXml(
            target.defaultFaultRule,
          );
          targetXml["TargetEndpoint"]["DefaultFaultRule"]["_attributes"] = {
            name: target.defaultFaultRule.name,
          };
          if (target.defaultFaultRule.alwaysEnforce) {
            targetXml["TargetEndpoint"]["DefaultFaultRule"]["AlwaysEnforce"] = {
              _text: "true",
            };
          }
        }

        fs.mkdirSync(tempFilePath + "/apiproxy/targets", { recursive: true });
        let xmlString = xmljs.json2xml(JSON.stringify(targetXml), {
          compact: true,
          spaces: 2,
        });
        fs.writeFileSync(tempFilePath + "/apiproxy/targets/" + target["name"] + ".xml", xmlString);
        zipfile.addFile(
          tempFilePath + "/apiproxy/targets/" + target["name"] + ".xml",
          "apiproxy/targets/" + target["name"] + ".xml",
        );
      }

      // policies
      for (let policy of input["policies"] || []) {
        fs.mkdirSync(tempFilePath + "/apiproxy/policies", { recursive: true });
        let policyJson = policy["content"];
        // clean-structure
        policyJson = this.cleanJsonToXml(policyJson);
        let policyContent = JSON.stringify(policyJson);
        let xmlString = xmljs.json2xml(policyContent, {
          compact: true,
          spaces: 2,
        });
        fs.writeFileSync(tempFilePath + "/apiproxy/policies/" + policy["name"] + ".xml", xmlString);
        zipfile.addFile(
          tempFilePath + "/apiproxy/policies/" + policy["name"] + ".xml",
          "apiproxy/policies/" + policy["name"] + ".xml",
        );
      }

      // resources
      for (let resource of input["resources"] || []) {
        fs.mkdirSync(tempFilePath + "/apiproxy/resources/" + resource["type"], {
          recursive: true,
        });
        fs.writeFileSync(
          tempFilePath + "/apiproxy/resources/" + resource["type"] + "/" + resource["name"],
          resource["content"],
        );
        zipfile.addFile(
          tempFilePath + "/apiproxy/resources/" + "/" + resource["type"] + "/" + resource["name"],
          "apiproxy/resources/" + resource["type"] + "/" + resource["name"],
        );
      }

      // preserve documentation as resources
      fs.mkdirSync(tempFilePath + "/apiproxy/resources/jsc", {
        recursive: true,
      });
      fs.writeFileSync(
        tempFilePath + "/apiproxy/resources/jsc/metadata.js",
        `var metadata=${JSON.stringify(
          {
            name: input["name"],
            description: input["description"],
            documentation: input["documentation"],
            uid: input["uid"] ?? "",
            parameters: input["parameters"],
            priority: input["priority"],
            displayName: input["displayName"],
            categories: input["categories"],
          },
          null,
          2,
        )};`,
      );
      zipfile.addFile(
        tempFilePath + "/apiproxy/resources/jsc/metadata.js",
        "apiproxy/resources/jsc/metadata.js",
      );

      zipfile.outputStream
        .pipe(fs.createWriteStream(tempFilePath + ".zip"))
        .on("close", function () {
          if (removeDir) fs.rmSync(tempFilePath, { recursive: true });
          resolve(tempFilePath + ".zip");
        });
      zipfile.end();
    });
  }

  public flowsXmlToJson(sourceDoc: any): Flow[] {
    let resultFlows: Flow[] = [];

    if (
      sourceDoc &&
      sourceDoc["Flows"] &&
      sourceDoc["Flows"]["Flow"] &&
      sourceDoc["Flows"]["Flow"].length
    ) {
      for (let flow of sourceDoc["Flows"]["Flow"]) {
        let newFlows = this.flowsNodeToJson(flow);
        if (newFlows.length > 0) resultFlows = resultFlows.concat(newFlows);
        else {
          let emptyFlow: Flow = {
            name: flow["_attributes"]["name"],
            condition: flow["Condition"]["_text"],
            steps: [],
          };
          resultFlows.push(emptyFlow);
        }
      }
    } else if (sourceDoc && sourceDoc["Flows"] && sourceDoc["Flows"]["Flow"]) {
      let newFlows = this.flowsNodeToJson(sourceDoc["Flows"]["Flow"]);
      if (newFlows.length > 0) resultFlows = resultFlows.concat(newFlows);
    }

    return resultFlows;
  }

  public flowsNodeToJson(sourceDoc: any): Flow[] {
    let name: string = sourceDoc["_attributes"]["name"];
    let resultFlows: Flow[] = [];

    let resultRequestFlow = this.flowXmlNodeToJson(name, "Request", sourceDoc["Request"]);
    if (resultRequestFlow && resultRequestFlow.steps.length > 0) {
      if (sourceDoc["Condition"] && sourceDoc["Condition"]["_text"])
        resultRequestFlow.condition = sourceDoc["Condition"]["_text"];
      resultFlows.push(resultRequestFlow);
    }
    let resultResponseFlow = this.flowXmlNodeToJson(name, "Response", sourceDoc["Response"]);
    if (resultResponseFlow && resultResponseFlow.steps.length > 0) {
      if (sourceDoc["Condition"] && sourceDoc["Condition"]["_text"])
        resultResponseFlow.condition = sourceDoc["Condition"]["_text"];
      resultFlows.push(resultResponseFlow);
    }

    return resultFlows;
  }

  public flowXmlToJson(type: string, mode: string, sourceDoc: any): Flow | undefined {
    let resultFlow: Flow | undefined = undefined;
    if (sourceDoc && sourceDoc[type] && sourceDoc[type][mode])
      resultFlow = this.flowXmlNodeToJson(type, mode, sourceDoc[type][mode]);

    return resultFlow;
  }

  public flowXmlNodeToJson(name: string, mode: string, sourceDoc: any): Flow {
    let resultFlow: Flow = new Flow(name, mode);

    if (sourceDoc && sourceDoc["Step"] && sourceDoc["Step"].length > 0) {
      for (let step of sourceDoc["Step"]) {
        let newStep = new Step();
        newStep.name = step["Name"]["_text"];
        if (step["Condition"]) {
          newStep.condition = step["Condition"]["_text"];
        }

        resultFlow.steps.push(newStep);
      }
    } else if (sourceDoc && sourceDoc["Step"]) {
      let newStep = new Step();
      newStep.name = sourceDoc["Step"]["Name"]["_text"];
      if (sourceDoc["Step"]["Condition"]) {
        newStep.condition = sourceDoc["Step"]["Condition"]["_text"];
      }
      resultFlow.steps.push(newStep);
    }

    if (sourceDoc && sourceDoc["_attributes"] && sourceDoc["_attributes"]["position"])
      resultFlow.position = sourceDoc["_attributes"]["position"];

    return resultFlow;
  }

  public flowJsonToXml(sourceDoc: any): any {
    let result: any = {};
    // position
    if (sourceDoc["position"]) {
      if (!result["_attributes"]) result["_attributes"] = {};
      result["_attributes"]["position"] = sourceDoc["position"];
    }

    if (sourceDoc && sourceDoc["steps"] && sourceDoc["steps"].length > 1) {
      result["Step"] = [];
      for (let step of sourceDoc["steps"]) {
        let newStep: any = {
          Name: {
            _text: step["name"],
          },
        };
        if (step["condition"]) {
          newStep["Condition"] = {
            _text: step["condition"],
          };
        }
        result["Step"].push(newStep);
      }
    } else if (sourceDoc && sourceDoc["steps"] && sourceDoc["steps"].length == 1) {
      result["Step"] = {
        Name: {
          _text: sourceDoc["steps"][0]["name"],
        },
      };
      if (sourceDoc["steps"][0]["condition"]) {
        result["Step"]["Condition"] = {
          _text: sourceDoc["steps"][0]["condition"],
        };
      }
    }
    return result;
  }

  public policyGetType(sourceDoc: any): string {
    let type = "";

    for (let node of Object.keys(sourceDoc)) {
      if (!node.startsWith("_")) {
        type = node;
        break;
      }
    }
    return type;
  }

  public templateCreate(
    name: string,
    basePath: string | undefined,
    targetUrl: string | undefined,
    auth: string = "",
    aud: string = "",
    scopes: string[] = [],
  ): Template {
    let tempName = name.replaceAll(" ", "-");
    let newTemplate: Template = {
      name: tempName,
      type: "template",
      description: "API template for " + name,
      gateway: "apigee",
      schemaVersion: "1.0.0",
      features: [],
      parameters: [],
      endpoints: [],
      targets: [],
    };

    if (basePath) {
      newTemplate.endpoints.push({
        name: "default",
        basePath: basePath,
        routes: [
          {
            name: "default",
          },
        ],
      });
    }

    if (targetUrl) {
      let newTarget: Target = {
        name: "default",
        url: targetUrl,
      };
      if (auth) newTarget.auth = auth;
      if (scopes) newTarget.scopes = scopes;
      if (aud) newTarget.aud = aud;

      newTemplate.targets.push(newTarget);

      if (newTemplate.endpoints[0] && newTemplate.endpoints[0].routes[0])
        newTemplate.endpoints[0].routes[0].target = "default";
    }

    return newTemplate;
  }

  public templateApplyFeature(
    template: Template,
    feature: Feature,
    featurePath: string,
    parameters: { [key: string]: string } = {},
  ): Template {
    // replace parameters from runtime, if configured
    let tempFeature = feature; // this.featureReplaceParameters(feature, [], parameters);

    if (tempFeature.endpoints && tempFeature.endpoints.length > 0) {
      for (let endpoint of tempFeature.endpoints) {
        if (endpoint.name != "default") {
          let templateEndpoint = new Endpoint();
          templateEndpoint.name = endpoint.name;
          templateEndpoint.basePath = endpoint.basePath;
          templateEndpoint.routes = endpoint.routes;
          template.endpoints.push(templateEndpoint);
        }
      }
    }

    if (tempFeature.targets && tempFeature.targets.length > 0) {
      for (let target of tempFeature.targets) {
        if (target.name != "default") {
          let templateTarget: Target = {
            name: target.name,
            url: target.url,
          };
          if (target.auth) templateTarget.auth = target.auth;
          if (target.scopes) templateTarget.scopes = target.scopes;
          if (target.aud) templateTarget.aud = target.aud;
          template.targets.push(templateTarget);
        }
      }
    }

    template.features.push(featurePath);

    // add parameters with feature name and uid if available
    for (let parameter of tempFeature.parameters || []) {
      // set default if one was passed in
      if (parameters[parameter.name])
        parameter.default = parameters[parameter.name] ?? parameter.default;

      template.parameters.push(parameter);
    }

    return template;
  }

  public templateRemoveFeature(
    template: Template,
    templateFeatures: Feature[],
    removeFeaturePath: string,
    removeFeature: Feature,
  ): Template {
    let featureIndex = templateFeatures.findIndex((x) => x.name === removeFeature.name);
    let featurePathIndex = template.features.findIndex((x) => x.endsWith(removeFeaturePath));
    if (featureIndex != -1 && featurePathIndex != -1) {
      templateFeatures.splice(featureIndex, 1);
      template.features.splice(featurePathIndex, 1);
      if (removeFeature.endpoints && removeFeature.endpoints.length > 0) {
        for (let endpoint of removeFeature.endpoints) {
          if (endpoint.name != "default") {
            // add feature uid, if it exists
            if (removeFeature.uid) endpoint.name = removeFeature.uid + "-" + endpoint.name;
            let index = template.endpoints.findIndex((x) => x.name === endpoint.name);
            if (index != -1) template.endpoints.splice(index, 1);
          }
        }
      }

      if (removeFeature.targets && removeFeature.targets.length > 0) {
        for (let target of removeFeature.targets) {
          if (target.name != "default") {
            // add feature uid, if it exists
            if (removeFeature.uid) target.name = removeFeature.uid + "-" + target.name;
            let index = template.targets.findIndex((x) => x.name === target.name);
            if (index != -1) template.targets.splice(index, 1);
          }
        }
      }

      for (let parameter of removeFeature.parameters || []) {
        let index = template.parameters.findIndex((x) => x.name === parameter.name);
        if (index != -1) template.parameters.splice(index, 1);
      }
    }

    return template;
  }

  public templateToProxy(
    template: Template,
    features: Feature[],
    parameters: { [key: string]: string } = {},
  ): Proxy {
    let proxy: Proxy = new Proxy();
    proxy.name = template.name;
    proxy.description = template.description;
    proxy.parameters = template.parameters || [];
    if (template.priority) proxy.priority = template.priority;
    if (template.tests) proxy.tests = template.tests;

    if ((template.endpoints || []).length > 0 && (features || []).length == 0) {
      // this is an empty template, so at least add a default enpoint
      let name = template.endpoints[0]?.basePath
        ? template.endpoints[0]?.basePath.replaceAll("/", "")
        : "default";
      proxy.endpoints.push({
        name: name,
        basePath: template.endpoints[0]?.basePath ?? "",
        routes: [
          {
            name: name,
          },
        ],
        flows: [],
      });

      if ((template.targets || []).length > 0 && template.targets[0]) {
        if (
          proxy.endpoints.length > 0 &&
          proxy.endpoints[0] &&
          (proxy.endpoints[0].routes || []).length > 0 &&
          proxy.endpoints[0].routes[0]
        )
          proxy.endpoints[0].routes[0].target = name;
        proxy.targets.push({
          name: name,
          url: template.targets[0].url ?? "",
          flows: []
        });
      }
    }

    proxy = this.proxyApplyFeatures(proxy, features, parameters);

    return proxy;
  }

  public proxyApplyFeatures(
    proxy: Proxy,
    features: Feature[],
    parameters: { [key: string]: string } = {},
  ): Proxy {
    // replace any runtime parameters
    this.proxyUpdateParameters(proxy, parameters);

    // sort features by priority
    (features || []).sort((a, b) => {
      let aPrio = a.priority ?? 100;
      let bPrio = b.priority ?? 100;
      return aPrio - bPrio;
    });

    // first apply features with targets & endpoints
    for (let feature of features || []) {
      if ((feature.endpoints || []).length > 0 || (feature.targets || []).length > 0) {
        proxy = this.proxyApplyFeature(proxy, feature, parameters);
      }
    }

    // now apply features with just policies
    for (let feature of features || []) {
      if ((feature.endpoints || []).length === 0 && (feature.targets || []).length === 0) {
        proxy = this.proxyApplyFeature(proxy, feature, parameters);
      }
    }

    return proxy;
  }

  public templateUpdateParameters(template: Template, parameters: { [key: string]: string } = {}) {
    for (let proxyParameter of template.parameters || []) {
      for (let key of Object.keys(parameters)) {
        if (proxyParameter.default && proxyParameter.default.toString().includes("{" + key + "}") && parameters[key]) {
          proxyParameter.default = proxyParameter.default.replaceAll(
            "{" + key + "}",
            parameters[key],
          );
        } else if (
          (proxyParameter.name === key || proxyParameter.name.endsWith("." + key)) &&
          parameters[key]
        ) {
          proxyParameter.default = parameters[key];
        }
      }
    }
  }

  public templateToStringArray(template: Template): string[] {
    let result: string[] = [];
    if (template.name) result.push(`Name: ${template.name}`);
    if (template.description) result.push(`Description: ${template.description}`);

    if (template.features && template.features.length > 0) {
      result.push(`Features:`);
      for (let feature of template.features) {
        result.push(`- ${feature}`);
      }
    } else {
      result.push(`Features: none`);
    }

    if (template.endpoints && template.endpoints.length > 0) {
      result.push(`Endpoints:`);
      for (let endpoint of template.endpoints) {
        result.push(`- ${endpoint.basePath}`);
      }
    } else {
      result.push(`Endpoints: none`);
    }

    if (template.targets && template.targets.length > 0) {
      result.push(`Targets:`);
      for (let target of template.targets) {
        result.push(`- ${target.name} - ${target.url}`);
      }
    } else {
      result.push(`Targets: none`);
    }

    return result;
  }

  public templateToString(template: Template): string {
    let result = this.templateToStringArray(template);
    return result.join("\n");
  }

  public featureToProxy(feature: Feature, parameters: { [key: string]: string }): Proxy {
    let newFeature = this.featureReplaceParameters(feature, [], parameters);
    let newProxy = new Proxy();
    newProxy.name = newFeature.name;
    newProxy.description = newFeature.description;
    if (newFeature.documentation) newProxy.documentation = newFeature.documentation;
    // keep original parameters, non-replaced
    newProxy.parameters = newFeature.parameters;
    if (newFeature.displayName) newProxy.displayName = newFeature.displayName;
    if (newFeature.categories) newProxy.categories = newFeature.categories;
    if (newFeature.uid) newProxy.uid = newFeature.uid;
    if (newFeature.priority) newProxy.priority = newFeature.priority;
    if (newFeature.tests) newProxy.tests = newFeature.tests;

    let defaultEndpoint: ProxyEndpoint | undefined = undefined;

    if ((newFeature.endpoints || []).length === 0 || newFeature.defaultEndpoint) {
      if (!newFeature.defaultEndpoint) {
        defaultEndpoint = new ProxyEndpoint();
        defaultEndpoint.name = "default";
        defaultEndpoint.basePath = "/" + newProxy.name.toLowerCase().replaceAll(" ", "-");
        defaultEndpoint.routes.push({
          name: "default",
        });
      } else {
        defaultEndpoint = newFeature.defaultEndpoint;
        if (!defaultEndpoint.flows) defaultEndpoint.flows = [];
        if (!defaultEndpoint.basePath)
          defaultEndpoint.basePath = "/" + newProxy.name.toLowerCase().replaceAll(" ", "-");
        if (!defaultEndpoint.routes || defaultEndpoint.routes.length === 0) {
          defaultEndpoint.routes = [
            {
              name: defaultEndpoint.name || "default",
              target: newFeature.defaultTarget?.name || "default",
            },
          ];
        }
      }

      if (defaultEndpoint) newProxy.endpoints.push(defaultEndpoint);
    }

    if (newFeature.defaultTarget) {
      if (!newFeature.defaultTarget.flows) newFeature.defaultTarget.flows = [];
      newProxy.targets.push(newFeature.defaultTarget);
    } else if ((newFeature.targets || []).length === 0) {
      // no default target for now, Apigee automatically returns request
      // for no-target proxies, which is nice.
    }

    newProxy.endpoints = (newProxy.endpoints || []).concat(newFeature.endpoints || []);
    newProxy.targets = (newProxy.targets || []).concat(newFeature.targets || []);
    newProxy.policies = newFeature.policies || [];
    newProxy.resources = newFeature.resources || [];

    return newProxy;
  }

  public featureApplyFeature(
    originalFeature: Feature,
    feature: Feature,
    parameters: { [key: string]: string } = {},
  ): Proxy {
    let applyFeature = feature;
    // merge / overwrite originalFeature.parameters with applyFeature.parameters
    if (applyFeature.parameters && applyFeature.parameters.length > 0) {
      if (!originalFeature.parameters) originalFeature.parameters = [];
      for (let param of applyFeature.parameters) {
        let paramIndex = originalFeature.parameters.findIndex((x) => x.name === param.name);
        if (paramIndex === -1) {
          originalFeature.parameters.push(param);
        } else {
          originalFeature.parameters[paramIndex] = param;
        }
      }
    }

    // merge endpoint flows
    if (applyFeature.defaultEndpoint) {
      // default endpoint
      if (originalFeature.defaultEndpoint)
        this.featureMergeEndpoints(applyFeature, originalFeature.defaultEndpoint);

      for (let endpoint of originalFeature.endpoints || []) {
        this.featureMergeEndpoints(applyFeature, endpoint);
      }
    }

    // merge target flows
    if (applyFeature.defaultTarget) {
      if (originalFeature.defaultTarget)
        this.featureMergeTargets(applyFeature, originalFeature.defaultTarget);
      for (let target of originalFeature.targets || []) {
        this.featureMergeTargets(applyFeature, target);
      }
    }

    // merge policies
    if (applyFeature.policies && applyFeature.policies.length > 0) {
      if (!originalFeature.policies) originalFeature.policies = [];
      for (let policy of applyFeature.policies) {
        let policyIndex = originalFeature.policies.findIndex((x) => x.name === policy.name);
        if (policyIndex === -1) {
          originalFeature.policies.push(policy);
        } else {
          // console.log(`Policy "${policy.name}" already exists, overwriting...\n`);
          originalFeature.policies[policyIndex] = policy;
        }
      }
    }

    // merge resources
    if (applyFeature.resources && applyFeature.resources.length > 0) {
      if (!originalFeature.resources) originalFeature.resources = [];
      for (let resource of applyFeature.resources) {
        let resourceIndex = originalFeature.resources.findIndex((x) => x.name === resource.name);
        if (resourceIndex === -1) {
          originalFeature.resources.push(resource);
        } else {
          // console.log(`Resource "${resource.name}" already exists, overwriting...\n`);
          originalFeature.resources[resourceIndex] = resource;
        }
      }
    }

    return originalFeature;
  }

  public featureMergeEndpoints(applyFeature: Feature, endpoint: ProxyEndpoint) {
    if (applyFeature.defaultEndpoint) {
      if (applyFeature.defaultEndpoint.flows) {
        if (!endpoint.flows) endpoint.flows = [];
        for (let featureFlow of applyFeature.defaultEndpoint.flows) {
          let foundFlow = false;
          for (let proxyFlow of endpoint.flows) {
            if (
              proxyFlow.name == featureFlow.name &&
              proxyFlow.mode == featureFlow.mode &&
              proxyFlow.condition == featureFlow.condition
            ) {
              foundFlow = true;
              let topStepArray: Step[] = [];
              for (let step of featureFlow.steps || []) {
                let stepIndex = proxyFlow.steps.findIndex((x) => x.name === step.name);
                if (stepIndex === -1) {
                  if (featureFlow.position && featureFlow.position == "top") topStepArray.push(step);
                  else proxyFlow.steps.push(step);
                } else {
                  // console.log(
                  //   `Overwriting step name ${step.name} found in proxy flow ${proxyFlow.name}.\n`,
                  // );
                  proxyFlow.steps[stepIndex] = step;
                }
              }

              // now unshift top steps, if needed..
              if (topStepArray.length > 0) proxyFlow.steps.unshift(...topStepArray);
              break;
            }
          }

          if (!foundFlow) {
            let newFlow = new Flow(featureFlow.name, featureFlow.mode, featureFlow.condition);
            newFlow.steps = newFlow.steps.concat(featureFlow.steps || []);
            endpoint.flows.push(newFlow);
          }
        }
      }

      if (applyFeature.defaultEndpoint.routes) {
        if (!endpoint.routes) endpoint.routes = [];
        for (let route of applyFeature.defaultEndpoint.routes) {
          let existingRouteIndex = endpoint.routes.findIndex((x) => x.name === route.name);
          if (existingRouteIndex === -1) {
            let defaultRouteIndex = endpoint.routes.findIndex(
              (r) => !r.condition && (r.name === "default" || !r.condition),
            );
            if (route.condition && defaultRouteIndex !== -1) {
              endpoint.routes.splice(defaultRouteIndex, 0, JSON.parse(JSON.stringify(route)));
            } else {
              endpoint.routes.push(JSON.parse(JSON.stringify(route)));
            }
          } else {
            endpoint.routes[existingRouteIndex] = JSON.parse(JSON.stringify(route));
          }
        }
      }

      if (applyFeature.defaultEndpoint.faultRules) {
        if (!endpoint.faultRules) endpoint.faultRules = [];
        for (let fr of applyFeature.defaultEndpoint.faultRules) {
          let existingFr = endpoint.faultRules.find((x) => x.name === fr.name);
          if (existingFr) {
            if (!existingFr.steps) existingFr.steps = [];
            for (let step of fr.steps || []) {
              let stepIndex = existingFr.steps.findIndex((x) => x.name === step.name);
              if (stepIndex === -1) {
                existingFr.steps.push(JSON.parse(JSON.stringify(step)));
              } else {
                existingFr.steps[stepIndex] = JSON.parse(JSON.stringify(step));
              }
            }
          } else {
            endpoint.faultRules.push(JSON.parse(JSON.stringify(fr)));
          }
        }
      }

      if (applyFeature.defaultEndpoint.defaultFaultRule) {
        if (endpoint.defaultFaultRule) {
          if (!endpoint.defaultFaultRule.steps) endpoint.defaultFaultRule.steps = [];
          for (let step of applyFeature.defaultEndpoint.defaultFaultRule.steps || []) {
            let stepIndex = endpoint.defaultFaultRule.steps.findIndex((x) => x.name === step.name);
            if (stepIndex === -1) {
              endpoint.defaultFaultRule.steps.push(JSON.parse(JSON.stringify(step)));
            } else {
              endpoint.defaultFaultRule.steps[stepIndex] = JSON.parse(JSON.stringify(step));
            }
          }
        } else {
          endpoint.defaultFaultRule = JSON.parse(
            JSON.stringify(applyFeature.defaultEndpoint.defaultFaultRule),
          );
        }
      }
    }
  }

  public featureMergeTargets(applyFeature: Feature, target: ProxyTarget) {
    if (applyFeature.defaultTarget) {
      if (applyFeature.defaultTarget.flows) {
        if (!target.flows) target.flows = [];
        for (let featureFlow of applyFeature.defaultTarget.flows) {
          let foundFlow = false;
          for (let targetFlow of target.flows) {
            if (
              targetFlow.name == featureFlow.name &&
              targetFlow.mode == featureFlow.mode &&
              targetFlow.condition == featureFlow.condition
            ) {
              foundFlow = true;
              let topStepArray: Step[] = [];
              for (let step of featureFlow.steps || []) {
                let stepIndex = targetFlow.steps.findIndex((x) => x.name === step.name);
                if (stepIndex === -1) {
                  if (featureFlow.position && featureFlow.position == "top") topStepArray.push(step);
                  else targetFlow.steps.push(step);
                } else {
                  // console.log(
                  //   `Overwriting step name ${step.name} found in target flow ${targetFlow.name}.\n`,
                  // );
                  targetFlow.steps[stepIndex] = step;
                }
              }

              // now unshift top steps, if needed..
              if (topStepArray.length > 0) targetFlow.steps.unshift(...topStepArray);
              break;
            }
          }

          if (!foundFlow) {
            let newFlow = new Flow(featureFlow.name, featureFlow.mode, featureFlow.condition);
            newFlow.steps = newFlow.steps.concat(featureFlow.steps || []);
            target.flows.push(newFlow);
          }
        }
      }

      if (applyFeature.defaultTarget.faultRules) {
        if (!target.faultRules) target.faultRules = [];
        for (let fr of applyFeature.defaultTarget.faultRules) {
          let existingFr = target.faultRules.find((x) => x.name === fr.name);
          if (existingFr) {
            if (!existingFr.steps) existingFr.steps = [];
            for (let step of fr.steps || []) {
              let stepIndex = existingFr.steps.findIndex((x) => x.name === step.name);
              if (stepIndex === -1) {
                existingFr.steps.push(JSON.parse(JSON.stringify(step)));
              } else {
                existingFr.steps[stepIndex] = JSON.parse(JSON.stringify(step));
              }
            }
          } else {
            target.faultRules.push(JSON.parse(JSON.stringify(fr)));
          }
        }
      }

      if (applyFeature.defaultTarget.defaultFaultRule) {
        if (target.defaultFaultRule) {
          if (!target.defaultFaultRule.steps) target.defaultFaultRule.steps = [];
          for (let step of applyFeature.defaultTarget.defaultFaultRule.steps || []) {
            let stepIndex = target.defaultFaultRule.steps.findIndex((x) => x.name === step.name);
            if (stepIndex === -1) {
              target.defaultFaultRule.steps.push(JSON.parse(JSON.stringify(step)));
            } else {
              target.defaultFaultRule.steps[stepIndex] = JSON.parse(JSON.stringify(step));
            }
          }
        } else {
          target.defaultFaultRule = JSON.parse(
            JSON.stringify(applyFeature.defaultTarget.defaultFaultRule),
          );
        }
      }
    }
  }

  public featureRemoveFeature(originalFeature: Feature, feature: Feature) {
    for (let policy of feature.policies || []) {
      if (originalFeature.defaultEndpoint) {
        if (originalFeature.defaultEndpoint.flows)
          this.featureRemovePolicy(policy, originalFeature.defaultEndpoint.flows);
        if (originalFeature.defaultEndpoint.faultRules)
          this.featureRemovePolicy(policy, originalFeature.defaultEndpoint.faultRules);
        if (originalFeature.defaultEndpoint.defaultFaultRule && originalFeature.defaultEndpoint.defaultFaultRule.steps)
          this.featureRemovePolicy(policy, [originalFeature.defaultEndpoint.defaultFaultRule as any]);
      }
      for (let endpoint of originalFeature.endpoints || []) {
        if (endpoint.flows) this.featureRemovePolicy(policy, endpoint.flows);
        if (endpoint.faultRules) this.featureRemovePolicy(policy, endpoint.faultRules);
        if (endpoint.defaultFaultRule && endpoint.defaultFaultRule.steps)
          this.featureRemovePolicy(policy, [endpoint.defaultFaultRule as any]);
      }
      if (originalFeature.defaultTarget) {
        if (originalFeature.defaultTarget.flows)
          this.featureRemovePolicy(policy, originalFeature.defaultTarget.flows);
        if (originalFeature.defaultTarget.faultRules)
          this.featureRemovePolicy(policy, originalFeature.defaultTarget.faultRules);
        if (originalFeature.defaultTarget.defaultFaultRule && originalFeature.defaultTarget.defaultFaultRule.steps)
          this.featureRemovePolicy(policy, [originalFeature.defaultTarget.defaultFaultRule as any]);
      }
      for (let target of originalFeature.targets || []) {
        if (target.flows) this.featureRemovePolicy(policy, target.flows);
        if (target.faultRules) this.featureRemovePolicy(policy, target.faultRules);
        if (target.defaultFaultRule && target.defaultFaultRule.steps)
          this.featureRemovePolicy(policy, [target.defaultFaultRule as any]);
      }

      if (originalFeature.policies) {
        let policyIndex = originalFeature.policies.findIndex((x) => policy.name === x.name);
        if (policyIndex != -1) originalFeature.policies.splice(policyIndex, 1);
      }
    }

    for (let resource of feature.resources || []) {
      if (originalFeature.resources) {
        let resourceIndex = originalFeature.resources.findIndex((x) => resource.name === x.name);
        if (resourceIndex != -1) originalFeature.resources.splice(resourceIndex, 1);
      }
    }

    if (feature.defaultEndpoint && feature.defaultEndpoint.routes) {
      for (let route of feature.defaultEndpoint.routes) {
        if (originalFeature.defaultEndpoint && originalFeature.defaultEndpoint.routes) {
          let index = originalFeature.defaultEndpoint.routes.findIndex(
            (x) =>
              x.name === route.name ||
              x.name === (feature.uid ? feature.uid + "-" + route.name : route.name),
          );
          if (index != -1) originalFeature.defaultEndpoint.routes.splice(index, 1);
        }
        for (let endpoint of originalFeature.endpoints || []) {
          let index = (endpoint.routes || []).findIndex(
            (x) =>
              x.name === route.name ||
              x.name === (feature.uid ? feature.uid + "-" + route.name : route.name),
          );
          if (index != -1) endpoint.routes.splice(index, 1);
        }
      }
    }
  }

  public featureRemovePolicy(policy: Policy, flows: Flow[] | FaultRule[]) {
    for (let flow of (flows || []) as Flow[]) {
      if (flow.steps) {
        let policyIndex = flow.steps.findIndex((x) => policy.name === x.name);
        if (policyIndex != -1) {
          flow.steps.splice(policyIndex, 1);
        }
      }
    }
  }

  public featureReplaceParameters(
    feature: Feature,
    proxyParameters: Parameter[],
    parameters: { [key: string]: string },
  ): Feature {
    let featureString = JSON.stringify(feature);
    let proxyParametersString = JSON.stringify(proxyParameters);

    // replace parameter values
    for (let i = 0; i < (feature.parameters || []).length; i++) {
      let tempFeature = JSON.parse(featureString) as Feature;
      let tempProxyParameters = JSON.parse(proxyParametersString) as Parameter[];

      let parameter = (tempFeature.parameters || [])[i];
      if (parameter) {
        let paramValue = parameter.default;
        let proxyParam = tempProxyParameters.find((x) => x.name === parameter.name);
        if (proxyParam && proxyParam.default) paramValue = proxyParam.default;

        if (parameters[parameter.name]) paramValue = parameters[parameter.name] ?? "";
        else if (parameters[parameter.name]) paramValue = parameters[parameter.name] ?? "";

        // apply map, if configured
        if (parameter.maps && parameter.maps[paramValue]) {
          if (parameter.maps[paramValue]?.startsWith("remove=")) {
            let removePath = parameter.maps[paramValue]?.replace("remove=", "");
            let removePaths = removePath ? removePath.split(",") : [];
            for (let path of removePaths) {
              tempFeature = this.removeJsonNodes(tempFeature, path);
              featureString = JSON.stringify(tempFeature);
            }
          } else {
            paramValue = parameter.maps[paramValue] ?? paramValue;
          }
        }

        let replaceKey = "{" + parameter.name + "}";
        if (parameter.paths) {
          for (let path of parameter.paths) {
            let newParamValue = paramValue;
            let newPath = path;
            if (path.includes(".substring(")) {
              // substring value
              let substringPieces = path.split(".substring(");
              if (substringPieces && substringPieces.length === 2 && substringPieces[1]) {
                newPath = substringPieces[0] ?? "";
                let chopNumber = substringPieces[1].slice(0, -1);
                newParamValue = newParamValue.substring(parseInt(chopNumber));
              }
            }
            const matches = JSONPath({ path: newPath, json: tempFeature, resultType: "all" });
            if (matches.length > 0) {
              for (const match of matches) {
                if (match.parent && match.parentProperty !== undefined) {
                  match.parent[match.parentProperty] = newParamValue;
                }
              }
            }
            parameter.default = newParamValue;
            featureString = JSON.stringify(tempFeature);
          }
        } else {
          parameter.default = paramValue;
          featureString = JSON.stringify(tempFeature);
          featureString = featureString.replaceAll(replaceKey, paramValue);
        }
        proxyParametersString = proxyParametersString.replaceAll(replaceKey, paramValue);
      }
    }

    return JSON.parse(featureString);
  }

  public featureUpdateParameters(feature: Feature, parameters: { [key: string]: string } = {}) {
    for (let featureParameter of feature.parameters || []) {
      for (let key of Object.keys(parameters)) {
        if (featureParameter.default && featureParameter.default.toString().includes("{" + key + "}") && parameters[key]) {
          featureParameter.default = featureParameter.default.replaceAll(
            "{" + key + "}",
            parameters[key],
          );
        } else if (
          (featureParameter.name === key || featureParameter.name.endsWith("." + key)) &&
          parameters[key]
        ) {
          featureParameter.default = parameters[key];
        }
      }
    }
  }

  public featureToStringArray(feature: Feature): string[] {
    let result: string[] = [];
    if (feature.name) result.push(`Name: ${feature.name}`);
    // if (feature.description) result.push(`Description: ${feature.description}`);

    if (feature.parameters && feature.parameters.length > 0) {
      result.push(`Parameters:`);
      for (let parameter of feature.parameters) {
        result.push(
          `- ${parameter.name} - ${parameter.description} - ${"Default: " + (parameter.default ? parameter.default : "none")}`,
        );
        // if (parameter.default) result.push(`- Default: ${parameter.default}`);
        // if (parameter.examples && parameter.examples.length > 0)
        //   result.push(`- Examples: ${parameter.examples.toString()}`);
      }
    } else {
      result.push(`Parameters: none`);
    }

    if (feature.endpoints && feature.endpoints.length > 0) {
      result.push(`Endpoints:`);
      for (let endpoint of feature.endpoints) {
        result.push(`- ${endpoint.basePath}`);
      }
    } else {
      result.push(`Endpoints: none`);
    }

    if (feature.defaultEndpoint && feature.defaultEndpoint.flows && feature.defaultEndpoint.flows.length > 0) {
      result.push(`Endpoint flows:`);
      for (let flow of feature.defaultEndpoint.flows) {
        if (flow.condition) result.push(`- ${flow.name} - ${flow.mode} - ${flow.condition}`);
        else result.push(`- ${flow.name} - ${flow.mode}`);
        for (let step of flow.steps || []) {
          if (step.condition) result.push(`  - ${step.name} - ${step.condition}`);
          else result.push(`  - ${step.name}`);
        }
      }
    } else {
      result.push(`Endpoint flows: none`);
    }

    if (feature.targets && feature.targets.length > 0) {
      result.push(`Targets:`);
      for (let target of feature.targets) {
        result.push(`- ${target.name} - ${target.url}`);
      }
    } else {
      result.push(`Targets: none`);
    }

    if (feature.defaultTarget && feature.defaultTarget.flows && feature.defaultTarget.flows.length > 0) {
      result.push(`Target flows:`);
      for (let flow of feature.defaultTarget.flows) {
        if (flow.condition) result.push(`- ${flow.name} - ${flow.mode} - ${flow.condition}`);
        else result.push(`- ${flow.name} - ${flow.mode}`);
        for (let step of flow.steps || []) {
          if (step.condition) result.push(`- ${step.name} - ${step.condition}`);
          else result.push(`- ${step.name}`);
        }
      }
    } else {
      result.push(`Target flows: none`);
    }

    if (feature.policies && feature.policies.length > 0) {
      result.push(`Policies:`);
      for (let policy of feature.policies) {
        result.push(`- ${policy.name} - ${policy.type}`);
      }
    } else {
      result.push(`Policies: none`);
    }

    if (feature.resources && feature.resources.length > 0) {
      result.push(`Resources:`);
      for (let resource of feature.resources) {
        result.push(`- ${resource.name} - ${resource.type}`);
      }
    } else {
      result.push(`Resources: none`);
    }

    return result;
  }

  public featureToString(feature: Feature): string {
    let result = this.featureToStringArray(feature);
    return result.join("\n");
  }

  public proxyApplyFeature(
    proxy: Proxy,
    feature: Feature,
    parameters: { [key: string]: string } = {},
  ): Proxy {
    // replace parameters from runtime
    let applyFeature = this.featureReplaceParameters(feature, proxy.parameters || [], parameters);

    // merge endpoint flows
    if (applyFeature.defaultEndpoint) {
      for (let endpoint of proxy.endpoints || []) {
        this.featureMergeEndpoints(applyFeature, endpoint);
      }
    }

    // merge target flows
    if (applyFeature.defaultTarget) {
      for (let target of proxy.targets || []) {
        this.featureMergeTargets(applyFeature, target);
      }
    }

    // if feature has endpoints
    if (applyFeature.endpoints && applyFeature.endpoints.length > 0) {
      if (!proxy.endpoints) proxy.endpoints = [];
      for (let tempEndpoint of applyFeature.endpoints) {
        let endpointIndex = proxy.endpoints.findIndex((x) => x.name === tempEndpoint.name);
        if (endpointIndex === -1) {
          proxy.endpoints.push(tempEndpoint);
        } else {
          // console.log(`Endpoint "${tempEndpoint.name}" already exists, overwriting...\n`);
          proxy.endpoints[endpointIndex] = tempEndpoint;
        }
      }
    }

    // if feature has targets
    if (applyFeature.targets && applyFeature.targets.length > 0) {
      if (!proxy.targets) proxy.targets = [];
      for (let tempTarget of applyFeature.targets) {
        let targetIndex = proxy.targets.findIndex((x) => x.name === tempTarget.name);
        if (targetIndex === -1) {
          proxy.targets.push(tempTarget);
        } else {
          // console.log(`Target "${tempTarget.name}" already exists, overwriting...\n`);
          proxy.targets[targetIndex] = tempTarget;
        }
      }
    }

    // merge policies
    if (applyFeature.policies && applyFeature.policies.length > 0) {
      if (!proxy.policies) proxy.policies = [];
      for (let policy of applyFeature.policies) {
        let policyIndex = proxy.policies.findIndex((x) => x.name === policy.name);
        if (policyIndex === -1) {
          proxy.policies.push(policy);
        } else {
          // console.log(`Policy "${policy.name}" already exists, overwriting...\n`);
          proxy.policies[policyIndex] = policy;
        }
      }
    }

    // merge resources
    if (applyFeature.resources && applyFeature.resources.length > 0) {
      if (!proxy.resources) proxy.resources = [];
      for (let resource of applyFeature.resources) {
        let resourceIndex = proxy.resources.findIndex((x) => x.name === resource.name);
        if (resourceIndex === -1) {
          proxy.resources.push(resource);
        } else {
          // console.log(`Resource "${resource.name}" already exists, overwriting...\n`);
          proxy.resources[resourceIndex] = resource;
        }
      }
    }

    return proxy;
  }

  public proxyRemoveFeature(proxy: Proxy, feature: Feature): Proxy {
    // remove parameters
    for (let parameter of feature.parameters || []) {
      if (proxy.parameters) {
        let index = proxy.parameters.findIndex(
          (x) => x.name == parameter.name && x.default == parameter.default,
        );
        if (index != -1) proxy.parameters.splice(index, 1);
      }
    }

    // remove default endpoint flow steps
    if (feature.defaultEndpoint) {
      if (feature.defaultEndpoint.flows) {
        for (let featureFlow of feature.defaultEndpoint.flows) {
          for (let endpoint of proxy.endpoints || []) {
            for (let proxyFlow of endpoint.flows || []) {
              if (
                proxyFlow.name == featureFlow.name &&
                proxyFlow.mode == featureFlow.mode &&
                proxyFlow.condition == featureFlow.condition
              ) {
                for (let step of featureFlow.steps || []) {
                  let index = proxyFlow.steps.findIndex(
                    (x) => x.name === feature.uid + "-" + step.name && x.condition === step.condition,
                  );
                  if (index != -1) proxyFlow.steps.splice(index, 1);
                }
                break;
              }
            }
          }
        }
      }

      if (feature.defaultEndpoint.faultRules) {
        for (let featureFr of feature.defaultEndpoint.faultRules) {
          for (let endpoint of proxy.endpoints || []) {
            for (let fr of endpoint.faultRules || []) {
              if (
                fr.name === featureFr.name ||
                fr.name === (feature.uid ? feature.uid + "-" + featureFr.name : featureFr.name)
              ) {
                for (let step of featureFr.steps || []) {
                  let index = (fr.steps || []).findIndex(
                    (x) =>
                      (x.name === step.name ||
                        x.name === (feature.uid ? feature.uid + "-" + step.name : step.name)) &&
                      x.condition === step.condition,
                  );
                  if (index != -1) fr.steps.splice(index, 1);
                }
              }
            }
          }
        }
      }

      if (feature.defaultEndpoint.routes) {
        for (let featureRoute of feature.defaultEndpoint.routes) {
          for (let endpoint of proxy.endpoints || []) {
            let index = (endpoint.routes || []).findIndex(
              (x) =>
                x.name === featureRoute.name ||
                x.name === (feature.uid ? feature.uid + "-" + featureRoute.name : featureRoute.name),
            );
            if (index != -1) endpoint.routes.splice(index, 1);
          }
        }
      }

      if (feature.defaultEndpoint.defaultFaultRule && feature.defaultEndpoint.defaultFaultRule.steps) {
        for (let endpoint of proxy.endpoints || []) {
          for (let step of feature.defaultEndpoint.defaultFaultRule.steps) {
            if (endpoint.defaultFaultRule && endpoint.defaultFaultRule.steps) {
              let index = endpoint.defaultFaultRule.steps.findIndex(
                (x) =>
                  (x.name === step.name ||
                    x.name === (feature.uid ? feature.uid + "-" + step.name : step.name)) &&
                  x.condition === step.condition,
              );
              if (index != -1) endpoint.defaultFaultRule.steps.splice(index, 1);
            }
          }
        }
      }
    }

    // remove default target flow steps
    if (feature.defaultTarget) {
      if (feature.defaultTarget.flows) {
        for (let featureFlow of feature.defaultTarget.flows) {
          for (let target of proxy.targets || []) {
            for (let targetFlow of target.flows || []) {
              if (
                targetFlow.name == featureFlow.name &&
                targetFlow.mode == featureFlow.mode &&
                targetFlow.condition == featureFlow.condition
              ) {
                for (let step of featureFlow.steps || []) {
                  let index = targetFlow.steps.findIndex(
                    (x) => x.name === feature.uid + "-" + step.name && x.condition === step.condition,
                  );
                  if (index != -1) targetFlow.steps.splice(index, 1);
                }
                break;
              }
            }
          }
        }
      }

      if (feature.defaultTarget.faultRules) {
        for (let featureFr of feature.defaultTarget.faultRules) {
          for (let target of proxy.targets || []) {
            for (let fr of target.faultRules || []) {
              if (
                fr.name === featureFr.name ||
                fr.name === (feature.uid ? feature.uid + "-" + featureFr.name : featureFr.name)
              ) {
                for (let step of featureFr.steps || []) {
                  let index = (fr.steps || []).findIndex(
                    (x) =>
                      (x.name === step.name ||
                        x.name === (feature.uid ? feature.uid + "-" + step.name : step.name)) &&
                      x.condition === step.condition,
                  );
                  if (index != -1) fr.steps.splice(index, 1);
                }
              }
            }
          }
        }
      }

      if (feature.defaultTarget.defaultFaultRule && feature.defaultTarget.defaultFaultRule.steps) {
        for (let target of proxy.targets || []) {
          for (let step of feature.defaultTarget.defaultFaultRule.steps) {
            if (target.defaultFaultRule && target.defaultFaultRule.steps) {
              let index = target.defaultFaultRule.steps.findIndex(
                (x) =>
                  (x.name === step.name ||
                    x.name === (feature.uid ? feature.uid + "-" + step.name : step.name)) &&
                  x.condition === step.condition,
              );
              if (index != -1) target.defaultFaultRule.steps.splice(index, 1);
            }
          }
        }
      }
    }

    // remove feature endpoints
    if (feature.endpoints && feature.endpoints.length > 0) {
      for (let endpoint of feature.endpoints) {
        // endpoint with uid, if available
        if (feature.uid) endpoint.name = feature.uid + "-" + endpoint.name;
        let index = (proxy.endpoints || []).findIndex((x) => x.name === endpoint.name);
        if (index != -1) proxy.endpoints.splice(index, 1);
      }
    }

    // if feature has targets
    if (feature.targets && feature.targets.length > 0) {
      for (let target of feature.targets) {
        // target with uid, if available
        if (feature.uid) target.name = feature.uid + "-" + target.name;
        let index = (proxy.targets || []).findIndex((x) => x.name === target.name);
        if (index != -1) proxy.targets.splice(index, 1);
      }
    }

    // remove policies
    if (feature.policies && feature.policies.length > 0) {
      for (let policy of feature.policies) {
        if (feature.uid) policy.name = feature.uid + "-" + policy.name;
        let policyIndex = (proxy.policies || []).findIndex((x) => x.name === policy.name);
        if (policyIndex != -1) {
          proxy.policies.splice(policyIndex, 1);
        }
      }
    }

    // remove resources
    if (feature.resources && feature.resources.length > 0) {
      for (let resource of feature.resources) {
        if (feature.uid) resource.name = feature.uid + "-" + resource.name;
        let resourceIndex = (proxy.resources || []).findIndex((x) => x.name === resource.name);
        if (resourceIndex != -1) {
          proxy.resources.splice(resourceIndex, 1);
        }
      }
    }

    return proxy;
  }

  public proxyToTemplate(proxy: Proxy): Template {
    let template = new Template();

    template.name = proxy.name;
    template.description = proxy.description;
    template.parameters = proxy.parameters || [];

    for (let proxyEndpoint of proxy.endpoints || []) {
      let templateEndpoint = new Endpoint();
      templateEndpoint.name = proxyEndpoint.name;
      templateEndpoint.basePath = proxyEndpoint.basePath;
      templateEndpoint.routes = proxyEndpoint.routes;
      template.endpoints.push(templateEndpoint);
    }
    for (let proxyTarget of proxy.targets || []) {
      let templateTarget = new Target();
      templateTarget.name = proxyTarget.name;
      templateTarget.url = proxyTarget.url;
      template.targets.push(templateTarget);
    }
    return template;
  }

  public proxyToFeature(proxy: Proxy): Feature {
    let newFeature = new Feature();
    newFeature.name = proxy.name;
    newFeature.description = proxy.description;
    newFeature.documentation = proxy.documentation ?? "";
    newFeature.parameters = proxy.parameters || [];
    newFeature.gateway = "apigee";
    newFeature.schemaVersion = "1.0.0";
    if (proxy.uid) newFeature.uid = proxy.uid;
    if (proxy.priority) newFeature.priority = proxy.priority;
    if (proxy.tests) newFeature.tests = proxy.tests;
    if (proxy.displayName) newFeature.displayName = proxy.displayName;
    if (proxy.categories) newFeature.categories = proxy.categories;

    let defaultEndpoint = (proxy.endpoints || []).find((x) => x.name == "default");
    let defaultTarget = (proxy.targets || []).find((x) => x.name == "default");

    if (defaultEndpoint) newFeature.defaultEndpoint = defaultEndpoint;
    if (defaultTarget) newFeature.defaultTarget = defaultTarget;

    for (let endpoint of proxy.endpoints || [])
      if (endpoint.name != "default") newFeature.endpoints.push(endpoint);

    for (let target of proxy.targets || [])
      if (target.name != "default") newFeature.targets.push(target);

    newFeature.policies = proxy.policies || [];
    newFeature.resources = proxy.resources || [];

    return newFeature;
  }

  public proxyUpdateParameters(proxy: Proxy, parameters: { [key: string]: string } = {}) {
    for (let proxyParameter of proxy.parameters || []) {
      for (let key of Object.keys(parameters)) {
        if (proxyParameter.default && proxyParameter.default.toString().includes("{" + key + "}") && parameters[key]) {
          proxyParameter.default = proxyParameter.default.replaceAll(
            "{" + key + "}",
            parameters[key],
          );
        } else if (
          (proxyParameter.name === key || proxyParameter.name.endsWith("." + key)) &&
          parameters[key]
        ) {
          proxyParameter.default = parameters[key];
        }
      }
    }
  }

  public proxyToStringArray(proxy: Proxy): string[] {
    let result: string[] = [];
    if (proxy.name) result.push(`Name: ${proxy.name}`);
    // if (proxy.description) result.push(`Description: ${proxy.description}`);

    if (proxy.endpoints && proxy.endpoints.length > 0) {
      result.push(`Endpoints:`);
      for (let endpoint of proxy.endpoints) {
        result.push(`- ${endpoint.basePath}`);
      }
    } else {
      result.push(`Endpoints: none`);
    }

    if (proxy.targets && proxy.targets.length > 0) {
      result.push(`Targets:`);
      for (let target of proxy.targets) {
        result.push(`- ${target.name} - ${target.url}`);
      }
    } else {
      result.push(`Targets: none`);
    }

    if (proxy.policies && proxy.policies.length > 0) {
      result.push(`Policies:`);
      for (let policy of proxy.policies) {
        result.push(`- ${policy.name} - ${policy.type}`);
      }
    } else {
      result.push(`Policies: none`);
    }

    if (proxy.resources && proxy.resources.length > 0) {
      result.push(`Resources:`);
      for (let resource of proxy.resources) {
        result.push(`- ${resource.name} - ${resource.type}`);
      }
    } else {
      result.push(`Resources: none`);
    }

    return result;
  }

  public proxyToString(proxy: Proxy): string {
    return this.proxyToStringArray(proxy).join("\n");
  }

  public cleanXmlToJson(input: any): any {
    if (input["_declaration"]) delete input["_declaration"];
    let result = this.removeXml(input);
    return result;
  }

  public removeXml(obj: any): any {
    // Check if the input is a valid object or array.
    if (obj === null || typeof obj !== "object") {
      return obj;
    }

    // Rule 2: If the object has a "_text" property, return its value directly.
    if (obj.hasOwnProperty("_text") && Object.keys(obj).length === 1) {
      return obj._text;
    }

    // Handle arrays by recursively transforming each element.
    if (Array.isArray(obj)) {
      return obj.map((item) => this.removeXml(item));
    }

    // Handle objects by creating a new object and applying the rules.
    const newObj: any = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        let newKey = key;  // this.toCamelCase(key);
        // metadata sounds cooler ;)
        if (key === "_attributes") newKey = "metadata";
        if (newKey === "value") newKey = "setValue";
        if (newKey === "text") newKey = "value";
        // Recursively transform the value and assign it to the new key.
        newObj[newKey] = this.removeXml(obj[key]);
      }
    }

    return newObj;
  }

  public toCamelCase(str: string): string {
    // Use regex to find words, splitting on caps, underscores, and hyphens
    const words = str
      .replace(/([a-z])([A-Z])/g, "$1 $2") // Space between lower and upper
      .replace(/([A-Z])([A-Z][a-z])/g, "$1 $2") // Space between acronym and next word
      .replace(/[^a-zA-Z0-9]+/g, " ") // Replace non-alphanumeric with spaces
      .trim()
      .split(/\s+/);

    if (words.length === 0) return "";

    return words
      .map((word, index) => {
        const lower = word.toLowerCase();
        if (index === 0) return lower;
        return lower.charAt(0).toUpperCase() + lower.slice(1);
      })
      .join("");
  }

  public cleanJsonToXml(input: any): any {
    input = this.generateXml("", input);
    return input;
    // let newInput: any = {
    //   _declaration: {
    //     _attributes: {
    //       version: "1.0",
    //       encoding: "UTF-8",
    //       standalone: "yes",
    //     },
    //   },
    // };
    // for (const key in input) newInput[key] = input[key];

    // return newInput;
  }

  public generateXml(parentName: string, inputObject: any): any {
    if (typeof inputObject !== "object" || inputObject === null) {
      return inputObject;
    }
    if (Array.isArray(inputObject)) {
      return inputObject.map((item) => this.generateXml("", item));
    }

    const newObject: any = {};

    for (const key in inputObject) {
      if (Object.prototype.hasOwnProperty.call(inputObject, key)) {
        let newKey = key;
        const value = inputObject[key];

        if (newKey === "metadata") newKey = "_attributes";
        else if (newKey === "value") newKey = "_text";
        else if (newKey === "setValue") {
          if (parentName === "_attributes") newKey = "value";
          else newKey = "Value";
        } else if (parentName !== "_attributes" && parentName != "_text") {
          // newKey = this.removeCamelCase(newKey);
        }

        if (typeof value === "object" && value !== null) {
          newObject[newKey] = this.generateXml(newKey, value);
        } else {
          newObject[newKey] = value;
        }
      }
    }

    return newObject;
  }

  public removeCamelCase(str: string): string {
    let result = str;
    result = result.substring(0, 1).toUpperCase() + result.substring(1);
    if (result.includes("Json")) result = result.replace("Json", "JSON");
    if (result.includes("Url")) result = result.replace("Url", "URL");
    if (result.includes("Cors")) result = result.replace("Cors", "CORS");
    if (result.includes("Http")) result = result.replace("Http", "HTTP");
    if (result.includes("Api")) result = result.replace("Api", "API");
    if (result.includes("Xml")) result = result.replace("Xml", "XML");
    if (result.includes("Xsl")) result = result.replace("Xsl", "XSL");
    if (result.includes("Uri")) result = result.replace("Uri", "URI");
    if (result.includes("Id") && result != "EntityIdentifier") result = result.replace("Id", "ID");
    if (result.includes("Llm")) result = result.replace("Llm", "LLM");
    if (result.includes("Jwt")) result = result.replace("Jwt", "JWT");
    if (result.includes("Jwks")) result = result.replace("Jwks", "JWKS");
    if (result.includes("Ai")) result = result.replace("Ai", "AI");
    if (result.includes("Ttl")) result = result.replace("Ttl", "TTL");
    if (result.includes("Ssl")) result = result.replace("Ssl", "SSL");
    if (result.includes("Oas")) result = result.replace("Oas", "OAS");
    if (result.includes("Saml")) result = result.replace("Saml", "SAML");
    if (result.includes("Hmac")) result = result.replace("Hmac", "HMAC");
    return result;
  }

  public removeJsonNodes(obj: any, pathExpression: string): any {
    const matches = JSONPath({ path: pathExpression, json: obj, resultType: "all" });

    // Iterate backwards to avoid index shifting issues when deleting array elements
    for (let i = matches.length - 1; i >= 0; i--) {
      const match = matches[i];
      if (match && match.parent && match.parentProperty !== undefined) {
        if (Array.isArray(match.parent)) {
          // Use splice for arrays to maintain correct array length and indices
          match.parent.splice(Number(match.parentProperty), 1);
        } else {
          // Use delete for standard object properties
          delete match.parent[match.parentProperty];
        }
      }
    }

    return obj;
  }

  public productCreate(
    name: string,
    description: string = "",
    proxies: string[] = [],
    environments: string[] = [],
  ): Product {
    let tempName = name.replaceAll(" ", "-");
    let newProduct: Product = {
      name: tempName,
      displayName: name,
      type: "product",
      gateway: "apigee",
      schemaVersion: "1.0.0",
      description: description || "API Product for " + name,
      approvalType: "auto",
      attributes: [
        {
          name: "access",
          value: "public",
        },
      ],
      environments: environments.length > 0 ? environments : ["test"],
      proxies: proxies.length > 0 ? proxies : [tempName],
      quota: "1000",
      quotaInterval: "1",
      quotaTimeUnit: "minute",
      scopes: [],
      operations: [],
    };
    return newProduct;
  }

  public productToApigeeProduct(product: Product): any {
    let apigeeProduct: any = {
      name: product.name,
    };

    if (product.displayName) apigeeProduct.displayName = product.displayName;
    if (product.description) apigeeProduct.description = product.description;
    if (product.approvalType) apigeeProduct.approvalType = product.approvalType;
    if (product.environments && product.environments.length > 0)
      apigeeProduct.environments = [...product.environments];
    if (product.proxies && product.proxies.length > 0)
      apigeeProduct.proxies = [...product.proxies];
    if (product.apiResources && product.apiResources.length > 0)
      apigeeProduct.apiResources = [...product.apiResources];
    if (product.quota) apigeeProduct.quota = String(product.quota);
    if (product.quotaInterval) apigeeProduct.quotaInterval = String(product.quotaInterval);
    if (product.quotaTimeUnit) apigeeProduct.quotaTimeUnit = product.quotaTimeUnit;
    if (product.scopes && product.scopes.length > 0)
      apigeeProduct.scopes = [...product.scopes];

    // attributes
    if (product.attributes) {
      if (Array.isArray(product.attributes)) {
        apigeeProduct.attributes = product.attributes.map((attr) => ({
          name: attr.name,
          value: attr.value,
        }));
      } else if (typeof product.attributes === "object") {
        apigeeProduct.attributes = Object.keys(product.attributes).map((key) => ({
          name: key,
          value: (product.attributes as any)[key],
        }));
      }
    }

    // operations -> operationGroup
    if (product.operations && product.operations.length > 0) {
      let operationConfigs: any[] = [];
      for (let op of product.operations) {
        let config: any = {
          apiSource: op.apiSource || product.proxies?.[0] || product.name,
        };
        if (op.operations && op.operations.length > 0) {
          config.operations = op.operations.map((o: any) => ({
            resource: o.name || o.resource || "/",
            methods: o.methods || ["GET"],
            ...(o.quota ? { quota: o.quota } : {}),
            ...(o.attributes ? { attributes: o.attributes } : {}),
          }));
        } else if (op.resource || (op as any).name) {
          config.operations = [
            {
              resource: (op as any).name || op.resource,
              methods: op.methods || ["GET"],
            },
          ];
        }
        if (op.quota) config.quota = op.quota;
        if (op.attributes && op.attributes.length > 0) config.attributes = op.attributes;
        operationConfigs.push(config);
      }
      apigeeProduct.operationGroup = {
        operationConfigs: operationConfigs,
      };
    }

    // llmOperations -> llmOperationGroup
    const llmOps = product.llmOperations || (product as any).llmoperations;
    if (llmOps && llmOps.length > 0) {
      let operationConfigs: any[] = [];
      for (let op of llmOps) {
        let config: any = {
          apiSource: op.apiSource || product.proxies?.[0] || product.name,
        };
        const ops = op.operations || op.llmOperations;
        if (ops && ops.length > 0) {
          config.operations = ops.map((o: any) => ({
            resource: o.name || o.path || o.resource || "/",
            methods: o.methods || ["POST"],
            ...(o.model ? { model: o.model } : {}),
            ...(o.models ? { models: o.models } : {}),
            ...(o.quota ? { quota: o.quota } : {}),
            ...(o.attributes ? { attributes: o.attributes } : {}),
          }));
        } else if (op.path || (op as any).resource || (op as any).name) {
          config.operations = [
            {
              resource: (op as any).name || (op as any).resource || op.path,
              methods: op.methods || ["POST"],
              ...(op.model ? { model: op.model } : {}),
              ...(op.models ? { models: op.models } : {}),
            },
          ];
        }
        if (op.llmTokenQuota) config.llmTokenQuota = op.llmTokenQuota;
        else if (op.tokenQuota) config.llmTokenQuota = op.tokenQuota;
        if (op.quota) config.quota = op.quota;
        if (op.attributes && op.attributes.length > 0) config.attributes = op.attributes;
        operationConfigs.push(config);
      }
      apigeeProduct.llmOperationGroup = {
        operationConfigs: operationConfigs,
      };
    }

    // payloadOperations -> payloadOperationGroup
    const payloadOps = product.payloadOperations || (product as any).payloadoperations;
    if (payloadOps && payloadOps.length > 0) {
      let operationConfigs: any[] = [];
      for (let op of payloadOps) {
        let config: any = {
          apiSource: op.apiSource || product.proxies?.[0] || product.name,
          protocol: op.protocol || "MCP",
        };
        if (op.operations && op.operations.length > 0) {
          config.operations = op.operations.map((o: any) => ({
            resource: o.name || o.resource || "/",
            methods: o.methods || ["POST"],
            ...(o.quota ? { quota: o.quota } : {}),
            ...(o.attributes ? { attributes: o.attributes } : {}),
          }));
        }
        if (op.quota) config.quota = op.quota;
        if (op.attributes && op.attributes.length > 0) config.attributes = op.attributes;
        operationConfigs.push(config);
      }
      apigeeProduct.payloadOperationGroup = {
        operationConfigs: operationConfigs,
      };
    }

    // graphqlOperations -> graphqlOperationGroup
    if (product.graphqlOperations && product.graphqlOperations.length > 0) {
      let operationConfigs: any[] = [];
      for (let op of product.graphqlOperations) {
        let config: any = {
          apiSource: op.apiSource || product.proxies?.[0] || product.name,
        };
        if (op.operations && op.operations.length > 0) {
          config.operations = op.operations.map((o: any) => ({
            operation: o.operation || o.name || "",
            operationTypes: o.operationTypes || [],
            ...(o.quota ? { quota: o.quota } : {}),
            ...(o.attributes ? { attributes: o.attributes } : {}),
          }));
        }
        if (op.quota) config.quota = op.quota;
        if (op.attributes && op.attributes.length > 0) config.attributes = op.attributes;
        operationConfigs.push(config);
      }
      apigeeProduct.graphqlOperationGroup = {
        operationConfigs: operationConfigs,
      };
    }

    // grpcOperations -> grpcOperationGroup
    if (product.grpcOperations && product.grpcOperations.length > 0) {
      let operationConfigs: any[] = [];
      for (let op of product.grpcOperations) {
        let config: any = {
          apiSource: op.apiSource || product.proxies?.[0] || product.name,
        };
        if (op.operations && op.operations.length > 0) {
          config.operations = op.operations.map((o: any) => ({
            service: o.service || o.name || "",
            methods: o.methods || [],
            ...(o.quota ? { quota: o.quota } : {}),
            ...(o.attributes ? { attributes: o.attributes } : {}),
          }));
        }
        if (op.quota) config.quota = op.quota;
        if (op.attributes && op.attributes.length > 0) config.attributes = op.attributes;
        operationConfigs.push(config);
      }
      apigeeProduct.grpcOperationGroup = {
        operationConfigs: operationConfigs,
      };
    }

    return apigeeProduct;
  }

  public apigeeProductToProduct(apigeeProduct: any): Product {
    let product = new Product();
    product.name = apigeeProduct.name || "";
    if (apigeeProduct.displayName) product.displayName = apigeeProduct.displayName;
    if (apigeeProduct.description) product.description = apigeeProduct.description;
    if (apigeeProduct.approvalType) product.approvalType = apigeeProduct.approvalType;
    if (apigeeProduct.environments && Array.isArray(apigeeProduct.environments))
      product.environments = apigeeProduct.environments;
    if (apigeeProduct.proxies && Array.isArray(apigeeProduct.proxies))
      product.proxies = apigeeProduct.proxies;
    if (apigeeProduct.apiResources && Array.isArray(apigeeProduct.apiResources))
      product.apiResources = apigeeProduct.apiResources;
    if (apigeeProduct.quota) product.quota = String(apigeeProduct.quota);
    if (apigeeProduct.quotaInterval) product.quotaInterval = String(apigeeProduct.quotaInterval);
    if (apigeeProduct.quotaTimeUnit) product.quotaTimeUnit = apigeeProduct.quotaTimeUnit;
    if (apigeeProduct.scopes && Array.isArray(apigeeProduct.scopes))
      product.scopes = apigeeProduct.scopes;

    if (apigeeProduct.attributes && Array.isArray(apigeeProduct.attributes)) {
      product.attributes = apigeeProduct.attributes
        .filter((a: any) => a && a.name)
        .map((a: any) => ({
          name: a.name,
          value: a.value || "",
        }));
    }

    // operationGroup -> operations
    if (apigeeProduct.operationGroup && apigeeProduct.operationGroup.operationConfigs) {
      product.operations = [];
      for (let config of apigeeProduct.operationGroup.operationConfigs) {
        let opConfig: ProductOperationConfig = {
          apiSource: config.apiSource || "",
        };
        if (config.operations && Array.isArray(config.operations)) {
          opConfig.operations = config.operations.map((o: any) => ({
            name: o.resource || o.name || "",
            methods: o.methods || [],
            ...(o.quota ? { quota: o.quota } : {}),
            ...(o.attributes ? { attributes: o.attributes } : {}),
          }));
        }
        if (config.quota) opConfig.quota = config.quota;
        if (config.attributes) opConfig.attributes = config.attributes;
        product.operations.push(opConfig);
      }
    }

    // llmOperationGroup -> llmOperations
    if (apigeeProduct.llmOperationGroup && apigeeProduct.llmOperationGroup.operationConfigs) {
      product.llmOperations = [];
      for (let config of apigeeProduct.llmOperationGroup.operationConfigs) {
        let opConfig: ProductLlmOperationConfig = {
          apiSource: config.apiSource || "",
        };
        const rawOps = config.operations || config.llmOperations;
        if (rawOps && Array.isArray(rawOps)) {
          opConfig.operations = rawOps.map((o: any) => ({
            name: o.resource || o.path || o.name || "",
            methods: o.methods || [],
            ...(o.model ? { model: o.model } : {}),
            ...(o.models ? { models: o.models } : {}),
            ...(o.quota ? { quota: o.quota } : {}),
            ...(o.attributes ? { attributes: o.attributes } : {}),
          }));
        }
        if (config.llmTokenQuota) opConfig.llmTokenQuota = config.llmTokenQuota;
        if (config.quota) opConfig.quota = config.quota;
        if (config.attributes) opConfig.attributes = config.attributes;
        product.llmOperations.push(opConfig);
      }
    }

    // payloadOperationGroup -> payloadOperations
    if (apigeeProduct.payloadOperationGroup && apigeeProduct.payloadOperationGroup.operationConfigs) {
      product.payloadOperations = [];
      for (let config of apigeeProduct.payloadOperationGroup.operationConfigs) {
        let opConfig: ProductPayloadOperationConfig = {
          apiSource: config.apiSource || "",
          protocol: config.protocol || "MCP",
        };
        if (config.operations && Array.isArray(config.operations)) {
          opConfig.operations = config.operations.map((o: any) => ({
            name: o.resource || o.name || "",
            methods: o.methods || [],
            ...(o.quota ? { quota: o.quota } : {}),
            ...(o.attributes ? { attributes: o.attributes } : {}),
          }));
        }
        if (config.quota) opConfig.quota = config.quota;
        if (config.attributes) opConfig.attributes = config.attributes;
        product.payloadOperations.push(opConfig);
      }
    }

    // graphqlOperationGroup -> graphqlOperations
    if (apigeeProduct.graphqlOperationGroup && apigeeProduct.graphqlOperationGroup.operationConfigs) {
      product.graphqlOperations = [];
      for (let config of apigeeProduct.graphqlOperationGroup.operationConfigs) {
        let opConfig: ProductGraphqlOperationConfig = {
          apiSource: config.apiSource || "",
        };
        if (config.operations && Array.isArray(config.operations)) {
          opConfig.operations = config.operations.map((o: any) => ({
            operation: o.operation || o.name || "",
            operationTypes: o.operationTypes || [],
            ...(o.quota ? { quota: o.quota } : {}),
            ...(o.attributes ? { attributes: o.attributes } : {}),
          }));
        }
        if (config.quota) opConfig.quota = config.quota;
        if (config.attributes) opConfig.attributes = config.attributes;
        product.graphqlOperations.push(opConfig);
      }
    }

    // grpcOperationGroup -> grpcOperations
    if (apigeeProduct.grpcOperationGroup && apigeeProduct.grpcOperationGroup.operationConfigs) {
      product.grpcOperations = [];
      for (let config of apigeeProduct.grpcOperationGroup.operationConfigs) {
        let opConfig: ProductGrpcOperationConfig = {
          apiSource: config.apiSource || "",
        };
        if (config.operations && Array.isArray(config.operations)) {
          opConfig.operations = config.operations.map((o: any) => ({
            service: o.service || o.name || "",
            methods: o.methods || [],
            ...(o.quota ? { quota: o.quota } : {}),
            ...(o.attributes ? { attributes: o.attributes } : {}),
          }));
        }
        if (config.quota) opConfig.quota = config.quota;
        if (config.attributes) opConfig.attributes = config.attributes;
        product.grpcOperations.push(opConfig);
      }
    }

    return product;
  }

  public productUpdateParameters(product: Product, parameters: { [key: string]: string } = {}) {
    const replaceStr = (str: string): string => {
      let res = str;
      for (let key of Object.keys(parameters)) {
        const val = parameters[key]!;
        res = res
          .replaceAll("{" + key + "}", val)
          .replaceAll("%" + key + "%", val)
          .replaceAll("${" + key + "}", val);
      }
      return res;
    };

    if (product.name) product.name = replaceStr(product.name);
    if (product.displayName) product.displayName = replaceStr(product.displayName);
    if (product.description) product.description = replaceStr(product.description);
    if (product.quota) product.quota = replaceStr(product.quota);
    if (product.quotaInterval) product.quotaInterval = replaceStr(product.quotaInterval);
    if (product.environments) {
      product.environments = product.environments.map(replaceStr);
    }
    if (product.proxies) {
      product.proxies = product.proxies.map(replaceStr);
    }
    if (product.apiResources) {
      product.apiResources = product.apiResources.map(replaceStr);
    }
    if (product.attributes) {
      for (let attr of product.attributes) {
        if (attr.name) attr.name = replaceStr(attr.name);
        if (attr.value) attr.value = replaceStr(attr.value);
      }
    }
    if (product.operations) {
      for (let op of product.operations) {
        if (op.apiSource) op.apiSource = replaceStr(op.apiSource);
        if (op.operations) {
          for (let o of op.operations) {
            if (o.name) o.name = replaceStr(o.name);
            if (o.resource) o.resource = replaceStr(o.resource);
          }
        }
      }
    }
  }

  public productToStringArray(product: Product): string[] {
    let result: string[] = [];
    if (product.name) result.push(`Name: ${product.name}`);
    if (product.displayName) result.push(`Display Name: ${product.displayName}`);
    if (product.description) result.push(`Description: ${product.description}`);
    if (product.approvalType) result.push(`Approval Type: ${product.approvalType}`);
    if (product.environments && product.environments.length > 0)
      result.push(`Environments: ${product.environments.join(", ")}`);
    if (product.proxies && product.proxies.length > 0)
      result.push(`Proxies: ${product.proxies.join(", ")}`);
    if (product.quota)
      result.push(`Quota: ${product.quota} per ${product.quotaInterval || 1} ${product.quotaTimeUnit || "minute"}`);
    if (product.operations && product.operations.length > 0) {
      result.push(`Operations: ${product.operations.length} configured`);
    }
    if (product.llmOperations && product.llmOperations.length > 0) {
      result.push(`LLM Operations: ${product.llmOperations.length} configured`);
    }
    if (product.payloadOperations && product.payloadOperations.length > 0) {
      result.push(`Payload Operations: ${product.payloadOperations.length} configured`);
    }
    return result;
  }

  public productToString(product: Product): string {
    return this.productToStringArray(product).join("\n");
  }

  public userCreate(
    name: string = "default-user",
    email: string = "",
    appName: string = "default-app",
    products: string[] = [],
  ): User {
    let user = new User();
    user.name = name;
    user.email = email || `${name}@example.com`;
    user.userName = name;
    user.firstName = name.charAt(0).toUpperCase() + name.slice(1);
    user.lastName = "User";
    user.status = "active";
    user.attributes = [{ name: "department", value: "engineering" }];

    let app: UserApp = {
      name: appName || `${name}-app`,
      displayName: appName || `${name}-app`,
      status: "approved",
      products: products,
      credentials: [
        {
          consumerKey: "",
          consumerSecret: "",
          status: "approved",
          products: products,
        },
      ],
    };
    user.apps = [app];
    return user;
  }

  public userToApigeeDeveloper(user: User): any {
    const email = user.email || (user.name.includes("@") ? user.name : `${user.name}@example.com`);
    return {
      email: email,
      userName: user.userName || user.name || email.split("@")[0],
      firstName: user.firstName || user.displayName?.split(" ")[0] || user.name || "Developer",
      lastName: user.lastName || user.displayName?.split(" ").slice(1).join(" ") || "User",
      attributes: user.attributes || [],
    };
  }

  public userToApigeeApps(user: User): any[] {
    let apps: any[] = [];
    for (let app of user.apps || []) {
      let appPayload: any = {
        name: app.name,
        displayName: app.displayName || app.name,
        description: app.description || "",
        callbackUrl: app.callbackUrl || "",
        status: app.status || "approved",
        apiProducts: app.products || app.apiProducts || [],
        scopes: app.scopes || [],
        attributes: app.attributes || [],
      };
      if (app.keyExpiresIn) appPayload.keyExpiresIn = app.keyExpiresIn;
      if (app.credentials || app.keys) {
        appPayload.credentials = app.credentials || app.keys;
      }
      apps.push(appPayload);
    }
    return apps;
  }

  public apigeeToUser(developer: any, apps?: any[]): User {
    let user = new User();
    user.name = developer.userName || developer.email?.split("@")[0] || "";
    user.email = developer.email || "";
    user.firstName = developer.firstName || "";
    user.lastName = developer.lastName || "";
    user.userName = developer.userName || "";
    if (developer.attributes && Array.isArray(developer.attributes)) {
      user.attributes = developer.attributes
        .filter((a: any) => a && a.name)
        .map((a: any) => ({ name: a.name, value: a.value || "" }));
    }

    if (apps && Array.isArray(apps)) {
      user.apps = [];
      for (let app of apps) {
        let userApp: UserApp = {
          name: app.name || "",
          displayName: app.displayName || app.name || "",
          description: app.description || "",
          callbackUrl: app.callbackUrl || "",
          status: app.status || "approved",
          products:
            app.apiProducts ||
            (app.credentials?.[0]?.apiProducts?.map((p: any) => p.apiproduct || p)) ||
            [],
          scopes: app.scopes || app.credentials?.[0]?.scopes || [],
          attributes: app.attributes || [],
          credentials: (app.credentials || []).map((c: any) => ({
            consumerKey: c.consumerKey || "",
            consumerSecret: c.consumerSecret || "",
            status: c.status || "approved",
            issuedAt: c.issuedAt ? String(c.issuedAt) : undefined,
            expiresAt: c.expiresAt ? String(c.expiresAt) : undefined,
            products: c.apiProducts?.map((p: any) => p.apiproduct || p) || [],
            scopes: c.scopes || [],
            attributes: c.attributes || [],
          })),
        };
        user.apps.push(userApp);
      }
    }

    return user;
  }

  public userUpdateParameters(user: User, parameters: { [key: string]: string } = {}) {
    const replaceStr = (str: string): string => {
      let res = str;
      for (let key of Object.keys(parameters)) {
        const val = parameters[key]!;
        res = res
          .replaceAll("{" + key + "}", val)
          .replaceAll("%" + key + "%", val)
          .replaceAll("${" + key + "}", val);
      }
      return res;
    };

    if (user.name) user.name = replaceStr(user.name);
    if (user.displayName) user.displayName = replaceStr(user.displayName);
    if (user.email) user.email = replaceStr(user.email);
    if (user.firstName) user.firstName = replaceStr(user.firstName);
    if (user.lastName) user.lastName = replaceStr(user.lastName);
    if (user.userName) user.userName = replaceStr(user.userName);

    if (user.attributes) {
      for (let attr of user.attributes) {
        if (attr.name) attr.name = replaceStr(attr.name);
        if (attr.value) attr.value = replaceStr(attr.value);
      }
    }

    if (user.apps) {
      for (let app of user.apps) {
        if (app.name) app.name = replaceStr(app.name);
        if (app.displayName) app.displayName = replaceStr(app.displayName);
        if (app.description) app.description = replaceStr(app.description);
        if (app.callbackUrl) app.callbackUrl = replaceStr(app.callbackUrl);
        if (app.products) app.products = app.products.map(replaceStr);
        if (app.apiProducts) app.apiProducts = app.apiProducts.map(replaceStr);
        if (app.scopes) app.scopes = app.scopes.map(replaceStr);
        if (app.attributes) {
          for (let attr of app.attributes) {
            if (attr.name) attr.name = replaceStr(attr.name);
            if (attr.value) attr.value = replaceStr(attr.value);
          }
        }
        const creds = app.credentials || app.keys;
        if (creds) {
          for (let cred of creds) {
            if (cred.consumerKey) cred.consumerKey = replaceStr(cred.consumerKey);
            if (cred.consumerSecret) cred.consumerSecret = replaceStr(cred.consumerSecret);
            if (cred.key) cred.key = replaceStr(cred.key);
            if (cred.secret) cred.secret = replaceStr(cred.secret);
            if (cred.products) cred.products = cred.products.map(replaceStr);
            if (cred.apiProducts) cred.apiProducts = cred.apiProducts.map(replaceStr);
            if (cred.scopes) cred.scopes = cred.scopes.map(replaceStr);
          }
        }
      }
    }
  }

  public userToStringArray(user: User): string[] {
    let result: string[] = [];
    if (user.name) result.push(`Name: ${user.name}`);
    if (user.displayName) result.push(`Display Name: ${user.displayName}`);
    if (user.email) result.push(`Email: ${user.email}`);
    if (user.userName) result.push(`Username: ${user.userName}`);
    if (user.firstName || user.lastName)
      result.push(`Full Name: ${[user.firstName, user.lastName].filter(Boolean).join(" ")}`);
    if (user.status) result.push(`Status: ${user.status}`);
    if (user.attributes && user.attributes.length > 0) {
      result.push(`Attributes: ${user.attributes.map((a) => `${a.name}=${a.value}`).join(", ")}`);
    }
    if (user.apps && user.apps.length > 0) {
      result.push(`Apps: ${user.apps.length} configured`);
      for (let app of user.apps) {
        let prods = (app.products || app.apiProducts || []).join(", ") || "none";
        result.push(`  - App: ${app.name} [Products: ${prods}]`);
      }
    }
    return result;
  }

  public userToString(user: User): string {
    return this.userToStringArray(user).join("\n");
  }
}

