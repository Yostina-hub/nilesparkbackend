import { Injectable, HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn } from 'child_process';
import { MinioClientService } from '../minio/minio.service';
import * as path from 'path';
import * as fsPromises from 'fs/promises';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class TranscodeService {
  constructor(
    private configService: ConfigService,
    private minioService: MinioClientService,
    private prisma: PrismaService,
    @InjectQueue('transcode-queue') private transcodeQueue: Queue,
  ) {}

  async hasAudioStream(filePath: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const ffprobe = spawn('ffprobe', [
        '-v',
        'error',
        '-show_streams',
        '-select_streams',
        'a',
        '-show_entries',
        'stream=codec_type',
        '-of',
        'json',
        filePath,
      ]);
      let output = '';
      ffprobe.stdout.on('data', (data) => (output += data));
      ffprobe.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`ffprobe exited with code ${code}`));
          return;
        }
        try {
          const result = JSON.parse(output);
          resolve(result.streams && result.streams.length > 0);
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  async queueTranscodeVideo(
    fileUrl: string,
    bucket: string,
    materialId: string,
    originalname: string,
  ): Promise<string> {
    const jobId = uuidv4();
    await this.transcodeQueue.add('transcode', {
      fileUrl,
      bucket,
      materialId,
      originalname,
      jobId,
    });

    await this.prisma.learningMaterial.update({
      where: { id: materialId },
      data: { jobId, status: 'PENDING' },
    });

    return jobId;
  }

  async processTranscodeVideo(jobData: {
    fileUrl: string;
    bucket: string;
    materialId: string;
    originalname: string;
    jobId: string;
  }): Promise<void> {
    try {
      const { fileUrl, bucket, materialId, originalname, jobId } = jobData;
      const tmpDir = `/tmp/${materialId}`;
      await fsPromises.mkdir(tmpDir, { recursive: true });

      // Download the file from MinIO
      const bucketName = `${this.configService.get('MINIO_BUCKET') || 'content'}-${bucket}`;
      const fileName = fileUrl.split('/').pop() || originalname;
      const inputPath = path.join(tmpDir, originalname);
      await this.minioService.minioClient
        .getObject(bucketName, fileName)
        .then(async (stream) => {
          const fileStream = fs.createWriteStream(inputPath);
          await new Promise((resolve, reject) => {
            stream.pipe(fileStream);
            fileStream.on('finish', () => resolve(null));
            fileStream.on('error', (error) => reject(error));
          });
        });

      // Check for audio stream
      const hasAudio = await this.hasAudioStream(inputPath);

      // FFmpeg command for HLS with multiple resolutions
      const outputDir = path.join(tmpDir, 'hls');
      await fsPromises.mkdir(outputDir, { recursive: true });

      const ffmpegArgs = [
        '-i',
        inputPath,
        '-filter_complex',
        '[0:v]split=3[v1][v2][v3]; [v1]scale=640:360[v1out]; [v2]scale=854:480[v2out]; [v3]scale=1280:720[v3out]',
        '-map',
        '[v1out]',
        '-c:v:0',
        'libx264',
        '-b:v:0',
        '800k',
        '-maxrate:0',
        '856k',
        '-bufsize:0',
        '1700k',
        '-map',
        '[v2out]',
        '-c:v:1',
        'libx264',
        '-b:v:1',
        '1400k',
        '-maxrate:1',
        '1496k',
        '-bufsize:1',
        '2992k',
        '-map',
        '[v3out]',
        '-c:v:2',
        'libx264',
        '-b:v:2',
        '2800k',
        '-maxrate:2',
        '2992k',
        '-bufsize:2',
        '5984k',
      ];

      if (hasAudio) {
        ffmpegArgs.push(
          '-map',
          'a:0',
          '-c:a',
          'aac',
          '-b:a',
          '96k',
          '-var_stream_map',
          'v:0,a:0 v:1,a:0 v:2,a:0',
        );
      } else {
        ffmpegArgs.push('-var_stream_map', 'v:0 v:1 v:2');
      }

      ffmpegArgs.push(
        '-master_pl_name',
        'master.m3u8',
        '-f',
        'hls',
        '-hls_time',
        '4',
        '-hls_list_size',
        '0',
        '-hls_segment_filename',
        `${outputDir}/%v/segment%d.ts`,
        `${outputDir}/%v/playlist.m3u8`,
      );

      await new Promise((resolve, reject) => {
        const ffmpeg = spawn('ffmpeg', ffmpegArgs); // Fixed typo: ffmpegstens -> ffmpegArgs
        ffmpeg.stderr.on('data', (data) => console.error(`FFmpeg: ${data}`));
        ffmpeg.on('close', (code) => {
          if (code !== 0) {
            reject(new Error(`FFmpeg exited with code ${code}`));
          } else {
            resolve(null);
          }
        });
      });

      // Upload segments and manifests to MinIO
      const bucketPath = `videos/${materialId}`;
      await this.uploadDirectoryToMinio(outputDir, bucket, bucketPath);

      // Generate presigned URL for master.m3u8
      const manifestUrl = await this.minioService.getFileUrl(
        bucket,
        `${bucketPath}/master.m3u8`,
      );

      // Update LearningMaterial with manifestUrl and status
      await this.prisma.learningMaterial.update({
        where: { id: materialId },
        data: {
          manifestUrl,
          status: 'COMPLETED',
          updatedAt: new Date(),
        },
      });

      // Clean up temporary files
      await fsPromises.rm(tmpDir, { recursive: true, force: true });
    } catch (error) {
      console.error(
        `Transcoding failed for material ${jobData.materialId}: ${error.message}`,
      );
      await this.prisma.learningMaterial.update({
        where: { id: jobData.materialId },
        data: { status: 'FAILED', updatedAt: new Date() },
      });
      throw new HttpException(
        {
          status: 'error',
          statusCode: 500,
          message: `Failed to transcode video: ${error.message}`,
          timestamp: new Date().toISOString(),
        },
        500,
      );
    }
  }

  private async uploadDirectoryToMinio(
    dir: string,
    bucket: string,
    bucketPath: string,
  ) {
    const files = await fsPromises.readdir(dir, { recursive: true });
    for (const file of files) {
      const filePath = path.join(dir, file);
      const stats = await fsPromises.stat(filePath);
      if (stats.isFile()) {
        const fileBuffer = await fsPromises.readFile(filePath);
        const minioPath = `${bucketPath}/${file}`;
        await this.minioService.uploadFile(
          {
            buffer: fileBuffer,
            originalname: path.basename(file),
            mimetype: file.endsWith('.m3u8')
              ? 'application/vnd.apple.mpegurl'
              : 'video/mp2t',
            size: fileBuffer.length,
          } as Express.Multer.File,
          bucket,
          minioPath,
        );
      }
    }
  }
}
