export class Template {
  name: string = "";
  description: string = "";
  features: string[] = [];
  endpoints: Endpoint[] = [];
  targets: Target[] = [];
}

export class Proxy {
  name: string = "";
  description: string = "";
  endpoints: ProxyEndpoint[] = [];
  targets: ProxyTarget[] = [];
  policies: Policy[] = [];
  resources: Resource[] = [];
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
    this.mode = mode;
    this.condition = condition;
  }
}

export class Step {
  name: string = "";
  condition?: string;
}

export class Target {
  name: string = "";
  url: string = "";
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
  description: string = "";
  parameters: Parameter[] = [];
  endpointFlows: Flow[] = [];
  targetFlows: Flow[] = [];

  // optional complete endpoints and targets
  endpoints: ProxyEndpoint[] = [];
  targets: ProxyTarget[] = [];

  policies: Policy[] = [];
  resources: Resource[] = [];
}

export class Parameter {
  name: string = "";
  description: string = "";
  examples: string[] = [];
  default: string = "";
}
