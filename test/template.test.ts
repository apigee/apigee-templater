import fs from "fs";
import { expect, test } from "vitest";
import { ApigeeConverter } from "../dist/lib/converter.js";
import { Proxy, Feature } from "../dist/lib/interfaces.js";
import { ApigeeTemplaterService } from "../dist/lib/service.js";

const converter = new ApigeeConverter();
const service = new ApigeeTemplaterService();

// converts a proxy zip to template
test("convert proxy zip to template json", async () => {
  let proxy: Proxy | undefined = await converter.zipToJson(
    "SimpleProxy-v1",
    "./test/templates/SimpleProxy-v1.zip",
  );
  expect(proxy).toBeDefined();
  expect(proxy.name).toBe("SimpleProxy-v1");
  expect(proxy.endpoints[0].path).toBe("/v1/simple-proxy");
  expect(proxy.targets[0].name).toBe("default");
  expect(proxy.targets[1].name).toBe("httpbin");
});

// applies a feature to a template
test("apply feature to template", async () => {
  let proxyString = fs.readFileSync(
    "./test/templates/SimpleProxy-v1.json",
    "utf8",
  );
  let featureString = fs.readFileSync(
    "./test/features/auth-apikey-header.json",
    "utf8",
  );
  expect(proxyString).toBeDefined();
  expect(featureString).toBeDefined();
  let proxy: Proxy = JSON.parse(proxyString);
  let feature: Feature = JSON.parse(featureString);
  expect(proxy).toBeDefined();
  expect(proxy.name).toBe("SimpleProxy-v1");
  expect(feature).toBeDefined();
  expect(feature.name).toBe("auth-apikey-header");
  proxy = converter.jsonApplyFeature(proxy, feature);
  expect(proxy).toBeDefined();
  expect(proxy.features.length).toBe(1);
  expect(proxy.features[0]).toBe("auth-apikey-header");
  expect(proxy.policies.length).toBe(3);
  proxy.name = "SimpleProxy-v2";
  fs.writeFileSync(
    "./test/templates/SimpleProxy-v2.local.json",
    JSON.stringify(proxy, null, 2),
  );
});

// removes a feature from a template
test("remove feature from a template", async () => {
  let proxyString = fs.readFileSync(
    "./test/templates/SimpleProxy-v2.json",
    "utf8",
  );
  let featureString = fs.readFileSync(
    "./test/features/auth-apikey-header.json",
    "utf8",
  );
  expect(proxyString).toBeDefined();
  expect(featureString).toBeDefined();
  let proxy: Proxy = JSON.parse(proxyString);
  let feature: Feature = JSON.parse(featureString);
  expect(proxy).toBeDefined();
  expect(proxy.name).toBe("SimpleProxy-v2");
  expect(feature).toBeDefined();
  expect(feature.name).toBe("auth-apikey-header");
  proxy = converter.jsonRemoveFeature(proxy, feature);
  expect(proxy).toBeDefined();
  expect(proxy.features.length).toBe(0);
  expect(proxy.policies.length).toBe(1);
});
