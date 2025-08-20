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
} from "./interfaces.ts";

export class ApigeeConverter {
  public async zipToJson(name: string, inputFilePath: string): Promise<any> {
    return new Promise((resolve, reject) => {
      let tempOutputDir = "./data/" + name;
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

            // pre-flow request and response
            newEndpoint.requestPreFlow = this.flowXmlToJson(
              "PreFlow",
              "Request",
              proxyJson["ProxyEndpoint"],
            );
            newEndpoint.responsePreFlow = this.flowXmlToJson(
              "PreFlow",
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
              newProxy.targets.push(newTarget);
            }

            // resources
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
                console.log("/apiproxy/resources/" + resType + "/" + resFile);
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

          fs.rmSync(tempOutputDir, { recursive: true });
          resolve(newProxy);
        });
      });
    });
  }

  public async jsonToZip(name: string, input: any): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      var zipfile = new yazl.ZipFile();
      let tempFilePath = "./data/" + name;
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
        if (endpoint["requestPreFlow"])
          endpointXml["ProxyEndpoint"]["PreFlow"]["Request"] =
            this.flowJsonToXml("PreFlow", endpoint["requestPreFlow"]);
        if (endpoint["responsePreFlow"])
          endpointXml["ProxyEndpoint"]["PreFlow"]["Response"] =
            this.flowJsonToXml("PreFlow", endpoint["responsePreFlow"]);
        if (endpoint["requestPostFlow"])
          endpointXml["ProxyEndpoint"]["PostFlow"]["Request"] =
            this.flowJsonToXml("PostFlow", endpoint["requestPostFlow"]);
        if (endpoint["responsePostFlow"])
          endpointXml["ProxyEndpoint"]["PostFlow"]["Response"] =
            this.flowJsonToXml("PostFlow", endpoint["responsePostFlow"]);
        // if (endpoint["requestPreFlow"]) {
        //   endpointXml["ProxyEndpoint"]["PreFlow"] = {
        //     _attributes: {
        //       name: "PreFlow",
        //     },
        //     Request: {},
        //     Response: {},
        //   };
        //   if (endpoint["requestPreFlow"]["steps"].length > 1) {
        //     endpointXml["ProxyEndpoint"]["PreFlow"]["Request"]["Step"] = [];
        //     for (let step of endpoint["requestPreFlow"]["steps"]) {
        //       let newStep = {
        //         Name: {
        //           _text: step["name"],
        //         },
        //       };
        //       if (step["condition"]) {
        //         newStep["Condition"] = {
        //           _text: step["condition"],
        //         };
        //       }
        //       endpointXml["ProxyEndpoint"]["PreFlow"]["Request"]["Step"].push(
        //         newStep,
        //       );
        //     }
        //   } else {
        //     endpointXml["ProxyEndpoint"]["PreFlow"]["Request"] = {
        //       Step: {
        //         Name: {
        //           _text: endpoint["requestPreFlow"]["steps"][0]["name"],
        //         },
        //       },
        //     };
        //     if (endpoint["requestPreFlow"]["steps"][0]["condition"]) {
        //       endpointXml["ProxyEndpoint"]["PreFlow"]["Request"]["Step"][
        //         "Condition"
        //       ] = {
        //         _text: endpoint["requestPreFlow"]["steps"][0]["condition"],
        //       };
        //     }
        //   }
        // }

        // routes
        if (endpoint["routes"].length) {
          endpointXml["ProxyEndpoint"]["RouteRule"] = [];
          for (let route of endpoint["routes"]) {
            let newRouteRule = {
              _attributes: {
                name: route["name"],
              },
              TargetEndpoint: {
                _text: route["target"],
              },
            };
            if (route["condition"]) {
              newRouteRule["Condition"] = {
                _text: route["condition"],
              };
            }
            endpointXml["ProxyEndpoint"]["RouteRule"].push(newRouteRule);
          }
        } else {
          endpointXml["ProxyEndpoint"]["RouteRule"] = {
            _attributes: {
              name: endpoint["routes"][0]["name"],
            },
            TargetEndpoint: {
              _text: endpoint["routes"][0]["target"],
            },
          };
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
          resolve(tempFilePath + ".zip");
        });
      zipfile.end();
    });
  }

  public flowXmlToJson(type: string, subType: string, sourceDoc: any): Flow {
    let resultFlow: Flow = new Flow(type);
    if (
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
    } else if (sourceDoc[type][subType]["Step"]) {
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
    if (sourceDoc["steps"].length > 1) {
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
    } else if (sourceDoc["steps"]) {
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
}
