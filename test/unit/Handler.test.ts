import { expect } from 'chai';
import { Handler } from '../../src';

describe('Handler Test',
  () => {
    it('should construct a Handler', () => {
      const handler = new Handler({ event: {}, context: { invokedFunctionArn: `` } });
      expect(handler).to.exist;
    });
  });
