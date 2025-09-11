import fs from "fs";
import express from "express";
import * as YAML from "yaml";
import { ApigeeConverter } from "./converter.js";
import { Proxy, Feature } from "./interfaces.js";
import { ApigeeTemplaterService } from "./service.js";

export class RestService {
  public converter: ApigeeConverter;
  public apigeeService: ApigeeTemplaterService;

  constructor(converter: ApigeeConverter, service: ApigeeTemplaterService) {
    this.converter = converter;
    this.apigeeService = service;
  }

  public templatesList = async (
    req: express.Request,
    res: express.Response,
  ) => {
    let templates = this.apigeeService.templatesList();
    res.send(JSON.stringify(templates, null, 2));
  };

  public templateCreate = async (
    req: express.Request,
    res: express.Response,
  ) => {
    if (!req.body) {
      return res.status(400).send("No data received.");
    }

    let name: string = req.query["name"] ? req.query["name"].toString() : "";
    if (!name) name = Math.random().toString(36).slice(2);
    let requestType = req.header("Content-Type");
    let responseType = req.header("Accept");

    // let tempFileName = Math.random().toString(36).slice(2);
    switch (requestType) {
      case "application/octet-stream":
        // Apigee proxy zip input, json output
        let tempFilePath = this.apigeeService.tempPath + name + ".zip";
        fs.writeFileSync(tempFilePath, req.body);

        this.converter
          .zipToJson(name.toString(), tempFilePath)
          .then((result) => {
            // fs.rmSync(tempFilePath);
            if (responseType == "application/yaml") {
              fs.writeFileSync(
                this.apigeeService.proxiesPath + name + ".json",
                JSON.stringify(result, null, 2),
              );
              res.setHeader("Content-Type", "application/yaml");
              res.status(201).send(YAML.stringify(result));
            } else {
              fs.writeFileSync(
                this.apigeeService.proxiesPath + name + ".json",
                JSON.stringify(result, null, 2),
              );
              res.setHeader("Content-Type", "application/json");
              res.status(201).send(JSON.stringify(result, null, 2));
            }
          })
          .catch((error) => {
            res.status(500).send(error.message);
          });
        break;
      case "application/json":
        name = req.body["name"] ? req.body["name"] : name;
        this.apigeeService.proxyImport(req.body);
        // Apigee proxy json input, yaml or zip output
        if (responseType == "application/yaml") {
          res.setHeader("Content-Type", "application/yaml");
          res.status(201).send(YAML.stringify(req.body));
        } else if (responseType == "application/octet-stream") {
          this.converter.jsonToZip(name, req.body).then((result) => {
            let zipOutputFile = fs.readFileSync(result);
            res.setHeader("Content-Type", "application/octet-stream");
            res.status(201).send(zipOutputFile);
          });
        } else {
          res.setHeader("Content-Type", "application/json");
          res.status(201).send(JSON.stringify(req.body, null, 2));
        }
        break;
      case "application/yaml":
        let proxy = YAML.parse(req.body);
        this.apigeeService.proxyImport(proxy);
        if (responseType == "application/yaml") {
          res.setHeader("Content-Type", "application/yaml");
          res.status(201).send(YAML.stringify(proxy));
        } else if (responseType == "application/octet-stream") {
          this.converter.jsonToZip(name, proxy).then((result) => {
            let zipOutputFile = fs.readFileSync(result);
            res.setHeader("Content-Type", "application/octet-stream");
            res.status(201).send(zipOutputFile);
          });
        } else {
          res.setHeader("Content-Type", "application/json");
          res.status(201).json(JSON.stringify(proxy, null, 2));
        }
        break;
      case "*/*":
        console.log("YES ANY CONTENT-TYPE!!");
        let apigeeOrg: string = req.query["org"]
          ? req.query["org"].toString()
          : "";
        let proxyName: string = req.query["proxy"]
          ? req.query["proxy"].toString()
          : "";
        let token: string = req.headers.authorization
          ? req.headers.authorization
          : "";
        if (!apigeeOrg || !proxyName || !token) {
          res.status(400).send("Either apigee org, proxy or token missing.");
        } else {
          let proxyPath = await this.apigeeService.apigeeProxyGet(
            proxyName,
            apigeeOrg,
            token,
          );
          if (proxyPath)
            this.converter
              .zipToJson(name.toString(), proxyPath)
              .then((result) => {
                if (responseType == "application/yaml") {
                  fs.writeFileSync(
                    this.apigeeService.proxiesPath + name + ".json",
                    JSON.stringify(result, null, 2),
                  );
                  res.setHeader("Content-Type", "application/yaml");
                  res.status(201).send(YAML.stringify(result));
                } else {
                  fs.writeFileSync(
                    this.apigeeService.proxiesPath + name + ".json",
                    JSON.stringify(result, null, 2),
                  );
                  res.setHeader("Content-Type", "application/json");
                  res.status(201).send(JSON.stringify(result, null, 2));
                }
              })
              .catch((error) => {
                res.status(500).send(error.message);
              });
          else res.status(404).send("Could not find proxy.");
        }
        break;
    }
  };

