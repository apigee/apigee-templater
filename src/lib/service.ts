import { ApigeeConverter } from "./converter.js";
import { Template, Proxy, Feature } from "./interfaces.js";
import fs from "fs";
import path from "path";
import * as YAML from "yaml";
import { Blob } from "buffer";

export class ApigeeTemplaterService {
  tempPath: string = "./data/temp/";
  templatesPath: string = "./data/templates/";
  featuresPath: string = "./data/features/";
  proxiesPath: string = "./data/proxies/";
  public apigeeProxyListCache: { [key: string]: string[] } = {};
  public templateListCache: string[] = [];
  public featureListCache: string[] = [];

  remoteGetBaseUrl = process.env.TEMPLATER_GET_BASE_URL
    ? process.env.TEMPLATER_GET_BASE_URL
    : "https://raw.githubusercontent.com/apigee/apigee-templater/refs/heads/main/repository/";
  remoteListUrl = process.env.TEMPLATER_LIST_URL
    ? process.env.TEMPLATER_LIST_URL
    : "https://api.github.com/repos/apigee/apigee-templater/contents/repository/";

  constructor(basePath: string = "", subDirs: boolean = true) {
    if (basePath && subDirs) {
      this.tempPath = basePath + "temp/";
      this.templatesPath = basePath + "templates/";
      this.featuresPath = basePath + "features/";
      this.proxiesPath = basePath + "proxies/";
    } else if (basePath) {
      this.tempPath = basePath;
      this.templatesPath = basePath;
      this.featuresPath = basePath;
      this.proxiesPath = basePath;
    }
  }

  public async templatesList(): Promise<Template[]> {
    return new Promise(async (resolve, reject) => {
      let templates: Template[] = [];
      let templateNames: string[] = fs.readdirSync(this.templatesPath);

      for (let templatePath of templateNames) {
        if (templatePath.endsWith(".json")) {
          let template: Template = JSON.parse(
            fs.readFileSync(this.templatesPath + templatePath, "utf8"),
          );
          templates.push(template);
        } else if (templatePath.endsWith(".yaml")) {
          let template: Template = YAML.parse(
            fs.readFileSync(this.templatesPath + templatePath, "utf8"),
          );
          templates.push(template);
        }
      }

      let response = await fetch(this.remoteListUrl + "templates");

      if (response.status == 200) {
        let remoteTemplates: any = await response.json();
        if (remoteTemplates && remoteTemplates.length > 0) {
          for (let template of remoteTemplates) {
            if (
              template &&
              template["name"] &&
              (template["name"].endsWith(".json") ||
                template["name"].endsWith(".yaml"))
            ) {
              let downloadResponse = await fetch(template["download_url"]);
              if (downloadResponse.status == 200) {
                let remoteTemplate: Template;
                let remoteTemplateText = await downloadResponse.text();
                if (template["name"].endsWith(".yaml"))
                  remoteTemplate = YAML.parse(remoteTemplateText) as Template;
                else
                  remoteTemplate = JSON.parse(remoteTemplateText) as Template;
                let templateExistsIndex = templates.findIndex(
                  (x) => x.name == remoteTemplate.name,
                );
                if (templateExistsIndex == -1) templates.push(remoteTemplate);
              }
            }
          }
        }
      }
      if (templates && templates.length > 0)
        this.templateListCache = templates.map((x) => x.name);
      resolve(templates);
    });
  }

