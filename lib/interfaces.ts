export class Proxy {
  endpoints: Endpoint[] = [];
  targets: Target[] = [];
  policies: Policy[] = [];
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
  steps: Step[];
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
  content: string = "";
}
