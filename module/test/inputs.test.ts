/**
 * Copyright 2022 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { ApigeeTemplater, SpecType, authTypes } from '../src'
import fs from 'fs';
import { expect } from 'chai';
import { describe } from 'mocha';

const apigeeGenerator = new ApigeeTemplater();

describe('Generate simple normal JSON 1 proxy', () => {
  return it('should produce a valid proxy bundle', () => {
    const input = fs.readFileSync('./test/data/input1.json', 'utf-8')
    return apigeeGenerator.generateProxyFromString(input, 'test/output').then((response) => {
      expect(response.success).to.equal(true);
      expect(response.duration).to.greaterThan(0);
      expect(fs.existsSync(response.localPath)).to.equal(true);
    });
  });
});

describe('Generate custom JSON 2 proxy', () => {
  return it('should produce a valid proxy bundle', () => {
    const input = fs.readFileSync('./test/data/input2.json', 'utf-8')
    return apigeeGenerator.generateProxyFromString(input, 'test/output').then((response) => {
      expect(response.success).to.equal(true);
      expect(response.duration).to.greaterThan(0);
      expect(fs.existsSync(response.localPath)).to.equal(true);
    })
  })
});

describe('Generate simple JSON 3 shared flow', () => {
  return it('should produce a valid sharedflow bundle', () => {
    const input = fs.readFileSync('./test/data/input3.sharedflow.json', 'utf-8')
    return apigeeGenerator.generateProxyFromString(input, 'test/output').then((response) => {
      expect(response.success).to.equal(true);
      expect(response.duration).to.greaterThan(0);
      expect(fs.existsSync(response.localPath)).to.equal(true);
    });
  });
});

describe('Generate JSON proxy with extension steps', () => {
  return it('should produce a valid proxy bundle', () => {
    const input = fs.readFileSync('./test/data/input4.extensions.json', 'utf-8')
    return apigeeGenerator.generateProxyFromString(input, 'test/output').then((response) => {
      expect(response.success).to.equal(true);
      expect(response.duration).to.greaterThan(0);
      expect(fs.existsSync(response.localPath)).to.equal(true);
    });
  });
});

describe('Generate JSON proxy to Cloud Run with authenticaion', () => {
  return it('should produce a valid proxy bundle', () => {
    const input = fs.readFileSync('./test/data/input5.cloudrun.json', 'utf-8')
    return apigeeGenerator.generateProxyFromString(input, 'test/output').then((response) => {
      expect(response.success).to.equal(true);
      expect(response.duration).to.greaterThan(0);
      expect(fs.existsSync(response.localPath)).to.equal(true);
    })
  })
});

describe('Generate JSON proxy with PostClient message logging policy', () => {
  return it('should produce a valid proxy bundle', () => {
    const input = fs.readFileSync('./test/data/input6.postclient.json', 'utf-8')
    return apigeeGenerator.generateProxyFromString(input, 'test/output').then((response) => {
      expect(response.success).to.equal(true);
      expect(response.duration).to.greaterThan(0);
      expect(fs.existsSync(response.localPath)).to.equal(true);
    })
  })
});

describe('Generate JSON proxy with TargetFault message logging policy', () => {
  return it('should produce a valid proxy bundle', () => {
    const input = fs.readFileSync('./test/data/input7.fault.json', 'utf-8')
    return apigeeGenerator.generateProxyFromString(input, 'test/output').then((response) => {
      expect(response.success).to.equal(true);
      expect(response.duration).to.greaterThan(0);
      expect(fs.existsSync(response.localPath)).to.equal(true);
    })
  })
});

describe('Generate JSON proxy with a javascript policy using the AnyPolicy', () => {
  return it('should produce a valid proxy bundle', () => {
    const input = fs.readFileSync('./test/data/input8.javascript.json', 'utf-8')
    return apigeeGenerator.generateProxyFromString(input, 'test/output').then((response) => {
      expect(response.success).to.equal(true);
      expect(response.duration).to.greaterThan(0);
      expect(fs.existsSync(response.localPath)).to.equal(true);
    })
  })
});

describe('Generate BigQuery query proxy bundle', () => {
  return it('should produce a valid proxy bundle', () => {
    const input = fs.readFileSync('./test/data/bigquery_query_input.json', 'utf-8')
    return apigeeGenerator.generateProxyFromString(input, 'test/output').then((response) => {
      expect(response.success).to.equal(true);
      expect(response.duration).to.greaterThan(0);
      expect(fs.existsSync(response.localPath)).to.equal(true);
    })
  })
});

describe('Generate BigQuery table proxy bundle', () => {
  return it('should produce a valid proxy bundle', () => {
    const input = fs.readFileSync('./test/data/bigquery_table_input.json', 'utf-8')
    return apigeeGenerator.generateProxyFromString(input, 'test/output').then((response) => {
      expect(response.success).to.equal(true);
      expect(response.duration).to.greaterThan(0);
      expect(fs.existsSync(response.localPath)).to.equal(true);
    })
  })
});

describe('Generate BigQuery v2 proxy bundle', () => {
  return it('should produce a valid proxy bundle', () => {
    const input = fs.readFileSync('./test/data/bigquery_v2.json', 'utf-8')
    return apigeeGenerator.generateProxyFromString(input, 'test/output').then((response) => {
      expect(response.success).to.equal(true);
      expect(response.duration).to.greaterThan(0);
      expect(fs.existsSync(response.localPath)).to.equal(true);
    })
  })
});

describe('Generate OpenAPI v3 proxy', () => {
  return it('should produce a valid proxy bundle', () => {
    const input = fs.readFileSync('./test/data/petstore.yaml', 'utf-8')
    return apigeeGenerator.generateProxyFromString(input, 'test/output').then((response) => {
      expect(response.success).to.equal(true);
      expect(response.duration).to.greaterThan(0);
      expect(fs.existsSync(response.localPath)).to.equal(true);
    })
  })
});

describe('Generate OpenAPI v3 spec from data payload', () => {
  return it('should produce a valid OpenAPI spec', () => {
    const input = fs.readFileSync('./test/data/data_payload1.json', 'utf-8')
    return apigeeGenerator.generateSpec(input, SpecType.Data, ["https://example.com"], authTypes.apiKey, true, true).then((result) => {
      fs.writeFileSync('test/output/data_spec.yaml', result);
      expect(result).to.not.equal("");
    })
  })
});