  public async featuresList(): Promise<Feature[]> {
    return new Promise<Feature[]>(async (resolve, reject) => {
      let features: Feature[] = [];
      let featureNames: string[] = fs.readdirSync(this.featuresPath);

      for (let featurePath of featureNames) {
        if (featurePath.endsWith(".json")) {
          let feature: Feature = JSON.parse(
            fs.readFileSync(this.featuresPath + featurePath, "utf8"),
          );
          features.push(feature);
        }
      }

      let response = await fetch(this.remoteListUrl + "features");

      if (response.status == 200) {
        let remoteFeatures: any = await response.json();
        if (remoteFeatures && remoteFeatures.length > 0) {
          for (let feature of remoteFeatures) {
            if (
              feature &&
              feature["name"] &&
              (feature["name"].endsWith(".json") ||
                feature["name"].endsWith(".yaml"))
            ) {
              let downloadResponse = await fetch(feature["download_url"]);
              if (downloadResponse.status == 200) {
                let remoteFeature: Feature;
                if (feature["name"].endsWith(".json"))
                  remoteFeature = (await downloadResponse.json()) as Feature;
                else {
                  let remoteFeatureText = await downloadResponse.text();
                  remoteFeature = YAML.parse(remoteFeatureText) as Feature;
                }
                let featureExistsIndex = features.findIndex(
                  (x) => x.name == remoteFeature.name,
                );
                if (featureExistsIndex == -1) features.push(remoteFeature);
              }
            }
          }
        }
      }

      if (features && features.length > 0)
        this.featureListCache = features.map((x) => x.name);
      resolve(features);
    });
  }

  public async proxiesList(): Promise<Proxy[]> {
    return new Promise(async (resolve, reject) => {
      let proxies: Proxy[] = [];
      let proxyNames: string[] = fs.readdirSync(this.proxiesPath);

      for (let proxyPath of proxyNames) {
        if (proxyPath.endsWith(".json")) {
          let proxy: Proxy = JSON.parse(
            fs.readFileSync(this.proxiesPath + proxyPath, "utf8"),
          );
          proxies.push(proxy);
        } else if (proxyPath.endsWith(".yaml")) {
          let proxy: Proxy = YAML.parse(
            fs.readFileSync(this.proxiesPath + proxyPath, "utf8"),
          );
          proxies.push(proxy);
        }
      }

      let response = await fetch(this.remoteListUrl + "proxies");

      if (response.status == 200) {
        let remoteProxies: any = await response.json();
        if (remoteProxies && remoteProxies.length > 0) {
          for (let proxy of remoteProxies) {
            if (
              proxy &&
              proxy["name"] &&
              (proxy["name"].endsWith(".json") ||
                proxy["name"].endsWith(".yaml"))
            ) {
              let downloadResponse = await fetch(proxy["download_url"]);
              if (downloadResponse.status == 200) {
                let remoteProxy: Proxy;
                let remoteTemplateText = await downloadResponse.text();
                if (proxy["name"].endsWith(".yaml"))
                  remoteProxy = YAML.parse(remoteTemplateText) as Proxy;
                else remoteProxy = JSON.parse(remoteTemplateText) as Proxy;
                let proxyExistsIndex = proxies.findIndex(
                  (x) => x.name == remoteProxy.name,
                );
                if (proxyExistsIndex == -1) proxies.push(remoteProxy);
              }
            }
          }
        }
      }

      resolve(proxies);
    });
  }

  public async templateGet(name: string): Promise<Template | undefined> {
    return new Promise(async (resolve, reject) => {
      let result: Template | undefined = undefined;
      let tempName = name.replaceAll(" ", "-");
      let templateString = "";
      let foundJson = false,
        foundYaml = false;

      if (!tempName.endsWith(".json") && !tempName.endsWith(".yaml")) {
        if (fs.existsSync(this.templatesPath + tempName + ".json")) {
          templateString = fs.readFileSync(
            this.templatesPath + tempName + ".json",
            "utf8",
          );
          foundJson = true;
        } else if (fs.existsSync(this.templatesPath + tempName + ".yaml")) {
          templateString = fs.readFileSync(
            this.templatesPath + tempName + ".yaml",
            "utf8",
          );
          foundYaml = true;
        }
      } else if (fs.existsSync(tempName)) {
        templateString = fs.readFileSync(tempName, "utf8");
        if (tempName.endsWith(".json")) foundJson = true;
        else if (tempName.endsWith(".yaml")) foundYaml = true;
      }

      if (!foundJson && !foundYaml) {
        // try to fetch remotely
        let fileName = tempName.endsWith(".json")
          ? tempName
          : tempName + ".json";
        let response = await fetch(
          this.remoteGetBaseUrl + "templates/" + fileName,
        );
        if (response.status == 200) foundJson = true;

        if (response.status == 404) {
          fileName = tempName.endsWith(".yaml") ? tempName : tempName + ".yaml";
          response = await fetch(
            this.remoteGetBaseUrl + "templates/" + fileName,
          );
          if (response.status == 200) foundYaml = true;
        }

        if (response.status == 200) {
          templateString = await response.text();
        }
      }

      if (templateString) {
        if (foundJson) result = JSON.parse(templateString);
        else result = YAML.parse(templateString);
      }

      resolve(result);
    });
  }

