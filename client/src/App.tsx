import { Component, createSignal } from 'solid-js';

import { PolymerElement, html } from '@polymer/polymer';
import '@polymer/paper-toast/paper-toast.js';

import yaml from 'js-yaml'

import logo from './assets/api-logo.png';

const App: Component = () => {

  const [name, setName] = createSignal("");
  const [basePath, setBasePath] = createSignal("");
  const [target, setTarget] = createSignal("")
  const [spec, setSpec] = createSignal("")
  const [spikeArrest, setSpikeArrest] = createSignal(false)
  const [quota, setQuota] = createSignal(false)
  const [authApiKey, setAuthApiKey] = createSignal(false)
  const [authSharedFlow, setAuthSharedFlow] = createSignal(false)
  const [authSharedFlowAudience, setAuthSharedFlowAudience] = createSignal("")
  const [authSharedFlowRoles, setAuthSharedFlowRoles] = createSignal("")
  const [authSharedFlowIssuer1, setAuthSharedFlowIssuer1] = createSignal("")
  const [authSharedFlowIssuer2, setAuthSharedFlowIssuer2] = createSignal("")
  const [description, setDescription] = createSignal("")
  const [environment, setEnvironment] = createSignal("")

  const [toastMessage, setToastMessage] = createSignal("")

  function downloadProxyFile() {
    if (!name()) {
      showToast("Please enter at least a name for the API.");
      return;
    }

    var command = generateCommand();
    var serviceUrl = getServiceUrl() + "/file";

    fetch(serviceUrl,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(command)
      })
      .then(response => response.blob())
      .then(blob => {
        showToast("API file download successful!");
        var blobUrl = URL.createObjectURL(blob);
        var anchor = document.createElement("a");
        anchor.download = name() + ".zip";
        anchor.href = blobUrl;
        anchor.click();
      });
  }

  function deployProxy() {
    if (!name) {
      showToast("Please enter at least a name for the proxy.");
      return;
    }

    if (!environment) {
      showToast("Please enter an Apigee environment to deploy to.");
      return;
    }

    var command = generateCommand();
    var serviceUrl = getServiceUrl() + "/deployment/" + environment;

    fetch(serviceUrl,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(command)
      }
    )
      .then(response => {
        if (response.status == 200) {
          showToast("API deployment successful!");
        }
        else {
          showToast("API deployment failed, possibly the environment doesn't exist?")
        }
      });
  }

  function generateCommand() {
    var command: ApigeeTemplateInput = {
      name: name(),
      profile: "default",
      endpoints: [{
        name: "default",
        basePath: "/" + basePath(),
        target: {
          name: "default",
          url: "https://" + target()
        },
        quotas: [],
        auth: []
      }]
    }

    if (authApiKey()) {
      command.endpoints[0].auth = [];
      command.endpoints[0].auth.push({
        type: authTypes.apikey,
        parameters: {}
      });
    }
    if (authSharedFlow()) {
      if (!command.endpoints[0].auth || command.endpoints[0].auth.length == 0)
        command.endpoints[0].auth = [];

      command.endpoints[0].auth.push({
        type: authTypes.sharedflow,
        parameters: {
          audience: authSharedFlowAudience(),
          roles: authSharedFlowRoles(),
          issuerVer1: authSharedFlowIssuer1(),
          issuerVer2: authSharedFlowIssuer2()
        }
      });
    }

    if (spikeArrest())
      command.endpoints[0].spikeArrest = {
        rate: "20s"
      }

    if (quota())
      command.endpoints[0].quotas = [{
        count: 200,
        timeUnit: "day"
      }];

    return command;
  }

  function getServiceUrl() {
    var serviceUrl = "/apigeegen";
    //if (process.env.REACT_APP_SVC_BASE_URL) serviceUrl = process.env.REACT_APP_SVC_BASE_URL + serviceUrl;

    return serviceUrl;
  }

  function onFileChange(event: any) {
    const reader = new FileReader();

    reader.addEventListener("load", () => {
      // this will then display a text file
      if (reader.result != null) {
        let newSpec = reader.result.toString();
        setSpec(newSpec);
        const specObj: any = yaml.load(newSpec);

        if (specObj && specObj.servers && specObj.servers.length > 0)
          setTarget(specObj.servers[0].url.replace("http://", "").replace("https://", ""));

        if (specObj && specObj.info && specObj.info.title)
          setName(specObj.info.title.replace(/ /g, "-"))

        if (specObj && specObj.paths && Object.keys(specObj.paths).length > 0)
          setBasePath(Object.keys(specObj.paths)[0].replace("/", ""));
      }

    }, false);

    reader.readAsText(event.target.files[0]);
  }

  function showToast(message: string) {
    setToastMessage(message)
    // @ts-ignore
    document.getElementById("toast")?.open()
  }

  return (
    <div class="w-full p-4">
      <div class="-z-[01] absolute inset-0 bg-[url(assets/grid.svg)] bg-center [mask-image:linear-gradient(180deg,white,rgba(255,255,255,0))]"></div>

      <div class="w-full sm:mt-[100px] sm:mb-[150px] content-center justify-center">
        <div class="w-full sm:w-2/3 bg-gray-50 rounded-xl m-auto">
          <div class="border-2 border-gray-200 bg-white rounded-xl shadow-md px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div>
              <div class="lg:grid lg:grid-cols-3 lg:gap-6">
                <div class="lg:col-span-1">
                  <img class="w-56 pt-5 pr-5 mb-10 mt-10" alt="Logo" src={logo}></img>
                  <div class="px-4 sm:px-0">
                    <h3 class="text-lg font-medium leading-6 text-gray-900">Publish API</h3>
                    <p class="mt-1 text-sm text-gray-600">
                      Configure your API to be published to the API platform.
                    </p>
                  </div>
                </div>
                <div class="mt-5 lg:mt-0 lg:col-span-2">
                  <div >
                    <div class="shadow sm:rounded-md sm:overflow-hidden">
                      <div class="px-4 py-5 bg-white space-y-6 sm:p-6">

                        <div class="grid grid-cols-3 gap-6">
                          <div class="col-span-3">
                            <label htmlFor="api-name" class="block text-sm font-medium text-gray-700">
                              Name
                            </label>
                            <div class="mt-1 flex rounded-md shadow-sm">
                              <input
                                type="text"
                                name="api-name"
                                id="api-name"
                                class="focus:ring-indigo-500 focus:border-indigo-500 flex-1 block rounded-md sm:text-sm border-gray-300 border"
                                placeholder="Super-API"
                                value={name()}
                                onChange={(e) => setName(e.currentTarget.value.replace(/ /g, "-"))}
                              />
                            </div>
                            <p class="mt-2 text-sm text-gray-500">
                              Spaces will be replaced with dashes.
                            </p>
                          </div>
                        </div>

                        <div class="grid grid-cols-3 gap-6">
                          <div class="col-span-3">
                            <label htmlFor="api-path" class="block text-sm font-medium text-gray-700">
                              Base Path
                            </label>
                            <div class="mt-1 flex rounded-md shadow-sm">
                              <span class="inline-flex items-center px-3 rounded-l-md border border-r-0 border-gray-300 bg-gray-50 text-gray-500 text-sm">
                                https://api.company.com/
                              </span>
                              <input
                                type="text"
                                name="api-path"
                                id="api-path"
                                class="w-[100px] focus:ring-indigo-500 focus:border-indigo-500 flex-1 block rounded-none rounded-r-md sm:text-sm border-gray-300 border"
                                placeholder="super"
                                value={basePath()}
                                onChange={(e) => setBasePath(e.currentTarget.value)}
                              />
                            </div>
                            <p class="mt-2 text-sm text-gray-500">
                              The base path that your API will be offered on.
                            </p>
                          </div>
                        </div>

                        <div class="grid grid-cols-3 gap-6">
                          <div class="col-span-3">
                            <label htmlFor="company-website" class="block text-sm font-medium text-gray-700">
                              Target (Backend) URL
                            </label>
                            <div class="mt-1 flex rounded-md shadow-sm">
                              <span class="inline-flex items-center px-3 rounded-l-md border border-r-0 border-gray-300 bg-gray-50 text-gray-500 text-sm">
                                https://
                              </span>
                              <input
                                type="text"
                                name="company-website"
                                id="company-website"
                                class="focus:ring-indigo-500 focus:border-indigo-500 flex-1 block rounded-none rounded-r-md sm:text-sm border-gray-300 border"
                                placeholder="backend.a.run.app"
                                value={target()}
                                onChange={(e) => setTarget(e.currentTarget.value)}
                              />
                            </div>
                            <p class="mt-2 text-sm text-gray-500">
                              Target Cloud Function, Cloud Run, or GKE Ingress endpoint (overrides OpenAPI spec)
                            </p>
                          </div>
                        </div>

                        <div>
                          <label class="block text-sm font-medium text-gray-700">OpenAPI Spec v3</label>
                          <div class="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-md">
                            <div class="space-y-1 text-center">
                              <svg
                                class="mx-auto h-12 w-12 text                    <!-- centered card -->-gray-400"
                                stroke="currentColor"
                                fill="none"
                                viewBox="0 0 48 48"
                                aria-hidden="true"
                              >
                                <path
                                  d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                                  stroke-width={2}
                                  stroke-line-cap="round"
                                  stroke-line-join="round"
                                />
                              </svg>
                              <div class="flex text-sm text-gray-600">
                                <label
                                  htmlFor="file-upload"
                                  class="relative cursor-pointer bg-white rounded-md font-medium text-indigo-600 hover:text-indigo-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-indigo-500"
                                >
                                  <span>Upload a file</span>
                                  <input id="file-upload" onChange={onFileChange} name="file-upload" type="file" class="sr-only" />
                                </label>
                                <p class="pl-1">or drag and drop</p>
                              </div>
                              <p class="text-xs text-gray-500">YAML v3 up to 5MB</p>
                            </div>
                          </div>
                        </div>

                        <div>
                          <label htmlFor="about" class="block text-sm font-medium text-gray-700">
                            Description
                          </label>
                          <div class="mt-1">
                            <textarea
                              id="about"
                              name="about"
                              rows={3}
                              class="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 mt-1 block w-full sm:text-sm border border-gray-300 rounded-md"
                              placeholder="This amazing API will knock your socks off!"
                              default-value={description}
                              onChange={(e) => setDescription(e.currentTarget.value)}
                            />
                          </div>
                          <p class="mt-2 text-sm text-gray-500">
                            Brief description for your API. URLs are hyperlinked.
                          </p>
                        </div>

                        <div class="grid grid-cols-3 gap-6">
                          <div class="col-span-3">
                            <label htmlFor="api-name" class="block text-sm font-medium text-gray-700">
                              Environment
                            </label>
                            <div class="mt-1 flex rounded-md shadow-sm">
                              <input
                                type="text"
                                name="api-env"
                                id="api-env"
                                class="focus:ring-indigo-500 focus:border-indigo-500 flex-1 block rounded-md sm:text-sm border-gray-300 border"
                                placeholder="dev"
                                value={environment()}
                                onChange={(e) => setEnvironment(e.currentTarget.value)}
                              />
                            </div>
                            <p class="mt-2 text-sm text-gray-500">
                              The environment in case the API should be deployed.
                            </p>
                          </div>
                        </div>

                        <div class="col-span-6 sm:col-span-3">
                          <fieldset>
                            <legend class="block text-sm font-medium text-gray-700">Traffic Management</legend>
                            <div class="mt-4 space-y-4">
                              <div class="flex items-start">
                                <div class="flex items-center h-5">
                                  <input
                                    id="spikearrest"
                                    name="spikearrest"
                                    type="checkbox"
                                    class="focus:ring-indigo-500 h-4 w-4 text-indigo-600 border-gray-300 rounded"
                                    default-checked={spikeArrest}
                                    onChange={(e) => setSpikeArrest(e.currentTarget.checked)}
                                  />
                                </div>
                                <div class="ml-3 text-sm">
                                  <label htmlFor="apikey" class="font-medium text-gray-700">
                                    Spike Arrest
                                  </label>
                                  <p class="text-gray-500">Protect backends by limiting spikes to max 20 calls/s.</p>
                                </div>
                              </div>
                            </div>
                            <div class="mt-4 space-y-4">
                              <div class="flex items-start">
                                <div class="flex items-center h-5">
                                  <input
                                    id="quota"
                                    name="quota"
                                    type="checkbox"
                                    class="focus:ring-indigo-500 h-4 w-4 text-indigo-600 border-gray-300 rounded"
                                    default-checked={quota}
                                    onChange={(e) => setQuota(e.currentTarget.checked)}
                                  />
                                </div>
                                <div class="ml-3 text-sm">
                                  <label htmlFor="apikey" class="font-medium text-gray-700">
                                    Developer Quota
                                  </label>
                                  <p class="text-gray-500">Throttle developers to 200 calls per day at the base plan.</p>
                                </div>
                              </div>
                            </div>
                          </fieldset>
                        </div>

                        <div class="col-span-6 sm:col-span-3">
                          <fieldset>
                            <legend class="block text-sm font-medium text-gray-700">Authorization methods accepted</legend>
                            <div class="mt-4 space-y-4">
                              <div class="flex items-start">
                                <div class="flex items-center h-5">
                                  <input
                                    id="apikey"
                                    name="apikey"
                                    type="checkbox"
                                    class="focus:ring-indigo-500 h-4 w-4 text-indigo-600 border-gray-300 rounded"
                                    default-checked={authApiKey}
                                    onChange={(e) => setAuthApiKey(e.currentTarget.checked)}
                                  />
                                </div>
                                <div class="ml-3 text-sm">
                                  <label htmlFor="apikey" class="font-medium text-gray-700">
                                    API Key
                                  </label>
                                  <p class="text-gray-500">Developers can access this API with an API key.</p>
                                </div>
                              </div>
                              <div class="flex items-start">
                                <div class="flex items-center h-5">
                                  <input
                                    id="authsharedflow"
                                    name="authsharedflow"
                                    type="checkbox"
                                    class="focus:ring-indigo-500 h-4 w-4 text-indigo-600 border-gray-300 rounded"
                                    default-checked={authSharedFlow}
                                    onChange={(e) => setAuthSharedFlow(e.currentTarget.checked)}
                                  />
                                </div>
                                <div class="ml-3 text-sm">
                                  <label htmlFor="authsharedflow" class="font-medium text-gray-700">
                                    OAuth shared flow
                                  </label>
                                  <p class="text-gray-500">Access is granted with an OAuth shared flow.</p>
                                </div>
                              </div>

                              {authSharedFlow() &&
                                <div class="ml-10">
                                  <div class="grid grid-cols-3 gap-6">
                                    <div class="col-span-3">
                                      <label htmlFor="api-name" class="block text-sm font-medium text-gray-700">
                                        Audience
                                      </label>
                                      <div class="mt-1 flex rounded-md shadow-sm">
                                        <input
                                          type="text"
                                          name="api-aud"
                                          id="api-aud"
                                          class="focus:ring-indigo-500 focus:border-indigo-500 flex-1 block rounded-md sm:text-sm border-gray-300 border"
                                          placeholder=""
                                          value={authSharedFlowAudience()}
                                          onChange={(e) => setAuthSharedFlowAudience(e.currentTarget.value)}
                                        />
                                      </div>
                                      <p class="mt-2 text-sm text-gray-500">
                                        The audience to validate for in the JWT token.
                                      </p>
                                    </div>
                                  </div>
                                  <div class="mt-5 grid grid-cols-3 gap-6">
                                    <div class="col-span-3">
                                      <label htmlFor="api-name" class="block text-sm font-medium text-gray-700">
                                        Roles
                                      </label>
                                      <div class="mt-1 flex rounded-md shadow-sm">
                                        <input
                                          type="text"
                                          name="api-roles"
                                          id="api-roles"
                                          class="focus:ring-indigo-500 focus:border-indigo-500 flex-1 block rounded-md sm:text-sm border-gray-300 border"
                                          placeholder=""
                                          value={authSharedFlowRoles()}
                                          onChange={(e) => setAuthSharedFlowRoles(e.currentTarget.value)}
                                        />
                                      </div>
                                      <p class="mt-2 text-sm text-gray-500">
                                        The roles to check in the JWT token.
                                      </p>
                                    </div>
                                  </div>
                                  <div class="mt-5 grid grid-cols-3 gap-6">
                                    <div class="col-span-3">
                                      <label htmlFor="api-name" class="block text-sm font-medium text-gray-700">
                                        Issuer v1
                                      </label>
                                      <div class="mt-1 flex rounded-md shadow-sm">
                                        <input
                                          type="text"
                                          name="api-issuer1"
                                          id="api-issuer1"
                                          class="focus:ring-indigo-500 focus:border-indigo-500 flex-1 block rounded-md sm:text-sm border-gray-300 border"
                                          placeholder=""
                                          value={authSharedFlowIssuer1()}
                                          onChange={(e) => setAuthSharedFlowIssuer1(e.currentTarget.value)}
                                        />
                                      </div>
                                      <p class="mt-2 text-sm text-gray-500">
                                        The Issuer v1 to check in the JWT token.
                                      </p>
                                    </div>
                                  </div>
                                  <div class="mt-5 grid grid-cols-3 gap-6">
                                    <div class="col-span-3">
                                      <label htmlFor="api-name" class="block text-sm font-medium text-gray-700">
                                        Issuer v2
                                      </label>
                                      <div class="mt-1 flex rounded-md shadow-sm">
                                        <input
                                          type="text"
                                          name="api-issuer2"
                                          id="api-issuer2"
                                          class="focus:ring-indigo-500 focus:border-indigo-500 flex-1 block rounded-md sm:text-sm border-gray-300 border"
                                          placeholder=""
                                          value={authSharedFlowIssuer2()}
                                          onChange={(e) => setAuthSharedFlowIssuer2(e.currentTarget.value)}
                                        />
                                      </div>
                                      <p class="mt-2 text-sm text-gray-500">
                                        The Issuer v2 to check in the JWT token.
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              }
                            </div>
                          </fieldset>
                        </div>
                      </div>
                      <div class="px-4 py-3 bg-gray-50 text-right sm:px-6">
                        <button
                          type="submit"
                          onClick={() => downloadProxyFile()}
                          class="inline-flex justify-center mr-2 py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                        >
                          Download
                        </button>
                        <button
                          type="submit"
                          onClick={() => deployProxy()}
                          class="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                        >
                          Deploy
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* @ts-ignore */}
      <paper-toast id="toast" text={toastMessage()}></paper-toast>
    </div>
  );
};

