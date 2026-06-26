import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from './ai.service';
import { AppException } from '../common/errors/app.exception';

export interface FraudAnalysisResult {
  riskScore: number;
  riskLevel: 'low' | 'medium' | 'high';
  flags: string[];
  summary: string;
  recommendedAction: string;
}

export interface MatchingInsightResult {
  summary: string;
  suggestions: string[];
}

@Injectable()
export class AiFeaturesService {
  private readonly logger = new Logger(AiFeaturesService.name);

  constructor(
    private readonly ai: AiService,
    private readonly prisma: PrismaService,
  ) {}

  async generateSupportReply(passengerMessage: string): Promise<string | null> {
    return this.ai.prompt(
      `You are HiGo Abuja customer support. Be concise, helpful, and warm. 
Use simple English; light Nigerian Pidgin is OK. Never promise refunds without admin review.
For emergencies tell user to use in-app SOS. Max 3 sentences.`,
      `Passenger message: "${passengerMessage}"`,
      { maxTokens: 180, temperature: 0.5, timeout: 8000 },
    );
  }

  async analyzeTripFraud(tripId: string): Promise<FraudAnalysisResult> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        passenger: { select: { id: true, name: true, phone: true, ratingAvg: true } },
        driver: { select: { id: true, name: true, phone: true, ratingAvg: true, isSuspended: true } },
        disputes: { select: { id: true, status: true, reason: true } },
      },
    });

    if (!trip) {
      throw new AppException('NOT_FOUND', undefined, 'Trip not found');
    }

    const fallback: FraudAnalysisResult = {
      riskScore: 0,
      riskLevel: 'low',
      flags: [],
      summary: 'AI analysis unavailable. Manual review recommended for disputed or high-value trips.',
      recommendedAction: 'review_manually',
    };

    if (!this.ai.isEnabled) {
      return this.buildHeuristicFraud(trip, fallback);
    }

    const context = JSON.stringify({
      tripId: trip.id,
      status: trip.status,
      paymentStatus: trip.paymentStatus,
      totalFareKobo: trip.totalFare,
      distanceKm: trip.distanceKm,
      durationMin: trip.durationMin,
      cancelReason: trip.cancelReason,
      passengerRating: trip.passenger?.ratingAvg,
      driverRating: trip.driver?.ratingAvg,
      driverSuspended: trip.driver?.isSuspended ?? false,
      disputeCount: trip.disputes.length,
      disputes: trip.disputes.map((d) => ({ status: d.status, reason: d.reason })),
    });

    const parsed = await this.ai.chatJson<FraudAnalysisResult>(
      [
        {
          role: 'system',
          content:
            'You are a ride-hailing fraud analyst for Abuja keke trips. Output JSON with keys: riskScore (0-100), riskLevel (low|medium|high), flags (string[]), summary, recommendedAction (none|monitor|review_manually|suspend_driver).',
        },
        { role: 'user', content: `Analyze this trip record: ${context}` },
      ],
      { maxTokens: 400, timeout: 12000 },
    );

    if (!parsed) {
      return this.buildHeuristicFraud(trip, fallback);
    }

    return {
      riskScore: Math.min(100, Math.max(0, Number(parsed.riskScore) || 0)),
      riskLevel: parsed.riskLevel ?? 'low',
      flags: Array.isArray(parsed.flags) ? parsed.flags : [],
      summary: parsed.summary || fallback.summary,
      recommendedAction: parsed.recommendedAction || 'review_manually',
    };
  }

  async getMatchingInsight(params: {
    pickupAddress: string;
    vehicleType: string;
    candidateCount: number;
    avgDistanceMeters: number;
  }): Promise<MatchingInsightResult> {
    const fallback: MatchingInsightResult = {
      summary: `${params.candidateCount} driver(s) near ${params.pickupAddress}. Avg distance ${Math.round(params.avgDistanceMeters)}m.`,
      suggestions: params.candidateCount === 0 ? ['Expand search radius', 'Check surge zones'] : ['Proceed with CTS ranking'],
    };

    if (!this.ai.isEnabled) {
      return fallback;
    }

    const parsed = await this.ai.chatJson<MatchingInsightResult>(
      [
        {
          role: 'system',
          content:
            'You advise Abuja dispatch operators on driver matching. Return JSON: { summary: string, suggestions: string[] }.',
        },
        {
          role: 'user',
          content: JSON.stringify(params),
        },
      ],
      { maxTokens: 200, timeout: 8000 },
    );

    return parsed ?? fallback;
  }

  private buildHeuristicFraud(
    trip: {
      status: string;
      paymentStatus: string;
      totalFare: number;
      cancelReason: string | null;
      disputes: { status: string }[];
      driver: { isSuspended: boolean } | null;
    },
    fallback: FraudAnalysisResult,
  ): FraudAnalysisResult {
    const flags: string[] = [];
    let score = 0;

    if (trip.disputes.length > 0) {
      flags.push('open_dispute');
      score += 35;
    }
    if (trip.driver?.isSuspended) {
      flags.push('suspended_driver');
      score += 50;
    }
    if (trip.paymentStatus === 'failed') {
      flags.push('payment_failed');
      score += 25;
    }
    if (trip.totalFare > 500_000) {
      flags.push('high_fare');
      score += 15;
    }
    if (trip.cancelReason?.toLowerCase().includes('fraud')) {
      flags.push('fraud_cancel_reason');
      score += 40;
    }

    const riskLevel: FraudAnalysisResult['riskLevel'] =
      score >= 60 ? 'high' : score >= 30 ? 'medium' : 'low';

    return {
      riskScore: Math.min(100, score),
      riskLevel,
      flags,
      summary:
        flags.length > 0
          ? `Heuristic check flagged: ${flags.join(', ')}.`
          : fallback.summary,
      recommendedAction: score >= 60 ? 'review_manually' : score >= 30 ? 'monitor' : 'none',
    };
  }
}