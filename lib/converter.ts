import * as xmljs from "xml-js";
import yauzl from "yauzl";
import yazl from "yazl";
import path from "path";
import fs from "fs";
import {
  Proxy,
  Endpoint,
  Route,
  Flow,
  Step,
  Policy,
  Target,
  Resource,
  Feature,
} from "./interfaces.ts";

export class ApigeeConverter {
  public async zipToJson(name: string, inputFilePath: string): Promise<Proxy> {
    return new Promise((resolve, reject) => {
      let tempOutputDir = "./data/temp/" + name;
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
          let proxies: string[] = fs.readdirSync(
            tempOutputDir + "/apiproxy/proxies",
          );
          let newProxy = new Proxy();
          newProxy.name = name;
          for (let proxy of proxies) {
            let newEndpoint = new Endpoint();
            let proxyPath = path.join(tempOutputDir, "apiproxy/proxies", proxy);
            let proxyContents = fs.readFileSync(proxyPath, "utf8");

            let proxyJsonString = xmljs.xml2json(proxyContents, {
              compact: true,
              spaces: 2,
            });
            let proxyJson = JSON.parse(proxyJsonString);

            newEndpoint.name =
              proxyJson["ProxyEndpoint"]["_attributes"]["name"];
            newEndpoint.path =
              proxyJson["ProxyEndpoint"]["HTTPProxyConnection"]["BasePath"][
                "_text"
              ];

            // routes
            if (proxyJson["ProxyEndpoint"]["RouteRule"].length > 0) {
              for (let routeRule of proxyJson["ProxyEndpoint"]["RouteRule"]) {
                let newRoute = new Route();
                newRoute.name = routeRule["_attributes"]["name"];
                newRoute.target = routeRule["TargetEndpoint"]["_text"];
                if (routeRule["Condition"])
                  newRoute.condition = routeRule["Condition"]["_text"];
                newEndpoint.routes.push(newRoute);
              }
            } else {
              let newRoute = new Route();
              newRoute.name =
                proxyJson["ProxyEndpoint"]["RouteRule"]["_attributes"]["name"];
              newRoute.target =
                proxyJson["ProxyEndpoint"]["RouteRule"]["TargetEndpoint"][
                  "_text"
                ];
              if (
                proxyJson["TargetEndpoint"]["RouteRule"]["Condition"]["_text"]
              )
                newRoute.condition =
                  proxyJson["TargetEndpoint"]["RouteRule"]["Condition"][
                    "_text"
                  ];
              newEndpoint.routes.push(newRoute);
            }

            let requestPreFlow = this.flowXmlToJson(
              "PreFlow",
              "Request",
              proxyJson["ProxyEndpoint"],
            );
            if (requestPreFlow.steps.length > 0)
              newEndpoint.flows.push(requestPreFlow);

            let responsePreFlow = this.flowXmlToJson(
              "PreFlow",
              "Response",
              proxyJson["ProxyEndpoint"],
            );
            if (responsePreFlow.steps.length > 0)
              newEndpoint.flows.push(responsePreFlow);

            let requestPostFlow = this.flowXmlToJson(
              "PostFlow",
              "Request",
              proxyJson["ProxyEndpoint"],
            );
            if (requestPostFlow.steps.length > 0)
              newEndpoint.flows.push(requestPostFlow);

            let responsePostFlow = this.flowXmlToJson(
              "PostFlow",
              "Response",
              proxyJson["ProxyEndpoint"],
            );
            if (responsePostFlow.steps.length > 0)
              newEndpoint.flows.push(responsePostFlow);

            newProxy.endpoints.push(newEndpoint);

            // policies
            let policies: string[] = fs.readdirSync(
              tempOutputDir + "/apiproxy/policies",
            );
            for (let policy of policies) {
              let policyContents = fs.readFileSync(
                tempOutputDir + "/apiproxy/policies/" + policy,
                "utf8",
              );
              let policyJsonString = xmljs.xml2json(policyContents, {
                compact: true,
                spaces: 2,
              });
              let policyJson = JSON.parse(policyJsonString);
              let newPolicy = new Policy();
              newPolicy.type = Object.keys(policyJson)[1];
              newPolicy.name =
                policyJson[newPolicy.type]["_attributes"]["name"];
              newPolicy.content = policyJson;
              newProxy.policies.push(newPolicy);
            }

            // targets
            let targets: string[] = fs.readdirSync(
              tempOutputDir + "/apiproxy/targets",
            );
            for (let target of targets) {
              let newTarget = new Target();
              let targetContent = fs.readFileSync(
                tempOutputDir + "/apiproxy/targets/" + target,
                "utf8",
              );

              let targetJsonString = xmljs.xml2json(targetContent, {
                compact: true,
                spaces: 2,
              });
              let targetJson = JSON.parse(targetJsonString);
              // console.log(targetJsonString);
              newTarget.name =
                targetJson["TargetEndpoint"]["_attributes"]["name"];
              if (
                targetJson["TargetEndpoint"]["HTTPTargetConnection"] &&
                targetJson["TargetEndpoint"]["HTTPTargetConnection"]["URL"]
              )
                newTarget.url =
                  targetJson["TargetEndpoint"]["HTTPTargetConnection"]["URL"][
                    "_text"
                  ];
              if (targetJson["TargetEndpoint"]["HTTPTargetConnection"]) {
                newTarget.httpTargetConnection =
                  targetJson["TargetEndpoint"]["HTTPTargetConnection"];
              } else if (targetJson["TargetEndpoint"]["LocalTargetConnection"])
                newTarget.localTargetConnection =
                  targetJson["TargetEndpoint"]["LocalTargetConnection"];

              let requestPreFlow = this.flowXmlToJson(
                "PreFlow",
                "Request",
                targetJson["TargetEndpoint"],
              );
              if (requestPreFlow.steps.length > 0)
                newTarget.flows.push(requestPreFlow);
              let responsePreFlow = this.flowXmlToJson(
                "PreFlow",
                "Response",
                targetJson["TargetEndpoint"],
              );
              if (responsePreFlow.steps.length > 0)
                newTarget.flows.push(responsePreFlow);
              let requestPostFlow = this.flowXmlToJson(
                "PostFlow",
                "Request",
                targetJson["TargetEndpoint"],
              );
              if (requestPostFlow.steps.length > 0)
                newTarget.flows.push(requestPostFlow);
              let responsePostFlow = this.flowXmlToJson(
                "PostFlow",
                "Response",
                targetJson["TargetEndpoint"],
              );
              if (responsePostFlow.steps.length > 0)
                newTarget.flows.push(responsePostFlow);
              let eventFlow = this.flowXmlToJson(
                "EventFlow",
                "Response",
                targetJson["TargetEndpoint"],
              );
              if (eventFlow.steps.length > 0) newTarget.flows.push(eventFlow);
              newProxy.targets.push(newTarget);
            }

            // resources
            if (fs.existsSync(tempOutputDir + "/apiproxy/resources")) {
              let resTypes: string[] = fs.readdirSync(
                tempOutputDir + "/apiproxy/resources",
              );
              for (let resType of resTypes) {
                let resFiles: string[] = fs.readdirSync(
                  tempOutputDir + "/apiproxy/resources/" + resType,
                );

                for (let resFile of resFiles) {
                  let newFile = new Resource();
                  newFile.name = resFile;
                  newFile.type = resType;
                  newFile.content = fs.readFileSync(
                    tempOutputDir +
                      "/apiproxy/resources/" +
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

          fs.rmSync(tempOutputDir, { recursive: true });
          resolve(newProxy);
        });
      });
    });
  }

  public async jsonToZip(name: string, input: Proxy): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      var zipfile = new yazl.ZipFile();
      let tempFilePath = "./data/proxies/" + name;
      fs.mkdirSync(tempFilePath, { recursive: true });

      // endpoints
      for (let endpoint of input.endpoints) {
        let endpointXml = {
          ProxyEndpoint: {
            _attributes: {
              name: endpoint["name"],
            },
            HTTPProxyConnection: {
              BasePath: {
                _text: endpoint["path"],
              },
            },
          },
        };

        // request preflow
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

        for (let flow of endpoint.flows) {
          if (!flow.condition && flow.steps.length > 0 && flow.mode) {
            endpointXml["ProxyEndpoint"][flow.name][flow.mode] =
              this.flowJsonToXml(flow.mode, flow);
          }
        }

        // routes
        if (endpoint["routes"].length > 1) {
          endpointXml["ProxyEndpoint"]["RouteRule"] = [];
          for (let route of endpoint["routes"]) {
            let newRouteRule = {
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
        } else if (endpoint["routes"].length === 1) {
          endpointXml["ProxyEndpoint"]["RouteRule"] = {
            _attributes: {
              name: endpoint["routes"][0]["name"],
            },
          };
          if (endpoint["routes"][0]["target"]) {
            endpointXml["ProxyEndpoint"]["RouteRule"]["Target"] = {
              _text: endpoint["routes"][0]["target"],
            };
          }
          if (endpoint["routes"][0]["condition"]) {
            endpointXml["ProxyEndpoint"]["RouteRule"]["Condition"] = {
              _text: endpoint["routes"][0]["condition"],
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
        let targetXml = {
          TargetEndpoint: {
            _attributes: {
              name: target["name"],
            },
          },
        };

        if (target.httpTargetConnection) {
          targetXml["HTTPTargetConnection"] = target.httpTargetConnection;
        } else if (target.localTargetConnection) {
          targetXml["LocalTargetConnection"] = target.localTargetConnection;
        }

        if (target.url) {
          targetXml["TargetEndpoint"]["HTTPTargetConnection"]["URL"]["_text"] =
            target.url;
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
          if (!flow.condition && flow.steps.length > 0 && flow.mode) {
            targetXml["TargetEndpoint"][flow.name][flow.mode] =
              this.flowJsonToXml(flow.mode, flow);
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
        let xmlString = xmljs.json2xml(JSON.stringify(policy["content"]), {
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

      zipfile.outputStream
        .pipe(fs.createWriteStream(tempFilePath + ".zip"))
        .on("close", function () {
          fs.rmSync(tempFilePath, { recursive: true });
          resolve(tempFilePath + ".zip");
        });
      zipfile.end();
    });
  }

  public flowXmlToJson(type: string, mode: string, sourceDoc: any): Flow {
    let resultFlow: Flow = new Flow(type, mode);
    if (
      sourceDoc &&
      sourceDoc[type] &&
      sourceDoc[type][mode] &&
      sourceDoc[type][mode]["Step"] &&
      sourceDoc[type][mode]["Step"].length > 0
    ) {
      for (let step of sourceDoc[type][mode]["Step"]) {
        let newStep = new Step();
        newStep.name = step["Name"]["_text"];
        if (step["Condition"]) {
          newStep.condition = step["Condition"]["_text"];
        }

        resultFlow.steps.push(newStep);
      }
    } else if (
      sourceDoc &&
      sourceDoc[type] &&
      sourceDoc[type][mode] &&
      sourceDoc[type][mode]["Step"]
    ) {
      let newStep = new Step();
      newStep.name = sourceDoc[type][mode]["Step"]["Name"]["_text"];
      if (sourceDoc[type][mode]["Step"]["Condition"]) {
        newStep.condition = sourceDoc[type][mode]["Step"]["Condition"]["_text"];
      }
      resultFlow.steps.push(newStep);
    }

    return resultFlow;
  }

  public flowJsonToXml(type: string, sourceDoc: any): any {
    let result: any = {};
    if (sourceDoc && sourceDoc["steps"] && sourceDoc["steps"].length > 1) {
      result["Step"] = [];
      for (let step of sourceDoc["steps"]) {
        let newStep = {
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

  public jsonApplyFeature(
    proxy: Proxy,
    feature: Feature,
    parameters: { [key: string]: string } = {},
  ): Proxy {
    // merge endpoint flows
    for (let featureFlow of feature.endpointFlows) {
      for (let endpoint of proxy.endpoints) {
        let foundFlow = false;
        for (let proxyFlow of endpoint.flows) {
          if (
            proxyFlow.name == featureFlow.name &&
            proxyFlow.mode == featureFlow.mode &&
            proxyFlow.condition == featureFlow.condition
          ) {
            foundFlow = true;
            proxyFlow.steps = featureFlow.steps.concat(proxyFlow.steps);
            break;
          }
        }

        if (!foundFlow) {
          endpoint.flows.push(featureFlow);
        }
      }
    }

    // merge target flows
    for (let featureFlow of feature.targetFlows) {
      for (let target of proxy.targets) {
        let foundFlow = false;
        for (let targetFlow of target.flows) {
          if (
            targetFlow.name == featureFlow.name &&
            targetFlow.mode == featureFlow.mode &&
            targetFlow.condition == featureFlow.condition
          ) {
            foundFlow = true;
            targetFlow.steps = featureFlow.steps.concat(targetFlow.steps);
            break;
          }
        }

        if (!foundFlow) {
          target.flows.push(featureFlow);
        }
      }
    }

    // merge policies
    if (feature.policies && feature.policies.length > 0)
      proxy.policies = proxy.policies.concat(
        this.featureReplaceParameters(feature.policies, feature, parameters),
      );
    // merge resources
    if (feature.resources && feature.resources.length > 0)
      proxy.resources = proxy.resources.concat(
        this.featureReplaceParameters(feature.resources, feature, parameters),
      );

    proxy.features.push(feature.name);

    return proxy;
  }

  public jsonRemoveFeature(proxy: Proxy, feature: Feature): Proxy {
    // remove endpoint flow steps
    for (let featureFlow of feature.endpointFlows) {
      for (let endpoint of proxy.endpoints) {
        let flowsToRemove: Flow[] = [];
        for (let proxyFlow of endpoint.flows) {
          if (
            proxyFlow.name == featureFlow.name &&
            proxyFlow.mode == featureFlow.mode &&
            proxyFlow.condition == featureFlow.condition
          ) {
            for (let step of featureFlow.steps) {
              let index = proxyFlow.steps.findIndex(
                (x) => x.name === step.name,
              );
              if (index != -1) {
                proxyFlow.steps.splice(index, 1);
              }
            }

            if (proxyFlow.steps.length === 0) flowsToRemove.push(proxyFlow);
          }
        }

        for (let removeFlow of flowsToRemove) {
          let index = endpoint.flows.findIndex(
            (x) =>
              x.name === removeFlow.name &&
              x.mode === removeFlow.mode &&
              x.condition == removeFlow.condition,
          );
          if (index != -1) endpoint.flows.splice(index, 1);
        }
      }
    }

    // remove target flows
    for (let featureFlow of feature.targetFlows) {
      for (let target of proxy.targets) {
        let flowsToRemove: Flow[] = [];
        for (let targetFlow of target.flows) {
          if (
            targetFlow.name == featureFlow.name &&
            targetFlow.mode == featureFlow.mode &&
            targetFlow.condition == featureFlow.condition
          ) {
            for (let step of featureFlow.steps) {
              let index = targetFlow.steps.findIndex(
                (x) => x.name === step.name,
              );
              if (index != -1) {
                targetFlow.steps.splice(index, 1);
              }
            }

            if (targetFlow.steps.length === 0) flowsToRemove.push(targetFlow);
          }
        }

        for (let removeFlow of flowsToRemove) {
          let index = target.flows.findIndex(
            (x) =>
              x.name === removeFlow.name &&
              x.mode === removeFlow.mode &&
              x.condition == removeFlow.condition,
          );
          if (index != -1) target.flows.splice(index, 1);
        }
      }
    }

    // remove policies
    for (let policy of feature.policies) {
      let index = proxy.policies.findIndex((x) => x.name === policy.name);
      if (index != -1) {
        proxy.policies.splice(index, 1);
      }
    }

    // remove resources
    if (feature.resources) {
      for (let resource of feature.resources) {
        let index = proxy.resources.findIndex((x) => x.name === resource.name);
        if (index != -1) {
          proxy.resources.splice(index, 1);
        }
      }
    }

    let index = proxy.features.findIndex((x) => x === feature.name);
    if (index != -1) proxy.features.splice(index, 1);

    return proxy;
  }

  public featureReplaceParameters(
    input: any,
    feature: Feature,
    parameters: { [key: string]: string } = {},
  ): any {
    let inputString = JSON.stringify(input);

    for (let parameter of feature.parameters) {
      let paramValue = parameter.default;
      if (parameters[parameter.name]) paramValue = parameters[parameter.name];
      inputString = inputString.replaceAll(parameter.name, paramValue);
    }

    return JSON.parse(inputString);
  }

  public jsonToFeature(input: Proxy): Feature {
    let newFeature = new Feature();
    newFeature.name = input.name;
    if (input.endpoints.length > 0)
      newFeature.endpointFlows = input.endpoints[0].flows;
    if (input.targets.length > 0)
      newFeature.targetFlows = input.targets[0].flows;

    newFeature.policies = input.policies;
    newFeature.resources = input.resources;

    return newFeature;
  }

  public proxyToString(proxy: Proxy): string {
    let result = "";
    if (proxy.name) result = `Name: ${proxy.name}\n`;
    if (proxy.description) result += `Description: ${proxy.description}\n`;
    result += "\n";

    if (proxy.features && proxy.features.length > 0) {
      result += `\nFeatures:\n`;
      for (let feature of proxy.features) {
        result += ` - ${feature}\n`;
      }
    } else {
      result += `\nFeatures: none\n`;
    }

    if (proxy.endpoints && proxy.endpoints.length > 0) {
      result += `\nEndpoints:\n`;
      for (let endpoint of proxy.endpoints) {
        result += ` - ${endpoint.path}\n`;
      }
    } else {
      result += `\nEndpoints: none\n`;
    }

    if (proxy.targets && proxy.targets.length > 0) {
      result += `\nTargets:\n`;
      for (let target of proxy.targets) {
        result += ` - ${target.name} - ${target.url}\n`;
      }
    } else {
      result += `\nTargets: none\n`;
    }

    if (proxy.policies && proxy.policies.length > 0) {
      result += `\nPolicies:\n`;
      for (let policy of proxy.policies) {
        result += ` - ${policy.name} - ${policy.type}\n`;
      }
    } else {
      result += `\nPolicies: none\n`;
    }

    if (proxy.resources && proxy.resources.length > 0) {
      result += `\nResources:\n`;
      for (let resource of proxy.resources) {
        result += ` - ${resource.name} - ${resource.type}\n`;
      }
    } else {
      result += `\nResources: none\n`;
    }

    return result;
  }

  public featureToString(feature: Feature): string {
    let result = "";
    if (feature.name) result = `Name: ${feature.name}\n`;
    if (feature.description) result += `Description: ${feature.description}\n`;
    result += "\n";

    if (feature.parameters && feature.parameters.length > 0) {
      result += `\nParameters:\n`;
      for (let parameter of feature.parameters) {
        result += ` - ${parameter.name} - ${parameter.description}\n`;
        if (parameter.default) result += ` - Default: ${parameter.default}\n`;
        if (parameter.examples && parameter.examples.length > 0)
          result += ` - Examples: ${parameter.examples.toString()}\n`;
      }
    } else {
      result += `\nEndpoints flows: none\n`;
    }

    if (feature.endpointFlows && feature.endpointFlows.length > 0) {
      result += `\nEndpoint flows:\n`;
      for (let flow of feature.endpointFlows) {
        result += ` - ${flow.name} - ${flow.mode} - ${flow.condition}\n`;
        for (let step of flow.steps) {
          result += `  - ${step.name} - ${step.condition}\n`;
        }
      }
    } else {
      result += `\nEndpoints flows: none\n`;
    }

    if (feature.targetFlows && feature.targetFlows.length > 0) {
      result += `\nTarget flows:\n`;
      for (let flow of feature.targetFlows) {
        result += ` - ${flow.name} - ${flow.mode} - ${flow.condition}\n`;
        for (let step of flow.steps) {
          result += `  - ${step.name} - ${step.condition}\n`;
        }
      }
    } else {
      result += `\nTarget flows: none\n`;
    }

    if (feature.policies && feature.policies.length > 0) {
      result += `\nPolicies:\n`;
      for (let policy of feature.policies) {
        result += ` - ${policy.name} - ${policy.type}\n`;
      }
    } else {
      result += `\nPolicies: none\n`;
    }

    if (feature.resources && feature.resources.length > 0) {
      result += `\nResources:\n`;
      for (let resource of feature.resources) {
        result += ` - ${resource.name} - ${resource.type}\n`;
      }
    } else {
      result += `\nResources: none\n`;
    }

    return result;
  }
}
