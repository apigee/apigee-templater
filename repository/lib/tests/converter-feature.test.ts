import { describe, it, expect } from "vitest";
import { ApigeeConverter } from "../../../src/lib/converter.js";
import { Feature, Parameter } from "../../../src/lib/interfaces.js";

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
          default: "original_val1"
        },
        {
          name: "Param2",
          displayName: "Param 2",
          description: "Original param 2",
          maps: {},
          examples: [],
          default: "original_val2"
        }
      ],
      endpoints: [],
      targets: [],
      policies: [],
      resources: []
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
          default: "new_val2"
        },
        {
          name: "Param3",
          displayName: "Param 3 New",
          description: "New param 3",
          maps: {},
          examples: [],
          default: "new_val3"
        }
      ],
      endpoints: [],
      targets: [],
      policies: [],
      resources: []
    };

    const merged = converter.featureApplyFeature(originalFeature, applyFeature);

    expect(merged.parameters).toHaveLength(3);
    expect(merged.parameters.find((p) => p.name === "Param1")?.default).toBe("original_val1");
    expect(merged.parameters.find((p) => p.name === "Param2")?.default).toBe("new_val2");
    expect(merged.parameters.find((p) => p.name === "Param2")?.displayName).toBe("Param 2 Overwritten");
    expect(merged.parameters.find((p) => p.name === "Param3")?.default).toBe("new_val3");
  });
});