  public async proxyGet(name: string): Promise<Proxy | undefined> {
    return new Promise(async (resolve, reject) => {
      let result: Proxy | undefined = undefined;
      let tempName = name.replaceAll(" ", "-");
      let proxyString = "";
      let foundJson = false,
        foundYaml = false;

      if (!tempName.endsWith(".json") && !tempName.endsWith(".yaml")) {
        if (fs.existsSync(this.proxiesPath + tempName + ".json")) {
          proxyString = fs.readFileSync(
            this.proxiesPath + tempName + ".json",
            "utf8",
          );
          foundJson = true;
        } else if (fs.existsSync(this.proxiesPath + tempName + ".yaml")) {
          proxyString = fs.readFileSync(
            this.proxiesPath + tempName + ".yaml",
            "utf8",
          );
          foundYaml = true;
        }
      } else if (fs.existsSync(tempName)) {
        proxyString = fs.readFileSync(tempName, "utf8");
        if (tempName.endsWith(".json")) foundJson = true;
        else if (tempName.endsWith(".yaml")) foundYaml = true;
      }

      if (!foundJson && !foundYaml) {
        // try to fetch remotely
        let fileName = tempName.endsWith(".json")
          ? tempName
          : tempName + ".json";
        let response = await fetch(
          this.remoteGetBaseUrl + "proxies/" + fileName,
        );
        if (response.status == 200) foundJson = true;

        if (response.status == 404) {
          fileName = tempName.endsWith(".yaml") ? tempName : tempName + ".yaml";
          response = await fetch(this.remoteGetBaseUrl + "proxies/" + fileName);
          if (response.status == 200) foundYaml = true;
        }

        if (response.status == 200) {
          proxyString = await response.text();
        }
      }

      if (proxyString) {
        if (foundJson) result = JSON.parse(proxyString);
        else result = YAML.parse(proxyString);
      }

      resolve(result);
    });
  }

  public proxyImport(proxy: Proxy) {
    fs.writeFileSync(
      this.proxiesPath + proxy.name + ".json",
      JSON.stringify(proxy, null, 2),
    );
  }

  public templateImport(template: Template) {
    fs.writeFileSync(
      this.templatesPath + template.name + ".json",
      JSON.stringify(template, null, 2),
    );
  }

  public async featureGet(name: string): Promise<Feature | undefined> {
    return new Promise(async (resolve, reject) => {
      let result: Feature | undefined = undefined;
      let tempName = name.replaceAll(" ", "-");
      let foundJson = false,
        foundYaml = false;
      let featureString = "";
      if (fs.existsSync(this.featuresPath + tempName + ".json")) {
        featureString = fs.readFileSync(
          this.featuresPath + tempName + ".json",
          "utf8",
        );
        foundJson = true;
      } else if (fs.existsSync(this.featuresPath + tempName + ".yaml")) {
        featureString = fs.readFileSync(
          this.featuresPath + tempName + ".yaml",
          "utf8",
        );
        foundYaml = true;
      } else if (fs.existsSync(tempName)) {
        featureString = fs.readFileSync(tempName, "utf8");
        let dirName = path.dirname(tempName);
        process.chdir(dirName);
        if (tempName.endsWith(".yaml")) foundYaml = true;
        else foundJson = true;
      } else {
        // try to fetch remotely
        let fileName = tempName.endsWith(".json")
          ? tempName
          : tempName + ".json";
        let response = await fetch(
          this.remoteGetBaseUrl + "features/" + fileName,
        );
        if (response.status == 200) foundJson = true;

        if (response.status == 404) {
          fileName = tempName.endsWith(".yaml") ? tempName : tempName + ".yaml";
          response = await fetch(
            this.remoteGetBaseUrl + "features/" + fileName,
          );
          if (response.status == 200) foundYaml = true;
        }

        if (response.status == 200) {
          featureString = await response.text();
        }
      }

      if (featureString) {
        if (foundJson) result = JSON.parse(featureString);
        else result = YAML.parse(featureString);
      }

      resolve(result);
    });
  }

