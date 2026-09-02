import { ApigeeConverter } from "./converter.js";
import { Template, Proxy, Feature, Product, Products, User, Users, ApigeeConfig } from "./interfaces.js";
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
  productsPath: string = "./data/products/";
  usersPath: string = "./data/users/";
  public apigeeProxyListCache: { [key: string]: string[] } = {};
  public apigeeSharedFlowListCache: { [key: string]: string[] } = {};
  public templateListCache: string[] = [];
  public featureListCache: string[] = [];
  public productListCache: string[] = [];
  public userListCache: string[] = [];

  private cacheTtlMs: number = 24 * 60 * 60 * 1000; // 1 day in milliseconds

  public get baseRepository(): string {
    return (
      process.env.AFT_REPOSITORY ||
      "https://github.com/gcp-samples/apigee-templates-repository"
    );
  }

  public get templatesRepository(): string {
    return (
      process.env.AFT_TEMPLATES_REPOSITORY ||
      `${this.baseRepository}/tree/main/templates`
    );
  }

  public get featuresRepository(): string {
    return (
      process.env.AFT_FEATURES_REPOSITORY ||
      `${this.baseRepository}/tree/main/features`
    );
  }

  public get productsRepository(): string {
    return (
      process.env.AFT_PRODUCTS_REPOSITORY ||
      `${this.baseRepository}/tree/main/products`
    );
  }

  public get usersRepository(): string {
    return (
      process.env.AFT_USERS_REPOSITORY ||
      `${this.baseRepository}/tree/main/users`
    );
  }

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

  private getCachePath(key: "templates" | "features" | "products" | "users"): string {
    return path.join(this.getCacheDir(), `${key}.json`);
  }

  private readCache<T>(key: "templates" | "features" | "products" | "users"): T[] | null {
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

  private readStaleCache<T>(key: "templates" | "features" | "products" | "users"): T[] | null {
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

  private writeCache<T>(key: "templates" | "features" | "products" | "users", data: T[]): void {
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
    this.productListCache = [];
    this.userListCache = [];
    return { cleared, errors };
  }

  public getRepoRawBaseUrl(repoUrl: string): string {
    const treeMatch = repoUrl.match(/^https?:\/\/github\.com\/([^\/]+)\/([^\/]+)\/tree\/([^\/]+)(?:\/(.*))?$/);
    if (treeMatch) {
      const [, owner, repo, branch, repoPath] = treeMatch;
      const pathSuffix = repoPath ? `${repoPath.replace(/\/+$/, "")}/` : "";
      return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${pathSuffix}`;
    }

    const rawMatch = repoUrl.match(/^https?:\/\/raw\.githubusercontent\.com\/([^\/]+)\/([^\/]+)\/([^\/]+)(?:\/(.*))?$/);
    if (rawMatch) {
      const [, owner, repo, branch, repoPath] = rawMatch;
      const pathSuffix = repoPath ? `${repoPath.replace(/\/+$/, "")}/` : "";
      return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${pathSuffix}`;
    }

    const directMatch = repoUrl.match(/^https?:\/\/github\.com\/([^\/]+)\/([^\/]+)(?:\/(.*))?$/);
    if (directMatch) {
      const [, owner, repo, repoPath] = directMatch;
      const pathSuffix = repoPath ? `${repoPath.replace(/\/+$/, "")}/` : "";
      return `https://raw.githubusercontent.com/${owner}/${repo}/main/${pathSuffix}`;
    }

    return repoUrl.endsWith("/") ? repoUrl : `${repoUrl}/`;
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

  private getGithubHeaders(): { [key: string]: string } {
    const headers: { [key: string]: string } = {
      "User-Agent": "apigee-templater",
    };
    const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    return headers;
  }

  public getCandidateFilenames(name: string): string[] {
    const raw = name.trim().replaceAll(" ", "-");
    const withoutExt = raw.replace(/\.(yaml|yml|json)$/i, "");
    const singleHyphen = withoutExt.replace(/-+/g, "-");
    const doubleHyphen = withoutExt.replace(/(?<!-)-(?!-)/g, "--");

    const parts = singleHyphen.split("-");
    const firstDouble = parts.length > 1 ? `${parts[0]}--${parts.slice(1).join("-")}` : singleHyphen;

    const baseNames = Array.from(new Set([raw, withoutExt, singleHyphen, firstDouble, doubleHyphen]));
    const candidates: string[] = [];

    for (const b of baseNames) {
      if (b.toLowerCase().endsWith(".yaml") || b.toLowerCase().endsWith(".yml")) {
        candidates.push(b);
      } else {
        candidates.push(`${b}.yaml`);
        candidates.push(`${b}.yml`);
        candidates.push(b);
      }
    }

    return Array.from(new Set(candidates));
  }

  constructor(basePath: string = "", subDirs: boolean = true) {
    if (basePath && subDirs) {
      this.tempPath = basePath + "temp/";
      this.templatesPath = basePath + "templates/";
      this.featuresPath = basePath + "features/";
      this.proxiesPath = basePath + "proxies/";
      this.productsPath = basePath + "products/";
      this.usersPath = basePath + "users/";
    } else if (basePath) {
      this.tempPath = basePath;
      this.templatesPath = basePath;
      this.featuresPath = basePath;
      this.proxiesPath = basePath;
      this.productsPath = basePath;
      this.usersPath = basePath;
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

  public async templateGet(name: string, relativeDir?: string): Promise<Template | undefined> {
    return new Promise(async (resolve, reject) => {
      let result: Template | undefined = undefined;
      const candidates = this.getCandidateFilenames(name);

      // 1. Local filesystem check
      for (const candidate of candidates) {
        const localPaths = [
          ...(relativeDir ? [path.resolve(relativeDir, candidate), path.join(relativeDir, candidate)] : []),
          path.join(this.templatesPath, candidate),
          path.join("repository/templates", candidate),
          candidate,
          path.resolve(process.cwd(), candidate),
          path.join(process.cwd(), candidate),
          path.join(import.meta.dirname, "../templates", candidate),
        ];

        for (const lp of localPaths) {
          if (fs.existsSync(lp) && !fs.statSync(lp).isDirectory()) {
            try {
              const content = fs.readFileSync(lp, "utf8");
              if (candidate.endsWith(".json")) {
                result = JSON.parse(content) as Template;
              } else {
                result = YAML.parse(content) as Template;
              }
              if (result && result.name) return resolve(result);
            } catch (e) {}
          }
        }
      }

      // 2. Direct HTTP / Raw repository fetch
      if (name.startsWith("https://") || name.startsWith("http://")) {
        try {
          const res = await fetch(name, { headers: this.getGithubHeaders() });
          if (res.status === 200) {
            const text = await res.text();
            result = name.endsWith(".json") ? JSON.parse(text) : YAML.parse(text);
            if (result) return resolve(result);
          }
        } catch (e) {}
      } else {
        const rawBaseUrl = this.getRepoRawBaseUrl(this.templatesRepository);
        for (const candidate of candidates) {
          try {
            const res = await fetch(`${rawBaseUrl}${candidate}`, {
              headers: this.getGithubHeaders(),
            });
            if (res.status === 200) {
              const text = await res.text();
              result = candidate.endsWith(".json") ? JSON.parse(text) : YAML.parse(text);
              if (result && result.name) return resolve(result);
            }
          } catch (e) {}
        }
      }

      // 3. Fallback: repository list search
      try {
        const allTemplates = await this.templatesList();
        const baseNames = candidates.map((c) => c.replace(/\.(yaml|yml|json)$/i, ""));
        const found = allTemplates.find(
          (t) => baseNames.includes(t.name) || baseNames.includes(t.name.replace(/-+/g, "-")),
        );
        if (found) result = found;
      } catch (e) {}

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

  public async featureGet(name: string, relativeDir?: string): Promise<Feature | undefined> {
    return new Promise(async (resolve, reject) => {
      let result: Feature | undefined = undefined;
      const candidates = this.getCandidateFilenames(name);

      // 1. Local filesystem check
      for (const candidate of candidates) {
        const localPaths = [
          ...(relativeDir ? [path.resolve(relativeDir, candidate), path.join(relativeDir, candidate)] : []),
          path.join(this.featuresPath, candidate),
          path.join("repository/features", candidate),
          candidate,
          path.resolve(process.cwd(), candidate),
          path.join(process.cwd(), candidate),
          path.join(import.meta.dirname, "../features", candidate),
        ];

        for (const lp of localPaths) {
          if (fs.existsSync(lp) && !fs.statSync(lp).isDirectory()) {
            try {
              const content = fs.readFileSync(lp, "utf8");
              if (candidate.endsWith(".json")) {
                result = JSON.parse(content) as Feature;
              } else {
                result = YAML.parse(content) as Feature;
              }
              if (result && result.name) return resolve(result);
            } catch (e) {}
          }
        }
      }

      // 2. Direct HTTP / Raw repository fetch
      if (name.startsWith("https://") || name.startsWith("http://")) {
        try {
          const res = await fetch(name, { headers: this.getGithubHeaders() });
          if (res.status === 200) {
            const text = await res.text();
            result = name.endsWith(".json") ? JSON.parse(text) : YAML.parse(text);
            if (result) return resolve(result);
          }
        } catch (e) {}
      } else {
        const rawBaseUrl = this.getRepoRawBaseUrl(this.featuresRepository);
        for (const candidate of candidates) {
          try {
            const res = await fetch(`${rawBaseUrl}${candidate}`, {
              headers: this.getGithubHeaders(),
            });
            if (res.status === 200) {
              const text = await res.text();
              result = candidate.endsWith(".json") ? JSON.parse(text) : YAML.parse(text);
              if (result && result.name) return resolve(result);
            }
          } catch (e) {}
        }
      }

      // 3. Fallback: repository list search
      try {
        const allFeatures = await this.featuresList();
        const baseNames = candidates.map((c) => c.replace(/\.(yaml|yml|json)$/i, ""));
        const found = allFeatures.find(
          (f) =>
            baseNames.includes(f.name) ||
            baseNames.includes(f.name.replace(/-+/g, "-")) ||
            (f.displayName && baseNames.includes(f.displayName.replace(/-+/g, "-"))),
        );
        if (found) result = found;
      } catch (e) {}

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

  public async apigeeSharedFlowList(
    apigeeOrg: string,
    drz: string,
    token: string,
  ): Promise<string[]> {
    if (this.apigeeSharedFlowListCache[apigeeOrg]) return this.apigeeSharedFlowListCache[apigeeOrg];
    let response = await fetch(
      `https://apigee${drz ? "." + drz + ".rep" : ""}.googleapis.com/v1/organizations/${apigeeOrg}/sharedflows`,
      {
        headers: {
          Authorization: token,
        },
      },
    );

    if (response.status === 200) {
      let responseBody: any = await response.json();
      if (responseBody.sharedFlows) {
        this.apigeeSharedFlowListCache[apigeeOrg] = responseBody.sharedFlows.map(
          (x: any) => x.name,
        );
        return this.apigeeSharedFlowListCache[apigeeOrg];
      }
    }
    return [];
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
        console.log(" > Apigee shared flow GET response: " + response.status);
        resolve(undefined);
      }
    });
  }

  public async apigeeSharedFlowExport(
    sharedFlowName: string,
    apigeeSharedFlowPath: string,
    apigeeOrg: string,
    drz: string,
    token: string,
  ): Promise<string> {
    return new Promise(async (resolve, reject) => {
      const form = new FormData();
      const data = fs.readFileSync(apigeeSharedFlowPath);
      form.set("file", new Blob([data]), `${sharedFlowName + ".zip"}`);

      let response = await fetch(
        `https://apigee${drz ? "." + drz + ".rep" : ""}.googleapis.com/v1/organizations/${apigeeOrg}/sharedflows?name=${sharedFlowName}&action=import`,
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
        console.log("> Apigee SharedFlow EXPORT error: " + response.status + ", " + responseText);
        resolve("");
      }
    });
  }

  public async apigeeSharedFlowRevisionDeploy(
    sharedFlowName: string,
    sharedFlowRevision: string,
    serviceAccountEmail: string,
    apigeeEnvironment: string,
    apigeeOrg: string,
    drz: string,
    token: string,
  ): Promise<string> {
    return new Promise(async (resolve, reject) => {
      let url = `https://apigee${drz ? "." + drz + ".rep" : ""}.googleapis.com/v1/organizations/${apigeeOrg}/environments/${apigeeEnvironment}/sharedflows/${sharedFlowName}/revisions/${sharedFlowRevision}/deployments?override=true`;
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
          " > Apigee SharedFlow DEPLOY response: " +
            response.status +
            " - " +
            JSON.stringify(responseBody),
        );
        resolve("");
      }
    });
  }

  public async apigeeSharedFlowImportFeature(
    sharedFlowName: string,
    apigeeOrg: string,
    drz: string,
    token: string,
    converter: ApigeeConverter,
  ): Promise<Feature | undefined> {
    return new Promise(async (resolve, reject) => {
      let apigeeSharedFlowPath = await this.apigeeSharedFlowGet(
        sharedFlowName,
        apigeeOrg,
        drz,
        token,
      );
      if (apigeeSharedFlowPath) {
        let feature = await converter.apigeeSharedFlowZipToFeature(
          sharedFlowName,
          apigeeSharedFlowPath,
        );
        fs.rmSync(apigeeSharedFlowPath);
        resolve(feature);
      } else {
        resolve(undefined);
      }
    });
  }

  public async apigeeSharedFlowDelete(
    sharedFlowName: string,
    apigeeOrg: string,
    drz: string,
    token: string,
  ): Promise<boolean> {
    return new Promise(async (resolve, reject) => {
      let response = await fetch(
        `https://apigee${drz ? "." + drz + ".rep" : ""}.googleapis.com/v1/organizations/${apigeeOrg}/sharedflows/${sharedFlowName}`,
        {
          method: "DELETE",
          headers: {
            Authorization: token,
          },
        },
      );
      if (response.status === 200) resolve(true);
      else resolve(false);
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

  public async apigeeProxyDeploymentsGet(
    proxyName: string,
    apigeeOrg: string,
    drz: string,
    token: string,
  ): Promise<any[]> {
    return new Promise(async (resolve) => {
      try {
        let response = await fetch(
          `https://apigee${drz ? "." + drz + ".rep" : ""}.googleapis.com/v1/organizations/${apigeeOrg}/apis/${proxyName}/deployments`,
          {
            method: "GET",
            headers: {
              Authorization: token,
            },
          },
        );
        if (response.status === 200) {
          let body: any = await response.json();
          let deployments: any[] = [];
          if (body.deployments && Array.isArray(body.deployments)) {
            deployments = body.deployments;
          } else if (body.environment && Array.isArray(body.environment)) {
            for (let envObj of body.environment) {
              if (envObj.revision && Array.isArray(envObj.revision)) {
                for (let revObj of envObj.revision) {
                  deployments.push({
                    environment: envObj.name,
                    revision: revObj.name,
                  });
                }
              }
            }
          }
          return resolve(deployments);
        }
      } catch (e) {}
      resolve([]);
    });
  }

  public async apigeeProxyUndeploy(
    proxyName: string,
    environment: string,
    revision: string,
    apigeeOrg: string,
    drz: string,
    token: string,
  ): Promise<boolean> {
    return new Promise(async (resolve) => {
      let response = await fetch(
        `https://apigee${drz ? "." + drz + ".rep" : ""}.googleapis.com/v1/organizations/${apigeeOrg}/environments/${environment}/apis/${proxyName}/revisions/${revision}/deployments`,
        {
          method: "DELETE",
          headers: {
            Authorization: token,
          },
        },
      );
      if (response.status === 200) resolve(true);
      else {
        let text = await response.text();
        console.log(` > Apigee proxy UNDEPLOY response: ${response.status} - ${text}`);
        resolve(false);
      }
    });
  }

  public async apigeeProxyDelete(
    proxyName: string,
    apigeeOrg: string,
    drz: string,
    token: string,
  ): Promise<boolean> {
    return new Promise(async (resolve) => {
      // 1. Undeploy all active deployments
      try {
        let deployments = await this.apigeeProxyDeploymentsGet(proxyName, apigeeOrg, drz, token);
        if (deployments && deployments.length > 0) {
          for (let dep of deployments) {
            let env = dep.environment || dep.environmentName;
            let rev = dep.revision || dep.revisionName;
            if (env && rev) {
              await this.apigeeProxyUndeploy(proxyName, env, rev, apigeeOrg, drz, token);
            }
          }
        }
      } catch (e) {}

      // 2. Delete the proxy
      let response = await fetch(
        `https://apigee${drz ? "." + drz + ".rep" : ""}.googleapis.com/v1/organizations/${apigeeOrg}/apis/${proxyName}`,
        {
          method: "DELETE",
          headers: {
            Authorization: token,
          },
        },
      );

      if (response.status === 200) {
        if (this.apigeeProxyListCache[apigeeOrg]) {
          delete this.apigeeProxyListCache[apigeeOrg];
        }
        resolve(true);
      } else {
        let message = await response.text();
        console.log(` > Apigee proxy DELETE response: ${response.status} - ${message}`);
        resolve(false);
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

  public productImport(product: Product) {
    if (!fs.existsSync(this.productsPath)) fs.mkdirSync(this.productsPath, { recursive: true });
    let productString = JSON.stringify(product, null, 2);
    fs.writeFileSync(path.join(this.productsPath, product.name + ".json"), productString);
    this.productListCache = [];
    const cachePath = this.getCachePath("products");
    if (fs.existsSync(cachePath)) {
      try {
        fs.rmSync(cachePath);
      } catch (e) {}
    }
  }

  public productDelete(productName: string): boolean {
    let deleted = false;
    let jsonPath = path.join(this.productsPath, productName + ".json");
    let yamlPath = path.join(this.productsPath, productName + ".yaml");
    if (fs.existsSync(jsonPath)) {
      fs.unlinkSync(jsonPath);
      deleted = true;
    }
    if (fs.existsSync(yamlPath)) {
      fs.unlinkSync(yamlPath);
      deleted = true;
    }
    this.productListCache = [];
    const cachePath = this.getCachePath("products");
    if (fs.existsSync(cachePath)) {
      try {
        fs.rmSync(cachePath);
      } catch (e) {}
    }
    return deleted;
  }

  public async productsList(forceRefresh: boolean = false): Promise<Product[]> {
    return new Promise(async (resolve, reject) => {
      let products: Product[] = [];
      if (fs.existsSync(this.productsPath)) {
        let productNames: string[] = fs.readdirSync(this.productsPath);
        for (let productPath of productNames) {
          if (productPath.endsWith(".json")) {
            let product: Product = JSON.parse(
              fs.readFileSync(path.join(this.productsPath, productPath), "utf8"),
            );
            products.push(product);
          } else if (productPath.endsWith(".yaml") || productPath.endsWith(".yml")) {
            let product: Product = YAML.parse(
              fs.readFileSync(path.join(this.productsPath, productPath), "utf8"),
            );
            products.push(product);
          }
        }
      }

      if (this.productsPath !== "./data/products/") {
        return resolve(products);
      }

      if (!forceRefresh) {
        const cached = this.readCache<Product>("products");
        if (cached && cached.length > 0) {
          for (const item of cached) {
            if (!products.some((p) => p.name === item.name)) {
              products.push(item);
            }
          }
          this.productListCache = products.map((x) => x.name);
          return resolve(products);
        }
      }

      const repoUrl = this.productsRepository;
      try {
        const apiUrl = this.getRepoApiUrl(repoUrl);
        const response = await fetch(apiUrl, {
          headers: this.getGithubHeaders(),
        });

        if (response.status === 200) {
          const remoteProducts: any = await response.json();
          if (Array.isArray(remoteProducts) && remoteProducts.length > 0) {
            for (const item of remoteProducts) {
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
                      let remoteProduct: Product;
                      if (item.name.endsWith(".yaml") || item.name.endsWith(".yml")) {
                        remoteProduct = YAML.parse(text) as Product;
                      } else {
                        remoteProduct = JSON.parse(text) as Product;
                      }
                      if (remoteProduct && remoteProduct.name) {
                        const idx = products.findIndex((x) => x.name === remoteProduct.name);
                        if (idx === -1) products.push(remoteProduct);
                      }
                    }
                  } catch (e) {}
                }
              }
            }
          }
        }
      } catch (e) {}

      if (products && products.length > 0) {
        this.writeCache("products", products);
        this.productListCache = products.map((x) => x.name);
      } else {
        const stale = this.readStaleCache<Product>("products");
        if (stale && stale.length > 0) {
          products = stale;
          this.productListCache = products.map((x) => x.name);
        }
      }

      resolve(products);
    });
  }

  public async loadProduct(
    productRef: string | Product,
    relativeDir?: string,
  ): Promise<Product | undefined> {
    return new Promise(async (resolve) => {
      if (typeof productRef === "object" && productRef !== null) {
        return resolve(productRef as Product);
      }
      if (typeof productRef === "string") {
        let res = await this.productGet(productRef, relativeDir);
        return resolve(res);
      }
      resolve(undefined);
    });
  }

  public async productGet(name: string, relativeDir?: string): Promise<Product | undefined> {
    return new Promise(async (resolve, reject) => {
      let result: Product | undefined = undefined;
      const candidates = this.getCandidateFilenames(name);

      // 1. Local filesystem check
      for (const candidate of candidates) {
        const localPaths = [
          ...(relativeDir ? [path.resolve(relativeDir, candidate), path.join(relativeDir, candidate)] : []),
          path.join(this.productsPath, candidate),
          path.join("repository/products", candidate),
          candidate,
          path.resolve(process.cwd(), candidate),
          path.join(process.cwd(), candidate),
          path.join(import.meta.dirname, "../products", candidate),
        ];

        for (const lp of localPaths) {
          if (fs.existsSync(lp) && !fs.statSync(lp).isDirectory()) {
            try {
              const content = fs.readFileSync(lp, "utf8");
              if (candidate.endsWith(".json")) {
                result = JSON.parse(content) as Product;
              } else {
                result = YAML.parse(content) as Product;
              }
              if (result && result.name) return resolve(result);
            } catch (e) {}
          }
        }
      }

      // 2. Direct HTTP / Raw repository fetch
      if (name.startsWith("https://") || name.startsWith("http://")) {
        try {
          const res = await fetch(name, { headers: this.getGithubHeaders() });
          if (res.status === 200) {
            const text = await res.text();
            result = name.endsWith(".json") ? JSON.parse(text) : YAML.parse(text);
            if (result) return resolve(result);
          }
        } catch (e) {}
      } else {
        const rawBaseUrl = this.getRepoRawBaseUrl(this.productsRepository);
        for (const candidate of candidates) {
          try {
            const res = await fetch(`${rawBaseUrl}${candidate}`, {
              headers: this.getGithubHeaders(),
            });
            if (res.status === 200) {
              const text = await res.text();
              result = candidate.endsWith(".json") ? JSON.parse(text) : YAML.parse(text);
              if (result && result.name) return resolve(result);
            }
          } catch (e) {}
        }
      }

      // 3. Fallback: repository list search
      try {
        const allProducts = await this.productsList();
        const baseNames = candidates.map((c) => c.replace(/\.(yaml|yml|json)$/i, ""));
        const found = allProducts.find(
          (p) =>
            baseNames.includes(p.name) ||
            baseNames.includes(p.name.replace(/-+/g, "-")) ||
            (p.displayName && baseNames.includes(p.displayName.replace(/-+/g, "-"))),
        );
        if (found) result = found;
      } catch (e) {}

      resolve(result);
    });
  }

  public async apigeeProductsList(
    apigeeOrg: string,
    drz: string,
    token: string,
  ): Promise<any | undefined> {
    return new Promise(async (resolve, reject) => {
      let response = await fetch(
        `https://apigee${drz ? "." + drz + ".rep" : ""}.googleapis.com/v1/organizations/${apigeeOrg}/apiproducts?expand=true`,
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

  public async apigeeProductGet(
    productName: string,
    apigeeOrg: string,
    drz: string,
    token: string,
  ): Promise<any | undefined> {
    return new Promise(async (resolve, reject) => {
      let response = await fetch(
        `https://apigee${drz ? "." + drz + ".rep" : ""}.googleapis.com/v1/organizations/${apigeeOrg}/apiproducts/${productName}`,
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
        let message = await response.text();
        console.log(" > Apigee product GET response: " + response.status + " - " + message);
        resolve(undefined);
      }
    });
  }

  public async apigeeProductExport(
    product: Product | any,
    apigeeOrg: string,
    drz: string,
    token: string,
  ): Promise<boolean> {
    return new Promise(async (resolve, reject) => {
      let converter = new ApigeeConverter();
      let payload =
        product.type === "product" ? converter.productToApigeeProduct(product) : product;
      let productName = payload.name;

      if (!productName) {
        console.log(" > Error: Product name is required for export.");
        resolve(false);
        return;
      }

      let checkResponse = await fetch(
        `https://apigee${drz ? "." + drz + ".rep" : ""}.googleapis.com/v1/organizations/${apigeeOrg}/apiproducts/${productName}`,
        {
          headers: {
            Authorization: token,
          },
        },
      );

      let method = "POST";
      let url = `https://apigee${drz ? "." + drz + ".rep" : ""}.googleapis.com/v1/organizations/${apigeeOrg}/apiproducts`;

      if (checkResponse.status === 200) {
        method = "PUT";
        url = `https://apigee${drz ? "." + drz + ".rep" : ""}.googleapis.com/v1/organizations/${apigeeOrg}/apiproducts/${productName}`;
      }

      let response = await fetch(url, {
        method: method,
        headers: {
          Authorization: token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (response.status === 200 || response.status === 201) {
        resolve(true);
      } else {
        let message = await response.text();
        console.log(` > Apigee product ${method} response: ${response.status} - ${message}`);
        resolve(false);
      }
    });
  }

  public async apigeeProductDelete(
    productName: string,
    apigeeOrg: string,
    drz: string,
    token: string,
  ): Promise<boolean> {
    return new Promise(async (resolve, reject) => {
      let response = await fetch(
        `https://apigee${drz ? "." + drz + ".rep" : ""}.googleapis.com/v1/organizations/${apigeeOrg}/apiproducts/${productName}`,
        {
          method: "DELETE",
          headers: {
            Authorization: token,
          },
        },
      );

      if (response.status === 200) {
        resolve(true);
      } else {
        let message = await response.text();
        console.log(` > Apigee product DELETE response: ${response.status} - ${message}`);
        resolve(false);
      }
    });
  }

  public userImport(user: User) {
    if (!fs.existsSync(this.usersPath)) {
      fs.mkdirSync(this.usersPath, { recursive: true });
    }
    fs.writeFileSync(
      path.join(this.usersPath, (user.name || user.email) + ".json"),
      JSON.stringify(user, null, 2),
    );
    this.userListCache = [];
    const cachePath = this.getCachePath("users");
    if (fs.existsSync(cachePath)) {
      try {
        fs.rmSync(cachePath);
      } catch (e) {}
    }
  }

  public userDelete(name: string): boolean {
    let deleted = false;
    let jsonPath = path.join(this.usersPath, name + ".json");
    let yamlPath = path.join(this.usersPath, name + ".yaml");
    if (fs.existsSync(jsonPath)) {
      fs.unlinkSync(jsonPath);
      deleted = true;
    }
    if (fs.existsSync(yamlPath)) {
      fs.unlinkSync(yamlPath);
      deleted = true;
    }
    this.userListCache = [];
    const cachePath = this.getCachePath("users");
    if (fs.existsSync(cachePath)) {
      try {
        fs.rmSync(cachePath);
      } catch (e) {}
    }
    return deleted;
  }

  public async usersList(forceRefresh: boolean = false): Promise<User[]> {
    return new Promise(async (resolve, reject) => {
      let users: User[] = [];
      if (fs.existsSync(this.usersPath)) {
        let userNames: string[] = fs.readdirSync(this.usersPath);
        for (let userPath of userNames) {
          if (userPath.endsWith(".json")) {
            let user: User = JSON.parse(
              fs.readFileSync(path.join(this.usersPath, userPath), "utf8"),
            );
            users.push(user);
          } else if (userPath.endsWith(".yaml") || userPath.endsWith(".yml")) {
            let user: User = YAML.parse(
              fs.readFileSync(path.join(this.usersPath, userPath), "utf8"),
            );
            users.push(user);
          }
        }
      }

      if (this.usersPath !== "./data/users/") {
        return resolve(users);
      }

      if (!forceRefresh) {
        const cached = this.readCache<User>("users");
        if (cached && cached.length > 0) {
          for (const item of cached) {
            if (!users.some((u) => u.name === item.name)) {
              users.push(item);
            }
          }
          this.userListCache = users.map((x) => x.name);
          return resolve(users);
        }
      }

      const repoUrl = this.usersRepository;
      try {
        const apiUrl = this.getRepoApiUrl(repoUrl);
        const response = await fetch(apiUrl, {
          headers: this.getGithubHeaders(),
        });

        if (response.status === 200) {
          const remoteUsers: any = await response.json();
          if (Array.isArray(remoteUsers) && remoteUsers.length > 0) {
            for (const item of remoteUsers) {
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
                      let remoteUser: User;
                      if (item.name.endsWith(".yaml") || item.name.endsWith(".yml")) {
                        remoteUser = YAML.parse(text) as User;
                      } else {
                        remoteUser = JSON.parse(text) as User;
                      }
                      if (remoteUser && (remoteUser.name || remoteUser.userName || remoteUser.email)) {
                        const idx = users.findIndex((x) => x.name === remoteUser.name);
                        if (idx === -1) users.push(remoteUser);
                      }
                    }
                  } catch (e) {}
                }
              }
            }
          }
        }
      } catch (e) {}

      if (users && users.length > 0) {
        this.writeCache("users", users);
        this.userListCache = users.map((x) => x.name);
      } else {
        const stale = this.readStaleCache<User>("users");
        if (stale && stale.length > 0) {
          users = stale;
          this.userListCache = users.map((x) => x.name);
        }
      }

      resolve(users);
    });
  }

  public async loadUser(
    userRef: string | User,
    relativeDir?: string,
  ): Promise<User | undefined> {
    return new Promise(async (resolve) => {
      if (typeof userRef === "object" && userRef !== null) {
        return resolve(userRef as User);
      }
      if (typeof userRef === "string") {
        let res = await this.userGet(userRef, relativeDir);
        return resolve(res);
      }
      resolve(undefined);
    });
  }

  public async userGet(name: string, relativeDir?: string): Promise<User | undefined> {
    return new Promise(async (resolve, reject) => {
      let result: User | undefined = undefined;
      const candidates = this.getCandidateFilenames(name);

      // 1. Local filesystem check
      for (const candidate of candidates) {
        const localPaths = [
          ...(relativeDir ? [path.resolve(relativeDir, candidate), path.join(relativeDir, candidate)] : []),
          path.join(this.usersPath, candidate),
          path.join("repository/users", candidate),
          candidate,
          path.resolve(process.cwd(), candidate),
          path.join(process.cwd(), candidate),
          path.join(import.meta.dirname, "../users", candidate),
        ];

        for (const lp of localPaths) {
          if (fs.existsSync(lp) && !fs.statSync(lp).isDirectory()) {
            try {
              const content = fs.readFileSync(lp, "utf8");
              if (candidate.endsWith(".json")) {
                result = JSON.parse(content) as User;
              } else {
                result = YAML.parse(content) as User;
              }
              if (result && (result.name || result.userName || result.email)) return resolve(result);
            } catch (e) {}
          }
        }
      }

      // 2. Direct HTTP / Raw repository fetch
      if (name.startsWith("https://") || name.startsWith("http://")) {
        try {
          const res = await fetch(name, { headers: this.getGithubHeaders() });
          if (res.status === 200) {
            const text = await res.text();
            result = name.endsWith(".json") ? JSON.parse(text) : YAML.parse(text);
            if (result) return resolve(result);
          }
        } catch (e) {}
      } else {
        const rawBaseUrl = this.getRepoRawBaseUrl(this.usersRepository);
        for (const candidate of candidates) {
          try {
            const res = await fetch(`${rawBaseUrl}${candidate}`, {
              headers: this.getGithubHeaders(),
            });
            if (res.status === 200) {
              const text = await res.text();
              result = candidate.endsWith(".json") ? JSON.parse(text) : YAML.parse(text);
              if (result && (result.name || result.userName || result.email)) return resolve(result);
            }
          } catch (e) {}
        }
      }

      // 3. Fallback: repository list search
      try {
        const allUsers = await this.usersList();
        const baseNames = candidates.map((c) => c.replace(/\.(yaml|yml|json)$/i, ""));
        const found = allUsers.find(
          (u) =>
            baseNames.includes(u.name) ||
            baseNames.includes(u.name.replace(/-+/g, "-")) ||
            (u.displayName && baseNames.includes(u.displayName.replace(/-+/g, "-"))) ||
            (u.email && baseNames.includes(u.email)) ||
            (u.userName && baseNames.includes(u.userName)),
        );
        if (found) result = found;
      } catch (e) {}

      resolve(result);
    });
  }

  public async repositoryGet(name: string): Promise<{
    type: "template" | "feature" | "product" | "user";
    data: Template | Feature | Product | User;
  } | undefined> {
    // Check templates, features, products, users in that order
    let template = await this.templateGet(name);
    if (template) return { type: "template", data: template };

    let feature = await this.featureGet(name);
    if (feature) return { type: "feature", data: feature };

    let product = await this.productGet(name);
    if (product) return { type: "product", data: product };

    let user = await this.userGet(name);
    if (user) return { type: "user", data: user };

    return undefined;
  }

  public async apigeeUsersList(
    apigeeOrg: string,
    drz: string,
    token: string,
  ): Promise<any | undefined> {
    return new Promise(async (resolve, reject) => {
      let response = await fetch(
        `https://apigee${drz ? "." + drz + ".rep" : ""}.googleapis.com/v1/organizations/${apigeeOrg}/developers?expand=true`,
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

  public async apigeeUserGet(
    developerEmail: string,
    apigeeOrg: string,
    drz: string,
    token: string,
  ): Promise<any | undefined> {
    return new Promise(async (resolve, reject) => {
      let response = await fetch(
        `https://apigee${drz ? "." + drz + ".rep" : ""}.googleapis.com/v1/organizations/${apigeeOrg}/developers/${encodeURIComponent(developerEmail)}`,
        {
          headers: {
            Authorization: token,
          },
        },
      );

      if (response.status === 200) {
        let dev: any = await response.json();
        let appsResponse = await fetch(
          `https://apigee${drz ? "." + drz + ".rep" : ""}.googleapis.com/v1/organizations/${apigeeOrg}/developers/${encodeURIComponent(developerEmail)}/apps?expand=true`,
          {
            headers: {
              Authorization: token,
            },
          },
        );
        let apps: any[] = [];
        if (appsResponse.status === 200) {
          let appsBody: any = await appsResponse.json();
          apps = appsBody.app || [];
        }
        let converter = new ApigeeConverter();
        resolve(converter.apigeeToUser(dev, apps));
      } else {
        let message = await response.text();
        console.log(" > Apigee developer GET response: " + response.status + " - " + message);
        resolve(undefined);
      }
    });
  }

  public async apigeeUserExport(
    user: User | any,
    apigeeOrg: string,
    drz: string,
    token: string,
  ): Promise<boolean> {
    return new Promise(async (resolve, reject) => {
      let converter = new ApigeeConverter();
      let devPayload = converter.userToApigeeDeveloper(user);
      let email = devPayload.email;

      if (!email) {
        console.log(" > Error: Developer email is required for user export.");
        resolve(false);
        return;
      }

      let checkResponse = await fetch(
        `https://apigee${drz ? "." + drz + ".rep" : ""}.googleapis.com/v1/organizations/${apigeeOrg}/developers/${encodeURIComponent(email)}`,
        {
          headers: {
            Authorization: token,
          },
        },
      );

      let method = "POST";
      let url = `https://apigee${drz ? "." + drz + ".rep" : ""}.googleapis.com/v1/organizations/${apigeeOrg}/developers`;

      if (checkResponse.status === 200) {
        method = "PUT";
        url = `https://apigee${drz ? "." + drz + ".rep" : ""}.googleapis.com/v1/organizations/${apigeeOrg}/developers/${encodeURIComponent(email)}`;
      }

      let response = await fetch(url, {
        method: method,
        headers: {
          Authorization: token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(devPayload),
      });

      if (response.status !== 200 && response.status !== 201) {
        let message = await response.text();
        console.log(` > Apigee developer ${method} response: ${response.status} - ${message}`);
        resolve(false);
        return;
      }

      let apps = converter.userToApigeeApps(user);
      for (let app of apps) {
        let appName = app.name;
        if (!appName) continue;

        let checkAppResponse = await fetch(
          `https://apigee${drz ? "." + drz + ".rep" : ""}.googleapis.com/v1/organizations/${apigeeOrg}/developers/${encodeURIComponent(email)}/apps/${encodeURIComponent(appName)}`,
          {
            headers: {
              Authorization: token,
            },
          },
        );

        let appMethod = "POST";
        let appUrl = `https://apigee${drz ? "." + drz + ".rep" : ""}.googleapis.com/v1/organizations/${apigeeOrg}/developers/${encodeURIComponent(email)}/apps`;

        if (checkAppResponse.status === 200) {
          appMethod = "PUT";
          appUrl = `https://apigee${drz ? "." + drz + ".rep" : ""}.googleapis.com/v1/organizations/${apigeeOrg}/developers/${encodeURIComponent(email)}/apps/${encodeURIComponent(appName)}`;
        }

        let appResp = await fetch(appUrl, {
          method: appMethod,
          headers: {
            Authorization: token,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: app.name,
            apiProducts: app.apiProducts || [],
            callbackUrl: app.callbackUrl || "",
            keyExpiresIn: app.keyExpiresIn || "-1",
            scopes: app.scopes || [],
            attributes: app.attributes || [],
          }),
        });

        if (appResp.status !== 200 && appResp.status !== 201) {
          let msg = await appResp.text();
          console.log(` > Apigee app ${appMethod} response: ${appResp.status} - ${msg}`);
        }

        if (app.credentials && Array.isArray(app.credentials)) {
          for (let cred of app.credentials) {
            let key = cred.consumerKey || cred.key;
            let secret = cred.consumerSecret || cred.secret;
            if (key && secret) {
              await fetch(
                `https://apigee${drz ? "." + drz + ".rep" : ""}.googleapis.com/v1/organizations/${apigeeOrg}/developers/${encodeURIComponent(email)}/apps/${encodeURIComponent(appName)}/keys/create`,
                {
                  method: "POST",
                  headers: {
                    Authorization: token,
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    consumerKey: key,
                    consumerSecret: secret,
                  }),
                },
              );
              if (cred.products || cred.apiProducts) {
                await fetch(
                  `https://apigee${drz ? "." + drz + ".rep" : ""}.googleapis.com/v1/organizations/${apigeeOrg}/developers/${encodeURIComponent(email)}/apps/${encodeURIComponent(appName)}/keys/${encodeURIComponent(key)}`,
                  {
                    method: "POST",
                    headers: {
                      Authorization: token,
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                      apiProducts: cred.products || cred.apiProducts,
                    }),
                  },
                );
              }
            }
          }
        }
      }

      resolve(true);
    });
  }

  public async apigeeUserDelete(
    developerEmail: string,
    apigeeOrg: string,
    drz: string,
    token: string,
  ): Promise<boolean> {
    return new Promise(async (resolve, reject) => {
      let response = await fetch(
        `https://apigee${drz ? "." + drz + ".rep" : ""}.googleapis.com/v1/organizations/${apigeeOrg}/developers/${encodeURIComponent(developerEmail)}`,
        {
          method: "DELETE",
          headers: {
            Authorization: token,
          },
        },
      );

      if (response.status === 200) {
        resolve(true);
      } else {
        let message = await response.text();
        console.log(` > Apigee developer DELETE response: ${response.status} - ${message}`);
        resolve(false);
      }
    });
  }
}
