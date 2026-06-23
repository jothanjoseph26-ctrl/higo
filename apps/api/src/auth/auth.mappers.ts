import { Driver as PrismaDriver, User as PrismaUser } from '@prisma/client';
import { Driver, User } from '@higo/shared-types';

export function mapUser(record: PrismaUser): User {
  return {
    id: record.id,
    phone: record.phone,
    email: record.email,
    name: record.name,
    avatarUrl: record.avatarUrl,
    fcmToken: record.fcmToken,
    preferredLanguage: record.preferredLanguage as User['preferredLanguage'],
    higoPoints: record.higoPoints,
    ratingAvg: Number(record.ratingAvg),
    totalTrips: record.totalTrips,
    isVerified: record.isVerified,
    isBlocked: record.isBlocked,
    emergencyContacts: (record.emergencyContacts as User['emergencyContacts']) ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export function mapDriver(record: PrismaDriver): Driver {
  return {
    id: record.id,
    userId: record.userId,
    name: record.name,
    phone: record.phone,
    email: record.email,
    avatarUrl: record.avatarUrl,
    fcmToken: record.fcmToken,
    vehicleType: record.vehicleType as Driver['vehicleType'],
    vehiclePlate: record.vehiclePlate,
    vehicleModel: record.vehicleModel,
    vehicleYear: record.vehicleYear,
    vehicleColor: record.vehicleColor,
    kycStatus: record.kycStatus as Driver['kycStatus'],
    kycDocuments: (record.kycDocuments as Driver['kycDocuments']) ?? null,
    verificationTier: record.verificationTier as Driver['verificationTier'],
    paystackRecipientCode: record.paystackRecipientCode,
    ratingAvg: Number(record.ratingAvg),
    totalTrips: record.totalTrips,
    isOnline: record.isOnline,
    isActive: record.isActive,
    isSuspended: record.isSuspended,
    subscriptionTier: record.subscriptionTier as Driver['subscriptionTier'],
    subscriptionExpiresAt: record.subscriptionExpiresAt?.toISOString() ?? null,
    operatingZoneIds: record.operatingZoneIds,
    currentLocation: null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}