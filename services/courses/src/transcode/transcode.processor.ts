import { Process, Processor } from '@nestjs/bull';
import type { Job } from 'bull';
import { TranscodeService } from './transcode.service';

@Processor('transcode-queue')
export class TranscodeProcessor {
  constructor(private transcodeService: TranscodeService) {}

  @Process('transcode')
  async handleTranscode(job: Job) {
    await this.transcodeService.processTranscodeVideo(job.data);
  }
}
