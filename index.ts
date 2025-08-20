import express from "express";
import fs from "fs";
import { stringify } from "yaml";
import { ApigeeConverter } from "./lib/converter.ts";

const converter = new ApigeeConverter();
const app = express();
app.use(express.json());
app.use(
  express.raw({
    type: "application/octet-stream",
    limit: "10mb",
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
            res.send(stringify(result));
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
      // Apigee proxy json input, zip output
      converter.jsonToZip(tempFileName, req.body).then((result) => {
        let zipOutputFile = fs.readFileSync(result);
        res.setHeader("Content-Type", "application/octet-stream");
        res.send(zipOutputFile);
      });
      break;
  }
});

app.listen("8080", () => {
  console.log(`apigee-templater listening on port 8080`);
});
