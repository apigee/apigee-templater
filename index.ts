import express from "express";
import * as xmljs from "xml-js";
import yazl from "yazl";
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

app.post("/oapi-to-apigee", (req, res) => {
  if (!req.body) {
    return res.status(400).send("No data received.");
  }

  var zipfile = new yazl.ZipFile();
  let tempFileName = Math.random().toString(36).slice(2);
  let tempFilePath = "./data/" + tempFileName;

  fs.mkdirSync(tempFilePath, { recursive: true });

  // endpoints
  for (let endpoint of req.body["endpoints"]) {
    let endpointXml = {
      ProxyEndpoint: {
        _attributes: {
          name: endpoint["name"],
        },
        HTTPProxyConnection: {
          BasePath: {
            _text: endpoint["path"],
          },
        },
      },
    };

    // request preflow
    if (endpoint["requestPreFlow"]) {
      endpointXml["ProxyEndpoint"]["PreFlow"] = {
        _attributes: {
          name: "PreFlow",
        },
        Request: {},
      };
      if (endpoint["requestPreFlow"]["steps"].length > 1) {
        endpointXml["ProxyEndpoint"]["PreFlow"]["Request"]["Step"] = [];
        for (let step of endpoint["requestPreFlow"]["steps"]) {
          let newStep = {
            Name: {
              _text: step["name"],
            },
          };
          if (step["condition"]) {
            newStep["Condition"] = {
              _text: step["condition"],
            };
          }
          endpointXml["ProxyEndpoint"]["PreFlow"]["Request"]["Step"].push(
            newStep,
          );
        }
      } else {
        endpointXml["ProxyEndpoint"]["PreFlow"]["Request"] = {
          Step: {
            Name: {
              _text: endpoint["requestPreFlow"]["steps"][0]["name"],
            },
          },
        };
        if (endpoint["requestPreFlow"]["steps"][0]["condition"]) {
          endpointXml["ProxyEndpoint"]["PreFlow"]["Request"]["Step"][
            "Condition"
          ] = {
            _text: endpoint["requestPreFlow"]["steps"][0]["condition"],
          };
        }
      }
    }

    // routes
    if (endpoint["routes"].length) {
      endpointXml["ProxyEndpoint"]["RouteRule"] = [];
      for (let route of endpoint["routes"]) {
        let newRouteRule = {
          _attributes: {
            name: route["name"],
          },
          TargetEndpoint: {
            _text: route["target"],
          },
        };
        if (route["condition"]) {
          newRouteRule["Condition"] = {
            _text: route["condition"],
          };
        }
        endpointXml["ProxyEndpoint"]["RouteRule"].push(newRouteRule);
      }
    } else {
      endpointXml["ProxyEndpoint"]["RouteRule"] = {
        _attributes: {
          name: endpoint["routes"][0]["name"],
        },
        TargetEndpoint: {
          _text: endpoint["routes"][0]["target"],
        },
      };
      if (endpoint["routes"][0]["condition"]) {
        endpointXml["ProxyEndpoint"]["RouteRule"]["Condition"] = {
          _text: endpoint["routes"][0]["condition"],
        };
      }
    }

    fs.mkdirSync(tempFilePath + "/apiproxy/proxies", { recursive: true });
    let xmlString = xmljs.json2xml(JSON.stringify(endpointXml), {
      compact: true,
      spaces: 2,
    });
    fs.writeFileSync(
      tempFilePath + "/apiproxy/proxies/" + endpoint["name"] + ".xml",
      xmlString,
    );
    zipfile.addFile(
      tempFilePath + "/apiproxy/proxies/" + endpoint["name"] + ".xml",
      "apiproxy/proxies/" + endpoint["name"] + ".xml",
    );
  }

  // targets
  for (let target of req.body["targets"]) {
    let targetXml = {
      TargetEndpoint: {
        _attributes: {
          name: target["name"],
        },
        HTTPTargetConnection: {
          URL: {
            _text: target["url"],
          },
        },
      },
    };

    fs.mkdirSync(tempFilePath + "/apiproxy/targets", { recursive: true });
    let xmlString = xmljs.json2xml(JSON.stringify(targetXml), {
      compact: true,
      spaces: 2,
    });
    fs.writeFileSync(
      tempFilePath + "/apiproxy/targets/" + target["name"] + ".xml",
      xmlString,
    );
    zipfile.addFile(
      tempFilePath + "/apiproxy/targets/" + target["name"] + ".xml",
      "apiproxy/targets/" + target["name"] + ".xml",
    );
  }

  // policies
  for (let policy of req.body["policies"]) {
    fs.mkdirSync(tempFilePath + "/apiproxy/policies", { recursive: true });
    let xmlString = xmljs.json2xml(JSON.stringify(policy["content"]), {
      compact: true,
      spaces: 2,
    });
    fs.writeFileSync(
      tempFilePath + "/apiproxy/policies/" + policy["name"] + ".xml",
      xmlString,
    );
    zipfile.addFile(
      tempFilePath + "/apiproxy/policies/" + policy["name"] + ".xml",
      "apiproxy/policies/" + policy["name"] + ".xml",
    );
  }

  zipfile.outputStream
    .pipe(fs.createWriteStream(tempFilePath + ".zip"))
    .on("close", function () {
      console.log("zip file done.");
    });
  zipfile.end();
  res.send("OK");
});

app.listen("8080", () => {
  console.log(`apigee-templater listening on port 8080`);
});
