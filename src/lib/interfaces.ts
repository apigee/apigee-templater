export class Template {
  constructor() {
    this.gateway = "apigee";
    this.schemaVersion = "1.0.0";
  }
  name: string = "";
  yamlName?: string;
  type: string = "template";
  gateway: string = "apigee";
  schemaVersion: string = "1.0.0"
  priority?: number;
  description: string = "";
  features: string[] = [];
  parameters: Parameter[] = [];
  endpoints: Endpoint[] = [];
  targets: Target[] = [];
  products?: (string | Product)[] = [];
  users?: (string | User)[] = [];
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
  yamlName?: string;
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
  apiSource?: string;
  name?: string;
  resource?: string;
  methods?: string[] = [];
  quota?: ProductQuota;
  attributes?: ProductAttribute[] = [];
}

export class ProductOperationConfig {
  apiSource: string = "";
  operations?: ProductOperation[] = [];
  quota?: ProductQuota;
  attributes?: ProductAttribute[] = [];
  name?: string;
  resource?: string;
  methods?: string[];
}

export class ProductLlmOperation {
  apiSource?: string;
  name?: string;
  path?: string;
  resource?: string;
  methods?: string[] = [];
  model?: string;
  models?: string[] = [];
  quota?: ProductQuota;
  llmTokenQuota?: ProductQuota;
  tokenQuota?: ProductQuota;
  attributes?: ProductAttribute[] = [];
}

export class ProductLlmOperationConfig {
  apiSource: string = "";
  operations?: ProductLlmOperation[] = [];
  llmOperations?: ProductLlmOperation[] = [];
  llmTokenQuota?: ProductQuota;
  tokenQuota?: ProductQuota;
  quota?: ProductQuota;
  name?: string;
  path?: string;
  resource?: string;
  methods?: string[];
  model?: string;
  models?: string[];
  attributes?: ProductAttribute[] = [];
}

export class ProductPayloadOperation {
  apiSource?: string;
  protocol?: string = "MCP";
  name?: string;
  operation?: string;
  methods?: string[];
  quota?: ProductQuota;
  attributes?: ProductAttribute[];
}

export class ProductPayloadOperationConfig {
  apiSource: string = "";
  protocol?: string = "MCP";
  name?: string;
  operation?: string;
  operations?: (ProductPayloadOperation | string)[] = [];
  quota?: ProductQuota;
  attributes?: ProductAttribute[];
}

export class ProductGraphqlOperation {
  apiSource?: string;
  operation?: string;
  operationTypes?: string[];
  quota?: ProductQuota;
  attributes?: ProductAttribute[];
}

export class ProductGraphqlOperationConfig {
  apiSource: string = "";
  operation?: string;
  operationTypes?: string[];
  operations?: ProductGraphqlOperation[] = [];
  quota?: ProductQuota;
  attributes?: ProductAttribute[];
}

export class ProductGrpcOperation {
  apiSource?: string;
  service?: string;
  methods?: string[];
  quota?: ProductQuota;
  attributes?: ProductAttribute[];
}

export class ProductGrpcOperationConfig {
  apiSource: string = "";
  service?: string;
  methods?: string[];
  operations?: ProductGrpcOperation[] = [];
  quota?: ProductQuota;
  attributes?: ProductAttribute[];
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
  access?: "public" | "private" | "internal" | string = "public";
  approvalType?: "auto" | "manual" | string = "auto";
  attributes?: ProductAttribute[] = [];
  environments?: string[] = [];
  proxies?: string[] = [];
  apiResources?: string[] = [];
  quota?: string;
  quotaInterval?: string;
  quotaTimeUnit?: string;
  scopes?: string[] = [];
  operations?: (ProductOperationConfig | ProductOperation)[] = [];
  llmOperations?: (ProductLlmOperationConfig | ProductLlmOperation)[] = [];
  payloadOperations?: (ProductPayloadOperationConfig | ProductPayloadOperation)[] = [];
  graphqlOperations?: (ProductGraphqlOperationConfig | ProductGraphqlOperation)[] = [];
  grpcOperations?: (ProductGrpcOperationConfig | ProductGrpcOperation)[] = [];
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

