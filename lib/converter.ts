import * as xmljs from "xml-js";
import yauzl from "yauzl";
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
  public async apigeeToOapi(
    name: string,
    inputFilePath: string,
  ): Promise<string> {
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

            console.log(proxyJsonString);

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
                console.log(policyJsonString);
                let newPolicy = new Policy();
                newPolicy.name = newStep.name;
                newPolicy.type = Object.keys(policyJson)[1];
                newPolicy.content = policyJsonString;
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
              console.log(policyJsonString);
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
              console.log(targetJsonString);
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
}
