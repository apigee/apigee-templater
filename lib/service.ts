import { ApigeeConverter } from "./converter.ts";
import { Proxy, ProxyFeature } from "./interfaces.ts";
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

  public proxyApplyFeature;
}
