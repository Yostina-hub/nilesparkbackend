import { Module } from '@nestjs/common';
import { MinioClientService } from './minio.service';
import { ConfigService } from '@nestjs/config';

@Module({
  providers: [MinioClientService, ConfigService],
  exports: [MinioClientService],
})
export class MinioClientModule {}
