import {
  AnalyzeDocumentCommand,
  Block,
  FeatureType,
  TextractClient,
} from '@aws-sdk/client-textract';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class TextractService {
  private readonly logger = new Logger(TextractService.name);
  private readonly client: TextractClient;
  private readonly bucket: string;

  constructor(config: ConfigService) {
    this.bucket = config.getOrThrow<string>('AWS_S3_BUCKET_KYC');
    this.client = new TextractClient({
      region: config.getOrThrow<string>('TEXTRACT_REGION'),
      credentials: {
        accessKeyId: config.getOrThrow<string>('AWS_ACCESS_KEY_ID'),
        secretAccessKey: config.getOrThrow<string>('AWS_SECRET_ACCESS_KEY'),
      },
    });
  }

  async extractForm(s3Key: string): Promise<Record<string, string>> {
    try {
      const response = await this.client.send(
        new AnalyzeDocumentCommand({
          Document: {
            S3Object: { Bucket: this.bucket, Name: s3Key },
          },
          FeatureTypes: [FeatureType.FORMS],
        }),
      );
      return this.flattenKeyValueBlocks(response.Blocks ?? []);
    } catch (error) {
      this.logger.warn(
        `Textract failed for key prefix ${s3Key.split('/')[0]}: ${
          error instanceof Error ? error.message : 'unknown'
        }`,
      );
      return {};
    }
  }

  private flattenKeyValueBlocks(blocks: Block[]): Record<string, string> {
    const blockMap = new Map(blocks.map((b) => [b.Id!, b]));
    const result: Record<string, string> = {};

    for (const block of blocks) {
      if (block.BlockType !== 'KEY_VALUE_SET' || !block.EntityTypes?.includes('KEY')) {
        continue;
      }

      const key = this.getText(block, blockMap);
      const valueBlock = block.Relationships?.find((r) => r.Type === 'VALUE')
        ?.Ids?.[0];
      const value = valueBlock
        ? this.getText(blockMap.get(valueBlock)!, blockMap)
        : '';

      if (key) {
        result[key.trim()] = value.trim();
      }
    }

    return result;
  }

  private getText(block: Block, blockMap: Map<string, Block>): string {
    if (block.Text) {
      return block.Text;
    }
    const childIds =
      block.Relationships?.find((r) => r.Type === 'CHILD')?.Ids ?? [];
    return childIds
      .map((id) => blockMap.get(id)?.Text ?? '')
      .join(' ')
      .trim();
  }
}