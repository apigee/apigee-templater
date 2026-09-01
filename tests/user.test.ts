import { describe, it, expect } from "bun:test";
import { ApigeeConverter } from "../src/lib/converter.js";
import { ApigeeTemplaterService } from "../src/lib/service.js";
import { User, Users, Template } from "../src/lib/interfaces.js";
import Ajv from "ajv";
import parseYaml from "yaml";
import fs from "fs";
import path from "path";

describe("User data type and operations", () => {
  const converter = new ApigeeConverter();
  const service = new ApigeeTemplaterService();

  it("should create a default User with expected fields", () => {
    const user = new User();
    expect(user.type).toBe("user");
    expect(user.gateway).toBe("apigee");
    expect(user.schemaVersion).toBe("1.0.0");
    expect(user.status).toBe("active");
    expect(Array.isArray(user.attributes)).toBe(true);
    expect(Array.isArray(user.apps)).toBe(true);
  });

  it("should create a User using converter.userCreate", () => {
    const user = converter.userCreate(
      "john-dev",
      "john@example.com",
      "john-app",
      ["my-product-1", "my-product-2"],
    );
    expect(user.name).toBe("john-dev");
    expect(user.email).toBe("john@example.com");
    expect(user.userName).toBe("john-dev");
    expect(user.apps).toBeDefined();
    expect(user.apps!.length).toBe(1);
    expect(user.apps![0]!.name).toBe("john-app");
    expect(user.apps![0]!.products).toEqual(["my-product-1", "my-product-2"]);
    expect(user.apps![0]!.credentials![0]!.products).toEqual(["my-product-1", "my-product-2"]);
  });

  it("should convert concise User to Apigee developer and apps payload and back", () => {
    const user: User = {
      name: "alice-dev",
      displayName: "Alice Developer",
      type: "user",
      gateway: "apigee",
      schemaVersion: "1.0.0",
      email: "alice@example.com",
      firstName: "Alice",
      lastName: "Developer",
      userName: "alicedev",
      status: "active",
      attributes: [{ name: "tier", value: "gold" }],
      apps: [
        {
          name: "alice-mobile-app",
          displayName: "Alice Mobile App",
          description: "Mobile app for Alice",
          callbackUrl: "https://alice.example.com/oauth",
          status: "approved",
          products: ["product-1", "product-2"],
          scopes: ["read", "write"],
          attributes: [{ name: "env", value: "prod" }],
          credentials: [
            {
              consumerKey: "alice-key-123",
              consumerSecret: "alice-secret-456",
              status: "approved",
              products: ["product-1", "product-2"],
              scopes: ["read", "write"],
            },
          ],
        },
      ],
    };

    const apigeeDev = converter.userToApigeeDeveloper(user);
    expect(apigeeDev.email).toBe("alice@example.com");
    expect(apigeeDev.firstName).toBe("Alice");
    expect(apigeeDev.lastName).toBe("Developer");
    expect(apigeeDev.userName).toBe("alicedev");
    expect(apigeeDev.attributes).toEqual([{ name: "tier", value: "gold" }]);

    const apigeeApps = converter.userToApigeeApps(user);
    expect(apigeeApps.length).toBe(1);
    expect(apigeeApps[0].name).toBe("alice-mobile-app");
    expect(apigeeApps[0].apiProducts).toEqual(["product-1", "product-2"]);
    expect(apigeeApps[0].credentials[0].consumerKey).toBe("alice-key-123");

    // Convert back from Apigee representation
    const roundtripUser = converter.apigeeToUser(
      {
        email: apigeeDev.email,
        firstName: apigeeDev.firstName,
        lastName: apigeeDev.lastName,
        userName: apigeeDev.userName,
        attributes: apigeeDev.attributes,
      },
      [
        {
          name: apigeeApps[0].name,
          displayName: apigeeApps[0].displayName,
          description: apigeeApps[0].description,
          callbackUrl: apigeeApps[0].callbackUrl,
          status: apigeeApps[0].status,
          apiProducts: apigeeApps[0].apiProducts,
          scopes: apigeeApps[0].scopes,
          attributes: apigeeApps[0].attributes,
          credentials: [
            {
              consumerKey: "alice-key-123",
              consumerSecret: "alice-secret-456",
              status: "approved",
              apiProducts: [{ apiproduct: "product-1" }, { apiproduct: "product-2" }],
              scopes: ["read", "write"],
            },
          ],
        },
      ],
    );

    expect(roundtripUser.email).toBe("alice@example.com");
    expect(roundtripUser.firstName).toBe("Alice");
    expect(roundtripUser.lastName).toBe("Developer");
    expect(roundtripUser.userName).toBe("alicedev");
    expect(roundtripUser.apps?.length).toBe(1);
    expect(roundtripUser.apps![0].name).toBe("alice-mobile-app");
    expect(roundtripUser.apps![0].products).toEqual(["product-1", "product-2"]);
  });

  it("should replace parameter placeholders across user fields", () => {
    const user: User = {
      name: "dev-{ENV}",
      displayName: "Developer {ENV}",
      type: "user",
      gateway: "apigee",
      schemaVersion: "1.0.0",
      email: "{ENV}-admin@example.com",
      firstName: "Admin",
      lastName: "{ENV}",
      userName: "admin_{ENV}",
      attributes: [{ name: "target_env", value: "{ENV}" }],
      apps: [
        {
          name: "app-{ENV}",
          displayName: "App for {ENV}",
          products: ["product-{ENV}"],
          credentials: [
            {
              consumerKey: "key-{ENV}",
              consumerSecret: "sec-{ENV}",
              products: ["product-{ENV}"],
            },
          ],
        },
      ],
    };

    converter.userUpdateParameters(user, { ENV: "prod" });

    expect(user.name).toBe("dev-prod");
    expect(user.displayName).toBe("Developer prod");
    expect(user.email).toBe("prod-admin@example.com");
    expect(user.lastName).toBe("prod");
    expect(user.userName).toBe("admin_prod");
    expect(user.attributes![0].value).toBe("prod");
    expect(user.apps![0].name).toBe("app-prod");
    expect(user.apps![0].displayName).toBe("App for prod");
    expect(user.apps![0].products).toEqual(["product-prod"]);
    expect(user.apps![0].credentials![0].consumerKey).toBe("key-prod");
    expect(user.apps![0].credentials![0].consumerSecret).toBe("sec-prod");
  });

  it("should produce readable string representations with userToStringArray and userToString", () => {
    const user = converter.userCreate("charlie-dev", "charlie@example.com", "charlie-app", ["prod-1"]);
    const lines = converter.userToStringArray(user);
    expect(lines.some((l) => l.includes("Name: charlie-dev"))).toBe(true);
    expect(lines.some((l) => l.includes("Email: charlie@example.com"))).toBe(true);
    expect(lines.some((l) => l.includes("charlie-app"))).toBe(true);

    const str = converter.userToString(user);
    expect(str).toContain("charlie-dev");
    expect(str).toContain("charlie@example.com");
  });

  it("should support local user file save, list, get, and delete in service", async () => {
    const testDir = path.join(process.cwd(), "data", "test-users");
    const testService = new ApigeeTemplaterService();
    testService.usersPath = testDir + "/";

    const user1 = converter.userCreate("user-alpha", "alpha@example.com");
    const user2 = converter.userCreate("user-beta", "beta@example.com");

    testService.userImport(user1);
    testService.userImport(user2);

    const list = await testService.usersList();
    expect(list.length).toBe(2);
    expect(list.some((u) => u.name === "user-alpha")).toBe(true);
    expect(list.some((u) => u.name === "user-beta")).toBe(true);

    const fetched = await testService.userGet("user-alpha");
    expect(fetched).toBeDefined();
    expect(fetched!.email).toBe("alpha@example.com");

    const deleted = testService.userDelete("user-alpha");
    expect(deleted).toBe(true);

    const listAfter = await testService.usersList();
    expect(listAfter.length).toBe(1);

    // Clean up
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it("should validate all user test YAML files in tests/data against gateway.schema.1.0.json", () => {
    const schemaContent = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "schema", "gateway.schema.1.0.json"), "utf8"),
    );
    const ajv = new Ajv({ strict: false, allErrors: true });
    const validate = ajv.compile(schemaContent);

    const testFiles = [
      "user-01-developer.yaml",
      "user-02-partner.yaml",
      "user-03-internal-apps.yaml",
    ];

    for (const file of testFiles) {
      const filePath = path.join(process.cwd(), "tests", "data", file);
      expect(fs.existsSync(filePath)).toBe(true);

      const content = fs.readFileSync(filePath, "utf8");
      const data = parseYaml.parse(content);
      expect(data).toBeDefined();
      expect(data.type).toBe("user");

      const valid = validate(data);
      if (!valid) {
        console.error(`Validation errors for ${file}:`, validate.errors);
      }
      expect(valid).toBe(true);
    }
  });

  it("should support Template with products and users string arrays", () => {
    const template: Template = {
      name: "template-with-users-and-products",
      type: "template",
      gateway: "apigee",
      schemaVersion: "1.0.0",
      features: ["feature-01-api-key-auth.yaml"],
      products: ["product-01-standard-api.yaml"],
      users: ["user-01-developer.yaml"],
      endpoints: [
        {
          name: "default",
          basePath: "/v1/test",
        },
      ],
    };

    expect(template.users).toEqual(["user-01-developer.yaml"]);
    expect(template.products).toEqual(["product-01-standard-api.yaml"]);

    const schemaContent = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "schema", "gateway.schema.1.0.json"), "utf8"),
    );
    const ajv = new Ajv({ strict: false, allErrors: true });
    const validate = ajv.compile(schemaContent);
    const valid = validate(template);
    expect(valid).toBe(true);
  });
});
