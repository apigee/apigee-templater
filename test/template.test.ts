import fs from "fs";
import { expect, test } from "vitest";
import { ApigeeConverter } from "../dist/lib/converter.js";
import { Proxy, Feature } from "../dist/lib/interfaces.js";
import { ApigeeTemplaterService } from "../dist/lib/service.js";

const converter = new ApigeeConverter();
const service = new ApigeeTemplaterService();

// converts a proxy zip to template
test("convert proxy zip to template json", async () => {
  let proxy: Proxy | undefined = await converter.apigeeZipToProxy(
    "SimpleProxy-v1",
    "./test/proxies/SimpleProxy-v1.zip",
  );
  expect(proxy).toBeDefined();
  expect(proxy.name).toBe("SimpleProxy-v1");
  expect(proxy.endpoints[0].basePath).toBe("/v1/simple-proxy");
  expect(proxy.targets[0].name).toBe("default");
  expect(proxy.targets[1].name).toBe("httpbin");
});

// applies a feature to a template
test("apply feature to template", async () => {
  let proxy: Proxy | undefined = await converter.apigeeZipToProxy(
    "SimpleProxy-v1",
    "./test/proxies/SimpleProxy-v1.zip",
  );
  let featureString = fs.readFileSync(
    "./test/features/Auth-Key-Header-v1.json",
    "utf8",
  );
  expect(featureString).toBeDefined();
  let feature: Feature = JSON.parse(featureString);
  expect(proxy).toBeDefined();
  expect(proxy.name).toBe("SimpleProxy-v1");
  expect(feature).toBeDefined();
  expect(feature.name).toBe("Auth-Key-Header-v1");
  proxy = converter.proxyApplyFeature(proxy, feature);
  expect(proxy).toBeDefined();
  expect(proxy.policies.length).toBe(3);
  proxy.name = "SimpleProxy-v2";
  fs.writeFileSync(
    "./test/templates/SimpleProxy-v2.local.json",
    JSON.stringify(proxy, null, 2),
  );
});