  public async templateApplyFeature(
    templateName: string,
    featureName: string,
    converter: ApigeeConverter,
  ): Promise<Template | undefined> {
    return new Promise(async (resolve, reject) => {
      let template: Template | undefined = await this.templateGet(templateName);
      let feature = await this.featureGet(featureName);

      if (!template || !feature) {
        console.log(
          `templateApplyFeature error: either ${templateName} or ${featureName} could not be loaded.`,
        );
        return undefined;
      } else if (template.features.includes(feature.name)) {
        console.log(
          `templateApplyFeature error: template ${templateName} already uses feature ${featureName}.`,
        );
        return undefined;
      } else {
        template = converter.templateApplyFeature(
          template,
          feature,
          featureName,
        );
      }

      fs.writeFileSync(
        this.templatesPath + templateName + ".json",
        JSON.stringify(template, null, 2),
      );

      resolve(template);
    });
  }

  public async templateRemoveFeature(
    templateName: string,
    featureName: string,
    converter: ApigeeConverter,
  ): Promise<Template | undefined> {
    return new Promise(async (resolve, reject) => {
      let template: Template | undefined = undefined;
      template = await this.templateGet(templateName);
      let feature = await this.featureGet(featureName);

      if (!template || !feature) {
        console.log(
          `proxyApplyFeature error: either ${templateName} or ${featureName} could not be loaded.`,
        );
        return undefined;
      } else if (!template.features.includes(feature.name)) {
        console.log(
          `proxyRemoveFeature error: proxy ${templateName} doesn't use feature ${featureName}.`,
        );
        return undefined;
      } else {
        template = converter.templateRemoveFeature(
          template,
          feature,
          feature.name,
        );
      }

      fs.writeFileSync(
        this.templatesPath + templateName + ".json",
        JSON.stringify(template, null, 2),
      );

      resolve(template);
    });
  }

  public templateCreate(
    name: string,
    basePath: string | undefined,
    targetUrl: string | undefined,
    converter: ApigeeConverter,
  ): Template {
    let newTemplate = converter.templateCreate(name, basePath, targetUrl);

    fs.writeFileSync(
      this.templatesPath + newTemplate.name + ".json",
      JSON.stringify(newTemplate, null, 2),
    );

    return newTemplate;
  }

  public featureImport(feature: Feature): Feature {
    fs.writeFileSync(
      this.featuresPath + feature.name + ".json",
      JSON.stringify(feature, null, 2),
    );

    return feature;
  }

  public templateAddEndpoint(
    templateName: string,
    endpointName: string,
    basePath: string,
    targetName?: string,
    targetUrl?: string,
    targetRouteRule?: string,
    targetAuth: string = "",
    targetAud: string = "",
    targetScopes: string[] = [],
  ): Promise<Template | undefined> {
    return new Promise(async (resolve) => {
      let template: Template | undefined = undefined;
      template = await this.templateGet(templateName);
      if (template) {
        template.endpoints.push({
          name: endpointName,
          basePath: basePath,
          routes: [],
        });

        if (targetName) {
          template.endpoints[template.endpoints.length - 1]?.routes.push({
            name: targetName,
            target: targetName,
            condition: targetRouteRule ?? "",
          });

          if (targetUrl) {
            template.targets.push({
              name: targetName,
              url: targetUrl,
              auth: targetAuth,
              aud: targetAud,
              scopes: targetScopes,
            });
          }
        }
      }

      resolve(template);
    });
  }

  public templateDelete(templateName: string) {
    if (fs.existsSync(this.templatesPath + templateName + ".json")) {
      fs.rmSync(this.templatesPath + templateName + ".json");
    }
  }

  public featureDelete(featureName: string) {
    if (fs.existsSync(this.featuresPath + featureName + ".json")) {
      fs.rmSync(this.featuresPath + featureName + ".json");
    }
  }