export default App;

/** A proxy endpoint describes a basepath, targets and other proxy features */
export class proxyEndpoint {
  name = 'TestProxy';
  basePath = '/test';
  target: proxyTarget = {
    name: 'default',
    url: 'https://httpbin.org'
  };
  auth?: authConfig[];
  quotas?: quotaConfig[];
  spikeArrest?: spikeArrestConfig;
  parameters?: { [key: string]: string } = {};
}

/** Describes a proxy to be templated */
export class ApigeeTemplateInput {
  name = 'MyProxy';
  profile = 'default';
  endpoints: proxyEndpoint[] = [];
}

/** Authorization config for an endpoint */
export class authConfig {
  type: authTypes = authTypes.apikey;
  parameters: { [key: string]: string } = {};
}

/** Quota config for an endpoint */
export class quotaConfig {
  count = 5;
  timeUnit = 'minute';
  condition?: string;
}

/** Spike arrest config for an endpoint */
export class spikeArrestConfig {
  rate = '30s';
}

export enum authTypes {
  // eslint-disable-next-line no-unused-vars
  apikey = 'apikey',
  // eslint-disable-next-line no-unused-vars
  jwt = 'jwt',
  // eslint-disable-next-line no-unused-vars
  sharedflow = 'sharedflow'
}

export class proxyTarget {
  name = '';
  url = '';
}
