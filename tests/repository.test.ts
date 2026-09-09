import { describe, it, expect } from "bun:test";
import { ApigeeTemplaterService } from "../src/lib/service";

describe("Repository resolution and fetching", () => {
  const service = new ApigeeTemplaterService();

  it("should generate proper candidate filenames for name lookups", () => {
    const candidates1 = service.getCandidateFilenames("auth-oauth21-server");
    expect(candidates1).toContain("auth-oauth21-server.yaml");
    expect(candidates1).toContain("auth-oauth21-server.yml");
    expect(candidates1).toContain("auth--oauth21-server.yaml");
    expect(candidates1).toContain("auth-oauth21-server");

    const candidates2 = service.getCandidateFilenames("auth--oauth21-server.yaml");
    expect(candidates2).toContain("auth--oauth21-server.yaml");
    expect(candidates2).toContain("auth-oauth21-server.yaml");

    const candidates3 = service.getCandidateFilenames("my feature name");
    expect(candidates3).toContain("my-feature-name.yaml");
    expect(candidates3).toContain("my--feature--name.yaml");
  });

  it("should construct correct raw github base URL from github tree and repo URLs", () => {
    const rawTree = service.getRepoRawBaseUrl(
      "https://github.com/gcp-samples/apigee-template-repository/tree/main/features",
    );
    expect(rawTree).toBe(
      "https://raw.githubusercontent.com/gcp-samples/apigee-template-repository/main/features/",
    );

    const rawDirect = service.getRepoRawBaseUrl(
      "https://raw.githubusercontent.com/gcp-samples/apigee-template-repository/main/templates",
    );
    expect(rawDirect).toBe(
      "https://raw.githubusercontent.com/gcp-samples/apigee-template-repository/main/templates/",
    );

    const rawRepo = service.getRepoRawBaseUrl(
      "https://github.com/gcp-samples/apigee-template-repository",
    );
    expect(rawRepo).toBe(
      "https://raw.githubusercontent.com/gcp-samples/apigee-template-repository/main/",
    );
  });

  it("should successfully fetch auth-oauth-server feature from default remote repository", async () => {
    const feature = await service.featureGet("auth-oauth-server");
    expect(feature).toBeDefined();
    expect(feature?.type).toBe("feature");
    expect(feature?.name).toContain("auth");
  }, 10000);

  it("should resolve unknown type using repositoryGet in order (templates -> features -> products -> users)", async () => {
    const resolved = await service.repositoryGet("auth-oauth-server");
    expect(resolved).toBeDefined();
    expect(resolved?.type).toBe("feature");
    expect(resolved?.data.type).toBe("feature");
  }, 10000);

  it("should respect custom AFT_REPOSITORY or folder-specific environment variables", () => {
    const customService = new ApigeeTemplaterService();
    expect(customService.baseRepository).toBe(
      "https://github.com/gcp-samples/apigee-template-repository",
    );
    expect(customService.featuresRepository).toBe(
      "https://github.com/gcp-samples/apigee-template-repository/tree/main/features",
    );
    expect(customService.productsRepository).toBe(
      "https://github.com/gcp-samples/apigee-template-repository/tree/main/products",
    );
    expect(customService.usersRepository).toBe(
      "https://github.com/gcp-samples/apigee-template-repository/tree/main/users",
    );
  });
});
