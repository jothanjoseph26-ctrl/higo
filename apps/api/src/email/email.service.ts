import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { KYCStatus, WeeklyKpi } from '@higo/shared-types';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly resend: Resend | null;
  private readonly from: string;
  private readonly enabled: boolean;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('RESEND_API_KEY', '').trim();
    this.from = this.config.get<string>(
      'EMAIL_FROM',
      'HiGo <noreply@hiconnect.com>',
    );
    this.enabled = apiKey.length > 0;
    this.resend = this.enabled ? new Resend(apiKey) : null;

    if (this.enabled) {
      this.logger.log('Resend email service enabled');
    } else {
      this.logger.warn('RESEND_API_KEY not set; email delivery disabled');
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  async send(params: {
    to: string | string[];
    subject: string;
    html: string;
    text?: string;
  }): Promise<boolean> {
    if (!this.resend) {
      this.logger.debug(`Email skipped (disabled): ${params.subject} → ${params.to}`);
      return false;
    }

    try {
      const { error } = await this.resend.emails.send({
        from: this.from,
        to: params.to,
        subject: params.subject,
        html: params.html,
        text: params.text,
      });

      if (error) {
        this.logger.warn(`Resend error: ${error.message}`);
        return false;
      }

      return true;
    } catch (error) {
      this.logger.warn(
        `Email send failed: ${error instanceof Error ? error.message : 'unknown'}`,
      );
      return false;
    }
  }

  async sendKycStatusUpdate(params: {
    to: string;
    name: string;
    status: KYCStatus;
  }): Promise<boolean> {
    const statusLabel = params.status.replace(/_/g, ' ');
    const subject = `HiGo KYC update: ${statusLabel}`;
    const html = `
      <p>Hello ${params.name},</p>
      <p>Your HiGo driver verification status is now <strong>${statusLabel}</strong>.</p>
      <p>Open the HiGo Driver app to view document details or upload again if needed.</p>
      <p>— HiGo by Hiconnect</p>
    `;

    return this.send({
      to: params.to,
      subject,
      html,
      text: `Hello ${params.name}, your HiGo KYC status is now ${statusLabel}.`,
    });
  }

  async sendWeeklyKpiSummary(params: {
    to: string[];
    kpi: WeeklyKpi;
    plainText: string;
  }): Promise<boolean> {
    const pct = (value: number) => `${(value * 100).toFixed(1)}%`;
    const ngn = (kobo: number) =>
      `₦${(kobo / 100).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;

    const subject = `HiGo Weekly KPI — week ending ${params.kpi.period.to.slice(0, 10)}`;
    const html = `
      <h2>HiGo Weekly KPI Summary</h2>
      <p>Period: ${params.kpi.period.from.slice(0, 10)} to ${params.kpi.period.to.slice(0, 10)}</p>
      <table cellpadding="8" cellspacing="0" border="1" style="border-collapse:collapse;font-family:sans-serif;font-size:14px;">
        <tr><td><strong>Driver Active Rate</strong></td><td>${pct(params.kpi.driverActiveRate)}</td></tr>
        <tr><td><strong>Ride Completion Rate</strong></td><td>${pct(params.kpi.rideCompletionRate)}</td></tr>
        <tr><td><strong>Avg Passenger Wait</strong></td><td>${params.kpi.avgPassengerWaitMinutes.toFixed(1)} min</td></tr>
        <tr><td><strong>Customer Acquisition Cost</strong></td><td>${ngn(params.kpi.customerAcquisitionCost)}</td></tr>
        <tr><td><strong>Cash Burn vs Revenue</strong></td><td>${params.kpi.cashBurnVsRevenue.toFixed(2)}x</td></tr>
      </table>
      <pre style="font-family:sans-serif;font-size:13px;white-space:pre-wrap;margin-top:16px;">${params.plainText}</pre>
      <p>— HiGo by Hiconnect</p>
    `;

    return this.send({
      to: params.to,
      subject,
      html,
      text: params.plainText,
    });
  }
}