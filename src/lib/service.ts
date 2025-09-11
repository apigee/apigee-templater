import { ApigeeConverter } from "./converter.js";
import { Proxy, Feature } from "./interfaces.js";
import fs from "fs";
import { Blob } from "buffer";
import { Readable } from "node:stream";

export class ApigeeTemplaterService {
  tempPath: string = "./data/temp/";
  proxiesPath: string = "./data/templates/";
  featuresPath: string = "./data/features/";

  constructor(
    tempPath: string = "",
    proxiesPath: string = "",
    featuresPath: string = "",
  ) {
    if (tempPath) this.tempPath = tempPath;
    if (proxiesPath) this.proxiesPath = proxiesPath;
    if (featuresPath) this.featuresPath = featuresPath;
  }

  public templatesList(): string[] {
    let templateNames: string[] = [];
    let templates: string[] = fs.readdirSync(this.proxiesPath);

    for (let templatePath of templates) {
      if (templatePath.endsWith(".json")) {
        let proxy: Proxy = JSON.parse(
          fs.readFileSync(this.proxiesPath + templatePath, "utf8"),
        );
        templateNames.push(proxy.name);
      }
    }

    return templateNames;
  }

  public proxiesListText(): string {
    let proxyLines: string[] = [];
    let proxies: string[] = fs.readdirSync(this.proxiesPath);

    for (let proxyPath of proxies) {
      if (proxyPath.endsWith(".json")) {
        let proxy: Proxy = JSON.parse(
          fs.readFileSync(this.proxiesPath + proxyPath, "utf8"),
        );
        let proxyString = proxy.description
          ? " - " + proxy.name + " - " + proxy.description
          : " - " + proxy.name + " - No description.";
        proxyLines.push(proxyString);
      }
    }

    return proxyLines.join("\n");
  }

  public featuresListText(): string {
    let featureLines: string[] = [];
    let features: string[] = fs.readdirSync(this.featuresPath);

    for (let featurePath of features) {
      if (featurePath.endsWith(".json")) {
        let feature: Feature = JSON.parse(
          fs.readFileSync(this.featuresPath + featurePath, "utf8"),
        );
        let featureString = feature.description
          ? " - " + feature.name + " - " + feature.description
          : " - " + feature.name + " - No description.";
        featureLines.push(featureString);
      }
    }

    return featureLines.join("\n");
  }

  public async templateGet(name: string): Promise<Proxy | undefined> {
    return new Promise(async (resolve, reject) => {
      let result: Proxy | undefined = undefined;
      let tempName = name.replaceAll(" ", "-");
      let proxyString = "";

      if (fs.existsSync(this.proxiesPath + tempName + ".json")) {
        proxyString = fs.readFileSync(
          this.proxiesPath + tempName + ".json",
          "utf8",
        );
      } else {
        console.log("Could not load " + name + ", trying github...");
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

  public proxyImport(proxy: Proxy) {
    fs.writeFileSync(
      this.proxiesPath + proxy.name + ".json",
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
        console.log(`Could not load feature ${name}, not found.`);
        return result;
      } else {
        result = JSON.parse(featureString);
      }

      resolve(result);
    });
  }

  public async proxyApplyFeature(
    proxyName: string,
    featureName: string,
    parameters: { [key: string]: string },
    converter: ApigeeConverter,
  ): Promise<Proxy | undefined> {
    return new Promise(async (resolve, reject) => {
      let proxy: Proxy | undefined = undefined;

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
        this.proxiesPath + proxyName + ".json",
        JSON.stringify(proxy, null, 2),
      );

      resolve(proxy);
    });
  }

  public async templateRemoveFeature(
    proxyName: string,
    featureName: string,
    converter: ApigeeConverter,
  ): Promise<Proxy | undefined> {
    return new Promise(async (resolve, reject) => {
      let proxy: Proxy | undefined = undefined;
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
        this.proxiesPath + proxyName + ".json",
        JSON.stringify(proxy, null, 2),
      );

      resolve(proxy);
    });
  }