  public async templateToProxy(
    templateName: string,
    converter: ApigeeConverter,
    parameters: { [key: string]: string } = {},
  ): Promise<Proxy | undefined> {
    return new Promise(async (resolve, reject) => {
      let proxy: Proxy | undefined = undefined;
      let template: Template | undefined = await this.templateGet(templateName);

      if (template) {
        proxy = await this.templateObjectToProxy(
          template,
          converter,
          parameters,
        );
      }

      resolve(proxy);
    });
  }

  public async templateObjectToProxy(
    template: Template,
    converter: ApigeeConverter,
    parameters: { [key: string]: string } = {},
  ): Promise<Proxy | undefined> {
    return new Promise(async (resolve, reject) => {
      let proxy: Proxy | undefined = undefined;

      if (template) {
        let features: Feature[] = [];
        for (let featureName of template.features) {
          let results = await this.loadFeatures(featureName);
          if (results) features = features.concat(results);
          else {
            // abort, could not load feature
            console.error(`Could not load feature ${featureName}.`);
            resolve(undefined);
          }
          // let feature = await this.featureGet(featureName);
          // if (feature) features.push(feature);
          // else {
          //   // abort, could not load feature
          //   console.error(`Could not load feature ${feature}, aborting...`);
          //   resolve(undefined);
          // }
        }

        const uniqueFeatures = Array.from(
          new Set(features.map((a) => a.name)),
        ).map((name) => {
          return features.find((a) => a.name === name);
        }) as Feature[];

        proxy = converter.templateToProxy(template, uniqueFeatures, parameters);
      }

      resolve(proxy);
    });
  }

  public async loadFeatures(
    featureName: string,
  ): Promise<Feature[] | undefined> {
    return new Promise(async (resolve, reject) => {
      let features: Feature[] = [];
      let feature = await this.featureGet(featureName);
      if (feature) {
        features.push(feature);
      } else {
        console.error(`Could not load feature ${featureName}.`);
        resolve(undefined);
      }

      resolve(features);
    });
  }

  public apigeeOrgProxiesCache(apigeeOrg: string): string[] {
    if (this.apigeeProxyListCache[apigeeOrg])
      return this.apigeeProxyListCache[apigeeOrg];
    else return [];
  }

  public async apigeeProxiesList(
    apigeeOrg: string,
    token: string,
  ): Promise<any | undefined> {
    return new Promise(async (resolve, reject) => {
      let response = await fetch(
        `https://apigee.googleapis.com/v1/organizations/${apigeeOrg}/apis?includeRevisions=true&includeMetaData=true`,
        {
          headers: {
            Authorization: token,
          },
        },
      );

      if (response.status === 200) {
        let responseBody: any = await response.json();
        if (responseBody && responseBody.length) {
          this.apigeeProxyListCache[apigeeOrg] = responseBody.map(
            (x: any) => x.name,
          );
        }
        resolve(responseBody);
      } else {
        console.log("Got response " + response.status);
        resolve(undefined);
      }
    });
  }

  public async apigeeProxyGet(
    proxyName: string,
    apigeeOrg: string,
    token: string,
  ): Promise<string | undefined> {
    return new Promise(async (resolve, reject) => {
      let response = await fetch(
        `https://apigee.googleapis.com/v1/organizations/${apigeeOrg}/apis/${proxyName}`,
        {
          headers: {
            Authorization: token,
          },
        },
      );

      if (response.status === 200) {
        let responseBody: any = await response.json();
        let latestRevisionId = responseBody.latestRevisionId;
        if (!latestRevisionId) resolve(undefined);

        let url = `https://apigee.googleapis.com/v1/organizations/${apigeeOrg}/apis/${proxyName}/revisions/${latestRevisionId}?format=bundle`;
        response = await fetch(url, {
          headers: {
            Authorization: token,
          },
        });
        if (response.status == 200) {
          let arrayBuffer = await response.arrayBuffer();
          fs.writeFileSync(
            this.tempPath + proxyName + ".zip",
            Buffer.from(arrayBuffer),
          );
          resolve(this.tempPath + proxyName + ".zip");
        } else {
          resolve(undefined);
        }
      } else {
        let message = await response.text();
        console.log(
          " > Apigee proxy GET response: " + response.status + " - " + message,
        );
        resolve(undefined);
      }
    });
  }

