import * as xmljs from "xml-js";
import yauzl from "yauzl";
import yazl from "yazl";
import jp from "jsonpath";
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
} from "./interfaces.js";

export class ApigeeConverter {
  tempPath: string = "./data/temp/";
  templatesPath: string = "./data/templates/";
  featuresPath: string = "./data/features/";
  constructor(basePath: string = "", subDirs: boolean = true) {
    if (basePath && subDirs) {
      this.tempPath = basePath + "temp/";
      this.templatesPath = basePath + "templates/";
      this.featuresPath = basePath + "features/";
    } else {
      this.tempPath = basePath;
      this.templatesPath = basePath;
      this.featuresPath = basePath;
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
          let newProxy: Proxy = this.apigeeFolderToProxy(
            name,
            tempOutputDir,
            importParameters,
          );
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
    let proxies: string[] = fs.readdirSync(inputPath + "/apiproxy/proxies");
    let newProxy = new Proxy();
    newProxy.name = name;
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
      newEndpoint.basePath =
        proxyJson["ProxyEndpoint"]["HTTPProxyConnection"]["BasePath"]["_text"];

      // routes
      if (proxyJson["ProxyEndpoint"]["RouteRule"].length > 0) {
        for (let routeRule of proxyJson["ProxyEndpoint"]["RouteRule"]) {
          let newRoute = new Route();
          newRoute.name = routeRule["_attributes"]["name"];
          if (routeRule["TargetEndpoint"])
            newRoute.target = routeRule["TargetEndpoint"]["_text"];
          if (routeRule["Condition"])
            newRoute.condition = routeRule["Condition"]["_text"];
          newEndpoint.routes.push(newRoute);
        }
      } else {
        let newRoute = new Route();
        newRoute.name =
          proxyJson["ProxyEndpoint"]["RouteRule"]["_attributes"]["name"];
        if (proxyJson["ProxyEndpoint"]["RouteRule"]["TargetEndpoint"])
          newRoute.target =
            proxyJson["ProxyEndpoint"]["RouteRule"]["TargetEndpoint"]["_text"];
        if (proxyJson["ProxyEndpoint"]["RouteRule"]["Condition"])
          newRoute.condition =
            proxyJson["ProxyEndpoint"]["RouteRule"]["Condition"]["_text"];
        newEndpoint.routes.push(newRoute);
      }

      // flows
      let requestPreFlow = this.flowXmlToJson(
        "PreFlow",
        "Request",
        proxyJson["ProxyEndpoint"],
      );
      if (requestPreFlow && requestPreFlow.steps.length > 0)
        newEndpoint.flows.push(requestPreFlow);

      let responsePreFlow = this.flowXmlToJson(
        "PreFlow",
        "Response",
        proxyJson["ProxyEndpoint"],
      );
      if (responsePreFlow && responsePreFlow.steps.length > 0)
        newEndpoint.flows.push(responsePreFlow);

      let requestPostFlow = this.flowXmlToJson(
        "PostFlow",
        "Request",
        proxyJson["ProxyEndpoint"],
      );
      if (requestPostFlow && requestPostFlow.steps.length > 0)
        newEndpoint.flows.push(requestPostFlow);

      let responsePostFlow = this.flowXmlToJson(
        "PostFlow",
        "Response",
        proxyJson["ProxyEndpoint"],
      );
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
        for (let faultXml of proxyJson["ProxyEndpoint"]["FaultRules"]) {
          let faultRule = this.flowXmlNodeToJson(
            faultXml["_attributes"]["name"],
            "",
            faultXml,
          );
          if (faultXml["Condition"])
            faultRule.condition = faultXml["Condition"]["_text"];
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
          proxyJson["ProxyEndpoint"]["FaultRules"]["FaultRule"]["_attributes"][
            "name"
          ],
          "",
          proxyJson["ProxyEndpoint"]["FaultRules"]["FaultRule"],
        );
        if (proxyJson["ProxyEndpoint"]["FaultRules"]["FaultRule"]["Condition"])
          faultRule.condition =
            proxyJson["ProxyEndpoint"]["FaultRules"]["FaultRule"]["Condition"][
              "_text"
            ];
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
            proxyJson["ProxyEndpoint"]["DefaultFaultRule"]["AlwaysEnforce"][
              "_text"
            ];
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
      let policyContents = fs.readFileSync(
        inputPath + "/apiproxy/policies/" + policy,
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
      // clean-structure
      policyJson = this.cleanXmlJson(policyJson);
      newPolicy.content = policyJson;
      newProxy.policies.push(newPolicy);
    }

    // targets
    let targets: string[] = [];
    if (fs.existsSync(inputPath + "/apiproxy/targets"))
      targets = fs.readdirSync(inputPath + "/apiproxy/targets");
    for (let target of targets) {
      let newTarget = new ProxyTarget();
      let targetContent = fs.readFileSync(
        inputPath + "/apiproxy/targets/" + target,
        "utf8",
      );

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
        newTarget.url =
          targetJson["TargetEndpoint"]["HTTPTargetConnection"]["URL"]["_text"];
      // Google Access Token
      if (
        targetJson["TargetEndpoint"]["HTTPTargetConnection"] &&
        targetJson["TargetEndpoint"]["HTTPTargetConnection"][
          "Authentication"
        ] &&
        targetJson["TargetEndpoint"]["HTTPTargetConnection"]["Authentication"][
          "GoogleAccessToken"
        ]
      ) {
        newTarget.auth = "GoogleAccessToken";
        newTarget.scopes = ["https://www.googleapis.com/auth/cloud-platform"];
      }
      // save original target XML
      if (targetJson["TargetEndpoint"]["HTTPTargetConnection"]) {
        let targetXml = targetJson["TargetEndpoint"]["HTTPTargetConnection"];
        // clean-structure
        newTarget.httpTargetConnection = this.cleanXmlJson(targetXml);
      } else if (targetJson["TargetEndpoint"]["LocalTargetConnection"]) {
        let targetXml = targetJson["TargetEndpoint"]["LocalTargetConnection"];
        // clean-structure
        newTarget.localTargetConnection = targetXml;
      }

      let requestPreFlow = this.flowXmlToJson(
        "PreFlow",
        "Request",
        targetJson["TargetEndpoint"],
      );
      if (requestPreFlow && requestPreFlow.steps.length > 0)
        newTarget.flows.push(requestPreFlow);
      let responsePreFlow = this.flowXmlToJson(
        "PreFlow",
        "Response",
        targetJson["TargetEndpoint"],
      );
      if (responsePreFlow && responsePreFlow.steps.length > 0)
        newTarget.flows.push(responsePreFlow);
      let requestPostFlow = this.flowXmlToJson(
        "PostFlow",
        "Request",
        targetJson["TargetEndpoint"],
      );
      if (requestPostFlow && requestPostFlow.steps.length > 0)
        newTarget.flows.push(requestPostFlow);
      let responsePostFlow = this.flowXmlToJson(
        "PostFlow",
        "Response",
        targetJson["TargetEndpoint"],
      );
      if (responsePostFlow && responsePostFlow.steps.length > 0)
        newTarget.flows.push(responsePostFlow);
      let eventFlow = this.flowXmlToJson(
        "EventFlow",
        "Response",
        targetJson["TargetEndpoint"],
      );
      if (eventFlow) newTarget.flows.push(eventFlow);
      newProxy.targets.push(newTarget);
    }

    // resources
    if (fs.existsSync(inputPath + "/apiproxy/resources")) {
      let resTypes: string[] = fs.readdirSync(
        inputPath + "/apiproxy/resources",
      );
      for (let resType of resTypes) {
        let resFiles: string[] = fs.readdirSync(
          inputPath + "/apiproxy/resources/" + resType,
        );

        for (let resFile of resFiles) {
          if (resFile === "templater-manifest.js") {
            let manifestContent = fs.readFileSync(
              inputPath + "/apiproxy/resources/" + resType + "/" + resFile,
              "utf8",
            );
            if (manifestContent) {
              const sandbox = { proxy: undefined };
              vm.createContext(sandbox);
              vm.runInContext(manifestContent, sandbox);

              if (sandbox.proxy) {
                if (sandbox.proxy["description"])
                  newProxy.description = sandbox.proxy["description"];
                if (sandbox.proxy["uid"]) newProxy.uid = sandbox.proxy["uid"];
                if (sandbox.proxy["parameters"])
                  newProxy.parameters = sandbox.proxy["parameters"];
                if (sandbox.proxy["priority"])
                  newProxy.priority = sandbox.proxy["priority"];
                if (sandbox.proxy["displayName"])
                  newProxy.displayName = sandbox.proxy["displayName"];
                if (sandbox.proxy["categories"])
                  newProxy.categories = sandbox.proxy["categories"];
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
                    newProxy.parameters.findIndex(
                      (x) => x.name === propPieces[0],
                    ) === -1
                  ) {
                    newProxy.parameters.push({
                      name: propPieces[0],
                      displayName: propPieces[0],
                      description: "Configuration input for " + propPieces[0],
                      default:
                        propPieces.length == 2 && propPieces[1]
                          ? propPieces[1]
                          : "",
                      examples: [],
                    });
                  }

                  // set value to use parameter in the future
                  if (propPieces && propPieces.length >= 1) {
                    newPropertiesContent +=
                      propPieces[0] + "={" + propPieces[0] + "}\n";
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

  public async apigeeSharedFlowZipToProxy(
    name: string,
    inputFilePath: string,
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
          let newProxy: Proxy = this.apigeeSharedFlowFolderToProxy(
            name,
            tempOutputDir,
          );
          fs.rmSync(tempOutputDir, { recursive: true });
          resolve(newProxy);
        });
      });
    });
  }

  public apigeeSharedFlowFolderToProxy(name: string, inputPath: string): Proxy {
    let sharedFlows: string[] = fs.readdirSync(
      inputPath + "/sharedflowbundle/sharedflows",
    );
    let newProxy = new Proxy();
    newProxy.name = name;
    for (let flow of sharedFlows) {
      let newEndpoint = new ProxyEndpoint();
      let proxyPath = path.join(
        inputPath,
        "sharedflowbundle/sharedflows",
        flow,
      );
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
        let resTypes: string[] = fs.readdirSync(
          inputPath + "/sharedflowbundle/resources",
        );
        for (let resType of resTypes) {
          let resFiles: string[] = fs.readdirSync(
            inputPath + "/sharedflowbundle/resources/" + resType,
          );

          for (let resFile of resFiles) {
            let newFile = new Resource();
            newFile.name = resFile;
            newFile.type = resType;
            newFile.content = fs.readFileSync(
              inputPath +
                "/sharedflowbundle/resources/" +
                resType +
                "/" +
                resFile,
              "utf8",
            );
            newProxy.resources.push(newFile);
          }
        }
      }
    }

    return newProxy;
  }

  public async proxyToApigeeZip(
    input: Proxy,
    removeDir: boolean = true,
  ): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      var zipfile = new yazl.ZipFile();
      let tempFilePath = this.tempPath + input.name;
      fs.mkdirSync(tempFilePath, { recursive: true });

      // endpoints
      for (let endpoint of input.endpoints) {
        let endpointXml: any = {
          ProxyEndpoint: {
            _attributes: {
              name: endpoint["name"],
            },
            HTTPProxyConnection: {
              BasePath: {
                _text: endpoint["basePath"],
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
        for (let flow of endpoint.flows) {
          if (!flow.condition && flow.mode) {
            if (!endpointXml["ProxyEndpoint"][flow.name]) {
              endpointXml["ProxyEndpoint"][flow.name] = {
                _attributes: {
                  name: flow.name,
                },
                Response: {},
              };
            }

            endpointXml["ProxyEndpoint"][flow.name][flow.mode] =
              this.flowJsonToXml(flow);
          } else if (flow.condition) {
            conditionalFlows.push(flow);
          }
        }
        if (
          conditionalFlows.length === 1 &&
          conditionalFlows[0] &&
          conditionalFlows[0].mode
        ) {
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
          endpointXml["ProxyEndpoint"]["Flows"]["Flow"][
            conditionalFlows[0].mode
          ] = this.flowJsonToXml(conditionalFlows[0]);
        } else if (conditionalFlows.length > 1) {
          for (let conditionalFlow of conditionalFlows) {
            if (!endpointXml["ProxyEndpoint"]["Flows"])
              endpointXml["ProxyEndpoint"]["Flows"] = {
                Flow: [],
              };

            let flow = endpointXml["ProxyEndpoint"]["Flows"]["Flow"].find(
              (x: any) => x["_attributes"]["name"] === conditionalFlow.name,
            );
            if (!flow) {
              flow = {
                _attributes: {
                  name: conditionalFlows[0]?.name,
                },
                Condition: {
                  _text: conditionalFlows[0]?.condition,
                },
              };
            }
            if (conditionalFlow.mode)
              flow[conditionalFlow.mode] = this.flowJsonToXml(
                conditionalFlows[0],
              );
          }
        }

        // routes
        if (endpoint["routes"].length > 1) {
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
        } else if (
          endpoint["routes"] &&
          endpoint["routes"].length === 1 &&
          endpoint["routes"][0]
        ) {
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
          endpointXml["ProxyEndpoint"]["FaultRules"] = [];
          for (let faultRule of endpoint.faultRules) {
            let newFaultRule = this.flowJsonToXml(faultRule);
            newFaultRule["_attributes"] = {
              name: faultRule.name,
            };
            if (faultRule.condition)
              newFaultRule["Condition"] = {
                _text: faultRule.condition,
              };

            endpointXml["ProxyEndpoint"]["FaultRules"].push(newFaultRule);
          }
        } else if (
          endpoint.faultRules &&
          endpoint.faultRules.length == 1 &&
          endpoint.faultRules[0]
        ) {
          endpointXml["ProxyEndpoint"]["FaultRules"] = {
            FaultRule: this.flowJsonToXml(endpoint.faultRules[0]),
          };
          endpointXml["ProxyEndpoint"]["FaultRules"]["FaultRule"][
            "_attributes"
          ] = {
            name: endpoint.faultRules[0].name,
          };
          if (endpoint.faultRules[0].condition) {
            endpointXml["ProxyEndpoint"]["FaultRules"]["FaultRule"][
              "Condition"
            ] = {
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
            endpointXml["ProxyEndpoint"]["DefaultFaultRule"]["AlwaysEnforce"] =
              {
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
      for (let target of input.targets) {
        let targetXml: any = {
          TargetEndpoint: {
            _attributes: {
              name: target["name"],
            },
          },
        };

        if (target.httpTargetConnection) {
          let targetJson = target.httpTargetConnection;
          // targetJson = this.cleanJsonXml(targetJson);
          targetXml["TargetEndpoint"]["HTTPTargetConnection"] = targetJson;
        } else if (target.localTargetConnection) {
          let targetJson = target.localTargetConnection;
          // targetJson = this.cleanJsonXml(targetJson);
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
          targetXml["TargetEndpoint"]["HTTPTargetConnection"][
            "Authentication"
          ] = {
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

        for (let flow of target.flows) {
          if (!flow.condition && flow.mode) {
            if (
              !targetXml["TargetEndpoint"][flow.name] &&
              flow.name == "EventFlow"
            ) {
              targetXml["TargetEndpoint"]["EventFlow"] = {
                _attributes: {
                  name: "EventFlow",
                  "content-type": "text/event-stream",
                },
                Response: {},
              };
            }
            targetXml["TargetEndpoint"][flow.name][flow.mode] =
              this.flowJsonToXml(flow);
          }
        }

        fs.mkdirSync(tempFilePath + "/apiproxy/targets", { recursive: true });
        let xmlString = xmljs.json2xml(JSON.stringify(targetXml), {
          compact: true,
          spaces: 2,
        });
        fs.writeFileSync(
          tempFilePath + "/apiproxy/targets/" + target["name"] + ".xml",
          xmlString,
        );
        zipfile.addFile(
          tempFilePath + "/apiproxy/targets/" + target["name"] + ".xml",
          "apiproxy/targets/" + target["name"] + ".xml",
        );
      }

      // policies
      for (let policy of input["policies"]) {
        fs.mkdirSync(tempFilePath + "/apiproxy/policies", { recursive: true });
        let policyJson = policy["content"];
        // policyJson = this.cleanJsonXml(policyJson);
        let policyContent = JSON.stringify(policyJson);
        let xmlString = xmljs.json2xml(policyContent, {
          compact: true,
          spaces: 2,
        });
        fs.writeFileSync(
          tempFilePath + "/apiproxy/policies/" + policy["name"] + ".xml",
          xmlString,
        );
        zipfile.addFile(
          tempFilePath + "/apiproxy/policies/" + policy["name"] + ".xml",
          "apiproxy/policies/" + policy["name"] + ".xml",
        );
      }

      // resources
      for (let resource of input["resources"]) {
        fs.mkdirSync(tempFilePath + "/apiproxy/resources/" + resource["type"], {
          recursive: true,
        });
        fs.writeFileSync(
          tempFilePath +
            "/apiproxy/resources/" +
            resource["type"] +
            "/" +
            resource["name"],
          resource["content"],
        );
        zipfile.addFile(
          tempFilePath +
            "/apiproxy/resources/" +
            "/" +
            resource["type"] +
            "/" +
            resource["name"],
          "apiproxy/resources/" + resource["type"] + "/" + resource["name"],
        );
      }

      // preserve documentation as resources
      fs.mkdirSync(tempFilePath + "/apiproxy/resources/jsc", {
        recursive: true,
      });
      fs.writeFileSync(
        tempFilePath + "/apiproxy/resources/jsc/templater-manifest.js",
        `var proxy=${JSON.stringify(input, null, 2)};`,
      );
      zipfile.addFile(
        tempFilePath + "/apiproxy/resources/jsc/templater-manifest.js",
        "apiproxy/resources/jsc/templater-manifest.js",
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

    let resultRequestFlow = this.flowXmlNodeToJson(
      name,
      "Request",
      sourceDoc["Request"],
    );
    if (resultRequestFlow && resultRequestFlow.steps.length > 0) {
      if (sourceDoc["Condition"] && sourceDoc["Condition"]["_text"])
        resultRequestFlow.condition = sourceDoc["Condition"]["_text"];
      resultFlows.push(resultRequestFlow);
    }
    let resultResponseFlow = this.flowXmlNodeToJson(
      name,
      "Response",
      sourceDoc["Response"],
    );
    if (resultResponseFlow && resultResponseFlow.steps.length > 0) {
      if (sourceDoc["Condition"] && sourceDoc["Condition"]["_text"])
        resultResponseFlow.condition = sourceDoc["Condition"]["_text"];
      resultFlows.push(resultResponseFlow);
    }

    return resultFlows;
  }

  public flowXmlToJson(
    type: string,
    mode: string,
    sourceDoc: any,
  ): Flow | undefined {
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

    return resultFlow;
  }

  public flowJsonToXml(sourceDoc: any): any {
    let result: any = {};
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
    } else if (
      sourceDoc &&
      sourceDoc["steps"] &&
      sourceDoc["steps"].length == 1
    ) {
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
    // replace parameters from runtime (no, disable for now..)
    let tempFeature = feature; // this.featureReplaceParameters(feature, [], parameters);
    // set uid on feature usage
    if (parameters["id"]) tempFeature.uid = parameters["id"];
    else {
      let id = "";
      let nameParts = tempFeature.name.split("-");
      id = nameParts[Math.floor(nameParts.length / 2)] ?? "";
      let origId = id;
      let count = 0;
      for (let feature of template.features) {
        let featureParts = feature.split(".");
        let existingId = featureParts.pop();
        if (existingId == id) {
          count++;
          id = origId + count.toString();
        }
      }

      tempFeature.uid = id;
      // tempFeature.uid = (Math.random() + 1).toString(36).substring(7);
    }
    if (tempFeature.endpoints && tempFeature.endpoints.length > 0) {
      for (let endpoint of tempFeature.endpoints) {
        if (endpoint.name != "default") {
          // add feature uid if exists
          if (tempFeature.uid) {
            endpoint.name = tempFeature.uid + "-" + endpoint.name;

            for (let tempRoute of endpoint.routes) {
              if (tempRoute.target) {
                tempRoute.target = tempFeature.uid + "-" + tempRoute.target;
              }
            }
          }

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
          // add template uid, if it exists
          if (tempFeature.uid) {
            target.name = tempFeature.uid + "-" + target.name;
          }
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

    template.features.push(featurePath + "." + tempFeature.uid);

    // add parameters with feature name and uid
    for (let parameter of tempFeature.parameters) {
      // set default if one was passed in
      if (parameters[parameter.name])
        parameter.default = parameters[parameter.name] ?? parameter.default;
      parameter.name =
        tempFeature.name + "." + tempFeature.uid + "." + parameter.name;
      if (parameters[parameter.name])
        parameter.default = parameters[parameter.name] ?? parameter.default;

      template.parameters.push(parameter);
    }

    return template;
  }

  public templateRemoveFeature(template: Template, feature: Feature): Template {
    let featureIndex = template.features.findIndex((x) =>
      x.endsWith("." + feature.uid),
    );
    if (featureIndex != -1) {
      if (feature.endpoints && feature.endpoints.length > 0) {
        for (let endpoint of feature.endpoints) {
          if (endpoint.name != "default") {
            // add feature uid, if it exists
            if (feature.uid) endpoint.name = feature.uid + "-" + endpoint.name;
            let index = template.endpoints.findIndex(
              (x) => x.name === endpoint.name,
            );
            if (index != -1) template.endpoints.splice(index, 1);
          }
        }
      }

      if (feature.targets && feature.targets.length > 0) {
        for (let target of feature.targets) {
          if (target.name != "default") {
            // add feature uid, if it exists
            if (feature.uid) target.name = feature.uid + "-" + target.name;
            let index = template.targets.findIndex(
              (x) => x.name === target.name,
            );
            if (index != -1) template.targets.splice(index, 1);
          }
        }
      }

      template.features.splice(featureIndex, 1);

      for (let parameter of feature.parameters) {
        let index = template.parameters.findIndex((x) =>
          feature.uid
            ? x.name === feature.name + "." + feature.uid + "." + parameter.name
            : x.name === feature.name + "." + parameter.name,
        );
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
    proxy.parameters = template.parameters;
    if (template.priority) proxy.priority = template.priority;
    if (template.tests) proxy.tests = template.tests;

    if (template.endpoints.length > 0 && features.length == 0) {
      // this is an empty template, so at least add a default enpoint
      proxy.endpoints.push({
        name: template.endpoints[0]?.name ?? "",
        basePath: template.endpoints[0]?.basePath ?? "",
        routes: [
          {
            name: "default",
          },
        ],
        flows: [],
      });
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
    features.sort((a, b) => {
      let aPrio = a.priority ?? 100;
      let bPrio = b.priority ?? 100;
      return aPrio - bPrio;
    });

    // first apply features with targets & endpoints
    for (let feature of features) {
      if (feature.endpoints.length > 0 || feature.targets.length > 0) {
        proxy = this.proxyApplyFeature(proxy, feature, parameters);
      }
    }

    // now apply features with just policies
    for (let feature of features) {
      if (feature.endpoints.length === 0 && feature.targets.length === 0) {
        proxy = this.proxyApplyFeature(proxy, feature, parameters);
      }
    }

    return proxy;
  }

  public templateUpdateParameters(
    template: Template,
    parameters: { [key: string]: string } = {},
  ) {
    for (let proxyParameter of template.parameters) {
      for (let key of Object.keys(parameters)) {
        if (
          proxyParameter.default.includes("{" + key + "}") &&
          parameters[key]
        ) {
          proxyParameter.default = proxyParameter.default.replaceAll(
            "{" + key + "}",
            parameters[key],
          );
        } else if (
          (proxyParameter.name === key ||
            proxyParameter.name.endsWith("." + key)) &&
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
    if (template.description)
      result.push(`Description: ${template.description}`);

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

  public featureToProxy(
    feature: Feature,
    parameters: { [key: string]: string },
  ): Proxy {
    let newFeature = this.featureReplaceParameters(feature, [], parameters);
    let newProxy = new Proxy();
    newProxy.name = newFeature.name.toLowerCase().startsWith("feature-")
      ? newFeature.name
      : "feature-" + newFeature.name;
    newProxy.description = newFeature.description;
    // keep original parameters, non-replaced
    newProxy.parameters = feature.parameters;
    if (newFeature.displayName) newProxy.displayName = newFeature.displayName;
    if (newFeature.categories) newProxy.categories = newFeature.categories;
    if (newFeature.uid) newProxy.uid = newFeature.uid;
    if (newFeature.priority) newProxy.priority = newFeature.priority;
    if (newFeature.tests) newProxy.tests = newFeature.tests;

    let defaultEndpoint: ProxyEndpoint | undefined = undefined;

    if (newFeature.endpoints.length === 0 || newFeature.defaultEndpoint) {
      if (!newFeature.defaultEndpoint) {
        defaultEndpoint = new ProxyEndpoint();
        defaultEndpoint.name = "default";
        defaultEndpoint.basePath =
          "/" + newProxy.name.toLowerCase().replaceAll(" ", "-");
        defaultEndpoint.routes.push({
          name: "default",
        });
      } else defaultEndpoint = newFeature.defaultEndpoint;

      if (defaultEndpoint) newProxy.endpoints.push(defaultEndpoint);
    }

    if (newFeature.defaultTarget) {
      newProxy.targets.push(newFeature.defaultTarget);
    } else if (newFeature.targets.length === 0) {
      // no default target for now, Apigee automatically returns request
      // for no-target proxies, which is nice.
      //
      // let defaultTarget = new ProxyTarget();
      // defaultTarget.name = "default";
      // defaultTarget.url = "https://httpbin.org";
      // newProxy.targets.push(defaultTarget);
      // if (defaultEndpoint && defaultEndpoint.routes[0])
      //   defaultEndpoint.routes[0].target = "default";
    }

    newProxy.endpoints = newProxy.endpoints.concat(newFeature.endpoints);
    newProxy.targets = newProxy.targets.concat(newFeature.targets);
    newProxy.policies = newFeature.policies;
    newProxy.resources = newFeature.resources;

    return newProxy;
  }

  public featureReplaceParameters(
    feature: Feature,
    proxyParameters: Parameter[],
    parameters: { [key: string]: string },
  ): Feature {
    let featureString = JSON.stringify(feature);
    let proxyParametersString = JSON.stringify(proxyParameters);

    // first replace parameter values
    for (let i = 0; i < feature.parameters.length; i++) {
      let tempFeature = JSON.parse(featureString) as Feature;
      let tempProxyParametres = JSON.parse(
        proxyParametersString,
      ) as Parameter[];

      let parameter = tempFeature.parameters[i];
      if (parameter) {
        let paramValue = parameter.default;
        let proxyParamKey = feature.uid
          ? feature.name + "." + feature.uid + "." + parameter.name
          : feature.name + "." + parameter.name;
        let proxyParam = tempProxyParametres.find(
          (x) => x.name === proxyParamKey,
        );
        if (proxyParam && proxyParam.default) paramValue = proxyParam.default;

        if (parameters[proxyParamKey])
          paramValue = parameters[proxyParamKey] ?? "";
        else if (parameters[parameter.name])
          paramValue = parameters[parameter.name] ?? "";

        let replaceKey = "{" + parameter.name + "}";
        if (parameter.paths) {
          for (let path of parameter.paths) {
            jp.value(tempFeature, path, paramValue);
            featureString = JSON.stringify(tempFeature);
          }
        } else {
          featureString = featureString.replaceAll(replaceKey, paramValue);
        }
        proxyParametersString = proxyParametersString.replaceAll(
          replaceKey,
          paramValue,
        );
      }
    }

    return JSON.parse(featureString);
  }

  public featureUpdateParameters(
    feature: Feature,
    parameters: { [key: string]: string } = {},
  ) {
    for (let featureParameter of feature.parameters) {
      for (let key of Object.keys(parameters)) {
        if (
          featureParameter.default.includes("{" + key + "}") &&
          parameters[key]
        ) {
          featureParameter.default = featureParameter.default.replaceAll(
            "{" + key + "}",
            parameters[key],
          );
        } else if (
          (featureParameter.name === key ||
            featureParameter.name.endsWith("." + key)) &&
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
        result.push(`- ${parameter.name} - ${parameter.description}`);
        if (parameter.default) result.push(`- Default: ${parameter.default}`);
        if (parameter.examples && parameter.examples.length > 0)
          result.push(`- Examples: ${parameter.examples.toString()}`);
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

    if (feature.defaultEndpoint && feature.defaultEndpoint.flows.length > 0) {
      result.push(`Endpoint flows:`);
      for (let flow of feature.defaultEndpoint.flows) {
        if (flow.condition)
          result.push(`- ${flow.name} - ${flow.mode} - ${flow.condition}`);
        else result.push(`- ${flow.name} - ${flow.mode}`);
        for (let step of flow.steps) {
          if (step.condition)
            result.push(`  - ${step.name} - ${step.condition}`);
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

    if (feature.defaultTarget && feature.defaultTarget.flows.length > 0) {
      result.push(`Target flows:`);
      for (let flow of feature.defaultTarget.flows) {
        if (flow.condition)
          result.push(`- ${flow.name} - ${flow.mode} - ${flow.condition}`);
        else result.push(`- ${flow.name} - ${flow.mode}`);
        for (let step of flow.steps) {
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
    // save original parameters, no don't do it, not needed.
    // proxy.parameters = proxy.parameters.concat(feature.parameters);

    // replace parameters from runtime
    let tempFeature = this.featureReplaceParameters(
      feature,
      proxy.parameters,
      parameters,
    );

    // now change names with uid, if available
    if (tempFeature.uid) {
      let tempFeatureString = JSON.stringify(tempFeature);
      // policies
      if (tempFeature.policies && tempFeature.policies.length > 0) {
        for (let policy of tempFeature.policies) {
          let originalName = policy.name;
          policy.name = tempFeature.uid + "-" + policy.name;
          tempFeatureString = tempFeatureString.replaceAll(
            originalName + ".",
            policy.name + ".",
          );
          tempFeatureString = tempFeatureString.replaceAll(
            `"name":"${originalName}"`,
            `"name":"${policy.name}"`,
          );
        }
      }

      // resources
      if (tempFeature.resources && tempFeature.resources.length > 0) {
        for (let resource of tempFeature.resources) {
          let originalName = resource.name;
          resource.name = tempFeature.uid + "-" + resource.name;

          if (originalName.endsWith(".properties")) {
            let propertySetName = originalName.replace(".properties", "");
            let newPropertySetName = resource.name.replace(".properties", "");
            tempFeatureString = tempFeatureString.replaceAll(
              `propertyset.${propertySetName}.`,
              `propertyset.${newPropertySetName}.`,
            );
            tempFeatureString = tempFeatureString.replaceAll(
              `"name":"${originalName}"`,
              `"name":"${resource.name}"`,
            );
          } else {
            tempFeatureString = tempFeatureString.replaceAll(
              `://${originalName}"`,
              `://${resource.name}"`,
            );
            tempFeatureString = tempFeatureString.replaceAll(
              `"name":"${originalName}"`,
              `"name":"${resource.name}"`,
            );
          }
        }
      }

      tempFeature = JSON.parse(tempFeatureString);
    }

    // merge endpoint flows
    if (tempFeature.defaultEndpoint) {
      for (let endpoint of proxy.endpoints) {
        for (let featureFlow of tempFeature.defaultEndpoint.flows) {
          let foundFlow = false;
          for (let proxyFlow of endpoint.flows) {
            if (
              proxyFlow.name == featureFlow.name &&
              proxyFlow.mode == featureFlow.mode &&
              proxyFlow.condition == featureFlow.condition
            ) {
              foundFlow = true;
              proxyFlow.steps = proxyFlow.steps.concat(featureFlow.steps);
              break;
            }
          }

          if (!foundFlow) {
            let newFlow = new Flow(
              featureFlow.name,
              featureFlow.mode,
              featureFlow.condition,
            );
            newFlow.steps = newFlow.steps.concat(featureFlow.steps);
            endpoint.flows.push(newFlow);
          }
        }

        if (tempFeature.defaultEndpoint.defaultFaultRule) {
          if (endpoint.defaultFaultRule) {
            endpoint.defaultFaultRule.steps =
              endpoint.defaultFaultRule.steps.concat(
                tempFeature.defaultEndpoint.defaultFaultRule.steps,
              );
          } else
            endpoint.defaultFaultRule =
              tempFeature.defaultEndpoint.defaultFaultRule;
        }
      }
    }

    // merge target flows
    if (tempFeature.defaultTarget) {
      for (let target of proxy.targets) {
        for (let featureFlow of tempFeature.defaultTarget.flows) {
          let foundFlow = false;
          for (let targetFlow of target.flows) {
            if (
              targetFlow.name == featureFlow.name &&
              targetFlow.mode == featureFlow.mode &&
              targetFlow.condition == featureFlow.condition
            ) {
              foundFlow = true;
              targetFlow.steps = targetFlow.steps.concat(featureFlow.steps);
              break;
            }
          }

          if (!foundFlow) {
            let newFlow = new Flow(
              featureFlow.name,
              featureFlow.mode,
              featureFlow.condition,
            );
            newFlow.steps = newFlow.steps.concat(featureFlow.steps);
            target.flows.push(newFlow);
          }
        }

        if (tempFeature.defaultTarget.defaultFaultRule) {
          if (target.defaultFaultRule) {
            target.defaultFaultRule.steps =
              target.defaultFaultRule.steps.concat(
                tempFeature.defaultTarget.defaultFaultRule.steps,
              );
          } else
            target.defaultFaultRule =
              tempFeature.defaultTarget.defaultFaultRule;
        }
      }
    }

    // if feature has endpoints
    if (tempFeature.endpoints && tempFeature.endpoints.length > 0) {
      // first set name with id
      for (let tempEndpoint of tempFeature.endpoints) {
        // rename endpoint names with uid
        if (tempFeature.uid) {
          tempEndpoint.name = tempFeature.uid + "-" + tempEndpoint.name;

          for (let tempRoute of tempEndpoint.routes) {
            if (tempRoute.target) {
              tempRoute.target = tempFeature.uid + "-" + tempRoute.target;
            }
          }
        }
        let endpointIndex = proxy.endpoints.findIndex(
          (x) => x.name === tempEndpoint.name,
        );
        if (endpointIndex === -1) {
          proxy.endpoints.push(tempEndpoint);
        } else {
          console.log(
            `\n!! Conflict detected in proxy apply feature - endpoint "${tempEndpoint.name}" already exists, overwriting...\n`,
          );
          proxy.endpoints[endpointIndex] = tempEndpoint;
        }
      }
    }

    // if feature has targets
    if (tempFeature.targets && tempFeature.targets.length > 0) {
      for (let tempTarget of tempFeature.targets) {
        // rename targets with uid
        if (tempFeature.uid) {
          tempTarget.name = tempFeature.uid + "-" + tempTarget.name;
        }
        let targetIndex = proxy.targets.findIndex(
          (x) => x.name === tempTarget.name,
        );
        if (targetIndex === -1) {
          proxy.targets.push(tempTarget);
        } else {
          console.log(
            `\n!! Conflict detected in proxy apply feature - target "${tempTarget.name}" already exists, overwriting...\n`,
          );
          proxy.targets[targetIndex] = tempTarget;
        }
      }
    }

    // merge policies
    if (tempFeature.policies && tempFeature.policies.length > 0) {
      for (let policy of tempFeature.policies) {
        let policyIndex = proxy.policies.findIndex(
          (x) => x.name === policy.name,
        );
        if (policyIndex === -1) {
          proxy.policies.push(policy);
        } else {
          console.log(
            `\n!! Conflict detected in proxy apply feature - policy "${policy.name}" already exists, overwriting...\n`,
          );
          proxy.policies[policyIndex] = policy;
        }
      }
    }

    // merge resources
    if (tempFeature.resources && tempFeature.resources.length > 0) {
      for (let resource of tempFeature.resources) {
        let resourceIndex = proxy.resources.findIndex(
          (x) => x.name === resource.name,
        );
        if (resourceIndex === -1) {
          proxy.resources.push(resource);
        } else {
          console.log(
            `\n!! Conflict detected in proxy apply feature - resource "${resource.name}" already exists, overwriting...\n`,
          );
          proxy.resources[resourceIndex] = resource;
        }
      }
    }

    return proxy;
  }

  public proxyRemoveFeature(proxy: Proxy, feature: Feature): Proxy {
    // remove parameters
    for (let parameter of feature.parameters) {
      let index = proxy.parameters.findIndex(
        (x) => x.name == parameter.name && x.default == parameter.default,
      );
      if (index != -1) proxy.parameters.splice(index, 1);
    }

    // remove default endpoint flow steps
    if (feature.defaultEndpoint) {
      for (let featureFlow of feature.defaultEndpoint.flows) {
        for (let endpoint of proxy.endpoints) {
          for (let proxyFlow of endpoint.flows) {
            if (
              proxyFlow.name == featureFlow.name &&
              proxyFlow.mode == featureFlow.mode &&
              proxyFlow.condition == featureFlow.condition
            ) {
              for (let step of featureFlow.steps) {
                let index = proxyFlow.steps.findIndex(
                  (x) =>
                    x.name === feature.uid + "-" + step.name &&
                    x.condition === step.condition,
                );
                if (index != -1) proxyFlow.steps.splice(index, 1);
              }
              break;
            }
          }
        }
      }

      if (feature.defaultEndpoint.defaultFaultRule) {
        for (let endpoint of proxy.endpoints) {
          for (let step of feature.defaultEndpoint.defaultFaultRule.steps) {
            if (endpoint.defaultFaultRule) {
              let index = endpoint.defaultFaultRule.steps.findIndex(
                (x) =>
                  x.name === feature.uid + "-" + step.name &&
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
      for (let featureFlow of feature.defaultTarget.flows) {
        for (let target of proxy.targets) {
          for (let targetFlow of target.flows) {
            if (
              targetFlow.name == featureFlow.name &&
              targetFlow.mode == featureFlow.mode &&
              targetFlow.condition == featureFlow.condition
            ) {
              for (let step of featureFlow.steps) {
                let index = targetFlow.steps.findIndex(
                  (x) =>
                    x.name === feature.uid + "-" + step.name &&
                    x.condition === step.condition,
                );
                if (index != -1) targetFlow.steps.splice(index, 1);
              }
              break;
            }
          }
        }
      }

      if (feature.defaultTarget.defaultFaultRule) {
        for (let target of proxy.targets) {
          for (let step of feature.defaultTarget.defaultFaultRule.steps) {
            if (target.defaultFaultRule) {
              let index = target.defaultFaultRule.steps.findIndex(
                (x) =>
                  x.name === feature.uid + "-" + step.name &&
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
        let index = proxy.endpoints.findIndex((x) => x.name === endpoint.name);
        if (index != -1) proxy.endpoints.splice(index, 1);
      }
    }

    // if feature has targets
    if (feature.targets && feature.targets.length > 0) {
      for (let target of feature.targets) {
        // target with uid, if available
        if (feature.uid) target.name = feature.uid + "-" + target.name;
        let index = proxy.targets.findIndex((x) => x.name === target.name);
        if (index != -1) proxy.targets.splice(index, 1);
      }
    }

    // remove policies
    if (feature.policies && feature.policies.length > 0) {
      for (let policy of feature.policies) {
        if (feature.uid) policy.name = feature.uid + "-" + policy.name;
        let policyIndex = proxy.policies.findIndex(
          (x) => x.name === policy.name,
        );
        if (policyIndex != -1) {
          proxy.policies.splice(policyIndex, 1);
        }
      }
    }

    // remove resources
    if (feature.resources && feature.resources.length > 0) {
      for (let resource of feature.resources) {
        if (feature.uid) resource.name = feature.uid + "-" + resource.name;
        let resourceIndex = proxy.resources.findIndex(
          (x) => x.name === resource.name,
        );
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
    template.parameters = proxy.parameters;

    for (let proxyEndpoint of proxy.endpoints) {
      let templateEndpoint = new Endpoint();
      templateEndpoint.name = proxyEndpoint.name;
      templateEndpoint.basePath = proxyEndpoint.basePath;
      templateEndpoint.routes = proxyEndpoint.routes;
      template.endpoints.push(templateEndpoint);
    }
    for (let proxyTarget of proxy.targets) {
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
    if (newFeature.name.startsWith("feature-"))
      newFeature.name = newFeature.name.replace("feature-", "");
    newFeature.description = proxy.description;
    newFeature.parameters = proxy.parameters;
    if (proxy.uid) newFeature.uid = proxy.uid;
    if (proxy.priority) newFeature.priority = proxy.priority;
    if (proxy.tests) newFeature.tests = proxy.tests;
    if (proxy.displayName) newFeature.displayName = proxy.displayName;
    if (proxy.categories) newFeature.categories = proxy.categories;

    let defaultEndpoint = proxy.endpoints.find((x) => x.name == "default");
    let defaultTarget = proxy.targets.find((x) => x.name == "default");

    if (defaultEndpoint) newFeature.defaultEndpoint = defaultEndpoint;
    if (defaultTarget) newFeature.defaultTarget = defaultTarget;

    for (let endpoint of proxy.endpoints)
      if (endpoint.name != "default") newFeature.endpoints.push(endpoint);

    for (let target of proxy.targets)
      if (target.name != "default") newFeature.targets.push(target);

    newFeature.policies = proxy.policies;
    newFeature.resources = proxy.resources;

    return newFeature;
  }

  public proxyUpdateParameters(
    proxy: Proxy,
    parameters: { [key: string]: string } = {},
  ) {
    for (let proxyParameter of proxy.parameters) {
      for (let key of Object.keys(parameters)) {
        if (
          proxyParameter.default.includes("{" + key + "}") &&
          parameters[key]
        ) {
          proxyParameter.default = proxyParameter.default.replaceAll(
            "{" + key + "}",
            parameters[key],
          );
        } else if (
          (proxyParameter.name === key ||
            proxyParameter.name.endsWith("." + key)) &&
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

  public cleanXmlJson(input: any): any {
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
        let newKey = this.toCamelCase(key);

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

  public cleanJsonXml(input: any): any {
    input = this.addXml(input);
    let newInput: any = {
      _declaration: {
        _attributes: {
          version: "1.0",
          encoding: "UTF-8",
          standalone: "yes",
        },
      },
    };
    for (const key in input) newInput[key] = input[key];

    return newInput;
  }

  public addXml(inputObject: any): any {
    if (typeof inputObject !== "object" || inputObject === null) {
      return inputObject;
    }
    if (Array.isArray(inputObject)) {
      return inputObject.map((item) => this.addXml(item));
    }

    const newObject: any = {};

    for (const key in inputObject) {
      if (Object.prototype.hasOwnProperty.call(inputObject, key)) {
        const value = inputObject[key];

        if (typeof value === "string") {
          newObject[key] = {
            _text: value,
          };
        } else if (typeof value === "object" && value !== null) {
          newObject[key] = this.addXml(value);
        } else {
          newObject[key] = value;
        }
      }
    }

    return newObject;
  }
}
