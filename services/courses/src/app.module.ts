import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CoursesModule } from './courses/courses.module';
import { MinioClientModule } from './minio/minio.module';
import { TranscodeModule } from './transcode/transcode.module';
import { BullModule } from '@nestjs/bull';

@Module({
  imports: [
    CoursesModule,
    MinioClientModule,
    TranscodeModule,
    BullModule.forRoot({
      redis: {
        host: process.env.REDIS_HOST || 'redis',
        port: parseInt(process.env.REDIS_PORT || '6379'),
      },
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