  public templateExportToApigee = async (
    req: express.Request,
    res: express.Response,
  ) => {
    let templateName = req.params.template;
    let apigeeOrg: string = req.query["org"] ? req.query["org"].toString() : "";
    let token: string = req.headers.authorization
      ? req.headers.authorization
      : "";
    if (!templateName || !apigeeOrg || !token) {
      res
        .status(400)
        .send("Either template name, apigee org, proxy or token missing.");
    } else {
      let apigeeProxyRevision = "";
      let proxy = this.apigeeService.proxyGet(templateName);
      if (proxy && token) {
        let zipPath = await this.converter.jsonToZip(templateName, proxy);

        apigeeProxyRevision = await this.apigeeService.apigeeProxyImport(
          templateName,
          zipPath,
          apigeeOrg,
          token,
        );
      }
      if (!apigeeProxyRevision) {
        res.status(500).send("Could not export template to apigee org.");
      } else {
        res.send(
          `Template ${templateName} successfully exported to Apigee org ${apigeeOrg} with revision ${apigeeProxyRevision}`,
        );
      }
    }
  };

  public templateDeployToApigee = async (
    req: express.Request,
    res: express.Response,
  ) => {
    let templateName = req.params.template;
    let apigeeOrg: string = req.query["org"] ? req.query["org"].toString() : "";
    let apigeeEnv: string = req.query["env"] ? req.query["env"].toString() : "";
    let serviceAccountEmail: string = req.query["sa"]
      ? req.query["sa"].toString()
      : "";
    let token: string = req.headers.authorization
      ? req.headers.authorization
      : "";
    if (!templateName || !apigeeOrg || !apigeeEnv || !token) {
      res
        .status(400)
        .send("Either template name, apigee org, env or token missing.");
    } else {
      let apigeeProxyRevision = "";
      let proxy = this.apigeeService.proxyGet(templateName);
      if (proxy && token) {
        let zipPath = await this.converter.jsonToZip(templateName, proxy);

        apigeeProxyRevision = await this.apigeeService.apigeeProxyImport(
          templateName,
          zipPath,
          apigeeOrg,
          token,
        );
      }
      if (!apigeeProxyRevision) {
        res.status(500).send("Could not export template to apigee org.");
      } else {
        let deployedRevision =
          await this.apigeeService.apigeeProxyRevisionDeploy(
            templateName,
            apigeeProxyRevision,
            serviceAccountEmail,
            apigeeEnv,
            apigeeOrg,
            token,
          );
        if (deployedRevision)
          res.send(
            `Template ${templateName} successfully exported and deployed to Apigee org ${apigeeOrg} and env ${apigeeEnv} with revision ${apigeeProxyRevision}`,
          );
        else res.status(500).send("Could not deploy template to apigee org.");
      }
    }
  };

