import { Test, TestingModule } from '@nestjs/testing';
import { TranscodeController } from './transcode.controller';

describe('TranscodeController', () => {
  let controller: TranscodeController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TranscodeController],
    }).compile();

    controller = module.get<TranscodeController>(TranscodeController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
