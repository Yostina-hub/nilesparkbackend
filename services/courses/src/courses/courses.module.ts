import { Module } from '@nestjs/common';
import { CoursesController } from './courses.controller';
import { CoursesService } from './courses.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MinioClientModule } from '../minio/minio.module';
import { HttpModule } from '@nestjs/axios';
import { ResourceGuard } from './guards/resource.guard';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer'; // Import memoryStorage
import { JwtStrategy } from './jwt.strategy';
import { TranscodeService } from 'src/transcode/transcode.service';
import { TranscodeModule } from 'src/transcode/transcode.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    MulterModule.register({
      storage: memoryStorage(), // Use memoryStorage for in-memory buffers
      limits: {
        fileSize: 50 * 1024 * 1024, // 50MB limit
        files: 10, // Max 10 files for slideshow
      },
    }),
    MinioClientModule,
    TranscodeModule,
    HttpModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      useFactory: (configService: ConfigService) => ({
        secret: configService.get('JWT_SECRET') || 'supersecret',
        signOptions: { expiresIn: '1h' },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [CoursesController],
  providers: [
    CoursesService,
    PrismaService,
    ConfigService,
    ResourceGuard,
    JwtStrategy,
  ],
})
export class CoursesModule {}
