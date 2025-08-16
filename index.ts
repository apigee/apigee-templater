import express from "express";
import yauzl from "yauzl";
import fs from "fs";
import path from "path";
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

app.get("/hello", async (req, res) => {
  res.send("Hello World!");
});

app.post("/apigee-to-oapi", (req, res) => {
  if (!req.body) {
    return res.status(400).send("No binary data received.");
  }

  let tempFileName = Math.random().toString(36).slice(2);
  let tempFilePath = "./data/" + tempFileName + ".zip";

  fs.writeFileSync(tempFilePath, req.body);

  converter
    .apigeeToOapi(tempFileName, tempFilePath)
    .then((result) => {
      fs.rmSync(tempFilePath);
      res.send(result);
    })
    .catch((error) => {
      res.status(500).send(error.message);
    });
});

app.listen("8080", () => {
  console.log(`apigee-templater listening on port 8080`);
});
