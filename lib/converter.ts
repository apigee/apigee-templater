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
} from "./interfaces.ts";

export class ApigeeConverter {
  public async zipToJson(name: string, inputFilePath: string): Promise<string> {
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

            // console.log(proxyJsonString);

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

            // pre-flow
            if (
              proxyJson["ProxyEndpoint"]["PreFlow"]["Request"]["Step"] &&
              proxyJson["ProxyEndpoint"]["PreFlow"]["Request"]["Step"].length >
                0
            ) {
              newEndpoint.requestPreFlow = new Flow("PreFlow");
              for (let step of proxyJson["ProxyEndpoint"]["PreFlow"]["Request"][
                "Step"
              ]) {
                let newStep = new Step();
                newStep.name = step["Name"]["_text"];
                if (step["Condition"]) {
                  newStep.condition = step["Condition"]["_text"];
                }

                // load policy
                let policyContents = fs.readFileSync(
                  tempOutputDir + "/apiproxy/policies/" + newStep.name + ".xml",
                  "utf8",
                );
                let policyJsonString = xmljs.xml2json(policyContents, {
                  compact: true,
                  spaces: 2,
                });
                let policyJson = JSON.parse(policyJsonString);
                let newPolicy = new Policy();
                newPolicy.name = newStep.name;
                newPolicy.type = Object.keys(policyJson)[1];
                newPolicy.content = policyJson;
                newProxy.policies.push(newPolicy);
                newEndpoint.requestPreFlow.steps.push(newStep);
              }
            } else if (
              proxyJson["ProxyEndpoint"]["PreFlow"]["Request"]["Step"]
            ) {
              newEndpoint.requestPreFlow = new Flow("PreFlow");
              let newStep = new Step();
              newStep.name =
                proxyJson["ProxyEndpoint"]["PreFlow"]["Request"]["Step"][
                  "Name"
                ]["_text"];
              if (
                proxyJson["ProxyEndpoint"]["PreFlow"]["Request"]["Step"][
                  "Condition"
                ]
              ) {
                newStep.condition =
                  proxyJson["ProxyEndpoint"]["PreFlow"]["Request"]["Step"][
                    "Condition"
                  ]["_text"];
              }
              // load policy
              let policyContents = fs.readFileSync(
                tempOutputDir + "/apiproxy/policies/" + newStep.name + ".xml",
                "utf8",
              );
              let policyJsonString = xmljs.xml2json(policyContents, {
                compact: true,
                spaces: 2,
              });
              let policyJson = JSON.parse(policyJsonString);
              // console.log(policyJsonString);
              let newPolicy = new Policy();
              newPolicy.name = newStep.name;
              newPolicy.type = Object.keys(policyJson)[1];
              newPolicy.content = policyJsonString;
              newProxy.policies.push(newPolicy);
              newEndpoint.requestPreFlow.steps.push(newStep);
            }

            newProxy.endpoints.push(newEndpoint);

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
          }

          fs.rmSync(tempOutputDir, { recursive: true });
          resolve(JSON.stringify(newProxy, null, 2));
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
        if (endpoint["requestPreFlow"]) {
          endpointXml["ProxyEndpoint"]["PreFlow"] = {
            _attributes: {
              name: "PreFlow",
            },
            Request: {},
          };
          if (endpoint["requestPreFlow"]["steps"].length > 1) {
            endpointXml["ProxyEndpoint"]["PreFlow"]["Request"]["Step"] = [];
            for (let step of endpoint["requestPreFlow"]["steps"]) {
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
              endpointXml["ProxyEndpoint"]["PreFlow"]["Request"]["Step"].push(
                newStep,
              );
            }
          } else {
            endpointXml["ProxyEndpoint"]["PreFlow"]["Request"] = {
              Step: {
                Name: {
                  _text: endpoint["requestPreFlow"]["steps"][0]["name"],
                },
              },
            };
            if (endpoint["requestPreFlow"]["steps"][0]["condition"]) {
              endpointXml["ProxyEndpoint"]["PreFlow"]["Request"]["Step"][
                "Condition"
              ] = {
                _text: endpoint["requestPreFlow"]["steps"][0]["condition"],
              };
            }
          }
        }

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

      zipfile.outputStream
        .pipe(fs.createWriteStream(tempFilePath + ".zip"))
        .on("close", function () {
          // console.log("zip file done: " + tempFilePath + ".zip");
          resolve(tempFilePath + ".zip");
        });
      zipfile.end();
    });
  }
}
