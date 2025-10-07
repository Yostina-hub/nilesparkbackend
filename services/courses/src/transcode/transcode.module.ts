import { Module } from '@nestjs/common';
import { TranscodeService } from './transcode.service';
import { TranscodeProcessor } from './transcode.processor';
import { MinioClientModule } from '../minio/minio.module';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bull';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [
    MinioClientModule,
    ConfigModule,
    PrismaModule, // Add PrismaModule to provide PrismaService
    BullModule.registerQueue({
      name: 'transcode-queue',
      redis: {
        host: process.env.REDIS_HOST || 'redis',
        port: parseInt(process.env.REDIS_PORT || '6379'),
      },
    }),
  ],
  providers: [TranscodeService, TranscodeProcessor],
  exports: [TranscodeService],
})
export class TranscodeModule {}
