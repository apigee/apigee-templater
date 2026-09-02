export class Template {
  constructor() {
    this.gateway = "apigee";
    this.schemaVersion = "1.0.0";
  }
  name: string = "";
  type: string = "template";
  gateway: string = "apigee";
  schemaVersion: string = "1.0.0"
  priority?: number;
  description: string = "";
  features: string[] = [];
  parameters: Parameter[] = [];
  endpoints: Endpoint[] = [];
  targets: Target[] = [];
  products?: string[] = [];
  users?: string[] = [];
  tests?: Test[] = [];
}

export class TemplateFeatureRef {
  name: string = "";
  id: string = "";
}

export class Test {
  name: string = "";
  description?: string = "";
  url: string = "";
  path?: string = "";
  method?: string = "";
  headers?: string[] = [];
  request?: string = "";
  queryParams?: string[] = [];
  variables?: string[] = [];
  assertions: string[] = [];
}

export class Proxy {
  constructor() {
    this.gateway = "apigee";
    this.schemaVersion = "1.0.0";
  }
  name: string = "";
  displayName?: string = "";
  uid?: string;
  type: string = "proxy";
  gateway: string = "apigee";
  schemaVersion: string = "1.0.0"
  priority?: number;
  categories?: string[] = [];
  description: string = "";
  documentation?: string = "";
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
  defaultFaultRule?: FaultRule;
}

export class Route {
  name: string = "";
  condition?: string;
  target?: string;
}

export class Flow {
  name: string;
  mode?: string;
  position?: string;
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

export class FaultRule extends Flow {
  alwaysEnforce: boolean = false;
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
  defaultFaultRule?: FaultRule;
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
  constructor() {
    this.gateway = "apigee";
    this.schemaVersion = "1.0.0";
  }
  name: string = "";
  displayName?: string = "";
  uid?: string;
  type: string = "feature";
  description: string = "";
  documentation?: string = "";
  gateway: string = "apigee";
  schemaVersion: string = "1.0.0"
  priority?: number;
  categories?: string[] = [];
  parameters: Parameter[] = [];
  defaultEndpoint?: ProxyEndpoint;
  defaultTarget?: ProxyTarget;
  endpoints: ProxyEndpoint[] = [];
  targets: ProxyTarget[] = [];
  policies: Policy[] = [];
  resources: Resource[] = [];
  tests?: Test[] = [];
}

export class Parameter {
  name: string = "";
  paths?: string[] = [];
  displayName: string = "";
  description: string = "";
  maps: { [key: string]: string } = {};
  examples: string[] = [];
  default: string = "";
}

export class ApigeeConfig {
  org?: any;
  environments?: any;
  environmentGroups?: any;
}

export class ProductAttribute {
  name: string = "";
  value: string = "";
}

export class ProductQuota {
  limit?: string;
  interval?: string;
  timeUnit?: string;
}

export class ProductOperation {
  resource: string = "";
  methods: string[] = [];
}

export class ProductOperationConfig {
  apiSource: string = "";
  operations?: ProductOperation[] = [];
  quota?: ProductQuota;
  attributes?: ProductAttribute[] = [];
  resource?: string;
  methods?: string[];
}

export class ProductLlmOperation {
  path: string = "";
  methods?: string[] = [];
  models?: string[] = [];
}

export class ProductLlmOperationConfig {
  apiSource: string = "";
  llmOperations?: ProductLlmOperation[] = [];
  llmTokenQuota?: ProductQuota;
  tokenQuota?: ProductQuota;
  path?: string;
  methods?: string[];
  models?: string[];
}

export class ProductPayloadOperation {
  name?: string;
  operation?: string;
  methods?: string[];
  quota?: ProductQuota;
  attributes?: ProductAttribute[];
}

export class ProductPayloadOperationConfig {
  apiSource: string = "";
  protocol?: string = "MCP";
  operations?: (ProductPayloadOperation | string)[] = [];
  quota?: ProductQuota;
  attributes?: ProductAttribute[];
}

export class ProductGraphqlOperation {
  operation?: string;
  operationTypes?: string[];
}

export class ProductGraphqlOperationConfig {
  apiSource: string = "";
  operations?: ProductGraphqlOperation[] = [];
  quota?: ProductQuota;
}

export class ProductGrpcOperation {
  service?: string;
  methods?: string[];
}

export class ProductGrpcOperationConfig {
  apiSource: string = "";
  operations?: ProductGrpcOperation[] = [];
  quota?: ProductQuota;
}

export class Product {
  constructor() {
    this.gateway = "apigee";
    this.schemaVersion = "1.0.0";
  }
  name: string = "";
  displayName?: string = "";
  uid?: string;
  type: string = "product";
  gateway: string = "apigee";
  schemaVersion: string = "1.0.0";
  priority?: number;
  description: string = "";
  approvalType?: string = "auto";
  attributes?: ProductAttribute[] = [];
  environments?: string[] = [];
  proxies?: string[] = [];
  apiResources?: string[] = [];
  quota?: string;
  quotaInterval?: string;
  quotaTimeUnit?: string;
  scopes?: string[] = [];
  operations?: ProductOperationConfig[] = [];
  llmOperations?: ProductLlmOperationConfig[] = [];
  payloadOperations?: ProductPayloadOperationConfig[] = [];
  graphqlOperations?: ProductGraphqlOperationConfig[] = [];
  grpcOperations?: ProductGrpcOperationConfig[] = [];
}

export class Products extends Product {}

export class UserAttribute {
  name: string = "";
  value: string = "";
}

export class UserCredential {
  consumerKey?: string = "";
  consumerSecret?: string = "";
  key?: string;
  secret?: string;
  status?: string = "approved";
  expiresAt?: string;
  issuedAt?: string;
  apiProducts?: string[] = [];
  products?: string[] = [];
  scopes?: string[] = [];
  attributes?: UserAttribute[] = [];
}

export class UserApp {
  name: string = "";
  displayName?: string = "";
  description?: string = "";
  callbackUrl?: string = "";
  status?: string = "approved";
  keyExpiresIn?: string;
  apiProducts?: string[] = [];
  products?: string[] = [];
  scopes?: string[] = [];
  attributes?: UserAttribute[] = [];
  credentials?: UserCredential[] = [];
  keys?: UserCredential[] = [];
}

export class User {
  constructor() {
    this.gateway = "apigee";
    this.schemaVersion = "1.0.0";
  }
  name: string = "";
  displayName?: string = "";
  uid?: string;
  type: string = "user";
  gateway: string = "apigee";
  schemaVersion: string = "1.0.0";
  priority?: number;
  email: string = "";
  firstName?: string = "";
  lastName?: string = "";
  userName?: string = "";
  status?: string = "active";
  attributes?: UserAttribute[] = [];
  apps?: UserApp[] = [];
}

export class Users extends User {}

