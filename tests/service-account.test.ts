import { describe, it, expect } from "vitest";
import { ApigeeConverter } from "../src/lib/converter.js";
import { cli } from "../src/lib/cli.js";
import { Proxy, Template, Feature, Deployment } from "../src/lib/interfaces.js";

describe("Service Account requirements and deployment formatting", () => {
  const converter = new ApigeeConverter("./", false);
  const myCli = new cli();

  it("should format shorthand service account with project ID to full IAM email", () => {
    expect(myCli.formatServiceAccount("apigee-runtime", "my-gcp-project")).toBe(
      "apigee-runtime@my-gcp-project.iam.gserviceaccount.com",
    );
    expect(myCli.formatServiceAccount("  custom-sa  ", "another-org")).toBe(
      "custom-sa@another-org.iam.gserviceaccount.com",
    );
  });

  it("should leave service account unchanged if already a full email address", () => {
    expect(
      myCli.formatServiceAccount(
        "custom-sa@another-project.iam.gserviceaccount.com",
        "my-gcp-project",
      ),
    ).toBe("custom-sa@another-project.iam.gserviceaccount.com");
  });

  it("should return empty string if service account is not provided", () => {
    expect(myCli.formatServiceAccount("", "my-gcp-project")).toBe("");
  });

  it("should detect service account requirement for target with GoogleAccessToken scopes", () => {
    const proxy = new Proxy();
    proxy.name = "vertex-ai-proxy";
    proxy.targets = [
      {
        name: "vertex-target",
        url: "https://aiplatform.googleapis.com",
        scopes: ["https://www.googleapis.com/auth/cloud-platform"],
      },
    ];

    const result = converter.detectServiceAccountRequirements(proxy);
    expect(result.required).toBe(true);
    expect(result.reasons.some((r) => r.includes("Google OAuth scopes"))).toBe(true);
  });

  it("should detect service account requirement for target with GoogleIDToken audience", () => {
    const proxy = new Proxy();
    proxy.name = "cloud-run-proxy";
    proxy.targets = [
      {
        name: "cloud-run-target",
        url: "https://my-service.run.app",
        aud: "https://my-service.run.app",
      },
    ];

    const result = converter.detectServiceAccountRequirements(proxy);
    expect(result.required).toBe(true);
    expect(result.reasons.some((r) => r.includes("Google ID token audience"))).toBe(true);
  });

  it("should detect service account requirement for target with auth: google", () => {
    const proxy = new Proxy();
    proxy.name = "google-target-proxy";
    proxy.targets = [
      {
        name: "default",
        url: "https://my-backend.internal",
        auth: "googleAccessToken",
      },
    ];

    const result = converter.detectServiceAccountRequirements(proxy);
    expect(result.required).toBe(true);
    expect(result.reasons.some((r) => r.includes("Google authentication"))).toBe(true);
  });

  it("should detect service account requirement for target with httpTargetConnection authentication block", () => {
    const proxy = new Proxy();
    proxy.name = "http-target-conn-proxy";
    proxy.targets = [
      {
        name: "default",
        httpTargetConnection: {
          authentication: {
            googleIdToken: {
              audience: "https://cloud-run-service.run.app",
            },
          },
        },
      },
    ];

    const result = converter.detectServiceAccountRequirements(proxy);
    expect(result.required).toBe(true);
    expect(result.reasons.some((r) => r.includes("GoogleIDToken authentication"))).toBe(true);
  });

  it("should detect service account requirement for Model Armor policy", () => {
    const proxy = new Proxy();
    proxy.name = "genai-proxy-with-model-armor";
    proxy.policies = [
      {
        name: "MA-SanitizePrompt",
        type: "ModelArmor",
        content: {
          modelArmor: {
            template: "projects/my-proj/locations/us-central1/templates/my-tmpl",
          },
        },
      },
    ];

    const result = converter.detectServiceAccountRequirements(proxy);
    expect(result.required).toBe(true);
    expect(result.reasons.some((r) => r.includes("Model Armor policy"))).toBe(true);
  });

  it("should detect service account requirement for ServiceCallout with GoogleAccessToken or GoogleIDToken", () => {
    const proxy = new Proxy();
    proxy.name = "service-callout-auth-proxy";
    proxy.policies = [
      {
        name: "SC-CallCloudRun",
        type: "ServiceCallout",
        content: {
          serviceCallout: {
            httpTargetConnection: {
              authentication: {
                googleIdToken: {
                  audience: "https://cloud-run-service.run.app",
                },
              },
            },
          },
        },
      },
    ];

    const result = converter.detectServiceAccountRequirements(proxy);
    expect(result.required).toBe(true);
    expect(result.reasons.some((r) => r.includes("GoogleIDToken authentication"))).toBe(true);
  });

  it("should not require service account for standard API proxies without Google auth or Model Armor", () => {
    const proxy = new Proxy();
    proxy.name = "standard-weather-proxy";
    proxy.targets = [
      {
        name: "default",
        url: "https://api.weather.com",
      },
    ];
    proxy.policies = [
      {
        name: "Verify-API-Key",
        type: "VerifyAPIKey",
        content: {
          verifyAPIKey: {
            apiKey: { ref: "request.header.x-api-key" },
          },
        },
      },
      {
        name: "SA-SpikeArrest",
        type: "SpikeArrest",
        content: {
          spikeArrest: { rate: "100pm" },
        },
      },
    ];

    const result = converter.detectServiceAccountRequirements(proxy);
    expect(result.required).toBe(false);
    expect(result.reasons).toEqual([]);
  });

  it("should preserve serviceAccount during proxyToTemplate and templateToProxy conversions", () => {
    const proxy = new Proxy();
    proxy.name = "test-sa-proxy";
    proxy.serviceAccount = "apigee-runtime";
    const template = converter.proxyToTemplate(proxy);
    expect(template.serviceAccount).toBe("apigee-runtime");

    const convertedProxy = converter.templateToProxy(template, []);
    expect(convertedProxy.serviceAccount).toBe("apigee-runtime");
  });

  it("should preserve serviceAccount during proxyToFeature and featureToProxy conversions", () => {
    const proxy = new Proxy();
    proxy.name = "test-sa-proxy";
    proxy.serviceAccount = "sharedflow-sa";
    const feature = converter.proxyToFeature(proxy);
    expect(feature.serviceAccount).toBe("sharedflow-sa");

    const convertedProxy = converter.featureToProxy(feature);
    expect(convertedProxy.serviceAccount).toBe("sharedflow-sa");
  });

  it("should update serviceAccount parameter placeholders in proxy, template, and deployment", () => {
    const proxy = new Proxy();
    proxy.name = "test-sa-proxy";
    proxy.serviceAccount = "sa-{ENV}@{PROJECT_ID}.iam.gserviceaccount.com";
    converter.proxyUpdateParameters(proxy, { ENV: "prod", PROJECT_ID: "my-gcp-project" });
    expect(proxy.serviceAccount).toBe("sa-prod@my-gcp-project.iam.gserviceaccount.com");

    const template = new Template();
    template.name = "test-template";
    template.serviceAccount = "sa-{ENV}@{PROJECT_ID}.iam.gserviceaccount.com";
    converter.templateUpdateParameters(template, { ENV: "staging", PROJECT_ID: "my-gcp-project" });
    expect(template.serviceAccount).toBe("sa-staging@my-gcp-project.iam.gserviceaccount.com");

    const deployment = new Deployment();
    deployment.name = "test-deployment";
    deployment.serviceAccount = "sa-{ENV}@{PROJECT_ID}.iam.gserviceaccount.com";
    converter.deploymentUpdateParameters(deployment, { ENV: "dev", PROJECT_ID: "my-gcp-project" });
    expect(deployment.serviceAccount).toBe("sa-dev@my-gcp-project.iam.gserviceaccount.com");
  });

  it("should validate and identify service account requirements for features and sharedflows", () => {
    const feature = new Feature();
    feature.name = "feature-model-armor";
    feature.policies = [
      {
        name: "MA-Guardrails",
        type: "ModelArmorPromptShield",
        content: {
          modelArmor: {
            template: "projects/test/locations/global/templates/guardrails",
          },
        },
      },
    ];

    const result = converter.detectServiceAccountRequirements(feature);
    expect(result.required).toBe(true);
    expect(result.reasons.length).toBeGreaterThan(0);
  });
});