  public templateGet = (req: express.Request, res: express.Response) => {
    let proxyName = req.params.template;
    if (!proxyName) {
      return res.status(400).send("No proxy name received.");
    }

    let format =
      req.query.format && typeof req.query.format == "string"
        ? req.query.format.toLowerCase()
        : "";
    let proxy = this.apigeeService.proxyGet(proxyName);
    let responseType = req.header("Accept");

    if (proxy) {
      if (
        responseType == "application/yaml" ||
        format == "yaml" ||
        format == "yml"
      ) {
        res.setHeader("Content-Type", "application/yaml");
        res.status(201).send(YAML.stringify(proxy));
      } else if (
        responseType == "application/octet-stream" ||
        format == "zip" ||
        format == "xml"
      ) {
        this.converter.jsonToZip(proxyName, proxy).then((result) => {
          let zipOutputFile = fs.readFileSync(result);
          res.setHeader("Content-Type", "application/octet-stream");
          res.status(201).send(zipOutputFile);
        });
      } else {
        res.setHeader("Content-Type", "application/json");
        res.status(201).json(JSON.stringify(proxy, null, 2));
      }
    } else res.status(404).send("Proxy could not be found.");
  };

  public templateDelete = (req: express.Request, res: express.Response) => {
    let proxyName = req.params.template;
    if (!proxyName) {
      return res.status(400).send("No proxy name received.");
    }

    let proxy = this.apigeeService.proxyGet(proxyName);
    this.apigeeService.proxyDelete(proxyName);

    if (proxy) {
      res.setHeader("Content-Type", "application/json");
      res.status(200).send(JSON.stringify(proxy, null, 2));
    } else res.status(404).send("Proxy could not be found.");
  };

  public featureGet = (req: express.Request, res: express.Response) => {
    let featureName = req.params.feature;
    if (!featureName) {
      return res.status(400).send("No feature name received.");
    }

    let feature = this.apigeeService.featureGet(featureName);
    let responseType = req.header("Accept");

    if (feature) {
      if (responseType == "application/yaml") {
        res.setHeader("Content-Type", "application/yaml");
        res.status(201).send(YAML.stringify(feature));
      } else {
        res.setHeader("Content-Type", "application/json");
        res.status(201).json(JSON.stringify(feature, null, 2));
      }
    } else res.status(404).send("Feature could not be found.");
  };

  public featureDelete = (req: express.Request, res: express.Response) => {
    let featureName = req.params.feature;
    if (!featureName) {
      return res.status(400).send("No feature name received.");
    }

    let feature = this.apigeeService.featureGet(featureName);
    this.apigeeService.featureDelete(featureName);

    if (feature) {
      res.setHeader("Content-Type", "application/json");
      res.status(200).send(JSON.stringify(feature, null, 2));
    } else res.status(404).send("Feature could not be found.");
  };

  public templateApplyFeature = async (
    req: express.Request,
    res: express.Response,
  ) => {
    let proxyName = req.params.template;
    if (!proxyName) {
      return res.status(400).send("No proxy name received.");
    }
    let featureName = req.params.feature;
    if (!featureName) {
      return res.status(400).send("No feature name received.");
    }

    let parameters = {};
    if (req.body && req.body["parameters"]) {
      parameters = req.body["parameters"];
    }

    let proxy: Proxy | undefined = this.apigeeService.proxyApplyFeature(
      proxyName,
      featureName,
      parameters,
      this.converter,
    );

    if (!proxy) {
      return res
        .status(500)
        .send(
          "Error applying feature to proxy, maybe either the proxy or feature doesn't exist?",
        );
    } else {
      res.setHeader("Content-Type", "application/json");
      res.status(200).send(JSON.stringify(proxy, null, 2));
    }
  };

