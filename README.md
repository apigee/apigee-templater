# Apigee Templater
Provides tooling for the templating and automation of Apigee proxies using simplified inputs, for example through a JSON/YAML input file, a REST call, or a CLI.

Apigee proxies are ideal for templating since the bundles are composed of simple files & directories, which can be easily automated, even for complex use-cases. This tool helps do exactly that.

## Prerequisites

* [Node.js](https://nodejs.org/) installed
* If you want to deploy the generated proxies to Apigee directly from the CLI, then you will need:
  * [Apigee X](https://cloud.google.com/apigee/docs/api-platform/get-started/provisioning-intro) org and environment (either eval or production).
  * [gcloud CLI](https://cloud.google.com/sdk/gcloud) installed and set to your Apigee X project (`gcloud config set project PROJECT`) and authenticated with a default service account (`gcloud auth application-default login`)

## Install and run

You can use the CLI either by installing it globally on your system or with npx.

```sh
# Install globally
npm i -g apigee-templater

# Run with npx
npx apigee-templater
```
## Supported features
| Feature | Supported | Example |
| --- | --- | --- |
| API key | Yes | [Example input](https://github.com/apigee/apigee-templater/blob/main/module/test/data/input1.json), usage: `apigee-templater -f https://raw.githubusercontent.com/apigee/apigee-templater/main/module/test/data/input1.json` |
| Quota | Yes | [Example input](https://github.com/apigee/apigee-templater/blob/main/module/test/data/input1.json), usage: `apigee-templater -f https://raw.githubusercontent.com/apigee/apigee-templater/main/module/test/data/input1.json` |
| Spike Arrest | Yes | [Example input](https://github.com/apigee/apigee-templater/blob/main/module/test/data/input1.json), usage: `apigee-templater -f https://raw.githubusercontent.com/apigee/apigee-templater/main/module/test/data/input1.json` |
| OAuth | Yes | |
| AssignMessage | Yes | [Example input](https://github.com/apigee/apigee-templater/blob/main/module/test/data/input4.extensions.json), usage: `apigee-tempater -f https://raw.githubusercontent.com/apigee/apigee-templater/main/module/test/data/input4.extensions.json` |
| MessageLogging | Yes | [Example input](https://github.com/apigee/apigee-templater/blob/main/module/test/data/input6.postclient.json), usage: `apigee-tempater -f https://raw.githubusercontent.com/apigee/apigee-templater/main/module/test/data/input6.postclient.json` |
| ExtractVariables | Yes | [Example input](https://github.com/apigee/apigee-templater/blob/main/module/test/data/input4.extensions.json), usage: `apigee-tempater -f https://raw.githubusercontent.com/apigee/apigee-templater/main/module/test/data/input4.extensions.json` |
| Shared flows | Yes | [Example input](https://github.com/apigee/apigee-templater/blob/main/module/test/data/input3.sharedflow.json), usage: `apigee-templater -f https://raw.githubusercontent.com/apigee/apigee-templater/main/module/test/data/input3.sharedflow.json` |
| Conditional proxy flows | Yes | [Example input](https://github.com/apigee/apigee-templater/blob/main/module/test/data/input4.extensions.json), usage: `apigee-tempater -f https://raw.githubusercontent.com/apigee/apigee-templater/main/module/test/data/input4.extensions.json`|
| Conditional steps | Yes | [Example input](https://github.com/apigee/apigee-templater/blob/main/module/test/data/input4.extensions.json), usage: `apigee-tempater -f https://raw.githubusercontent.com/apigee/apigee-templater/main/module/test/data/input4.extensions.json` |
| Fault handling in endpoints & targets | Yes |[Example input](https://github.com/apigee/apigee-templater/blob/main/module/test/data/input6.postclient.json), usage: `apigee-tempater -f https://raw.githubusercontent.com/apigee/apigee-templater/main/module/test/data/input6.postclient.json` |
| Target Google authentication | Yes | [Example input](https://github.com/apigee/apigee-templater/blob/main/module/test/data/input5.cloudrun.json), example usage: `https://raw.githubusercontent.com/apigee/apigee-templater/main/module/test/data/input5.cloudrun.json` |
| Javascript policies & resource files | Yes | [Example input](https://github.com/apigee/apigee-templater/blob/main/module/test/data/input8.javascript.json), example usage: `https://raw.githubusercontent.com/apigee/apigee-templater/main/module/test/data/input8.javascript.json` | 
| Target load balancing | Yes | |
| Target conditional flows | No | |

The default templating engine used is the [Handlebars](https://handlebarsjs.com/) framework to build any type of proxy based on structured inputs.  And because the logic is contained in Javascript or Typescript plugins, logic can be added for any type of requirement.

You can also just create any type of policy automatically using JSON-XML mapping, see the [javascript example](https://raw.githubusercontent.com/apigee/apigee-templater/main/module/test/data/input8.javascript.json) to see how the JS policy is automatically mapped from the JSON input configuration to the XML policy (no plugin needed).

## Example usage
You can find examples of both proxy and shared flow generation in the `./module/tests` directory. The tests use both JSON and YAML to demonstrate configuration of proxies and shared flows.

### Basic CLI usage
This example creates a simple proxy to httpbin.org and deploys it to the `eval` environment in project apigee-test99.

```sh
apigee-templater -n HttpBinProxy -b /httpbin -t https://httpbin.org -d -e eval -p apigee-test99
```
Output:
```sh
# Proxy bundle generated and deployed to environment "eval"
> Proxy HttpBinProxy generated to ./HttpBinProxy.zip in 32 milliseconds.
> Proxy HttpBinProxy version 1 deployed to environment eval in 2258 milliseconds.
> Wait 2-3 minutes, then test here: https://eval-group.34-111-104-118.nip.io/httpbin
```
### Use a local or remote JSON file as input
```sh
#Generate a proxy based on the local input1.json file and deploy it to environment eval in project apigee-test99
apigee-templater -f ./module/test/data/input1.json -d -e eval -p apigee-test99
```
```sh
#Generate a proxy from a remote JSON file and deploy it to environment eval in project apigee-test99
apigee-templater -f https://raw.githubusercontent.com/apigee/apigee-templater/main/module/test/data/input1.json -d -e eval -p apigee-test99
```

### Create a proxy to a BigQuery table or query
This example uses the `-q` flag to create a proxy to a BigQuery query and deploy it to the `eval` environment in GCP project `apigee-test99`. Here a service account must be specified with the `-s` parameter that has the rights to access BigQuery and read from the dataset.

```sh
# Build and deploy a REST proxy to the BigQuery Austin bikesharing public dataset
apigee-templater -n BikeTrips-v1 -b /trips -q bigquery-public-data.austin_bikeshare.bikeshare_trips -d -e eval -p apigee-test99 -s serviceaccount@project.iam.gserviceaccount.com
```

Output:
```sh
# Proxy bundle was generated and deployed to environment "eval" with service identity
> Proxy BikeTrips-v1 generated to ./BikeTrips-v1.zip in 42 milliseconds.
> Proxy BikeTrips-v1 version 1 deployed to environment eval in 3267 milliseconds.
> Wait 2-3 minutes, then test here: https://eval-group.34-111-104-118.nip.io/trips
```
After waiting a few minutes, you can run **curl https://BASE_PATH/trips?pageSize=1** and get bike trip data returned, with URL parameters **pageSize**, **filter**, **orderBy** and **pageToken**.

```sh
{
  "trips": [
    {
      "trip_id": "9900289692",
      "subscriber_type": "Walk Up",
      "bikeid": "248",
      "start_time": "1.443820321E9",
      "start_station_id": "1006",
      "start_station_name": "Zilker Park West",
      "end_station_id": "1008",
      "end_station_name": "Nueces @ 3rd",
      "duration_minutes": "39"
    }
  ],
  "next_page_token": 2
}
```

### Use the CLI either in command or interactive mode

```sh
# Use the CLI in interactive mode to collect inputs
apigee-templater
> Welcome to apigee-template, use -h for more command line options. 
? What should the proxy be called? MyProxy
? Which base path should be used? /test
? Which backend target should be called? https://test.com
? Do you want to deploy the proxy to an Apigee X environment? No
> Proxy MyProxy generated to ./MyProxy.zip in 60 milliseconds.
```
```sh
# Show all commands
apigee-templater -h
```

All deployed proxies can then be viewed and managed in the [Apigee console](https://apigee.google.com), where you can check the status of the deployments, do tracing, and create API products based on these automated proxies.

## Examples
Here are example JSON input files to generate proxies with these different features, located in the `./module/test/data` directory.

| Example | Features tested  |
| --- | --- |
| [input1.json](./module/test/data/input1.json) | Basic configuration example of a proxy to httpbin.org. |
| [input2.json](./module/test/data/input2.json) | A different configuration format with some simple URL rewrites. |
| [input3.sharedflow.json](./module/test/data/input3.sharedflow.json) | Generates a shared flow. |
| [input4.extensions.json](./module/test/data/input4.extensions.json) | Generates a proxy with extensions, also with conditions. |
| [input5.cloudrun.json](./module/test/data/input5.cloudrun.json) | Generates a proxy to Cloud Run with a Google Id token. |
| [input6.postclient.json](./module/test/data/input6.postclient.json) | Generates a proxy to httpbin with a PostClientFlow to log a message to Cloud Logging in GCP
| [bigquery_query_input.json](./module/test/data/bigquery_query_input.json) | Generates a proxy to BigQuery data based on a query. |
| [bigquery_table_input.json](./module/test/data/bigquery_table_input.json) | Generates a proxy to a BigQuery query. |

You can easily test these input files by running the `apigee-templater-module` unit tests like this:

```bash
cd ./module
npm install
npm run test
# The proxies are generated in the ./module/test/proxies directory
```

## REST service and web client

![Web client screenshot](img/screen1.png)

A sample [REST service](/service) and [web client](/client) show how the Apigee Templater can be used to template and deploy proxies directly from users interacting in a client.

To build and run the service and web client locally:

```sh
# Build and copy the client outputs to the service 
./build_service.sh
# Run service
cd service
node dist
```
Then you can open the service locally at [http://localhost:8080](http://localhost:8080).

You can also build and deploy the service to [Cloud Run](https://cloud.google.com/run) by clicking here:

[![Run on Google Cloud](https://deploy.cloud.run/button.svg)](https://deploy.cloud.run)

### Usage with Typescript/Javascript
First install and import into your project.
```bash
npm install apigee-templater-module
```
Then use the generator module to build proxies.

```ts
import {ApigeeTemplateInput, ApigeeGenerator, proxyTypes, authTypes} from 'apigee-templater-module'

apigeeTemplater: ApigeeGenerator = new ApigeeGenerator(); // Optionally custom conversion plugins can be passed here, defaults are included.

let input: ApigeeTemplateInput = {
  name: "MyProxy",
  endpoints: [
    {
      name: "default",
      basePath: "/myproxy",
      target: {
        name: "default",
        url: "https://httpbin.org"
      },
      quotas: [
        {
          count: 200,
          timeUnit: "day"
        }
      ],
      auth: [
        {
          type: authTypes.apikey
        }
      ]
    }
  ]
}

apigeeGenerator.generateProxy(input, "./proxies").then((result) => {
  // Proxy bundle generated to ./proxies/MyProxy.zip
  console.log(`Proxy successfully generated to ${result.localPath}!`);
});

```
### Customization and extensions
You can customize apigee-templater by creating your own CLI class, and then settting / overriding with your own plugins. See [this repository](https://github.com/tyayers/apigee-templater-custom) for a detailed example, complete with a customized plugin and unit tests to test the changes.

## Contributing

See the [contributing instructions](./CONTRIBUTING.md) to get started.

## License

All solutions within this repository are provided under the
[Apache 2.0](https://www.apache.org/licenses/LICENSE-2.0) license.
Please see the [LICENSE](./LICENSE) file for more detailed terms and conditions.

## Disclaimer

This repository and its contents are not an official Google product.

