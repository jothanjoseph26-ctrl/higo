import { Module } from '@nestjs/common';
import { AfricasTalkingAdapter } from './africastalking.adapter';
import { SmsService } from './sms.service';
import { TermiiAdapter } from './termii.adapter';

@Module({
  providers: [SmsService, TermiiAdapter, AfricasTalkingAdapter],
  exports: [SmsService],
})
export class SmsModule {}