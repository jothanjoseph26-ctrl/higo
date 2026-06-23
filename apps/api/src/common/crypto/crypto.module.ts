import { Global, Module } from '@nestjs/common';
import { AesService } from './aes.service';

@Global()
@Module({
  providers: [AesService],
  exports: [AesService],
})
export class CryptoModule {}