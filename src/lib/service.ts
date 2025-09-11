import { ApigeeConverter } from "./converter.js";
import { Template, Feature } from "./interfaces.js";
import fs from "fs";
import { Blob } from "buffer";
import { Readable } from "node:stream";

export class ApigeeTemplaterService {
  tempPath: string = "./data/temp/";
  templatesPath: string = "./data/templates/";
  featuresPath: string = "./data/features/";

  constructor(
    tempPath: string = "",
    proxiesPath: string = "",
    featuresPath: string = "",
  ) {
    if (tempPath) this.tempPath = tempPath;
    if (proxiesPath) this.templatesPath = proxiesPath;
    if (featuresPath) this.featuresPath = featuresPath;
  }

  public async templatesList(): Promise<Template[]> {
    return new Promise<Template[]>(async (resolve, reject) => {
      let templates: Template[] = [];
      let templateNames: string[] = fs.readdirSync(this.templatesPath);

      for (let templatePath of templateNames) {
        if (templatePath.endsWith(".json")) {
          let template: Template = JSON.parse(
            fs.readFileSync(this.templatesPath + templatePath, "utf8"),
          );
          templates.push(template);
        }
      }

      let response = await fetch(
        "https://api.github.com/repos/apigee/apigee-templater/contents/repository/templates",
      );

      if (response.status == 200) {
        let remoteTemplates: any = await response.json();
        if (remoteTemplates && remoteTemplates.length > 0) {
          for (let template of remoteTemplates) {
            if (
              template &&
              template["name"] &&
              template["name"].endsWith(".json")
            ) {
              let downloadResponse = await fetch(template["download_url"]);
              if (downloadResponse.status == 200) {
                let remoteTemplate =
                  (await downloadResponse.json()) as Template;
                templates.push(remoteTemplate);
              }
            }
          }
        }
      }

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

      let response = await fetch(
        "https://api.github.com/repos/apigee/apigee-templater/contents/repository/features",
      );

      if (response.status == 200) {
        let remoteFeatures: any = await response.json();
        if (remoteFeatures && remoteFeatures.length > 0) {
          for (let feature of remoteFeatures) {
            if (
              feature &&
              feature["name"] &&
              feature["name"].endsWith(".json")
            ) {
              let downloadResponse = await fetch(feature["download_url"]);
              if (downloadResponse.status == 200) {
                let remoteFeature = (await downloadResponse.json()) as Feature;
                features.push(remoteFeature);
              }
            }
          }
        }
      }

      resolve(features);
    });
  }

  public async templateGet(name: string): Promise<Template | undefined> {
    return new Promise(async (resolve, reject) => {
      let result: Template | undefined = undefined;
      let tempName = name.replaceAll(" ", "-");
      let proxyString = "";

      if (fs.existsSync(this.templatesPath + tempName + ".json")) {
        proxyString = fs.readFileSync(
          this.templatesPath + tempName + ".json",
          "utf8",
        );
      } else {
        // try to fetch remotely
        let response = await fetch(
          "https://raw.githubusercontent.com/apigee/apigee-templater/refs/heads/main/repository/templates/" +
            tempName +
            ".json",
        );

        if (response.status == 200) {
          proxyString = await response.text();
        }
      }

      if (!proxyString) {
        console.log(`Could not load proxy ${name}, not found.`);
      } else {
        result = JSON.parse(proxyString);
      }

      resolve(result);
    });
  }

  public templateImport(proxy: Template) {
    fs.writeFileSync(
      this.templatesPath + proxy.name + ".json",
      JSON.stringify(proxy, null, 2),
    );
  }

  public async featureGet(name: string): Promise<Feature | undefined> {
    return new Promise(async (resolve, reject) => {
      let result: Feature | undefined = undefined;
      let tempName = name.replaceAll(" ", "-");
      let featureString = fs.readFileSync(
        this.featuresPath + tempName + ".json",
        "utf8",
      );

      // try to fetch remotely
      let response = await fetch(
        "https://raw.githubusercontent.com/apigee/apigee-templater/refs/heads/main/repository/features/" +
          tempName +
          ".json",
      );

      if (response.status == 200) {
        featureString = await response.text();
      }

      if (!featureString) {
        return result;
      } else {
        result = JSON.parse(featureString);
      }

      resolve(result);
    });
  }

  public async templateApplyFeature(
    proxyName: string,
    featureName: string,
    parameters: { [key: string]: string },
    converter: ApigeeConverter,
  ): Promise<Template | undefined> {
    return new Promise(async (resolve, reject) => {
      let proxy: Template | undefined = undefined;

      proxy = await this.templateGet(proxyName);
      let feature = await this.featureGet(featureName);

      if (!proxy || !feature) {
        console.log(
          `proxyApplyFeature error: either ${proxyName} or ${featureName} could not be loaded.`,
        );
        return undefined;
      } else if (proxy.features.includes(feature.name)) {
        console.log(
          `proxyApplyFeature error: proxy ${proxyName} already uses feature ${featureName}.`,
        );
        return undefined;
      } else {
        proxy = converter.jsonApplyFeature(proxy, feature, parameters);
      }

      fs.writeFileSync(
        this.templatesPath + proxyName + ".json",
        JSON.stringify(proxy, null, 2),
      );

      resolve(proxy);
    });
  }

