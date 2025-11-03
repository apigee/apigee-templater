export class Template {
  name: string = "";
  type: string = "template";
  description: string = "";
  features: string[] = [];
  parameters: Parameter[] = [];
  endpoints: Endpoint[] = [];
  targets: Target[] = [];
  tests?: Test[] = [];
}

export class Test {
  description?: string = "";
  proxy?: string = "";
  endpoint: string = "";
  headers?: string[] = [];
  request?: string = "";
  queryParams?: string[] = [];
  variables?: string[] = [];
  assertions: string[] = [];
}

export class Proxy {
  name: string = "";
  type: string = "proxy";
  priority?: number;
  description: string = "";
  parameters: Parameter[] = [];
  endpoints: ProxyEndpoint[] = [];
  targets: ProxyTarget[] = [];
  policies: Policy[] = [];
  resources: Resource[] = [];
  tests?: Test[] = [];
}

export class Endpoint {
  name: string = "";
  basePath: string = "";
  routes: Route[] = [];
}

export class ProxyEndpoint extends Endpoint {
  flows: Flow[] = [];
  postClientFlow?: Flow;
  faultRules?: Flow[] = [];
  defaultFaultRule?: Flow;
}

export class Route {
  name: string = "";
  condition?: string;
  target?: string;
}

export class Flow {
  name: string;
  mode?: string;
  condition?: string;
  steps: Step[] = [];

  constructor(name: string, mode: string = "", condition: string = "") {
    this.name = name;
    if (mode) this.mode = mode;
    if (condition) this.condition = condition;
  }
}

export class Step {
  name: string = "";
  condition?: string;
}

export class Target {
  name: string = "";
  url: string = "";
  auth?: string;
  scopes?: string[];
  aud?: string;
}

export class ProxyTarget extends Target {
  flows: Flow[] = [];
  faultRules?: Flow[] = [];
  defaultFaultRule?: Flow;
  httpTargetConnection?: any;
  localTargetConnection?: any;
}

export class Policy {
  name: string = "";
  type: string = "";
  content: any;
}

export class Resource {
  name: string = "";
  type: string = "";
  content: string = "";
}

export class Feature {
  name: string = "";
  type: string = "feature";
  description: string = "";
  priority?: number;
  features?: string[] = [];
  parameters: Parameter[] = [];
  endpointFlows: Flow[] = [];
  targetFlows: Flow[] = [];

  // optional complete endpoints and targets
  endpoints: ProxyEndpoint[] = [];
  targets: ProxyTarget[] = [];

  policies: Policy[] = [];
  resources: Resource[] = [];
  tests?: Test[] = [];
}

export class Parameter {
  name: string = "";
  displayName: string = "";
  description: string = "";
  examples: string[] = [];
  default: string = "";
}
