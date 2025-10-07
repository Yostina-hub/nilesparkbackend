import { Injectable, HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from 'minio';
import { v4 as uuidv4 } from 'uuid';
import { Express } from 'express';

@Injectable()
export class MinioClientService {
  private _minioClient: Client;

  constructor(private configService: ConfigService) {
    this._minioClient = new Client({
      endPoint: this.configService.get('MINIO_ENDPOINT') || 'minio',
      port: parseInt(this.configService.get('MINIO_PORT') || '9000'),
      useSSL: false,
      accessKey: this.configService.get('MINIO_ROOT_USER') || 'minioadmin',
      secretKey: this.configService.get('MINIO_ROOT_PASSWORD') || 'minioadmin',
    });
  }

  get minioClient(): Client {
    return this._minioClient;
  }

  async uploadFile(
    file: Express.Multer.File,
    bucket: string,
    path?: string,
  ): Promise<string> {
    try {
      const bucketName = `${this.configService.get('MINIO_BUCKET') || 'content'}-${bucket}`;
      const fileName = path || `${uuidv4()}-${file.originalname}`;

      const bucketExists = await this._minioClient.bucketExists(bucketName);
      if (!bucketExists) {
        await this._minioClient.makeBucket(bucketName, 'us-east-1');
        await this.setPublicReadPolicy(bucketName);
      }

      await this._minioClient.putObject(
        bucketName,
        fileName,
        file.buffer,
        file.size,
        { 'Content-Type': file.mimetype },
      );

      const publicEndpoint =
        this.configService.get('MINIO_PUBLIC_ENDPOINT') ||
        'http://localhost:9000';
      return `${publicEndpoint}/${bucketName}/${fileName}`;
    } catch (error) {
      console.error('Error uploading to MinIO:', error);
      throw new HttpException(
        {
          status: 'error',
          statusCode: 500,
          message: 'Failed to upload file to MinIO',
          timestamp: new Date().toISOString(),
        },
        500,
      );
    }
  }

  async getFileUrl(bucket: string, fileName: string): Promise<string> {
    try {
      const bucketName = `${this.configService.get('MINIO_BUCKET') || 'content'}-${bucket}`;
      const publicEndpoint =
        this.configService.get('MINIO_PUBLIC_ENDPOINT') ||
        'http://localhost:9000';
      return `${publicEndpoint}/${bucketName}/${fileName}`;
    } catch (error) {
      console.error('Error generating file URL:', error);
      throw new HttpException(
        {
          status: 'error',
          statusCode: 500,
          message: 'Failed to generate file URL',
          timestamp: new Date().toISOString(),
        },
        500,
      );
    }
  }

  private async setPublicReadPolicy(bucketName: string): Promise<void> {
    try {
      const policy = {
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Principal: '*',
            Action: ['s3:GetObject'],
            Resource: [`arn:aws:s3:::${bucketName}/*`],
          },
        ],
      };
      await this._minioClient.setBucketPolicy(
        bucketName,
        JSON.stringify(policy),
      );
    } catch (error) {
      console.error('Error setting bucket policy:', error);
      throw new Error(
        `Failed to set public read policy for bucket ${bucketName}`,
      );
    }
  }
}
