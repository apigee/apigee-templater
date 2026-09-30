import { describe, it, expect, afterEach } from "bun:test";
import { ApigeeConverter } from "../src/lib/converter.js";
import { ApigeeTemplaterService } from "../src/lib/service.js";
import {
  DataCollector,
  CustomReport,
  Deployment,
} from "../src/lib/interfaces.js";
import Ajv from "ajv";
import YAML from "yaml";
import fs from "fs";
import path from "path";

describe("DataCollector and CustomReport data types and operations", () => {
  const converter = new ApigeeConverter();
  const service = new ApigeeTemplaterService();

  const schemaPath = path.resolve("./schema/gateway.schema.1.0.json");
  const schemaJson = JSON.parse(fs.readFileSync(schemaPath, "utf-8"));
  const ajv = new Ajv({ strict: false });
  const validateSchema = ajv.compile(schemaJson);

  describe("DataCollector operations", () => {
    it("should create a default DataCollector with expected fields", () => {
      const dc = new DataCollector();
      expect(dc.type).toBe("datacollector");
      expect(dc.gateway).toBe("apigee");
      expect(dc.schemaVersion).toBe("1.0.0");
      expect(dc.collectorType).toBe("STRING");
    });

    it("should create a DataCollector using converter.dataCollectorCreate", () => {
      const dc = converter.dataCollectorCreate("dc_response_time", "INTEGER", "Measures response time in ms");
      expect(dc.name).toBe("dc_response_time");
      expect(dc.collectorType).toBe("INTEGER");
      expect(dc.description).toBe("Measures response time in ms");
    });

    it("should auto-prefix dc_ if omitted in dataCollectorCreate", () => {
      const dc = converter.dataCollectorCreate("user_id", "STRING");
      expect(dc.name).toBe("dc_user_id");
    });

    it("should convert DataCollector to Apigee payload and back", () => {
      const dc: DataCollector = {
        name: "dc_cost_center",
        displayName: "Cost Center",
        type: "datacollector",
        collectorType: "STRING",
        description: "Billing cost center",
        gateway: "apigee",
        schemaVersion: "1.0.0",
      };

      const apigeeDc = converter.dataCollectorToApigeeDataCollector(dc);
      expect(apigeeDc.name).toBe("dc_cost_center");
      expect(apigeeDc.type).toBe("STRING");
      expect(apigeeDc.description).toBe("Billing cost center");

      const roundtrip = converter.apigeeDataCollectorToDataCollector(apigeeDc);
      expect(roundtrip.name).toBe("dc_cost_center");
      expect(roundtrip.collectorType).toBe("STRING");
      expect(roundtrip.description).toBe("Billing cost center");
      expect(roundtrip.type).toBe("datacollector");
    });

    it("should replace parameter placeholders in DataCollector", () => {
      const dc = converter.dataCollectorCreate("dc_{{env}}_status", "STRING", "Status for {{env}}");
      converter.dataCollectorUpdateParameters(dc, { env: "prod" });
      expect(dc.name).toBe("dc_prod_status");
      expect(dc.description).toBe("Status for prod");
    });

    it("should produce readable string representations with dataCollectorToStringArray and dataCollectorToString", () => {
      const dc = converter.dataCollectorCreate("dc_latency", "INTEGER", "Latency measurement");
      const arr = converter.dataCollectorToStringArray(dc);
      expect(arr.some((s) => s.includes("dc_latency"))).toBe(true);
      expect(arr.some((s) => s.includes("INTEGER"))).toBe(true);
      const str = converter.dataCollectorToString(dc);
      expect(str).toContain("dc_latency");
    });

    it("should reset DataCollector returning a clean clone", () => {
      const dc = converter.dataCollectorCreate("dc_status", "STRING");
      const clone = converter.dataCollectorReset(dc);
      expect(clone.name).toBe("dc_status");
      expect(clone).not.toBe(dc);
    });

    it("should validate DataCollector against JSON schema", () => {
      const dc = converter.dataCollectorCreate("dc_status", "STRING", "Status code");
      const valid = validateSchema(dc);
      expect(valid).toBe(true);
    });
  });

  describe("CustomReport operations", () => {
    it("should create a default CustomReport with expected fields", () => {
      const rep = new CustomReport();
      expect(rep.type).toBe("report");
      expect(rep.gateway).toBe("apigee");
      expect(rep.schemaVersion).toBe("1.0.0");
      expect(rep.chartType).toBe("COLUMN");
      expect(Array.isArray(rep.metrics)).toBe(true);
      expect(Array.isArray(rep.dimensions)).toBe(true);
    });

    it("should create a CustomReport using converter.reportCreate", () => {
      const rep = converter.reportCreate(
        "monthly-traffic",
        "Monthly Traffic Report",
        [{ name: "message_count", function: "sum" }],
        ["apiproxy"],
      );
      expect(rep.name).toBe("monthly-traffic");
      expect(rep.displayName).toBe("Monthly Traffic Report");
      expect(rep.metrics.length).toBe(1);
      expect(rep.metrics[0].name).toBe("message_count");
      expect(rep.metrics[0].function).toBe("sum");
      expect(rep.dimensions).toEqual(["apiproxy"]);
    });

    it("should convert CustomReport to Apigee payload and back", () => {
      const rep: CustomReport = {
        name: "latency-report",
        displayName: "API Latency",
        type: "report",
        gateway: "apigee",
        schemaVersion: "1.0.0",
        chartType: "LINE",
        metrics: [{ name: "total_response_time", function: "avg", alias: "avg_response_time" }],
        dimensions: ["apiproxy", "developer_app"],
        timeUnit: "hour",
        sortOrder: "DESC",
        limit: 20,
        filter: "response_status_code eq '200'",
      };

      const apigeeRep = converter.reportToApigeeReport(rep);
      expect(apigeeRep.name).toBe("latency-report");
      expect(apigeeRep.displayName).toBe("API Latency");
      expect(apigeeRep.chartType).toBe("LINE");
      expect(apigeeRep.metrics).toEqual([{ name: "total_response_time", function: "avg", alias: "avg_response_time" }]);
      expect(apigeeRep.dimensions).toEqual(["apiproxy", "developer_app"]);
      expect(apigeeRep.timeUnit).toBe("hour");
      expect(apigeeRep.sortOrder).toBe("DESC");
      expect(apigeeRep.topk).toBe(20);

      const roundtrip = converter.apigeeReportToReport(apigeeRep);
      expect(roundtrip.name).toBe("latency-report");
      expect(roundtrip.displayName).toBe("API Latency");
      expect(roundtrip.chartType).toBe("LINE");
      expect(roundtrip.limit).toBe(20);
      expect(roundtrip.type).toBe("report");
    });

    it("should replace parameter placeholders in CustomReport", () => {
      const rep = converter.reportCreate(
        "{{env}}-report",
        "Report for {{env}}",
        [{ name: "{{metric_name}}", function: "sum" }],
        ["{{dim}}"],
      );
      rep.filter = "environment eq '{{env}}'";
      converter.reportUpdateParameters(rep, {
        env: "prod",
        metric_name: "message_count",
        dim: "apiproxy",
      });
      expect(rep.name).toBe("prod-report");
      expect(rep.displayName).toBe("Report for prod");
      expect(rep.metrics[0].name).toBe("message_count");
      expect(rep.dimensions[0]).toBe("apiproxy");
      expect(rep.filter).toBe("environment eq 'prod'");
    });

    it("should produce readable string representations with reportToStringArray and reportToString", () => {
      const rep = converter.reportCreate(
        "traffic-report",
        "Traffic Report",
        [{ name: "message_count", function: "sum" }],
        ["apiproxy"],
      );
      const arr = converter.reportToStringArray(rep);
      expect(arr.some((s) => s.includes("traffic-report"))).toBe(true);
      expect(arr.some((s) => s.includes("message_count"))).toBe(true);
      const str = converter.reportToString(rep);
      expect(str).toContain("traffic-report");
    });

    it("should reset CustomReport returning a clean clone", () => {
      const rep = converter.reportCreate("test-report");
      const clone = converter.reportReset(rep);
      expect(clone.name).toBe("test-report");
      expect(clone).not.toBe(rep);
    });

    it("should validate CustomReport against JSON schema", () => {
      const rep = converter.reportCreate(
        "traffic-report",
        "Traffic Overview",
        [{ name: "message_count", function: "sum" }],
        ["apiproxy"],
      );
      const valid = validateSchema(rep);
      expect(valid).toBe(true);
    });
  });

  describe("Deployment integration with DataCollectors and Reports", () => {
    it("should validate Deployment containing dataCollectors and reports against JSON schema", () => {
      const deployment: Deployment = {
        name: "analytics-deployment",
        type: "deployment",
        gateway: "apigee",
        schemaVersion: "1.0.0",
        dataCollectors: [
          converter.dataCollectorCreate("dc_transaction_amount", "FLOAT", "Amount in USD"),
        ],
        reports: [
          converter.reportCreate(
            "transaction-report",
            "Transaction Totals",
            [{ name: "dc_transaction_amount", function: "sum" }],
            ["apiproxy"],
          ),
        ],
      };

      const valid = validateSchema(deployment);
      expect(valid).toBe(true);
    });

    it("should resolve inline dataCollectors and reports in deploymentResolveAssets", async () => {
      const dc = converter.dataCollectorCreate("dc_order_id", "STRING");
      const rep = converter.reportCreate("order-report", "Order Report", [
        { name: "message_count", function: "sum" },
      ]);

      const deployment: Deployment = {
        name: "orders-deployment",
        type: "deployment",
        gateway: "apigee",
        schemaVersion: "1.0.0",
        dataCollectors: [dc],
        reports: [rep],
      };

      const resolved = await service.deploymentResolveAssets(deployment, ".");
      expect(resolved.dataCollectors.length).toBe(1);
      expect(resolved.dataCollectors[0].name).toBe("dc_order_id");
      expect(resolved.reports.length).toBe(1);
      expect(resolved.reports[0].name).toBe("order-report");
    });

    it("should parameterize dataCollectors and reports when updating deployment parameters", () => {
      const dc = converter.dataCollectorCreate("dc_{{env}}_id", "STRING");
      const rep = converter.reportCreate("{{env}}-report");

      const deployment: Deployment = {
        name: "{{env}}-deployment",
        type: "deployment",
        gateway: "apigee",
        schemaVersion: "1.0.0",
        dataCollectors: [dc],
        reports: [rep],
      };

      converter.deploymentUpdateParameters(deployment, { env: "stage" });
      expect(deployment.name).toBe("stage-deployment");
      expect(dc.name).toBe("dc_stage_id");
      expect(rep.name).toBe("stage-report");
    });

    it("should include dataCollectors and reports in deploymentToStringArray", () => {
      const dc = converter.dataCollectorCreate("dc_metric", "INTEGER");
      const rep = converter.reportCreate("metric-report");

      const deployment: Deployment = {
        name: "metrics-deployment",
        type: "deployment",
        gateway: "apigee",
        schemaVersion: "1.0.0",
        dataCollectors: [dc],
        reports: [rep],
      };

      const lines = converter.deploymentToStringArray(deployment);
      expect(lines.some((l) => l.includes("Data Collectors") && l.includes("dc_metric"))).toBe(true);
      expect(lines.some((l) => l.includes("Reports") && l.includes("metric-report"))).toBe(true);
    });
  });

  describe("CLI operations for DataCollector and CustomReport", () => {
    const tmpDcYaml = path.join(process.cwd(), "tests/tmp-cli-dc.yaml");
    const tmpDcJson = path.join(process.cwd(), "tests/tmp-cli-dc.json");
    const tmpRepYaml = path.join(process.cwd(), "tests/tmp-cli-rep.yaml");
    const tmpRepJson = path.join(process.cwd(), "tests/tmp-cli-rep.json");

    afterEach(() => {
      for (const f of [tmpDcYaml, tmpDcJson, tmpRepYaml, tmpRepJson]) {
        if (fs.existsSync(f)) fs.unlinkSync(f);
      }
    });

    it("should create empty DataCollector with -f datacollector", async () => {
      const { default: cli } = await import("../src/lib/cli.js");
      const myCli = new cli();
      await myCli.process([
        "bun",
        "apigee-templater.ts",
        tmpDcYaml,
        "-f",
        "datacollector",
        "-n",
        "dc_cart_value",
        "--no-anim",
      ]);

      expect(fs.existsSync(tmpDcYaml)).toBe(true);
      const content = fs.readFileSync(tmpDcYaml, "utf-8");
      const dc = YAML.parse(content);
      expect(dc.type).toBe("datacollector");
      expect(dc.name).toBe("dc_cart_value");
      expect(dc.collectorType).toBe("STRING");
    });

    it("should support -f dc alias for DataCollector", async () => {
      const { default: cli } = await import("../src/lib/cli.js");
      const myCli = new cli();
      await myCli.process([
        "bun",
        "apigee-templater.ts",
        tmpDcYaml,
        "-f",
        "dc",
        "-n",
        "dc_status_code",
        "--no-anim",
      ]);

      expect(fs.existsSync(tmpDcYaml)).toBe(true);
      const dc = YAML.parse(fs.readFileSync(tmpDcYaml, "utf-8"));
      expect(dc.type).toBe("datacollector");
      expect(dc.name).toBe("dc_status_code");
    });

    it("should create empty CustomReport with -f report", async () => {
      const { default: cli } = await import("../src/lib/cli.js");
      const myCli = new cli();
      await myCli.process([
        "bun",
        "apigee-templater.ts",
        tmpRepYaml,
        "-f",
        "report",
        "-n",
        "error-analysis",
        "--no-anim",
      ]);

      expect(fs.existsSync(tmpRepYaml)).toBe(true);
      const rep = YAML.parse(fs.readFileSync(tmpRepYaml, "utf-8"));
      expect(rep.type).toBe("report");
      expect(rep.name).toBe("error-analysis");
      expect(Array.isArray(rep.metrics)).toBe(true);
    });

    it("should support -f customreport and -f cr aliases for CustomReport", async () => {
      const { default: cli } = await import("../src/lib/cli.js");
      const myCli = new cli();
      await myCli.process([
        "bun",
        "apigee-templater.ts",
        tmpRepYaml,
        "-f",
        "cr",
        "-n",
        "api-latency",
        "--no-anim",
      ]);

      expect(fs.existsSync(tmpRepYaml)).toBe(true);
      const rep = YAML.parse(fs.readFileSync(tmpRepYaml, "utf-8"));
      expect(rep.type).toBe("report");
      expect(rep.name).toBe("api-latency");
    });

    it("should convert DataCollector YAML to JSON", async () => {
      const { default: cli } = await import("../src/lib/cli.js");
      const myCli = new cli();
      // First create YAML
      await myCli.process([
        "bun",
        "apigee-templater.ts",
        tmpDcYaml,
        "-f",
        "datacollector",
        "-n",
        "dc_client_ip",
        "--no-anim",
      ]);

      // Now convert YAML to JSON
      await myCli.process([
        "bun",
        "apigee-templater.ts",
        "-i",
        tmpDcYaml,
        "-o",
        tmpDcJson,
        "--no-anim",
      ]);

      expect(fs.existsSync(tmpDcJson)).toBe(true);
      const dcJson = JSON.parse(fs.readFileSync(tmpDcJson, "utf-8"));
      expect(dcJson.type).toBe("datacollector");
      expect(dcJson.name).toBe("dc_client_ip");
    });

    it("should convert CustomReport YAML to JSON", async () => {
      const { default: cli } = await import("../src/lib/cli.js");
      const myCli = new cli();
      // First create YAML
      await myCli.process([
        "bun",
        "apigee-templater.ts",
        tmpRepYaml,
        "-f",
        "report",
        "-n",
        "traffic-by-developer",
        "--no-anim",
      ]);

      // Convert YAML to JSON
      await myCli.process([
        "bun",
        "apigee-templater.ts",
        "-i",
        tmpRepYaml,
        "-o",
        tmpRepJson,
        "--no-anim",
      ]);

      expect(fs.existsSync(tmpRepJson)).toBe(true);
      const repJson = JSON.parse(fs.readFileSync(tmpRepJson, "utf-8"));
      expect(repJson.type).toBe("report");
      expect(repJson.name).toBe("traffic-by-developer");
    });
  });

  describe("Apigee REST Service operations (mocked)", () => {
    const originalFetch = globalThis.fetch;

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it("should export DataCollector creating it when it does not exist (404 -> POST)", async () => {
      let postBody: any = null;
      globalThis.fetch = (async (url: any, init?: any) => {
        const urlStr = String(url);
        const method = init?.method || "GET";

        if (urlStr.includes("/datacollectors/dc_test_new") && method === "GET") {
          return new Response(JSON.stringify({ error: { code: 404, message: "Not found" } }), {
            status: 404,
          });
        }
        if (urlStr.includes("/datacollectors") && method === "POST") {
          postBody = JSON.parse(init.body);
          return new Response(JSON.stringify(postBody), { status: 201 });
        }
        return new Response("{}", { status: 200 });
      }) as any;

      const dc = converter.dataCollectorCreate("dc_test_new", "INTEGER", "Test DC");
      const result = await service.apigeeDataCollectorExport(dc, "my-org", "", "Bearer token");
      expect(result).toBe(true);
      expect(postBody).toBeDefined();
      expect(postBody.name).toBe("dc_test_new");
      expect(postBody.type).toBe("INTEGER");
      expect(postBody.description).toBe("Test DC");
    });

    it("should export DataCollector updating it when it already exists (200 -> PATCH)", async () => {
      let patchBody: any = null;
      let patchUrl: string = "";
      globalThis.fetch = (async (url: any, init?: any) => {
        const urlStr = String(url);
        const method = init?.method || "GET";

        if (urlStr.includes("/datacollectors/dc_test_existing") && method === "GET") {
          return new Response(
            JSON.stringify({
              name: "dc_test_existing",
              type: "STRING",
              description: "Old description",
            }),
            { status: 200 },
          );
        }
        if (urlStr.includes("/datacollectors/dc_test_existing") && method === "PATCH") {
          patchUrl = urlStr;
          patchBody = JSON.parse(init.body);
          return new Response(JSON.stringify(patchBody), { status: 200 });
        }
        return new Response("{}", { status: 200 });
      }) as any;

      const dc = converter.dataCollectorCreate("dc_test_existing", "STRING", "New updated description");
      const result = await service.apigeeDataCollectorExport(dc, "my-org", "", "Bearer token");
      expect(result).toBe(true);
      expect(patchBody).toBeDefined();
      expect(patchBody.description).toBe("New updated description");
      expect(patchUrl).toContain("updateMask=description");
    });

    it("should export CustomReport creating it when it does not exist (404 -> POST)", async () => {
      let postBody: any = null;
      globalThis.fetch = (async (url: any, init?: any) => {
        const urlStr = String(url);
        const method = init?.method || "GET";

        if (urlStr.includes("/reports/new-report") && method === "GET") {
          return new Response(JSON.stringify({ error: { code: 404, message: "Not found" } }), {
            status: 404,
          });
        }
        if (urlStr.includes("/reports") && method === "POST") {
          postBody = JSON.parse(init.body);
          return new Response(JSON.stringify(postBody), { status: 201 });
        }
        return new Response("{}", { status: 200 });
      }) as any;

      const rep = converter.reportCreate("new-report", "New Report", [
        { name: "message_count", function: "sum" },
      ]);
      const result = await service.apigeeReportExport(rep, "my-org", "", "Bearer token");
      expect(result).toBe(true);
      expect(postBody).toBeDefined();
      expect(postBody.name).toBe("new-report");
      expect(postBody.metrics.length).toBe(1);
    });

    it("should export CustomReport updating it when it already exists (200 -> PUT)", async () => {
      let putBody: any = null;
      globalThis.fetch = (async (url: any, init?: any) => {
        const urlStr = String(url);
        const method = init?.method || "GET";

        if (urlStr.includes("/reports/existing-report") && method === "GET") {
          return new Response(
            JSON.stringify({
              name: "existing-report",
              displayName: "Old Report",
              metrics: [{ name: "message_count", function: "sum" }],
            }),
            { status: 200 },
          );
        }
        if (urlStr.includes("/reports/existing-report") && method === "PUT") {
          putBody = JSON.parse(init.body);
          return new Response(JSON.stringify(putBody), { status: 200 });
        }
        return new Response("{}", { status: 200 });
      }) as any;

      const rep = converter.reportCreate("existing-report", "Updated Report Title", [
        { name: "total_response_time", function: "avg" },
      ]);
      const result = await service.apigeeReportExport(rep, "my-org", "", "Bearer token");
      expect(result).toBe(true);
      expect(putBody).toBeDefined();
      expect(putBody.displayName).toBe("Updated Report Title");
      expect(putBody.metrics[0].name).toBe("total_response_time");
    });

    it("should delete DataCollector and CustomReport", async () => {
      const deletedUrls: string[] = [];
      globalThis.fetch = (async (url: any, init?: any) => {
        const urlStr = String(url);
        const method = init?.method || "GET";

        if (method === "DELETE") {
          deletedUrls.push(urlStr);
          return new Response("{}", { status: 200 });
        }
        return new Response("{}", { status: 200 });
      }) as any;

      const delDc = await service.apigeeDataCollectorDelete("dc_test", "my-org", "", "Bearer token");
      expect(delDc).toBe(true);
      expect(deletedUrls.some((u) => u.includes("/datacollectors/dc_test"))).toBe(true);

      const delRep = await service.apigeeReportDelete("my-report", "my-org", "", "Bearer token");
      expect(delRep).toBe(true);
      expect(deletedUrls.some((u) => u.includes("/reports/my-report"))).toBe(true);
    });
  });
});
