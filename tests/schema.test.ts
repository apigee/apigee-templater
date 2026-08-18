import { describe, expect, it } from "bun:test";
import Ajv from "ajv";
import parseYaml from "yaml";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";

describe("Apigee JSON Schema validation", () => {
  const schemaPath = join(__dirname, "../schema/gateway.schema.0.9.json");
  const schemaJson = JSON.parse(readFileSync(schemaPath, "utf-8"));

  const ajv = new Ajv({ allErrors: true, strict: false });
  const validate = ajv.compile(schemaJson);

  const featuresDir = join(__dirname, "../repository/features");
  const files = readdirSync(featuresDir).filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));

  it("should validate all feature/template YAML files in repository/features against schema", () => {
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const filePath = join(featuresDir, file);
      const content = readFileSync(filePath, "utf-8");
      const yamlData = parseYaml.parse(content);

      const valid = validate(yamlData);
      if (!valid) {
        console.error(`Validation errors for ${file}:`, validate.errors);
      }
      expect(valid).toBe(true);
    }
  });

  it("should fail validation if mandatory properties are missing", () => {
    const invalidYaml = {
      type: "feature",
      description: "Missing name"
    };

    const valid = validate(invalidYaml);
    expect(valid).toBe(false);
  });
});
