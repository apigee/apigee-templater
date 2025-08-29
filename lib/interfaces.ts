export class Proxy {
  name: string = "";
  displayName?: string = "";
  description?: string = "";
  features: string[] = [];
  endpoints: Endpoint[] = [];
  targets: Target[] = [];
  policies: Policy[] = [];
  resources: Resource[] = [];
}

export class Endpoint {
  name: string;
  path: string;
  flows: Flow[] = [];
  postClientFlow?: Flow;
  faultRules?: Flow[] = [];
  defaultFaultRule?: Flow;
  routes: Route[] = [];
}

export class Route {
  name: string;
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
  name: string;
  condition: string;
}

export class Target {
  name: string;
  flows: Flow[] = [];
  faultRules?: Flow[] = [];
  defaultFaultRule?: Flow;
  url: string;
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
  policies: Policy[] = [];
  resources: Resource[] = [];
}

export class Parameter {
  name: string = "";
  description: string = "";
  examples: string[] = [];
  default: string = "";
}
