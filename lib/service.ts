import { ApigeeConverter } from "./converter.ts";
import { Proxy, Feature } from "./interfaces.ts";
import fs from "fs";

export class ApigeeTemplaterService {
  public proxiesList(uri: URL): any {
    let proxyNames: string[] = [];
    let proxies: string[] = fs.readdirSync("./data/proxies");

    for (let proxyPath of proxies) {
      if (proxyPath.endsWith(".json")) {
        proxyNames.push(
          " - " + proxyPath.replace("./data/proxies", "").replace(".json", ""),
        );
      }
    }

    return {
      contents: [
        {
          uri: uri.href,
          text: "All proxies:\n" + proxyNames.join("\n"),
        },
      ],
    };
  }

  public featuresList(uri: URL): any {
    let featureNames: string[] = [];
    let features: string[] = fs.readdirSync("./data/features");

    for (let featurePath of features) {
      if (featurePath.endsWith(".json")) {
        featureNames.push(
          " - " +
            featurePath.replace("./data/features", "").replace(".json", ""),
        );
      }
    }

    return {
      contents: [
        {
          uri: uri.href,
          text: "All features:\n" + featureNames.join("\n"),
        },
      ],
    };
  }

  public getProxy(name: string): Proxy | undefined {
    let result: Proxy | undefined = undefined;
    let proxyString = fs.readFileSync(
      "./data/proxies/" + name + ".json",
      "utf8",
    );

    if (!proxyString) {
      console.log(`Could not load proxy ${name}, not found.`);
      return result;
    }
    {
      result = JSON.parse(proxyString);
    }
    return result;
  }

  public getFeature(name: string): Feature | undefined {
    let result: Feature | undefined = undefined;
    let featureString = fs.readFileSync(
      "./data/features/" + name + ".json",
      "utf8",
    );

    if (!featureString) {
      console.log(`Could not load feature ${name}, not found.`);
      return result;
    }
    {
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

    proxy = this.getProxy(proxyName);
    let feature = this.getFeature(featureName);

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
    proxy = this.getProxy(proxyName);
    let feature = this.getFeature(featureName);

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
  ): any {
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

    return {
      content: [
        {
          type: "text",
          text: `Proxy ${name} created.\n` + converter.proxyToString(newProxy),
        },
      ],
    };
  }

  public featureCreate(feature: Feature): Feature {
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
  ): any {
    let tempProxyName = proxyName.replaceAll(" ", "-").toLowerCase();
    let proxyString = fs.readFileSync(
      "./data/proxies/" + tempProxyName + ".json",
      "utf8",
    );
    let result = {};
    if (!proxyString) {
      return {
        content: [
          {
            type: "text",
            text: `The proxy ${proxyName} could not be loaded, are you sure the name is correct?`,
          },
        ],
      };
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

      return {
        content: [
          {
            type: "text",
            text:
              `Proxy ${proxyName} updated with endpoint ${endpointName}.\n` +
              converter.proxyToString(proxy),
          },
        ],
      };
    }
  }

  public proxyAddTarget(
    proxyName: string,
    targetName: string,
    targetUrl: string,
    routeRule: string,
    converter: ApigeeConverter,
  ): any {
    let tempProxyName = proxyName.replaceAll(" ", "-").toLowerCase();
    let proxyString = fs.readFileSync(
      "./data/proxies/" + tempProxyName + ".json",
      "utf8",
    );
    let result = {};
    if (!proxyString) {
      return {
        content: [
          {
            type: "text",
            text: `The proxy ${proxyName} could not be loaded, are you sure the name is correct?`,
          },
        ],
      };
    } else {
      let proxy: Proxy = JSON.parse(proxyString);
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

      return {
        content: [
          {
            type: "text",
            text:
              `Proxy ${proxyName} updated with target ${targetName}.\n` +
              converter.proxyToString(proxy),
          },
        ],
      };
    }
  }
}
