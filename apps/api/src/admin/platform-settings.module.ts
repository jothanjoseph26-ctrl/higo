import { Module } from '@nestjs/common';
import { PlatformSettingsReader } from './platform-settings-reader.service';

@Module({
  providers: [PlatformSettingsReader],
  exports: [PlatformSettingsReader],
})
export class PlatformSettingsModule {}
