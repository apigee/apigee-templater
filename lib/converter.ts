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
  ProxyFeature,
} from "./interfaces.ts";

export class ApigeeConverter {
  public async zipToJson(name: string, inputFilePath: string): Promise<any> {
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

            if (
              this.testXmlFlow("PreFlow", "Request", proxyJson["ProxyEndpoint"])
            )
              newEndpoint.requestPreFlow = this.flowXmlToJson(
                "PreFlow",
                "Request",
                proxyJson["ProxyEndpoint"],
              );
            if (
              this.testXmlFlow(
                "PreFlow",
                "Response",
                proxyJson["ProxyEndpoint"],
              )
            )
              newEndpoint.responsePreFlow = this.flowXmlToJson(
                "PreFlow",
                "Response",
                proxyJson["ProxyEndpoint"],
              );
            if (
              this.testXmlFlow(
                "PostFlow",
                "Request",
                proxyJson["ProxyEndpoint"],
              )
            )
              newEndpoint.requestPostFlow = this.flowXmlToJson(
                "PostFlow",
                "Request",
                proxyJson["ProxyEndpoint"],
              );
            if (
              this.testXmlFlow(
                "PostFlow",
                "Response",
                proxyJson["ProxyEndpoint"],
              )
            )
              newEndpoint.responsePostFlow = this.flowXmlToJson(
                "PostFlow",
                "Response",
                proxyJson["ProxyEndpoint"],
              );
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
              newTarget.url =
                targetJson["TargetEndpoint"]["HTTPTargetConnection"]["URL"][
                  "_text"
                ];

              if (
                this.testXmlFlow(
                  "PreFlow",
                  "Request",
                  targetJson["TargetEndpoint"],
                )
              )
                newTarget.requestPreFlow = this.flowXmlToJson(
                  "PreFlow",
                  "Request",
                  targetJson["TargetEndpoint"],
                );
              if (
                this.testXmlFlow(
                  "PreFlow",
                  "Response",
                  targetJson["TargetEndpoint"],
                )
              )
                newTarget.responsePreFlow = this.flowXmlToJson(
                  "PreFlow",
                  "Response",
                  targetJson["TargetEndpoint"],
                );
              if (
                this.testXmlFlow(
                  "PostFlow",
                  "Request",
                  targetJson["TargetEndpoint"],
                )
              )
                newTarget.requestPostFlow = this.flowXmlToJson(
                  "PostFlow",
                  "Request",
                  targetJson["TargetEndpoint"],
                );
              if (
                this.testXmlFlow(
                  "PostFlow",
                  "Response",
                  targetJson["TargetEndpoint"],
                )
              )
                newTarget.responsePostFlow = this.flowXmlToJson(
                  "PostFlow",
                  "Response",
                  targetJson["TargetEndpoint"],
                );

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

  public async jsonToZip(name: string, input: any): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      var zipfile = new yazl.ZipFile();
      let tempFilePath = "./data/proxies/" + name;
      fs.mkdirSync(tempFilePath, { recursive: true });

      // endpoints
      for (let endpoint of input["endpoints"]) {
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
        endpointXml["ProxyEndpoint"]["PreFlow"]["Request"] = this.flowJsonToXml(
          "PreFlow",
          endpoint["requestPreFlow"],
        );
        endpointXml["ProxyEndpoint"]["PreFlow"]["Response"] =
          this.flowJsonToXml("PreFlow", endpoint["responsePreFlow"]);
        endpointXml["ProxyEndpoint"]["PostFlow"]["Request"] =
          this.flowJsonToXml("PostFlow", endpoint["requestPostFlow"]);
        endpointXml["ProxyEndpoint"]["PostFlow"]["Response"] =
          this.flowJsonToXml("PostFlow", endpoint["responsePostFlow"]);

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
      for (let target of input["targets"]) {
        let targetXml = {
          TargetEndpoint: {
            _attributes: {
              name: target["name"],
            },
            HTTPTargetConnection: {
              URL: {
                _text: target["url"],
              },
            },
          },
        };

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
        targetXml["TargetEndpoint"]["PreFlow"]["Request"] = this.flowJsonToXml(
          "PreFlow",
          target["requestPreFlow"],
        );
        targetXml["TargetEndpoint"]["PreFlow"]["Response"] = this.flowJsonToXml(
          "PreFlow",
          target["responsePreFlow"],
        );
        targetXml["TargetEndpoint"]["PostFlow"]["Request"] = this.flowJsonToXml(
          "PostFlow",
          target["requestPostFlow"],
        );
        targetXml["TargetEndpoint"]["PostFlow"]["Response"] =
          this.flowJsonToXml("PostFlow", target["responsePostFlow"]);

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

  public testXmlFlow(type: string, subType: string, sourceDoc: any): boolean {
    let result = false;
    if (
      sourceDoc &&
      sourceDoc["PreFlow"] &&
      sourceDoc["PreFlow"]["Request"] &&
      sourceDoc["PreFlow"]["Request"]["Step"]
    ) {
      result = true;
    }
    return result;
  }

  public flowXmlToJson(type: string, subType: string, sourceDoc: any): Flow {
    let resultFlow: Flow = new Flow(type);
    if (
      sourceDoc &&
      sourceDoc[type] &&
      sourceDoc[type][subType] &&
      sourceDoc[type][subType]["Step"] &&
      sourceDoc[type][subType]["Step"].length > 0
    ) {
      for (let step of sourceDoc[type][subType]["Step"]) {
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
      sourceDoc[type][subType] &&
      sourceDoc[type][subType]["Step"]
    ) {
      let newStep = new Step();
      newStep.name = sourceDoc[type][subType]["Step"]["Name"]["_text"];
      if (sourceDoc[type][subType]["Step"]["Condition"]) {
        newStep.condition =
          sourceDoc[type][subType]["Step"]["Condition"]["_text"];
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

  public async jsonApplyFeature(
    proxy: Proxy,
    feature: ProxyFeature,
    parameters: { [key: string]: string } = {},
  ): Promise<Proxy> {
    return new Promise<any>((resolve, reject) => {
      for (let endpoint of proxy.endpoints) {
        if (
          feature.endpointRequestPreFlowSteps &&
          feature.endpointRequestPreFlowSteps.length > 0
        ) {
          if (!endpoint.requestPreFlow)
            endpoint.requestPreFlow = new Flow("PreFlow");
          endpoint.requestPreFlow.steps = endpoint.requestPreFlow.steps.concat(
            feature.endpointRequestPreFlowSteps,
          );
        }
        if (
          feature.endpointRequestPostFlowSteps &&
          feature.endpointRequestPostFlowSteps.length > 0
        ) {
          if (!endpoint.requestPostFlow)
            endpoint.requestPostFlow = new Flow("PostFlow");
          endpoint.requestPostFlow.steps =
            endpoint.requestPostFlow.steps.concat(
              feature.endpointRequestPostFlowSteps,
            );
        }
        if (
          feature.endpointResponsePreFlowSteps &&
          feature.endpointResponsePreFlowSteps.length > 0
        ) {
          if (!endpoint.responsePreFlow)
            endpoint.responsePreFlow = new Flow("PreFlow");
          endpoint.responsePreFlow.steps =
            endpoint.responsePreFlow.steps.concat(
              feature.endpointResponsePreFlowSteps,
            );
        }
        if (
          feature.endpointResponsePostFlowSteps &&
          feature.endpointResponsePostFlowSteps.length > 0
        ) {
          if (!endpoint.requestPostFlow)
            endpoint.requestPostFlow = new Flow("PostFlow");
          endpoint.requestPostFlow.steps =
            endpoint.requestPostFlow.steps.concat(
              feature.endpointResponsePostFlowSteps,
            );
        }
      }

      for (let target of proxy.targets) {
        if (
          feature.targetRequestPreFlowSteps &&
          feature.targetRequestPreFlowSteps.length > 0
        ) {
          if (!target.requestPreFlow)
            target.requestPreFlow = new Flow("PreFlow");
          target.requestPreFlow.steps = target.requestPreFlow.steps.concat(
            feature.targetRequestPreFlowSteps,
          );
        }
        if (
          feature.targetRequestPostFlowSteps &&
          feature.targetRequestPostFlowSteps.length > 0
        ) {
          if (!target.requestPostFlow)
            target.requestPostFlow = new Flow("PostFlow");
          target.requestPostFlow.steps = target.requestPostFlow.steps.concat(
            feature.targetRequestPostFlowSteps,
          );
        }
        if (
          feature.targetResponsePreFlowSteps &&
          feature.targetResponsePreFlowSteps.length > 0
        ) {
          if (!target.responsePreFlow)
            target.responsePreFlow = new Flow("PreFlow");
          target.responsePreFlow.steps = target.responsePreFlow.steps.concat(
            feature.targetResponsePreFlowSteps,
          );
        }
        if (
          feature.targetResponsePostFlowSteps &&
          feature.targetResponsePostFlowSteps.length > 0
        ) {
          if (!target.requestPostFlow)
            target.requestPostFlow = new Flow("PostFlow");
          target.requestPostFlow.steps = target.requestPostFlow.steps.concat(
            feature.targetResponsePostFlowSteps,
          );
        }
      }

      if (feature.policies && feature.policies.length > 0)
        proxy.policies = proxy.policies.concat(
          this.featureReplaceParameters(feature.policies, feature, parameters),
        );
      if (feature.resources && feature.resources.length > 0)
        proxy.resources = proxy.resources.concat(
          this.featureReplaceParameters(feature.resources, feature, parameters),
        );

      resolve(proxy);
    });
  }

  public featureReplaceParameters(
    input: any,
    feature: ProxyFeature,
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

  public proxyToString(proxy: Proxy): string {
    let result = `Proxy ${proxy.name} has these endpoints:\n`;
    if (!proxy.name) result = `Proxy has these endpoints:\n`;

    for (let endpoint of proxy.endpoints) {
      result += ` - ${endpoint.path}\n`;
    }
    result += `To these targets:\n`;

    for (let target of proxy.targets) {
      result += ` - ${target.name} - ${target.url}\n`;
    }

    return result;
  }
}
