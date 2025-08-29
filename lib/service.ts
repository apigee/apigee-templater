import { ApigeeConverter } from "./converter.ts";
import { Proxy, Feature } from "./interfaces.ts";
import fs from "fs";

export class ApigeeTemplaterService {
  public proxiesListText(): string {
    let proxyLines: string[] = [];
    let proxies: string[] = fs.readdirSync("./data/proxies");

    for (let proxyPath of proxies) {
      if (proxyPath.endsWith(".json")) {
        let proxy: Proxy = JSON.parse(
          fs.readFileSync("./data/proxies/" + proxyPath, "utf8"),
        );
        let proxyString = proxy.description
          ? proxy.name + " - " + proxy.description
          : proxy.name + " - No description.";
        proxyLines.push(proxyString);
      }
    }

    return proxyLines.join("\n");
  }

  public featuresListText(): string {
    let featureLines: string[] = [];
    let features: string[] = fs.readdirSync("./data/features");

    for (let featurePath of features) {
      if (featurePath.endsWith(".json")) {
        let feature: Feature = JSON.parse(
          fs.readFileSync("./data/features/" + featurePath, "utf8"),
        );
        let featureString = feature.description
          ? feature.name + " - " + feature.description
          : feature.name + " - No description.";
        featureLines.push(featureString);
      }
    }

    return featureLines.join("\n");
  }

  public proxyGet(name: string): Proxy | undefined {
    let result: Proxy | undefined = undefined;
    let proxyString = fs.readFileSync(
      "./data/proxies/" + name + ".json",
      "utf8",
    );

    if (!proxyString) {
      console.log(`Could not load proxy ${name}, not found.`);
      return result;
    } else {
      result = JSON.parse(proxyString);
    }
    return result;
  }

  public proxyImport(proxy: Proxy) {
    fs.writeFileSync(
      "./data/proxies/" + proxy.name + ".json",
      JSON.stringify(proxy, null, 2),
    );
  }

  public featureGet(name: string): Feature | undefined {
    let result: Feature | undefined = undefined;
    let featureString = fs.readFileSync(
      "./data/features/" + name + ".json",
      "utf8",
    );

    if (!featureString) {
      console.log(`Could not load feature ${name}, not found.`);
      return result;
    } else {
      result = JSON.parse(featureString);
    }
    return result;
  }

  public proxyApplyFeature(
    proxyName: string,
    featureName: string,
    parameters: { [key: string]: string },
    converter: ApigeeConverter,
  ): Proxy | undefined {
    let proxy: Proxy | undefined = undefined;

    proxy = this.proxyGet(proxyName);
    let feature = this.featureGet(featureName);

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
      "./data/proxies/" + proxyName + ".json",
      JSON.stringify(proxy, null, 2),
    );

    return proxy;
  }

  public proxyRemoveFeature(
    proxyName: string,
    featureName: string,
    converter: ApigeeConverter,
  ): Proxy | undefined {
    let proxy: Proxy | undefined = undefined;
    proxy = this.proxyGet(proxyName);
    let feature = this.featureGet(featureName);

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
      "./data/proxies/" + proxyName + ".json",
      JSON.stringify(proxy, null, 2),
    );

    return proxy;
  }

  public proxyCreate(
    name: string,
    basePath: string,
    targetUrl: string | undefined,
    converter: ApigeeConverter,
  ): Proxy {
    let tempProxyName = name.replaceAll(" ", "-").toLowerCase();
    let newProxy: Proxy = {
      name: tempProxyName,
      displayName: name,
      description: "A proxy for traffic to " + targetUrl,
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

      newProxy.endpoints[0].routes[0].target = "default";
    }

    fs.writeFileSync(
      "./data/proxies/" + tempProxyName + ".json",
      JSON.stringify(newProxy, null, 2),
    );

    return newProxy;
  }

  public featureImport(feature: Feature): Feature {
    fs.writeFileSync(
      "./data/features/" + feature.name + ".json",
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
      "./data/proxies/" + tempProxyName + ".json",
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
            condition: targetRouteRule,
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
        "./data/proxies/" + tempProxyName + ".json",
        JSON.stringify(proxy, null, 2),
      );

      return proxy;
    }
  }

  public proxyDelete(proxyName: string) {
    if (fs.existsSync("./data/proxies/" + proxyName + ".json")) {
      fs.rmSync("./data/proxies/" + proxyName + ".json");
    }
    if (fs.existsSync("./data/proxies/" + proxyName + ".yaml")) {
      fs.rmSync("./data/proxies/" + proxyName + ".yaml");
    }
    if (fs.existsSync("./data/proxies/" + proxyName + ".zip")) {
      fs.rmSync("./data/proxies/" + proxyName + ".zip");
    }
  }

  public featureDelete(featureName: string) {
    if (fs.existsSync("./data/features/" + featureName + ".json")) {
      fs.rmSync("./data/features/" + featureName + ".json");
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
      "./data/proxies/" + tempProxyName + ".json",
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
            if (endpoint.routes.length === 1 && !endpoint.routes[0].target) {
              endpoint.routes[0].target = targetName;
            }
          }
        }

        fs.writeFileSync(
          "./data/proxies/" + tempProxyName + ".json",
          JSON.stringify(proxy, null, 2),
        );
      }

      return proxy;
    }
  }
}