  public proxyCreate(
    name: string,
    basePath: string,
    targetUrl: string | undefined,
    converter: ApigeeConverter,
  ): Proxy {
    let tempProxyName = name.replaceAll(" ", "-");
    let newProxy: Proxy = {
      name: tempProxyName,
      displayName: name,
      description: "API proxy " + name,
      features: [],
      endpoints: [
        {
          name: "default",
          path: basePath,
          flows: [],
          routes: [
            {
              name: "default",
            },
          ],
        },
      ],
      targets: [],
      policies: [],
      resources: [],
    };

    if (targetUrl) {
      newProxy.targets.push({
        name: "default",
        url: targetUrl,
        flows: [],
      });

      if (newProxy.endpoints[0] && newProxy.endpoints[0].routes[0])
        newProxy.endpoints[0].routes[0].target = "default";
    }

    console.log("Writing PROXY " + this.proxiesPath + tempProxyName + ".json");

    fs.writeFileSync(
      this.proxiesPath + tempProxyName + ".json",
      JSON.stringify(newProxy, null, 2),
    );

    return newProxy;
  }

  public featureImport(feature: Feature): Feature {
    fs.writeFileSync(
      this.featuresPath + feature.name + ".json",
      JSON.stringify(feature, null, 2),
    );

    return feature;
  }

  public proxyAddEndpoint(
    proxyName: string,
    endpointName: string,
    basePath: string,
    targetName: string,
    targetUrl: string,
    targetRouteRule: string | undefined,
    converter: ApigeeConverter,
  ): Proxy | undefined {
    let proxy: Proxy | undefined = undefined;
    let tempProxyName = proxyName.replaceAll(" ", "-").toLowerCase();
    let proxyString = fs.readFileSync(
      this.proxiesPath + tempProxyName + ".json",
      "utf8",
    );
    let result = {};
    if (!proxyString) {
      return proxy;
    } else {
      let proxy: Proxy = JSON.parse(proxyString);
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
        this.proxiesPath + tempProxyName + ".json",
        JSON.stringify(proxy, null, 2),
      );

      return proxy;
    }
  }

  public proxyDelete(proxyName: string) {
    if (fs.existsSync(this.proxiesPath + proxyName + ".json")) {
      fs.rmSync(this.proxiesPath + proxyName + ".json");
    }
    if (fs.existsSync(this.proxiesPath + proxyName + ".yaml")) {
      fs.rmSync(this.proxiesPath + proxyName + ".yaml");
    }
    if (fs.existsSync(this.proxiesPath + proxyName + ".zip")) {
      fs.rmSync(this.proxiesPath + proxyName + ".zip");
    }
  }

  public featureDelete(featureName: string) {
    if (fs.existsSync(this.featuresPath + featureName + ".json")) {
      fs.rmSync(this.featuresPath + featureName + ".json");
    }
  }

  public proxyAddTarget(
    proxyName: string,
    targetName: string,
    targetUrl: string,
    routeRule: string,
    converter: ApigeeConverter,
  ): Proxy | undefined {
    let proxy: Proxy | undefined = undefined;
    let tempProxyName = proxyName.replaceAll(" ", "-").toLowerCase();
    let proxyString = fs.readFileSync(
      this.proxiesPath + tempProxyName + ".json",
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
          this.proxiesPath + tempProxyName + ".json",
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

        response = await fetch(
          `https://apigee.googleapis.com/v1/organizations/${apigeeOrg}/apis/${proxyName}/${latestRevisionId}?format=bundle`,
          {
            headers: {
              Authorization: token,
            },
          },
        );
        let arrayBuffer = await response.arrayBuffer();
        fs.writeFileSync(
          this.proxiesPath + proxyName + ".zip",
          Buffer.from(arrayBuffer),
        );
        resolve(this.proxiesPath + proxyName + ".zip");
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