  public templateRemoveFeature = (
    req: express.Request,
    res: express.Response,
  ) => {
    let proxyName = req.params.template;
    if (!proxyName) {
      return res.status(400).send("No proxy name received.");
    }
    let featureName = req.params.feature;
    if (!featureName) {
      return res.status(400).send("No feature name received.");
    }

    let proxy: Proxy | undefined = this.apigeeService.proxyRemoveFeature(
      proxyName,
      featureName,
      this.converter,
    );

    if (!proxy) {
      return res
        .status(500)
        .send(
          "Error removing feature from proxy, maybe either the proxy or feature doesn't exist?",
        );
    } else {
      res.json(proxy);
    }
  };

  public featureCreate = async (
    req: express.Request,
    res: express.Response,
  ) => {
    if (!req.body) {
      return res.status(400).send("No data received.");
    }

    let name: string = req.query["name"] ? req.query["name"].toString() : "";
    if (!name) name = Math.random().toString(36).slice(2);
    let requestType = req.header("Content-Type");
    let responseType = req.header("Accept");

    let newFeature: Feature | undefined = undefined;

    switch (requestType) {
      case "application/octet-stream":
        // Apigee proxy zip input, convert to feature
        let tempFilePath = this.apigeeService.tempPath + name + ".zip";
        fs.writeFileSync(tempFilePath, req.body);

        this.converter
          .zipToJson(name.toString(), tempFilePath)
          .then((result) => {
            fs.rmSync(tempFilePath);
            newFeature = this.converter.jsonToFeature(result);
            this.apigeeService.featureImport(newFeature);
            if (responseType == "application/yaml") {
              res.setHeader("Content-Type", "application/yaml");
              res.status(201).send(YAML.stringify(newFeature));
            } else {
              res.setHeader("Content-Type", "application/json");
              res.status(201).send(JSON.stringify(newFeature, null, 2));
            }
          })
          .catch((error) => {
            res.status(500).send(error.message);
          });
        break;
      case "application/json":
        name = req.body["name"] ? req.body["name"] : name;
        newFeature = this.apigeeService.featureImport(req.body);
        if (responseType == "application/yaml") {
          res.setHeader("Content-Type", "application/yaml");
          res.status(201).send(YAML.stringify(newFeature));
        } else {
          res.status(201).send(JSON.stringify(newFeature, null, 2));
        }
        break;
      case "application/yaml":
        newFeature = this.apigeeService.featureImport(YAML.parse(req.body));
        if (responseType == "application/yaml") {
          res.setHeader("Content-Type", "application/yaml");
          res.status(201).send(YAML.stringify(newFeature));
        } else {
          res.setHeader("Content-Type", "application/json");
          res.status(201).send(JSON.stringify(newFeature, null, 2));
        }
        break;
      case "*/*":
        console.log("YES ANY CONTENT-TYPE!!");
        let apigeeOrg: string = req.query["org"]
          ? req.query["org"].toString()
          : "";
        let proxyName: string = req.query["proxy"]
          ? req.query["proxy"].toString()
          : "";
        let token: string = req.headers.authorization
          ? req.headers.authorization
          : "";
        if (!apigeeOrg || !proxyName || !token) {
          res.status(400).send("Either apigee org, proxy or token missing.");
        } else {
          let proxyPath = await this.apigeeService.apigeeProxyGet(
            proxyName,
            apigeeOrg,
            token,
          );
          if (proxyPath) {
            this.converter
              .zipToJson(name.toString(), proxyPath)
              .then((result) => {
                fs.rmSync(tempFilePath);
                newFeature = this.converter.jsonToFeature(result);
                this.apigeeService.featureImport(newFeature);
                if (responseType == "application/yaml") {
                  res.setHeader("Content-Type", "application/yaml");
                  res.status(201).send(YAML.stringify(newFeature));
                } else {
                  res.setHeader("Content-Type", "application/json");
                  res.status(201).send(JSON.stringify(newFeature, null, 2));
                }
              })
              .catch((error) => {
                res.status(500).send(error.message);
              });
          } else res.status(404).send("Could not find proxy.");
        }
        break;
    }

    if (!newFeature) res.status(500).send("Could not create feature.");
  };
}
