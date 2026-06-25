import { Global, Module } from '@nestjs/common';
import { OssService } from './s3.service';

@Global()
@Module({
  providers: [OssService],
  exports: [OssService],
})
export class S3Module {}
