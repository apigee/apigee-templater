import { describe, it, expect } from "bun:test";
import fs from "fs";
import { ApigeeConverter } from "../src/lib/converter.js";
import { Feature, Proxy } from "../src/lib/interfaces.js";

describe("featureApplyFeature parameter merging", () => {
  it("should add new parameters and overwrite existing parameters by name", () => {
    const converter = new ApigeeConverter();

    const originalFeature: Feature = {
      name: "original-feature",
      type: "feature",
      description: "Original feature",
      parameters: [
        {
          name: "Param1",
          displayName: "Param 1",
          description: "Original param 1",
          maps: {},
          examples: [],
          default: "original_val1",
        },
        {
          name: "Param2",
          displayName: "Param 2",
          description: "Original param 2",
          maps: {},
          examples: [],
          default: "original_val2",
        },
      ],
      endpoints: [],
      targets: [],
      policies: [],
      resources: [],
    };

    const applyFeature: Feature = {
      name: "applied-feature",
      type: "feature",
      description: "Applied feature",
      parameters: [
        {
          name: "Param2",
          displayName: "Param 2 Overwritten",
          description: "Overwritten param 2",
          maps: {},
          examples: [],
          default: "new_val2",
        },
        {
          name: "Param3",
          displayName: "Param 3 New",
          description: "New param 3",
          maps: {},
          examples: [],
          default: "new_val3",
        },
      ],
      endpoints: [],
      targets: [],
      policies: [],
      resources: [],
    };

    const merged = converter.featureApplyFeature(originalFeature, applyFeature);

    expect(merged.parameters).toHaveLength(3);
    expect(merged.parameters.find((p) => p.name === "Param1")?.default).toBe("original_val1");
    expect(merged.parameters.find((p) => p.name === "Param2")?.default).toBe("new_val2");
    expect(merged.parameters.find((p) => p.name === "Param2")?.displayName).toBe("Param 2 Overwritten");
    expect(merged.parameters.find((p) => p.name === "Param3")?.default).toBe("new_val3");
  });

  it("should merge and remove faultRules in endpoints and targets", () => {
    const converter = new ApigeeConverter();

    const originalFeature: Feature = {
      name: "proxy-with-faults",
      type: "feature",
      description: "Original feature with fault rules",
      defaultEndpoint: {
        name: "default",
        faultRules: [
          {
            name: "Rule1",
            condition: 'fault.name = "InvalidApiKey"',
            steps: [{ name: "AM-KeyError" }]
          }
        ]
      },
      defaultTarget: {
        name: "default",
        faultRules: [
          {
            name: "TargetRule1",
            condition: 'response.status.code = 500',
            steps: [{ name: "AM-Target500" }]
          }
        ]
      },
      policies: [{ name: "AM-KeyError", type: "AssignMessage", content: {} }, { name: "AM-Target500", type: "AssignMessage", content: {} }],
      resources: []
    };

    const applyFeature: Feature = {
      name: "fault-addon",
      type: "feature",
      description: "Feature adding new fault rule and step",
      defaultEndpoint: {
        name: "default",
        faultRules: [
          {
            name: "Rule1",
            steps: [{ name: "AM-ExtraKeyStep" }]
          },
          {
            name: "Rule2",
            condition: 'fault.name = "QuotaViolation"',
            steps: [{ name: "AM-QuotaError" }]
          }
        ]
      },
      defaultTarget: {
        name: "default",
        faultRules: [
          {
            name: "TargetRule2",
            condition: 'response.status.code = 503',
            steps: [{ name: "AM-Target503" }]
          }
        ]
      },
      policies: [
        { name: "AM-ExtraKeyStep", type: "AssignMessage", content: {} },
        { name: "AM-QuotaError", type: "AssignMessage", content: {} },
        { name: "AM-Target503", type: "AssignMessage", content: {} }
      ],
      resources: []
    };

    const merged = converter.featureApplyFeature(originalFeature, applyFeature);

    expect(merged.defaultEndpoint?.faultRules).toHaveLength(2);
    expect(merged.defaultEndpoint?.faultRules?.[0].name).toBe("Rule1");
    expect(merged.defaultEndpoint?.faultRules?.[0].steps).toHaveLength(2);
    expect(merged.defaultEndpoint?.faultRules?.[0].steps?.[1].name).toBe("AM-ExtraKeyStep");
    expect(merged.defaultEndpoint?.faultRules?.[1].name).toBe("Rule2");

    expect(merged.defaultTarget?.faultRules).toHaveLength(2);
    expect(merged.defaultTarget?.faultRules?.[0].name).toBe("TargetRule1");
    expect(merged.defaultTarget?.faultRules?.[1].name).toBe("TargetRule2");

    // Test feature removal
    converter.featureRemoveFeature(merged, applyFeature);
    expect(merged.defaultEndpoint?.faultRules?.[0].steps).toHaveLength(1);
    expect(merged.defaultEndpoint?.faultRules?.[0].steps?.[0].name).toBe("AM-KeyError");
    expect(merged.defaultTarget?.faultRules?.[0].steps).toHaveLength(1);
    expect(merged.defaultTarget?.faultRules?.[0].steps?.[0].name).toBe("AM-Target500");
  });

  it("should convert feature with faultRules to proxy and export to apigee zip without error", async () => {
    const converter = new ApigeeConverter();

    const featureWithFaultRules: Feature = {
      name: "fault-proxy",
      type: "feature",
      description: "Feature with fault rules and no flows/routes",
      defaultEndpoint: {
        name: "default",
        faultRules: [
          {
            name: "Rule1",
            condition: 'fault.name = "InvalidApiKey"',
            steps: [{ name: "AM-KeyError" }]
          },
          {
            name: "Rule2",
            condition: 'fault.name = "QuotaViolation"',
            steps: [{ name: "AM-QuotaError" }]
          }
        ]
      },
      defaultTarget: {
        name: "default",
        faultRules: [
          {
            name: "TargetRule1",
            condition: 'response.status.code = 500',
            steps: [{ name: "AM-Target500" }]
          }
        ]
      },
      policies: [
        { name: "AM-KeyError", type: "AssignMessage", content: { AssignMessage: { _attributes: { name: "AM-KeyError" } } } },
        { name: "AM-QuotaError", type: "AssignMessage", content: { AssignMessage: { _attributes: { name: "AM-QuotaError" } } } },
        { name: "AM-Target500", type: "AssignMessage", content: { AssignMessage: { _attributes: { name: "AM-Target500" } } } }
      ]
    };

    const proxy = converter.featureToProxy(featureWithFaultRules, {});
    expect(proxy.endpoints).toHaveLength(1);
    expect(proxy.targets).toHaveLength(1);

    const zipPath = await converter.proxyToApigeeZip(proxy);
    expect(fs.existsSync(zipPath)).toBe(true);
    fs.unlinkSync(zipPath);
  });

  it("should convert minimal feature (missing faultRules, flows, routes) to proxy and export to zip", async () => {
    const converter = new ApigeeConverter();

    const minimalFeature: Feature = {
      name: "minimal-proxy",
      type: "feature",
      description: "Minimal feature without optional arrays"
    };

    const proxy = converter.featureToProxy(minimalFeature, {});
    expect(proxy.endpoints).toHaveLength(1);

    const zipPath = await converter.proxyToApigeeZip(proxy);
    expect(fs.existsSync(zipPath)).toBe(true);
    fs.unlinkSync(zipPath);
  });

  it("should apply and remove feature with fault rules from a proxy", () => {
    const converter = new ApigeeConverter();

    const baseProxy = new Proxy();
    baseProxy.name = "my-proxy";
    baseProxy.endpoints = [
      {
        name: "default",
        basePath: "/my-proxy",
        routes: [{ name: "default", target: "default" }],
        flows: [],
        faultRules: [
          {
            name: "BaseRule",
            steps: [{ name: "AM-BaseError" }]
          }
        ]
      }
    ];
    baseProxy.targets = [
      {
        name: "default",
        url: "https://httpbin.org",
        flows: [],
        faultRules: [
          {
            name: "BaseTargetRule",
            steps: [{ name: "AM-BaseTargetError" }]
          }
        ]
      }
    ];

    const feature: Feature = {
      name: "addon-fault",
      uid: "addon",
      type: "feature",
      description: "Addon feature with fault rules",
      defaultEndpoint: {
        name: "default",
        faultRules: [
          {
            name: "BaseRule",
            steps: [{ name: "AM-AddonError" }]
          }
        ]
      },
      policies: [
        { name: "AM-AddonError", type: "AssignMessage", content: {} }
      ]
    };

    const applied = converter.proxyApplyFeature(baseProxy, feature);
    expect(applied.endpoints[0].faultRules?.[0].steps).toHaveLength(2);

    const removed = converter.proxyRemoveFeature(applied, feature);
    expect(removed.endpoints[0].faultRules?.[0].steps).toHaveLength(1);
    expect(removed.endpoints[0].faultRules?.[0].steps[0].name).toBe("AM-BaseError");
  });

  it("should merge defaultFaultRule in target configuration to multiple targets without duplicate steps", () => {
    const converter = new ApigeeConverter();

    const proxy = new Proxy();
    proxy.name = "multi-target-proxy";
    proxy.endpoints = [
      {
        name: "default",
        basePath: "/multi",
        routes: [{ name: "default", target: "target1" }],
        flows: [],
      },
    ];
    proxy.targets = [
      { name: "target1", url: "https://target1.example.com", flows: [] },
      { name: "target2", url: "https://target2.example.com", flows: [] },
      { name: "target3", url: "https://target3.example.com", flows: [] },
      { name: "target4", url: "https://target4.example.com", flows: [] },
    ];

    const feature: Feature = {
      name: "target-fault-feature",
      uid: "fault-feat",
      type: "feature",
      description: "Feature with defaultFaultRule on defaultTarget",
      defaultTarget: {
        name: "default",
        defaultFaultRule: {
          name: "default",
          alwaysEnforce: true,
          steps: [
            { name: "AM-TargetFault-1" },
            { name: "AM-TargetFault-2" },
          ],
        },
      },
      policies: [
        { name: "AM-TargetFault-1", type: "AssignMessage", content: {} },
        { name: "AM-TargetFault-2", type: "AssignMessage", content: {} },
      ],
    };

    const applied = converter.proxyApplyFeature(proxy, feature);

    expect(applied.targets).toHaveLength(4);
    for (let i = 0; i < 4; i++) {
      expect(applied.targets[i].defaultFaultRule).toBeDefined();
      expect(applied.targets[i].defaultFaultRule?.steps).toHaveLength(2);
      expect(applied.targets[i].defaultFaultRule?.steps?.[0].name).toBe("AM-TargetFault-1");
      expect(applied.targets[i].defaultFaultRule?.steps?.[1].name).toBe("AM-TargetFault-2");
    }

    // Ensure target objects have independent defaultFaultRule copies (not shared reference)
    applied.targets[0].defaultFaultRule!.steps!.push({ name: "AM-Target0-Custom" });
    expect(applied.targets[0].defaultFaultRule?.steps).toHaveLength(3);
    expect(applied.targets[1].defaultFaultRule?.steps).toHaveLength(2);
    expect(applied.targets[2].defaultFaultRule?.steps).toHaveLength(2);
    expect(applied.targets[3].defaultFaultRule?.steps).toHaveLength(2);
  });
});


