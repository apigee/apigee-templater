export class Proxy {
  endpoints: Endpoint[] = [];
  targets: Target[] = [];
  policies: Policy[] = [];
  resources: Resource[] = [];
}

export class Endpoint {
  name: string;
  path: string;
  requestPreFlow: Flow;
  requestConditionalFlows: Flow[] = [];
  requestPostFlow: Flow;
  responsePreFlow: Flow;
  responseConditionalFlows: Flow[] = [];
  responsePostFlow: Flow;
  postClientFlow: Flow;
  faultRules: Flow[] = [];
  defaultFaultRule: Flow;
  routes: Route[] = [];
}

export class Route {
  name: string;
  condition: string;
  target: string;
}

export class Flow {
  name: string;
  condition: string;
  steps: Step[] = [];

  constructor(name: string, condition: string = "") {
    this.name = name;
    this.condition = condition;
  }
}

export class Step {
  name: string;
  condition: string;
}

export class Target {
  name: string;
  requestPreFlow: Flow;
  requestConditionalFlows: Flow[] = [];
  requestPostFlow: Flow;
  responsePreFlow: Flow;
  responseConditionalFlows: Flow[] = [];
  responsePostFlow: Flow;
  faultRules: Flow[] = [];
  defaultFaultRule: Flow;
  url: string;
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
