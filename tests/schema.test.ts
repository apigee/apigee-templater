import { describe, expect, it } from "bun:test";
import Ajv from "ajv";
import parseYaml from "yaml";
import { existsSync, readdirSync, readFileSync } from "fs";
import { join } from "path";

describe("Apigee JSON Schema validation", () => {
  const schemaPath = join(__dirname, "../schema/gateway.schema.0.9.json");
  const schemaJson = JSON.parse(readFileSync(schemaPath, "utf-8"));

  const ajv = new Ajv({ allErrors: true, strict: false });
  const validate = ajv.compile(schemaJson);

  const featuresDir = join(__dirname, "../repository/features");
  const files = existsSync(featuresDir)
    ? readdirSync(featuresDir).filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
    : [];

  it("should validate all feature/template YAML files in repository/features against schema", () => {
    if (files.length === 0) {
      expect(true).toBe(true);
      return;
    }
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

  it("should validate sample proxy with _text against gateway.schema.1.0.json", () => {
    const schema1Path = join(__dirname, "../schema/gateway.schema.1.0.json");
    const schema1Json = JSON.parse(readFileSync(schema1Path, "utf-8"));
    const validate1 = ajv.compile(schema1Json);

    const sampleProxyYaml = `
gateway: apigee
schemaVersion: 1.0.0
name: sample-proxy
displayName: Sample Proxy
type: proxy
description: Simple proxy to mocktarget.apigee.net
endpoints:
  - name: default
    basePath: /sample
    routes:
      - name: default
        target: default
    flows:
      - name: PostFlow
        mode: Response
        steps:
          - name: AM-SetResponseHeader
targets:
  - name: default
    url: https://mocktarget.apigee.net
policies:
  - name: AM-SetResponseHeader
    type: AssignMessage
    content:
      AssignMessage:
        metadata:
          continueOnError: "false"
          enabled: "true"
          name: AM-SetResponseHeader
        DisplayName: AM-SetResponseHeader
        Set:
          Headers:
            Header:
              metadata:
                name: x-hello
              _text: Hello world!
`;
    const yamlData = parseYaml.parse(sampleProxyYaml);
    const valid = validate1(yamlData);
    if (!valid) {
      console.error("Validation errors for sample proxy 1.0:", validate1.errors);
    }
    expect(valid).toBe(true);
  });

  it("should validate all sample YAML files in tests/data against gateway.schema.1.0.json", () => {
    const schema1Path = join(__dirname, "../schema/gateway.schema.1.0.json");
    const schema1Json = JSON.parse(readFileSync(schema1Path, "utf-8"));
    const ajv1 = new Ajv({ allErrors: true, strict: false });
    const validate1 = ajv1.compile(schema1Json);

    const dataDir = join(__dirname, "data");
    const testFiles = existsSync(dataDir)
      ? readdirSync(dataDir).filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
      : [];

    expect(testFiles.length).toBeGreaterThanOrEqual(12);

    for (const file of testFiles) {
      const filePath = join(dataDir, file);
      const content = readFileSync(filePath, "utf-8");
      const yamlData = parseYaml.parse(content);

      const valid = validate1(yamlData);
      if (!valid) {
        console.error(`Validation errors for tests/data/${file}:`, validate1.errors);
      }
      expect(valid).toBe(true);
    }
  });
});
