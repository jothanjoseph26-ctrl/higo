import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/errors/app.exception';
import { CreateContactSubmissionDto } from './dto/contact-submission.dto';
import { CreateDriverApplicationDto } from './dto/driver-application.dto';

@Injectable()
export class OnboardingService {
  constructor(private readonly prisma: PrismaService) {}

  async createContactSubmission(dto: CreateContactSubmissionDto) {
    const submission = await this.prisma.contactSubmission.create({
      data: {
        name: dto.name,
        email: dto.email,
        phone: dto.phone,
        role: dto.role,
        message: dto.message,
        source: 'web',
        metadata: {
          submittedFrom: 'landing_page',
        },
      },
    });

    return {
      submissionId: submission.id,
      status: submission.status,
      createdAt: submission.createdAt,
    };
  }

  async createDriverApplication(dto: CreateDriverApplicationDto) {
    if (!dto.consentAccepted) {
      throw new AppException(
        'VALIDATION_ERROR',
        undefined,
        'Consent is required before submitting a driver application',
      );
    }

    const phone = this.normalizePhone(dto.phone);
    const existingDriver = await this.prisma.driver.findUnique({ where: { phone } });
    if (existingDriver) {
      throw new AppException(
        'VALIDATION_ERROR',
        undefined,
        'This phone number already has a driver profile. Please sign in to continue onboarding.',
      );
    }

    const application = await this.prisma.driverApplication.upsert({
      where: { phone },
      create: {
        fullName: dto.fullName,
        phone,
        email: dto.email,
        city: dto.city,
        preferredLanguage: dto.preferredLanguage,
        vehicleType: dto.vehicleType,
        vehiclePlate: dto.vehiclePlate,
        vehicleModel: dto.vehicleModel,
        hasSmartphone: dto.hasSmartphone,
        hasNin: dto.hasNin,
        hasDriversLicence: dto.hasDriversLicence,
        consentAccepted: dto.consentAccepted,
        source: 'web',
        metadata: {
          readinessScore: this.calculateReadinessScore(dto),
          submittedFrom: 'landing_page',
        },
      },
      update: {
        fullName: dto.fullName,
        email: dto.email,
        city: dto.city,
        preferredLanguage: dto.preferredLanguage,
        vehicleType: dto.vehicleType,
        vehiclePlate: dto.vehiclePlate,
        vehicleModel: dto.vehicleModel,
        hasSmartphone: dto.hasSmartphone,
        hasNin: dto.hasNin,
        hasDriversLicence: dto.hasDriversLicence,
        consentAccepted: dto.consentAccepted,
        source: 'web',
        metadata: {
          readinessScore: this.calculateReadinessScore(dto),
          submittedFrom: 'landing_page',
          resubmittedAt: new Date().toISOString(),
        },
      },
    });

    return {
      applicationId: application.id,
      status: application.status,
      nextStep: this.resolveNextStep(application),
      createdAt: application.createdAt,
    };
  }

  private normalizePhone(phone: string): string {
    const compact = phone.replace(/[^\d+]/g, '');
    if (compact.startsWith('+')) return compact;
    if (compact.startsWith('0')) return `+234${compact.slice(1)}`;
    if (compact.startsWith('234')) return `+${compact}`;
    return compact;
  }

  private calculateReadinessScore(dto: CreateDriverApplicationDto): number {
    return [dto.hasSmartphone, dto.hasNin, dto.hasDriversLicence, Boolean(dto.vehiclePlate)].filter(Boolean)
      .length;
  }

  private resolveNextStep(application: {
    hasSmartphone: boolean;
    hasNin: boolean;
    hasDriversLicence: boolean;
  }): string {
    if (!application.hasSmartphone) return 'Get a smartphone that can run the HiGo Driver app.';
    if (!application.hasNin) return 'Prepare your NIN before KYC verification.';
    if (!application.hasDriversLicence) return "Prepare your driver's licence before KYC verification.";
    return 'HiGo ops will contact you to complete KYC and app onboarding.';
  }
}
