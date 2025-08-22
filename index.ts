import express, { response } from "express";
import fs from "fs";
import * as YAML from "yaml";
import { ApigeeConverter } from "./lib/converter.ts";
import { Proxy, ProxyFeature } from "./lib/interfaces.ts";

const converter = new ApigeeConverter();
const app = express();
app.use(
  express.json({
    type: "application/json",
    limit: "2mb",
  }),
);
app.use(
  express.raw({
    type: "application/octet-stream",
    limit: "20mb",
  }),
);
app.use(
  express.text({
    type: "application/yaml",
    limit: "2mb",
  }),
);

app.post("/apigee-templater/convert", (req, res) => {
  if (!req.body) {
    return res.status(400).send("No data received.");
  }

  let requestType = req.header("Content-Type");
  let responseType = req.header("Accept");

  let tempFileName = Math.random().toString(36).slice(2);
  switch (requestType) {
    case "application/octet-stream":
      // Apigee proxy zip input, json output
      fs.mkdirSync("./data", { recursive: true });
      let tempFilePath = "./data/" + tempFileName + ".zip";
      fs.writeFileSync(tempFilePath, req.body);

      converter
        .zipToJson(tempFileName, tempFilePath)
        .then((result) => {
          fs.rmSync(tempFilePath);
          if (responseType == "application/yaml") {
            res.setHeader("Content-Type", "application/yaml");
            res.send(YAML.stringify(result));
          } else {
            res.setHeader("Content-Type", "application/json");
            res.send(JSON.stringify(result, null, 2));
          }
        })
        .catch((error) => {
          res.status(500).send(error.message);
        });
      break;
    case "application/json":
      // Apigee proxy json input, yaml or zip output
      if (responseType == "application/yaml") {
        res.setHeader("Content-Type", "application/yaml");
        res.send(YAML.stringify(req.body));
      } else {
        converter.jsonToZip(tempFileName, req.body).then((result) => {
          let zipOutputFile = fs.readFileSync(result);
          res.setHeader("Content-Type", "application/octet-stream");
          res.send(zipOutputFile);
        });
      }
      break;
    case "application/yaml":
      // Apigee proxy yaml input, json or zip output
      if (responseType == "application/json") {
        res.setHeader("Content-Type", "application/json");
        res.json(YAML.parse(req.body));
      } else {
        converter
          .jsonToZip(tempFileName, YAML.parse(req.body))
          .then((result) => {
            let zipOutputFile = fs.readFileSync(result);
            res.setHeader("Content-Type", "application/octet-stream");
            res.send(zipOutputFile);
          });
      }
      break;
  }
});

app.post("/apigee-templater/apply-feature", async (req, res) => {
  if (!req.body) {
    return res.status(400).send("No data received.");
  }

  let requestType = req.header("Content-Type");
  let responseType = req.header("Accept");

  if (
    (requestType == "*/*" || requestType == "application/json") &&
    (responseType == "*/*" || responseType == "application/json")
  ) {
    let proxy: Proxy = req.body["proxy"];
    let feature: ProxyFeature = req.body["feature"];
    proxy = await converter.jsonApplyFeature(proxy, feature);
    res.json(proxy);
  } else {
    res.status(501).send("Not yet implemented");
  }
});

app.post("/apigee-templater/remove-feature", (req, res) => {});

app.listen("8080", () => {
  console.log(`apigee-templater listening on port 8080`);
});
