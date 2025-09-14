import { ApigeeConverter } from "./converter.js";
import { Template, Proxy, Feature } from "./interfaces.js";
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

  public async templatesList(): Promise<Proxy[]> {
    return new Promise<Proxy[]>(async (resolve, reject) => {
      let templates: Proxy[] = [];
      let templateNames: string[] = fs.readdirSync(this.templatesPath);

      for (let templatePath of templateNames) {
        if (templatePath.endsWith(".json")) {
          let template: Proxy = JSON.parse(
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
                let remoteTemplate = (await downloadResponse.json()) as Proxy;
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
      let featureString = "";
      if (fs.existsSync(this.featuresPath + tempName + ".json")) {
        featureString = fs.readFileSync(
          this.featuresPath + tempName + ".json",
          "utf8",
        );
      } else {
        // try to fetch remotely
        let response = await fetch(
          "https://raw.githubusercontent.com/apigee/apigee-templater/refs/heads/main/repository/features/" +
            tempName +
            ".json",
        );

        if (response.status == 200) {
          featureString = await response.text();
        }
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
        template = converter.templateApplyFeature(template, feature);
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
        template = converter.templateRemoveFeature(template, feature);
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
    converter: ApigeeConverter,
    targetName?: string,
    targetUrl?: string,
    targetRouteRule?: string,
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
          let feature = await this.featureGet(featureName);
          if (feature) features.push(feature);
        }

        proxy = converter.templateToProxy(template, features, parameters);
      }

      resolve(proxy);
    });
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
        console.log(" > Apigee proxy EXPORT response: " + response.status);
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
