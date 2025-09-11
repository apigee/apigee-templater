import fs from "fs";
import express from "express";
import * as YAML from "yaml";
import { ApigeeConverter } from "./converter.js";
import { Template, Feature } from "./interfaces.js";
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
    let name: string = req.query["name"] ? req.query["name"].toString() : "";
    if (!name) name = Math.random().toString(36).slice(2);
    let requestType = req.header("Content-Type");
    let responseType = req.header("Accept");
    let templateResult: Template | undefined = undefined;

    // let tempFileName = Math.random().toString(36).slice(2);
    switch (requestType) {
      case "application/octet-stream":
        if (!req.body) {
          return res.status(400).send("No data received.");
        }
        // Apigee proxy zip input, json output
        let tempFilePath = this.apigeeService.tempPath + name + ".zip";
        fs.writeFileSync(tempFilePath, req.body);

        templateResult = await this.converter.zipToJson(
          name.toString(),
          tempFilePath,
        );
        if (responseType == "application/yaml") {
          fs.writeFileSync(
            this.apigeeService.templatesPath + name + ".json",
            JSON.stringify(templateResult, null, 2),
          );
          res.setHeader("Content-Type", "application/yaml");
          res.status(201).send(YAML.stringify(templateResult));
        } else {
          fs.writeFileSync(
            this.apigeeService.templatesPath + name + ".json",
            JSON.stringify(templateResult, null, 2),
          );
          res.setHeader("Content-Type", "application/json");
          res.status(201).send(JSON.stringify(templateResult, null, 2));
        }
        break;
      case "application/json":
        if (!req.body) {
          return res.status(400).send("No data received.");
        }
        name = req.body["name"] ? req.body["name"] : name;
        this.apigeeService.templateImport(req.body);
        // Apigee proxy json input, yaml or zip output
        if (responseType == "application/yaml") {
          res.setHeader("Content-Type", "application/yaml");
          res.status(201).send(YAML.stringify(req.body));
        } else if (responseType == "application/octet-stream") {
          let remplateResult = await this.converter.jsonToZip(name, req.body);
          let zipOutputFile = fs.readFileSync(remplateResult);
          res.setHeader("Content-Type", "application/octet-stream");
          res.status(201).send(zipOutputFile);
        } else {
          res.setHeader("Content-Type", "application/json");
          res.status(201).send(JSON.stringify(req.body, null, 2));
        }
        break;
      case "application/yaml":
        if (!req.body) {
          return res.status(400).send("No data received.");
        }
        let proxy = YAML.parse(req.body);
        this.apigeeService.templateImport(proxy);
        if (responseType == "application/yaml") {
          res.setHeader("Content-Type", "application/yaml");
          res.status(201).send(YAML.stringify(proxy));
        } else if (responseType == "application/octet-stream") {
          let templateResult = await this.converter.jsonToZip(name, proxy);
          let zipOutputFile = fs.readFileSync(templateResult);
          res.setHeader("Content-Type", "application/octet-stream");
          res.status(201).send(zipOutputFile);
        } else {
          res.setHeader("Content-Type", "application/json");
          res.status(201).send(JSON.stringify(proxy, null, 2));
        }
        break;
      default:
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
          templateResult = new Template();
          templateResult.name = proxyName ? proxyName : name;
        } else {
          let proxyPath = await this.apigeeService.apigeeProxyGet(
            proxyName,
            apigeeOrg,
            token,
          );
          if (proxyPath) {
            templateResult = await this.converter.zipToJson(
              name.toString(),
              proxyPath,
            );
          }
        }
        if (templateResult) {
          if (responseType == "application/yaml") {
            fs.writeFileSync(
              this.apigeeService.templatesPath + name + ".json",
              JSON.stringify(templateResult, null, 2),
            );
            res.setHeader("Content-Type", "application/yaml");
            res.status(201).send(YAML.stringify(templateResult));
          } else {
            fs.writeFileSync(
              this.apigeeService.templatesPath + name + ".json",
              JSON.stringify(templateResult, null, 2),
            );
            res.setHeader("Content-Type", "application/json");
            res.status(201).send(JSON.stringify(templateResult, null, 2));
          }
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
      let proxy = await this.apigeeService.templateGet(templateName);
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
      let proxy = await this.apigeeService.templateGet(templateName);
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

  public templateGet = async (req: express.Request, res: express.Response) => {
    let proxyName = req.params.template;
    if (!proxyName) {
      return res.status(400).send("No proxy name received.");
    }

    let format =
      req.query.format && typeof req.query.format == "string"
        ? req.query.format.toLowerCase()
        : "";
    let proxy = await this.apigeeService.templateGet(proxyName);
    let responseType = req.header("Accept");

    if (proxy) {
      if (
        responseType == "application/yaml" ||
        format == "yaml" ||
        format == "yml"
      ) {
        res.setHeader("Content-Type", "application/yaml");
        res.status(200).send(YAML.stringify(proxy));
      } else if (
        responseType == "application/octet-stream" ||
        format == "zip" ||
        format == "xml"
      ) {
        let templateResult = await this.converter.jsonToZip(proxyName, proxy);
        let zipOutputFile = fs.readFileSync(templateResult);
        res.setHeader("Content-Type", "application/octet-stream");
        res.status(200).send(zipOutputFile);
      } else {
        res.setHeader("Content-Type", "application/json");
        res.status(200).send(JSON.stringify(proxy, null, 2));
      }
    } else res.status(404).send("Proxy could not be found.");
  };

  public templateDelete = (req: express.Request, res: express.Response) => {
    let proxyName = req.params.template;
    if (!proxyName) {
      return res.status(400).send("No proxy name received.");
    }

    let proxy = this.apigeeService.templateGet(proxyName);
    this.apigeeService.templateDelete(proxyName);

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
        res.status(201).send(JSON.stringify(feature, null, 2));
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

    let proxy: Template | undefined =
      await this.apigeeService.templateApplyFeature(
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

  public templateRemoveFeature = async (
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

    let proxy: Template | undefined =
      await this.apigeeService.templateRemoveFeature(
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
      res.setHeader("Content-Type", "application/json");
      res.send(JSON.stringify(proxy, null, 2));
    }
  };

  public featureCreate = async (
    req: express.Request,
    res: express.Response,
  ) => {
    let name: string = req.query["name"] ? req.query["name"].toString() : "";
    if (!name) name = Math.random().toString(36).slice(2);
    let requestType = req.header("Content-Type");
    let responseType = req.header("Accept");

    let newFeature: Feature | undefined = undefined;

    switch (requestType) {
      case "application/octet-stream":
        if (!req.body) {
          return res.status(400).send("No data received.");
        }
        // Apigee proxy zip input, convert to feature
        let tempFilePath = this.apigeeService.tempPath + name + ".zip";
        fs.writeFileSync(tempFilePath, req.body);

        let featureResult = await this.converter.zipToJson(
          name.toString(),
          tempFilePath,
        );
        fs.rmSync(tempFilePath);
        newFeature = this.converter.jsonToFeature(featureResult);
        this.apigeeService.featureImport(newFeature);
        if (responseType == "application/yaml") {
          res.setHeader("Content-Type", "application/yaml");
          res.status(201).send(YAML.stringify(newFeature));
        } else {
          res.setHeader("Content-Type", "application/json");
          res.status(201).send(JSON.stringify(newFeature, null, 2));
        }
        break;
      case "application/json":
        if (!req.body) {
          return res.status(400).send("No data received.");
        }
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
        if (!req.body) {
          return res.status(400).send("No data received.");
        }
        newFeature = this.apigeeService.featureImport(YAML.parse(req.body));
        if (responseType == "application/yaml") {
          res.setHeader("Content-Type", "application/yaml");
          res.status(201).send(YAML.stringify(newFeature));
        } else {
          res.setHeader("Content-Type", "application/json");
          res.status(201).send(JSON.stringify(newFeature, null, 2));
        }
        break;
      default:
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
          return res
            .status(400)
            .send("Either apigee org, proxy or token missing.");
        } else {
          let proxyPath = await this.apigeeService.apigeeProxyGet(
            proxyName,
            apigeeOrg,
            token,
          );
          if (proxyPath) {
            let proxy = await this.converter.zipToJson(proxyName, proxyPath);
            newFeature = this.converter.jsonToFeature(proxy);
            fs.rmSync(proxyPath);
            this.apigeeService.featureImport(newFeature);
            if (responseType == "application/yaml") {
              res.setHeader("Content-Type", "application/yaml");
              return res.status(201).send(YAML.stringify(newFeature));
            } else {
              res.setHeader("Content-Type", "application/json");
              return res.status(201).send(JSON.stringify(newFeature, null, 2));
            }
          } else res.status(404).send("Could not find proxy.");
        }
        break;
    }

    if (!newFeature) res.status(500).send("Could not create feature.");
  };
}
