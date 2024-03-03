// This is just for debugging, since debugging typescript tests with mocha isn't working for me yet.

import { ApigeeTemplater } from '../dist/src/index.js';
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