  public async templateRemoveFeature(
    proxyName: string,
    featureName: string,
    converter: ApigeeConverter,
  ): Promise<Template | undefined> {
    return new Promise(async (resolve, reject) => {
      let proxy: Template | undefined = undefined;
      proxy = await this.templateGet(proxyName);
      let feature = await this.featureGet(featureName);

      if (!proxy || !feature) {
        console.log(
          `proxyApplyFeature error: either ${proxyName} or ${featureName} could not be loaded.`,
        );
        return undefined;
      } else if (!proxy.features.includes(feature.name)) {
        console.log(
          `proxyRemoveFeature error: proxy ${proxyName} doesn't use feature ${featureName}.`,
        );
        return undefined;
      } else {
        proxy = converter.jsonRemoveFeature(proxy, feature);
      }

      fs.writeFileSync(
        this.templatesPath + proxyName + ".json",
        JSON.stringify(proxy, null, 2),
      );

      resolve(proxy);
    });
  }

  public templateCreate(
    name: string,
    basePath: string | undefined,
    targetUrl: string | undefined,
    converter: ApigeeConverter,
  ): Template {
    let tempName = name.replaceAll(" ", "-");
    let newTemplate: Template = {
      name: tempName,
      displayName: name,
      description: "API proxy " + name,
      features: [],
      endpoints: [],
      targets: [],
      policies: [],
      resources: [],
    };

    if (basePath) {
      newTemplate.endpoints.push({
        name: "default",
        path: basePath,
        flows: [],
        routes: [
          {
            name: "default",
          },
        ],
      });
    }

    if (targetUrl) {
      newTemplate.targets.push({
        name: "default",
        url: targetUrl,
        flows: [],
      });

      if (newTemplate.endpoints[0] && newTemplate.endpoints[0].routes[0])
        newTemplate.endpoints[0].routes[0].target = "default";
    }

    fs.writeFileSync(
      this.templatesPath + tempName + ".json",
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
    proxyName: string,
    endpointName: string,
    basePath: string,
    targetName: string,
    targetUrl: string,
    targetRouteRule: string | undefined,
    converter: ApigeeConverter,
  ): Template | undefined {
    let proxy: Template | undefined = undefined;
    let tempProxyName = proxyName.replaceAll(" ", "-").toLowerCase();
    let proxyString = fs.readFileSync(
      this.templatesPath + tempProxyName + ".json",
      "utf8",
    );
    let result = {};
    if (!proxyString) {
      return proxy;
    } else {
      let proxy: Template = JSON.parse(proxyString);
      proxy.endpoints.push({
        name: endpointName,
        path: basePath,
        flows: [],
        routes: [
          {
            name: targetName,
            target: targetName,
            condition: targetRouteRule ?? "",
          },
        ],
      });

      // create new target, if targetUrl is passed
      if (targetUrl) {
        proxy.targets.push({
          name: targetName,
          url: targetUrl,
          flows: [],
        });
      }

      fs.writeFileSync(
        this.templatesPath + tempProxyName + ".json",
        JSON.stringify(proxy, null, 2),
      );

      return proxy;
    }
  }

  public templateDelete(proxyName: string) {
    if (fs.existsSync(this.templatesPath + proxyName + ".json")) {
      fs.rmSync(this.templatesPath + proxyName + ".json");
    }
    if (fs.existsSync(this.templatesPath + proxyName + ".yaml")) {
      fs.rmSync(this.templatesPath + proxyName + ".yaml");
    }
    if (fs.existsSync(this.templatesPath + proxyName + ".zip")) {
      fs.rmSync(this.templatesPath + proxyName + ".zip");
    }
  }

  public featureDelete(featureName: string) {
    if (fs.existsSync(this.featuresPath + featureName + ".json")) {
      fs.rmSync(this.featuresPath + featureName + ".json");
    }
  }

  public templateAddTarget(
    proxyName: string,
    targetName: string,
    targetUrl: string,
    routeRule: string,
    converter: ApigeeConverter,
  ): Template | undefined {
    let proxy: Template | undefined = undefined;
    let tempProxyName = proxyName.replaceAll(" ", "-").toLowerCase();
    let proxyString = fs.readFileSync(
      this.templatesPath + tempProxyName + ".json",
      "utf8",
    );
    let result = {};
    if (!proxyString) {
      return undefined;
    } else {
      proxy = JSON.parse(proxyString);
      if (proxy) {
        proxy.targets.push({
          name: targetName,
          url: targetUrl,
          flows: [],
        });
        if (routeRule) {
          for (let endpoint of proxy.endpoints) {
            endpoint.routes.unshift({
              name: targetName,
              target: targetName,
              condition: routeRule,
            });
          }
        } else {
          // check if this is a no-target proxy, and if so add default route rule.
          for (let endpoint of proxy.endpoints) {
            if (
              endpoint.routes.length === 1 &&
              endpoint.routes[0] &&
              !endpoint.routes[0].target
            ) {
              endpoint.routes[0].target = targetName;
            }
          }
        }

        fs.writeFileSync(
          this.templatesPath + tempProxyName + ".json",
          JSON.stringify(proxy, null, 2),
        );
      }

      return proxy;
    }
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
        console.log("Got response " + response.status);
        resolve(undefined);
      }
    });
  }

  public async apigeeProxyImport(
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
        console.log("Got response " + response.status);
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
        console.log("Got response " + response.status);
        resolve("");
      }
    });
  }
}
