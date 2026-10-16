import { Test } from '@nestjs/testing';
import { TerminusModule } from '@nestjs/terminus';
import { TypeOrmModule } from '@nestjs/typeorm';

import { HealthController } from './health.controller';

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [TerminusModule],
      controllers: [HealthController],
    }).compile();

    controller = moduleRef.get(HealthController);
  });

  describe('live()', () => {
    it('should return status ok', () => {
      const result = controller.live();
      expect(result.status).toBe('ok');
      expect(result.timestamp).toBeDefined();
    });
  });
});
