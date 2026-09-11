import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { Redis } from 'ioredis';
import axios from 'axios';
import * as crypto from 'crypto';

const CALL_TTL_SEC = 120; // 2 min max call lifetime
const CALL_STATUS_KEY = 'call:status:';
const CALL_TRIP_KEY = 'call:trip:';

export interface CallRecord {
  callId: string;
  tripId: string;
  callerId: string;
  calleeId: string;
  callerName: string;
  calleeName: string;
  callerRole: 'passenger' | 'driver';
  status: 'initiated' | 'ringing' | 'connecting' | 'connected' | 'ended';
  createdAt: number;
}

@Injectable()
export class CallsService {
  private readonly logger = new Logger(CallsService.name);
  private readonly redis: Redis;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const redisUrl = this.config.get<string>('REDIS_URL');
    this.redis = redisUrl ? new Redis(redisUrl) : new Redis();
  }

  async createCall(params: {
    tripId: string;
    callerId: string;
    calleeId: string;
    callerName: string;
    calleeName: string;
    callerRole: 'passenger' | 'driver';
  }): Promise<string> {
    const callId = crypto.randomBytes(9).toString('base64url');

    // Check no existing active call for this trip
    const existingCallId = await this.redis.get(`${CALL_TRIP_KEY}${params.tripId}`);
    if (existingCallId) {
      const existingStatus = await this.redis.get(`${CALL_STATUS_KEY}${existingCallId}`);
      if (existingStatus && existingStatus !== 'ended') {
        throw new Error('Call already active for this trip');
      }
    }

    const record: CallRecord = {
      callId,
      tripId: params.tripId,
      callerId: params.callerId,
      calleeId: params.calleeId,
      callerName: params.callerName,
      calleeName: params.calleeName,
      callerRole: params.callerRole,
      status: 'initiated',
      createdAt: Date.now(),
    };

    await this.redis.set(
      `${CALL_STATUS_KEY}${callId}`,
      JSON.stringify(record),
      'EX',
      CALL_TTL_SEC,
    );
    await this.redis.set(
      `${CALL_TRIP_KEY}${params.tripId}`,
      callId,
      'EX',
      CALL_TTL_SEC,
    );

    this.logger.log(`Call created: ${callId} trip=${params.tripId} caller=${params.callerId} → callee=${params.calleeId}`);
    return callId;
  }

  async getCall(callId: string): Promise<CallRecord | null> {
    const data = await this.redis.get(`${CALL_STATUS_KEY}${callId}`);
    if (!data) return null;
    return JSON.parse(data) as CallRecord;
  }

  async getActiveCallForTrip(tripId: string): Promise<CallRecord | null> {
    const callId = await this.redis.get(`${CALL_TRIP_KEY}${tripId}`);
    if (!callId) return null;
    return this.getCall(callId);
  }

  async updateCallStatus(
    callId: string,
    status: CallRecord['status'],
  ): Promise<void> {
    const record = await this.getCall(callId);
    if (!record) return;
    record.status = status;
    await this.redis.set(
      `${CALL_STATUS_KEY}${callId}`,
      JSON.stringify(record),
      'EX',
      CALL_TTL_SEC,
    );
  }

  async endCall(callId: string): Promise<void> {
    const record = await this.getCall(callId);
    if (!record) return;
    record.status = 'ended';
    await this.redis.set(
      `${CALL_STATUS_KEY}${callId}`,
      JSON.stringify(record),
      'EX',
      30, // keep for 30s for final signaling
    );
    // Clean up trip→call mapping
    await this.redis.del(`${CALL_TRIP_KEY}${record.tripId}`);
  }

  async endCallForTrip(tripId: string): Promise<CallRecord | null> {
    const callId = await this.redis.get(`${CALL_TRIP_KEY}${tripId}`);
    if (!callId) return null;
    const record = await this.getCall(callId);
    await this.endCall(callId);
    return record;
  }

  async isParticipant(callId: string, userId: string): Promise<boolean> {
    const record = await this.getCall(callId);
    if (!record) return false;
    return record.callerId === userId || record.calleeId === userId;
  }

  async getOtherParty(callId: string, userId: string): Promise<string | null> {
    const record = await this.getCall(callId);
    if (!record) return null;
    if (record.callerId === userId) return record.calleeId;
    if (record.calleeId === userId) return record.callerId;
    return null;
  }

  async getTurnCredentials(): Promise<{
    iceServers: Array<{ urls: string | string[]; username?: string; credential?: string }>;
    expiresInSeconds: number;
  }> {
    const accountSid = this.config.get<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.config.get<string>('TWILIO_AUTH_TOKEN');

    if (!accountSid || !authToken) {
      // Fallback to free STUN only
      return {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
        ],
        expiresInSeconds: 3600,
      };
    }

    try {
      const response = await axios.post(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Tokens.json`,
        'Ttl=3600',
        {
          auth: { username: accountSid, password: authToken },
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          timeout: 10000,
        },
      );

      const iceServers = response.data.ice_servers.map((s: any) => ({
        urls: s.urls,
        ...(s.username ? { username: s.username } : {}),
        ...(s.credential ? { credential: s.credential } : {}),
      }));

      return { iceServers, expiresInSeconds: 3600 };
    } catch (err) {
      this.logger.warn(`Twilio TURN credential fetch failed, falling back to STUN: ${err}`);
      return {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
        ],
        expiresInSeconds: 3600,
      };
    }
  }
}
