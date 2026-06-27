import { Module } from '@nestjs/common';
import { AfricasTalkingAdapter } from './africastalking.adapter';
import { SmsService } from './sms.service';
import { TermiiAdapter } from './termii.adapter';
import { TwilioAdapter } from './twilio.adapter';
import { FirebaseModule } from '../firebase/firebase.module';
import { FirebaseOtpAdapter } from '../firebase/firebase-otp.adapter';

@Module({
  imports: [FirebaseModule],
  providers: [
    SmsService,
    FirebaseOtpAdapter,
    TwilioAdapter,
    TermiiAdapter,
    AfricasTalkingAdapter,
  ],
  exports: [SmsService],
})
export class SmsModule {}