  public async apigeeSharedFlowGet(
    sharedFlowName: string,
    apigeeOrg: string,
    token: string,
  ): Promise<string | undefined> {
    return new Promise(async (resolve, reject) => {
      let response = await fetch(
        `https://apigee.googleapis.com/v1/organizations/${apigeeOrg}/sharedflows/${sharedFlowName}`,
        {
          headers: {
            Authorization: token,
          },
        },
      );

      if (response.status === 200) {
        let responseBody: any = await response.json();
        let latestRevisionId = responseBody.latestRevisionId;
        if (!latestRevisionId) resolve(undefined);

        let url = `https://apigee.googleapis.com/v1/organizations/${apigeeOrg}/sharedflows/${sharedFlowName}/revisions/${latestRevisionId}?format=bundle`;
        response = await fetch(url, {
          headers: {
            Authorization: token,
          },
        });
        if (response.status == 200) {
          let arrayBuffer = await response.arrayBuffer();
          fs.writeFileSync(
            this.tempPath + sharedFlowName + ".zip",
            Buffer.from(arrayBuffer),
          );
          resolve(this.tempPath + sharedFlowName + ".zip");
        } else {
          resolve(undefined);
        }
      } else {
        console.log(" > Apigee proxy GET response: " + response.status);
        resolve(undefined);
      }
    });
  }

  // imports an apigee proxy as template
  public async apigeeProxyImportTemplate(
    proxyName: string,
    apigeeOrg: string,
    token: string,
    converter: ApigeeConverter,
  ): Promise<Template | undefined> {
    return new Promise(async (resolve, reject) => {
      let template: Template | undefined = undefined;
      let apigeeProxyPath = await this.apigeeProxyGet(
        proxyName,
        apigeeOrg,
        token,
      );

      if (apigeeProxyPath) {
        let proxy = await converter.apigeeZipToProxy(
          proxyName,
          apigeeProxyPath,
        );
        if (proxy) {
          template = converter.proxyToTemplate(proxy);
        }
        fs.rmSync(apigeeProxyPath);
      }

      resolve(template);
    });
  }

  public async apigeeProxyExport(
    proxyName: string,
    apigeeProxyPath: string,
    apigeeOrg: string,
    token: string,
  ): Promise<string> {
    return new Promise(async (resolve, reject) => {
      const form = new FormData();
      const data = fs.readFileSync(apigeeProxyPath);
      form.set("file", new Blob([data]), `${proxyName + ".zip"}`);

      let response = await fetch(
        `https://apigee.googleapis.com/v1/organizations/${apigeeOrg}/apis?name=${proxyName}&action=import`,
        {
          method: "POST",
          headers: {
            Authorization: token,
          },
          body: form,
        },
      );

      if (response.status === 200) {
        let responseBody: any = await response.json();
        let latestRevisionId = responseBody.revision;
        if (!latestRevisionId) resolve("");
        else resolve(latestRevisionId);
      } else {
        let responseText = await response.text();
        console.log(
          "> Apigee proxy EXPORT error: " +
            response.status +
            ", " +
            responseText,
        );
        resolve("");
      }
    });
  }

  public async apigeeProxyRevisionDeploy(
    proxyName: string,
    proxyRevision: string,
    serviceAccountEmail: string,
    apigeeEnvironment: string,
    apigeeOrg: string,
    token: string,
  ): Promise<string> {
    return new Promise(async (resolve, reject) => {
      let url = `https://apigee.googleapis.com/v1/organizations/${apigeeOrg}/environments/${apigeeEnvironment}/apis/${proxyName}/revisions/${proxyRevision}/deployments?override=true`;
      if (serviceAccountEmail) url += `&serviceAccount=${serviceAccountEmail}`;
      let response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: token,
        },
      });

      if (response.status === 200) {
        let responseBody: any = await response.json();
        let latestRevisionId = responseBody.revision;
        if (!latestRevisionId) resolve("");
        else resolve(latestRevisionId);
      } else {
        console.log(" > Apigee proxy DEPLOY response: " + response.status);
        resolve("");
      }
    });
  }
}
