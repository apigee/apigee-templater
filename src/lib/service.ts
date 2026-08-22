import { ApigeeConverter } from "./converter.js";
import { Template, Proxy, Feature, ApigeeConfig } from "./interfaces.js";
import fs from "fs";
import path from "path";
import os from "os";
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

  private cacheTtlMs: number = 24 * 60 * 60 * 1000; // 1 day in milliseconds

  templatesRepository = process.env.AFT_TEMPLATES_REPOSITORY
    ? process.env.AFT_TEMPLATES_REPOSITORY
    : "https://github.com/gcp-samples/apigee-templates-repository/tree/main/templates";
  featuresRepository = process.env.AFT_FEATURES_REPOSITORY
    ? process.env.AFT_FEATURES_REPOSITORY
    : "https://github.com/gcp-samples/apigee-templates-repository/tree/main/features";

  remoteGetBaseUrl = process.env.TEMPLATER_GET_BASE_URL
    ? process.env.TEMPLATER_GET_BASE_URL
    : "https://raw.githubusercontent.com/apigee/apigee-templater/refs/heads/main/repository/";
  remoteListUrl = process.env.TEMPLATER_LIST_URL
    ? process.env.TEMPLATER_LIST_URL
    : "https://api.github.com/repos/apigee/apigee-templater/contents/repository/";

  public getCacheDir(): string {
    const homeDir = os.homedir() || process.env.HOME || process.env.USERPROFILE || ".";
    return path.join(homeDir, ".aft", "cache");
  }

  private getCachePath(key: "templates" | "features"): string {
    return path.join(this.getCacheDir(), `${key}.json`);
  }

  private readCache<T>(key: "templates" | "features"): T[] | null {
    try {
      const filePath = this.getCachePath(key);
      if (!fs.existsSync(filePath)) return null;

      const raw = fs.readFileSync(filePath, "utf8");
      const parsed = JSON.parse(raw);

      if (!parsed || !Array.isArray(parsed.data)) return null;

      const age = Date.now() - (parsed.timestamp || 0);
      if (age < this.cacheTtlMs && parsed.data.length > 0) {
        return parsed.data as T[];
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  private readStaleCache<T>(key: "templates" | "features"): T[] | null {
    try {
      const filePath = this.getCachePath(key);
      if (!fs.existsSync(filePath)) return null;
      const raw = fs.readFileSync(filePath, "utf8");
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.data) && parsed.data.length > 0) {
        return parsed.data as T[];
      }
    } catch (e) {}
    return null;
  }

  private writeCache<T>(key: "templates" | "features", data: T[]): void {
    try {
      const filePath = this.getCachePath(key);
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const payload = {
        timestamp: Date.now(),
        data,
      };
      fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf8");
    } catch (e) {}
  }

  public clearCache(): { cleared: string[]; errors: string[] } {
    const cleared: string[] = [];
    const errors: string[] = [];
    const cacheDir = this.getCacheDir();

    if (fs.existsSync(cacheDir)) {
      try {
        const files = fs.readdirSync(cacheDir);
        for (const file of files) {
          const p = path.join(cacheDir, file);
          try {
            fs.rmSync(p, { recursive: true, force: true });
            cleared.push(file);
          } catch (err: any) {
            errors.push(`${file}: ${err.message}`);
          }
        }
      } catch (err: any) {
        errors.push(err.message);
      }
    }
    this.templateListCache = [];
    this.featureListCache = [];
    return { cleared, errors };
  }

  private getRepoApiUrl(repoUrl: string): string {
    const treeMatch = repoUrl.match(/^https?:\/\/github\.com\/([^\/]+)\/([^\/]+)\/tree\/([^\/]+)(?:\/(.*))?$/);
    if (treeMatch) {
      const [, owner, repo, branch, repoPath] = treeMatch;
      const pathSuffix = repoPath ? `/${repoPath}` : "";
      return `https://api.github.com/repos/${owner}/${repo}/contents${pathSuffix}?ref=${branch}`;
    }

    const rawMatch = repoUrl.match(/^https?:\/\/raw\.githubusercontent\.com\/([^\/]+)\/([^\/]+)\/([^\/]+)(?:\/(.*))?$/);
    if (rawMatch) {
      const [, owner, repo, branch, repoPath] = rawMatch;
      const pathSuffix = repoPath ? `/${repoPath}` : "";
      return `https://api.github.com/repos/${owner}/${repo}/contents${pathSuffix}?ref=${branch}`;
    }

    const repoMatch = repoUrl.match(/^https?:\/\/github\.com\/([^\/]+)\/([^\/]+)\/?$/);
    if (repoMatch) {
      const [, owner, repo] = repoMatch;
      return `https://api.github.com/repos/${owner}/${repo}/contents`;
    }

    return repoUrl;
  }

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

  public async templatesList(forceRefresh: boolean = false): Promise<Template[]> {
    return new Promise(async (resolve, reject) => {
      if (!forceRefresh) {
        const cached = this.readCache<Template>("templates");
        if (cached && cached.length > 0) {
          this.templateListCache = cached.map((x) => x.name);
          return resolve(cached);
        }
      }

      let templates: Template[] = [];
      const repoUrl = process.env.AFT_TEMPLATES_REPOSITORY || this.templatesRepository;

      try {
        const apiUrl = this.getRepoApiUrl(repoUrl);
        const response = await fetch(apiUrl, {
          headers: { "User-Agent": "apigee-templater" },
        });

        if (response.status === 200) {
          const remoteTemplates: any = await response.json();
          if (Array.isArray(remoteTemplates) && remoteTemplates.length > 0) {
            for (const item of remoteTemplates) {
              if (
                item &&
                item.name &&
                (item.name.endsWith(".json") || item.name.endsWith(".yaml") || item.name.endsWith(".yml"))
              ) {
                if (item.download_url) {
                  try {
                    const downloadResponse = await fetch(item.download_url);
                    if (downloadResponse.status === 200) {
                      const text = await downloadResponse.text();
                      let remoteTemplate: Template;
                      if (item.name.endsWith(".yaml") || item.name.endsWith(".yml")) {
                        remoteTemplate = YAML.parse(text) as Template;
                      } else {
                        remoteTemplate = JSON.parse(text) as Template;
                      }
                      const idx = templates.findIndex((x) => x.name === remoteTemplate.name);
                      if (idx === -1) templates.push(remoteTemplate);
                    }
                  } catch (e) {}
                } else {
                  const name = item.name.replace(/\.(json|yaml|yml)$/, "");
                  if (!templates.some((x) => x.name === name)) {
                    templates.push({
                      name: name,
                      type: "template",
                      gateway: "apigee",
                      schemaVersion: "1.0.0",
                      description: "",
                      features: [],
                      parameters: [],
                      endpoints: [],
                      targets: [],
                    } as Template);
                  }
                }
              }
            }
          }
        }
      } catch (e) {}

      if (templates && templates.length > 0) {
        this.writeCache("templates", templates);
        this.templateListCache = templates.map((x) => x.name);
      } else {
        const stale = this.readStaleCache<Template>("templates");
        if (stale && stale.length > 0) {
          templates = stale;
          this.templateListCache = templates.map((x) => x.name);
        }
      }

      resolve(templates);
    });
  }

  public async featuresList(forceRefresh: boolean = false): Promise<Feature[]> {
    return new Promise<Feature[]>(async (resolve, reject) => {
      if (!forceRefresh) {
        const cached = this.readCache<Feature>("features");
        if (cached && cached.length > 0) {
          this.featureListCache = cached.map((x) => x.name);
          return resolve(cached);
        }
      }

      let features: Feature[] = [];
      const repoUrl = process.env.AFT_FEATURES_REPOSITORY || this.featuresRepository;

      try {
        const apiUrl = this.getRepoApiUrl(repoUrl);
        const response = await fetch(apiUrl, {
          headers: { "User-Agent": "apigee-templater" },
        });

        if (response.status === 200) {
          const remoteFeatures: any = await response.json();
          if (Array.isArray(remoteFeatures) && remoteFeatures.length > 0) {
            const validItems = remoteFeatures.filter(
              (item) =>
                item &&
                item.name &&
                (item.name.endsWith(".json") || item.name.endsWith(".yaml") || item.name.endsWith(".yml")),
            );

            const fetchedFeatures = await Promise.all(
              validItems.map(async (item) => {
                if (item.download_url) {
                  try {
                    const downloadResponse = await fetch(item.download_url);
                    if (downloadResponse.status === 200) {
                      const text = await downloadResponse.text();
                      let remoteFeature: Feature;
                      if (item.name.endsWith(".yaml") || item.name.endsWith(".yml")) {
                        remoteFeature = YAML.parse(text) as Feature;
                      } else {
                        remoteFeature = JSON.parse(text) as Feature;
                      }
                      if (remoteFeature && remoteFeature.name) {
                        return remoteFeature;
                      }
                    }
                  } catch (e) {}
                }
                const name = item.name.replace(/\.(json|yaml|yml)$/, "");
                return {
                  name: name,
                  displayName: name,
                  type: "feature",
                  description: "",
                  documentation: "",
                  gateway: "apigee",
                  schemaVersion: "1.0.0",
                  categories: [],
                  parameters: [],
                  endpoints: [],
                  targets: [],
                  policies: [],
                  resources: [],
                } as Feature;
              }),
            );

            for (const feature of fetchedFeatures) {
              if (feature && !features.some((f) => f.name === feature.name)) {
                features.push(feature);
              }
            }
          }
        }
      } catch (e) {}

      if (features && features.length > 0) {
        this.writeCache("features", features);
        this.featureListCache = features.map((x) => x.name);
      } else {
        const stale = this.readStaleCache<Feature>("features");
        if (stale && stale.length > 0) {
          features = stale;
          this.featureListCache = features.map((x) => x.name);
        }
      }

      resolve(features);
    });
  }

  public async proxiesList(): Promise<Proxy[]> {
    return new Promise(async (resolve, reject) => {
      let proxies: Proxy[] = [];
      let proxyNames: string[] = fs.readdirSync(this.proxiesPath);

      for (let proxyPath of proxyNames) {
        if (proxyPath.endsWith(".json")) {
          let proxy: Proxy = JSON.parse(fs.readFileSync(this.proxiesPath + proxyPath, "utf8"));
          proxies.push(proxy);
        } else if (proxyPath.endsWith(".yaml")) {
          let proxy: Proxy = YAML.parse(fs.readFileSync(this.proxiesPath + proxyPath, "utf8"));
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
              (proxy["name"].endsWith(".json") || proxy["name"].endsWith(".yaml"))
            ) {
              let downloadResponse = await fetch(proxy["download_url"]);
              if (downloadResponse.status == 200) {
                let remoteProxy: Proxy;
                let remoteTemplateText = await downloadResponse.text();
                if (proxy["name"].endsWith(".yaml"))
                  remoteProxy = YAML.parse(remoteTemplateText) as Proxy;
                else remoteProxy = JSON.parse(remoteTemplateText) as Proxy;
                let proxyExistsIndex = proxies.findIndex((x) => x.name == remoteProxy.name);
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
      let foundJson = false,
        foundYaml = false;

      let templateString = "";
      if (fs.existsSync(this.templatesPath + tempName + ".json")) {
        templateString = fs.readFileSync(this.templatesPath + tempName + ".json", "utf8");
        foundJson = true;
      } else if (fs.existsSync(this.templatesPath + tempName + ".yaml")) {
        templateString = fs.readFileSync(this.templatesPath + tempName + ".yaml", "utf8");
        foundYaml = true;
      } else if (fs.existsSync(tempName)) {
        templateString = fs.readFileSync(tempName, "utf8");
        // let dirName = path.dirname(tempName);
        // process.chdir(dirName);
        if (tempName.endsWith(".yaml")) foundYaml = true;
        else foundJson = true;
      } else {
        // try to fetch from dist directory
        let fileName = tempName.endsWith(".json")
          ? import.meta.dirname + "/../templates/" + tempName
          : import.meta.dirname + "/../templates/" + tempName + ".json";

        if (fs.existsSync(fileName)) {
          templateString = fs.readFileSync(fileName, "utf8");
          foundJson = true;
        } else {
          fileName = tempName.endsWith(".yaml")
            ? import.meta.dirname + "/../templates/" + tempName
            : import.meta.dirname + "/../templates/" + tempName + ".yaml";

          if (fs.existsSync(fileName)) {
            templateString = fs.readFileSync(fileName, "utf8");
            foundYaml = true;
          }
        }
      }

      if (templateString) {
        if (foundJson) result = JSON.parse(templateString);
        else result = YAML.parse(templateString);
      } else {
        const allTemplates = await this.templatesList();
        const found = allTemplates.find((t) => t.name === tempName || t.name === name);
        if (found) result = found;
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
          proxyString = fs.readFileSync(this.proxiesPath + tempName + ".json", "utf8");
          foundJson = true;
        } else if (fs.existsSync(this.proxiesPath + tempName + ".yaml")) {
          proxyString = fs.readFileSync(this.proxiesPath + tempName + ".yaml", "utf8");
          foundYaml = true;
        }
      } else if (fs.existsSync(tempName)) {
        proxyString = fs.readFileSync(tempName, "utf8");
        if (tempName.endsWith(".json")) foundJson = true;
        else if (tempName.endsWith(".yaml")) foundYaml = true;
      }

      if (!foundJson && !foundYaml) {
        // try to fetch remotely
        let fileName = tempName.endsWith(".json") ? tempName : tempName + ".json";
        let response = await fetch(this.remoteGetBaseUrl + "proxies/" + fileName);
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
    fs.writeFileSync(this.proxiesPath + proxy.name + ".json", JSON.stringify(proxy, null, 2));
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
        featureString = fs.readFileSync(this.featuresPath + tempName + ".json", "utf8");
        foundJson = true;
      } else if (fs.existsSync(this.featuresPath + tempName + ".yaml")) {
        featureString = fs.readFileSync(this.featuresPath + tempName + ".yaml", "utf8");
        foundYaml = true;
      } else if (fs.existsSync("repository/features/" + tempName + ".json")) {
        featureString = fs.readFileSync("repository/features/" + tempName + ".json", "utf8");
        foundJson = true;
      } else if (fs.existsSync("repository/features/" + tempName + ".yaml")) {
        featureString = fs.readFileSync("repository/features/" + tempName + ".yaml", "utf8");
        foundYaml = true;
      } else if (fs.existsSync(tempName)) {
        featureString = fs.readFileSync(tempName, "utf8");
        // let dirName = path.dirname(tempName);
        // process.chdir(dirName);
        if (tempName.endsWith(".yaml")) foundYaml = true;
        else foundJson = true;
      } else {
        // first try https
        if (tempName.startsWith("https://")) {
          let response = await fetch(tempName);
          if (response.status === 200) {
            featureString = await response.text();
            if (tempName.endsWith(".yaml")) foundYaml = true;
            else if (tempName.endsWith(".json")) foundJson = true;
          }
        } else {
          // try to fetch from dist directory
          let fileName = tempName.endsWith(".json")
            ? import.meta.dirname + "/../features/" + tempName
            : import.meta.dirname + "/../features/" + tempName + ".json";

          if (fs.existsSync(fileName)) {
            featureString = fs.readFileSync(fileName, "utf8");
            foundJson = true;
          } else {
            fileName = tempName.endsWith(".yaml")
              ? import.meta.dirname + "/../features/" + tempName
              : import.meta.dirname + "/../features/" + tempName + ".yaml";

            if (fs.existsSync(fileName)) {
              featureString = fs.readFileSync(fileName, "utf8");
              foundYaml = true;
            }
          }
        }
      }

      if (featureString) {
        if (foundJson) result = JSON.parse(featureString);
        else result = YAML.parse(featureString);
      } else {
        const allFeatures = await this.featuresList();
        const found = allFeatures.find((f) => f.name === tempName || f.name === name || f.displayName === name);
        if (found) result = found;
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
      } else {
        template = converter.templateApplyFeature(template, feature, featureName);
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
    id: string = "",
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
      } else {
        template = converter.templateRemoveFeature(template, [], featureName, feature);
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
    fs.writeFileSync(this.featuresPath + feature.name + ".json", JSON.stringify(feature, null, 2));

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
        proxy = await this.templateObjectToProxy(template, converter, parameters);
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
        for (let templateFeature of template.features) {
          let loadedFeature = await this.loadFeature(templateFeature);
          if (loadedFeature) {
            features.push(loadedFeature);
          } else {
            // abort, could not load feature
            console.error(`Could not load feature ${templateFeature}.`);
            resolve(undefined);
          }
        }

        proxy = converter.templateToProxy(template, features, parameters);
      }

      resolve(proxy);
    });
  }

  public async loadFeature(featureName: string): Promise<Feature | undefined> {
    return new Promise(async (resolve, reject) => {
      let uId = "";
      if (featureName.includes(":")) {
        let parts = featureName.split(":");
        if (parts.length === 2) {
          uId = parts[0] ?? "";
          featureName = parts[1] ?? featureName;
        }
      }
      let feature = await this.featureGet(featureName);
      if (!feature) {
        console.error(`Could not load feature ${featureName}.`);
        resolve(undefined);
      } else if (uId) {
        // set dynamic uId
        feature.uid = uId;
      }

      resolve(feature);
    });
  }

  public apigeeOrgProxiesCache(apigeeOrg: string): string[] {
    if (this.apigeeProxyListCache[apigeeOrg]) return this.apigeeProxyListCache[apigeeOrg];
    else return [];
  }

  public async apigeeProxiesList(apigeeOrg: string, drz: string, token: string): Promise<any | undefined> {
    return new Promise(async (resolve, reject) => {
      let response = await fetch(
        `https://apigee${drz ? "." + drz + ".rep" : ""}.googleapis.com/v1/organizations/${apigeeOrg}/apis?includeRevisions=true&includeMetaData=true`,
        {
          headers: {
            Authorization: token,
          },
        },
      );

      if (response.status === 200) {
        let responseBody: any = await response.json();
        if (responseBody && responseBody.length) {
          this.apigeeProxyListCache[apigeeOrg] = responseBody.map((x: any) => x.name);
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
    drz: string,
    token: string
  ): Promise<string | undefined> {
    return new Promise(async (resolve, reject) => {
      let response = await fetch(
        `https://apigee${drz ? "." + drz + ".rep" : ""}.googleapis.com/v1/organizations/${apigeeOrg}/apis/${proxyName}`,
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

        let url = `https://apigee${drz ? "." + drz + ".rep" : ""}.googleapis.com/v1/organizations/${apigeeOrg}/apis/${proxyName}/revisions/${latestRevisionId}?format=bundle`;
        response = await fetch(url, {
          headers: {
            Authorization: token,
          },
        });
        if (response.status == 200) {
          let arrayBuffer = await response.arrayBuffer();
          fs.writeFileSync(this.tempPath + proxyName + ".zip", Buffer.from(arrayBuffer));
          resolve(this.tempPath + proxyName + ".zip");
        } else {
          resolve(undefined);
        }
      } else {
        let message = await response.text();
        console.log(" > Apigee proxy GET response: " + response.status + " - " + message);
        resolve(undefined);
      }
    });
  }

  public async apigeeSharedFlowGet(
    sharedFlowName: string,
    apigeeOrg: string,
    drz: string,
    token: string,
  ): Promise<string | undefined> {
    return new Promise(async (resolve, reject) => {
      let response = await fetch(
        `https://apigee${drz ? "." + drz + ".rep" : ""}.googleapis.com/v1/organizations/${apigeeOrg}/sharedflows/${sharedFlowName}`,
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

        let url = `https://apigee${drz ? "." + drz + ".rep" : ""}.googleapis.com/v1/organizations/${apigeeOrg}/sharedflows/${sharedFlowName}/revisions/${latestRevisionId}?format=bundle`;
        response = await fetch(url, {
          headers: {
            Authorization: token,
          },
        });
        if (response.status == 200) {
          let arrayBuffer = await response.arrayBuffer();
          fs.writeFileSync(this.tempPath + sharedFlowName + ".zip", Buffer.from(arrayBuffer));
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
    drz: string,
    token: string,
    converter: ApigeeConverter,
  ): Promise<Template | undefined> {
    return new Promise(async (resolve, reject) => {
      let template: Template | undefined = undefined;
      let apigeeProxyPath = await this.apigeeProxyGet(proxyName, apigeeOrg, drz, token);

      if (apigeeProxyPath) {
        let proxy = await converter.apigeeZipToProxy(proxyName, apigeeProxyPath);
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
    drz: string,
    token: string,
  ): Promise<string> {
    return new Promise(async (resolve, reject) => {
      const form = new FormData();
      const data = fs.readFileSync(apigeeProxyPath);
      form.set("file", new Blob([data]), `${proxyName + ".zip"}`);

      let response = await fetch(
        `https://apigee${drz ? "." + drz + ".rep" : ""}.googleapis.com/v1/organizations/${apigeeOrg}/apis?name=${proxyName}&action=import`,
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
        console.log("> Apigee proxy EXPORT error: " + response.status + ", " + responseText);
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
    drz: string,
    token: string,
  ): Promise<string> {
    return new Promise(async (resolve, reject) => {
      let url = `https://apigee${drz ? "." + drz + ".rep" : ""}.googleapis.com/v1/organizations/${apigeeOrg}/environments/${apigeeEnvironment}/apis/${proxyName}/revisions/${proxyRevision}/deployments?override=true`;
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
        let responseBody: any = await response.json();
        console.log(
          " > Apigee proxy DEPLOY response: " +
            response.status +
            " - " +
            JSON.stringify(responseBody),
        );
        resolve("");
      }
    });
  }

  public async apigeeConfigGet(apigeeOrg: string, drz: string, token: string): Promise<ApigeeConfig> {
    return new Promise(async (resolve, reject) => {
      let apigeeConfig: ApigeeConfig = {
        org: undefined,
        environments: [],
        environmentGroups: [],
      };

      let response = await fetch(`https://apigee${drz ? "." + drz + ".rep" : ""}.googleapis.com/v1/organizations/${apigeeOrg}`, {
        method: "GET",
        headers: {
          Authorization: token,
        },
      });

      if (response.status === 200) {
        apigeeConfig.org = await response.json();
      } else {
        let responseText = await response.text();
        console.log("> Apigee get org config error: " + response.status + ", " + responseText);
      }

      response = await fetch(
        `https://apigee${drz ? "." + drz + ".rep" : ""}.googleapis.com/v1/organizations/${apigeeOrg}/environments`,
        {
          method: "GET",
          headers: {
            Authorization: token,
          },
        },
      );

      if (response.status === 200) {
        apigeeConfig.environments = await response.json();
      } else {
        let responseText = await response.text();
        console.log("> Apigee get env config error: " + response.status + ", " + responseText);
      }

      response = await fetch(
        `https://apigee${drz ? "." + drz + ".rep" : ""}.googleapis.com/v1/organizations/${apigeeOrg}/envgroups`,
        {
          method: "GET",
          headers: {
            Authorization: token,
          },
        },
      );

      if (response.status === 200) {
        let groups: any = await response.json();
        if (groups && groups.environmentGroups) {
          apigeeConfig.environmentGroups = groups.environmentGroups;
          if (apigeeConfig.environmentGroups && apigeeConfig.environmentGroups.length > 0) {
            for (let group of apigeeConfig.environmentGroups) {
              response = await fetch(
                `https://apigee${drz ? "." + drz + ".rep" : ""}.googleapis.com/v1/organizations/${apigeeOrg}/envgroups/${group.name}/attachments`,
                {
                  method: "GET",
                  headers: {
                    Authorization: token,
                  },
                },
              );

              if (response.status === 200) {
                let groupAttachments: any = await response.json();
                if (groupAttachments && groupAttachments.environmentGroupAttachments)
                  group.attachments = groupAttachments.environmentGroupAttachments;
              } else {
                let responseText = await response.text();
                console.log(
                  "> Apigee get envGroups attachment config error: " +
                    response.status +
                    ", " +
                    responseText,
                );
              }
            }
          }
        }
      } else {
        let responseText = await response.text();
        console.log(
          "> Apigee get envGroups config error: " + response.status + ", " + responseText,
        );
      }

      resolve(apigeeConfig);
    });
  }
}
