import { Injectable } from '@nestjs/common';
import { PaymentMethod, VehicleType, type LatLng } from '@higo/shared-types';
import { AppException } from '../common/errors/app.exception';
import { GeoRepository } from '../matching/geo.repository';
import { PrismaService } from '../prisma/prisma.service';
import {
  CompleteDeliveryDto,
  RequestDeliveryDto,
  UpdateDeliveryTrackingDto,
} from './dto/delivery.dto';

@Injectable()
export class DeliveriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly geo: GeoRepository,
  ) {}

  async requestDelivery(senderId: string, dto: RequestDeliveryDto) {
    const sender = await this.prisma.user.findUnique({ where: { id: senderId } });
    if (!sender) {
      throw new AppException('NOT_FOUND', undefined, 'Sender profile not found');
    }

    const distanceKm = this.haversineDistance(dto.pickup, dto.dropoff);
    const durationMin = Math.max(1, Math.round(distanceKm * 3));
    const estimatedFare = this.estimateDeliveryFare(distanceKm, dto.parcelSize);

    const deliveryId = await this.createDeliveryRaw({
      senderId,
      senderName: sender.name,
      senderPhone: sender.phone,
      city: dto.city ?? 'Abuja',
      pickup: dto.pickup,
      pickupAddress: dto.pickupAddress,
      dropoff: dto.dropoff,
      dropoffAddress: dto.dropoffAddress,
      recipientName: dto.recipientName,
      recipientPhone: dto.recipientPhone,
      parcelSize: dto.parcelSize ?? 'small',
      parcelDescription: dto.parcelDescription,
      parcelPhotoUrl: dto.parcelPhotoUrl,
      estimatedFare,
      totalFare: estimatedFare,
      distanceKm,
      durationMin,
      paymentMethod: dto.paymentMethod ?? PaymentMethod.CASH,
      description: dto.description,
    });

    const match = await this.matchDeliveryDriver(deliveryId, dto.pickup);
    const delivery = await this.getDelivery(deliveryId);

    return {
      delivery,
      match,
    };
  }

  async getDelivery(id: string) {
    const rows = await this.prisma.$queryRaw<any[]>`
      SELECT
        d.id,
        d.sender_id AS "senderId",
        d.sender_name AS "senderName",
        d.sender_phone AS "senderPhone",
        d.city,
        ST_AsGeoJSON(d.pickup_location) AS "pickupGeoJson",
        d.pickup_address AS "pickupAddress",
        ST_AsGeoJSON(d.dropoff_location) AS "dropoffGeoJson",
        d.dropoff_address AS "dropoffAddress",
        d.recipient_name AS "recipientName",
        d.recipient_phone AS "recipientPhone",
        d.parcel_size AS "parcelSize",
        d.parcel_description AS "parcelDescription",
        d.parcel_photo_url AS "parcelPhotoUrl",
        d.vehicle_type AS "vehicleType",
        d.status,
        d.rider_id AS "riderId",
        r.name AS "riderName",
        r.phone AS "riderPhone",
        r.vehicle_plate AS "riderPlate",
        r.avatar_url AS "riderAvatar",
        d.estimated_fare AS "estimatedFare",
        d.total_fare AS "totalFare",
        d.distance_km AS "distanceKm",
        d.duration_min AS "durationMin",
        d.payment_method AS "paymentMethod",
        d.payment_status AS "paymentStatus",
        d.delivery_photo_url AS "deliveryPhotoUrl",
        d.recipient_verified AS "recipientVerified",
        ST_AsGeoJSON(d.tracking_location) AS "trackingGeoJson",
        d.accepted_at AS "acceptedAt",
        d.picked_up_at AS "pickedUpAt",
        d.delivered_at AS "deliveredAt",
        d.cancelled_at AS "cancelledAt",
        d.cancel_reason AS "cancelReason",
        d.description,
        d.created_at AS "createdAt",
        d.updated_at AS "updatedAt"
      FROM deliveries d
      LEFT JOIN drivers r ON r.id = d.rider_id
      WHERE d.id = ${id}::uuid
      LIMIT 1;
    `;
    if (rows.length === 0) return null;
    return this.mapDeliveryRow(rows[0]);
  }

  async assertDeliveryAccess(id: string, user: { sub: string; type: string }) {
    const delivery = await this.getDelivery(id);
    if (!delivery) {
      throw new AppException('NOT_FOUND', undefined, 'Delivery not found');
    }
    if (user.type === 'admin') return delivery;
    if (user.type === 'passenger' && delivery.senderId === user.sub) return delivery;
    if (user.type === 'driver' && delivery.riderId === user.sub) return delivery;
    throw new AppException('FORBIDDEN', undefined, 'You cannot access this delivery');
  }

  async cancelDelivery(id: string, reason: string) {
    await this.prisma.$executeRaw`
      UPDATE deliveries
      SET status = 'cancelled',
          cancelled_at = NOW(),
          cancel_reason = ${reason},
          updated_at = NOW()
      WHERE id = ${id}::uuid
        AND status::text NOT IN ('delivered', 'cancelled');
    `;
    return this.getDelivery(id);
  }

  async markPickedUp(id: string, driverId: string) {
    await this.prisma.$executeRaw`
      UPDATE deliveries
      SET status = 'picked_up',
          picked_up_at = NOW(),
          updated_at = NOW()
      WHERE id = ${id}::uuid
        AND rider_id = ${driverId}::uuid
        AND status = 'accepted';
    `;
    return this.getDelivery(id);
  }

  async markEnRoute(id: string, driverId: string) {
    await this.prisma.$executeRaw`
      UPDATE deliveries
      SET status = 'en_route',
          updated_at = NOW()
      WHERE id = ${id}::uuid
        AND rider_id = ${driverId}::uuid
        AND status::text IN ('accepted', 'picked_up');
    `;
    return this.getDelivery(id);
  }

  async completeDelivery(id: string, driverId: string, dto: CompleteDeliveryDto) {
    await this.prisma.$executeRaw`
      UPDATE deliveries
      SET status = 'delivered',
          delivered_at = NOW(),
          delivery_photo_url = ${dto.deliveryPhotoUrl ?? null},
          recipient_verified = ${dto.recipientVerified ?? false},
          payment_status = CASE WHEN payment_method = 'cash' THEN 'released'::"PaymentStatus" ELSE payment_status END,
          updated_at = NOW()
      WHERE id = ${id}::uuid
        AND rider_id = ${driverId}::uuid
        AND status::text IN ('picked_up', 'en_route');
    `;
    return this.getDelivery(id);
  }

  async updateTracking(id: string, driverId: string, dto: UpdateDeliveryTrackingDto) {
    await this.prisma.$executeRaw`
      UPDATE deliveries
      SET tracking_location = ST_SetSRID(ST_MakePoint(${dto.lng}, ${dto.lat}), 4326)::geography,
          updated_at = NOW()
      WHERE id = ${id}::uuid
        AND rider_id = ${driverId}::uuid
        AND status::text IN ('accepted', 'picked_up', 'en_route');
    `;
    return this.getDelivery(id);
  }

  async listMine(user: { sub: string; type: string }, limit = 20, offset = 0) {
    const take = Math.min(Math.max(Number(limit) || 20, 1), 50);
    const skip = Math.max(Number(offset) || 0, 0);
    const rows = user.type === 'driver'
      ? await this.prisma.$queryRaw<any[]>`
          SELECT id FROM deliveries
          WHERE rider_id = ${user.sub}::uuid
          ORDER BY created_at DESC
          LIMIT ${take} OFFSET ${skip};
        `
      : await this.prisma.$queryRaw<any[]>`
          SELECT id FROM deliveries
          WHERE sender_id = ${user.sub}::uuid
          ORDER BY created_at DESC
          LIMIT ${take} OFFSET ${skip};
        `;
    const deliveries = await Promise.all(rows.map((row) => this.getDelivery(row.id)));
    return { deliveries: deliveries.filter(Boolean), limit: take, offset: skip };
  }

  async matchDeliveryDriver(deliveryId: string, pickup: LatLng) {
    const candidates = await this.geo.findNearestOnlineDrivers(pickup, VehicleType.BIKE, 5000);
    const busy = await this.getBusyDriverIds();
    const available = candidates.filter((candidate) => !busy.has(candidate.id));
    const selected = available[0];

    if (!selected) {
      return {
        outcome: 'FAILED',
        failureReason: 'NO_RIDER_AVAILABLE',
        candidatePoolSize: candidates.length,
        eligibleCount: 0,
      };
    }

    await this.prisma.$executeRaw`
      UPDATE deliveries
      SET rider_id = ${selected.id}::uuid,
          status = 'accepted',
          accepted_at = NOW(),
          updated_at = NOW()
      WHERE id = ${deliveryId}::uuid
        AND status = 'requested';
    `;

    const driver = await this.prisma.driver.findUnique({ where: { id: selected.id } });
    const distanceKm = selected.distanceMeters / 1000;
    const etaMin = Math.max(1, Math.ceil(distanceKm * 2.4));

    return {
      outcome: 'MATCHED',
      rider: driver
        ? {
            riderId: driver.id,
            name: driver.name,
            phone: driver.phone,
            vehiclePlate: driver.vehiclePlate,
            avatarUrl: driver.avatarUrl,
            rating: Number(driver.ratingAvg),
            distanceKm: Math.round(distanceKm * 100) / 100,
            etaMin,
          }
        : { riderId: selected.id, distanceKm, etaMin },
      candidatePoolSize: candidates.length,
      eligibleCount: available.length,
    };
  }

  private async getBusyDriverIds(): Promise<Set<string>> {
    const [deliveries, trips] = await Promise.all([
      this.prisma.$queryRaw<Array<{ driver_id: string }>>`
        SELECT rider_id AS driver_id
        FROM deliveries
        WHERE rider_id IS NOT NULL
          AND status::text IN ('accepted', 'picked_up', 'en_route')
      `,
      this.prisma.$queryRaw<Array<{ driver_id: string }>>`
        SELECT driver_id
        FROM trips
        WHERE driver_id IS NOT NULL
          AND status::text IN ('requested', 'matched', 'arrived', 'en_route', 'active')
      `,
    ]);
    return new Set([...deliveries, ...trips].map((row) => row.driver_id));
  }

  private async createDeliveryRaw(data: {
    senderId: string;
    senderName?: string | null;
    senderPhone?: string | null;
    city: string;
    pickup: LatLng;
    pickupAddress: string;
    dropoff: LatLng;
    dropoffAddress: string;
    recipientName: string;
    recipientPhone: string;
    parcelSize: string;
    parcelDescription?: string;
    parcelPhotoUrl?: string;
    estimatedFare: number;
    totalFare: number;
    distanceKm: number;
    durationMin: number;
    paymentMethod: PaymentMethod;
    description?: string;
  }): Promise<string> {
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      INSERT INTO deliveries (
        sender_id,
        sender_name,
        sender_phone,
        city,
        pickup_location,
        pickup_address,
        dropoff_location,
        dropoff_address,
        recipient_name,
        recipient_phone,
        parcel_size,
        parcel_description,
        parcel_photo_url,
        vehicle_type,
        status,
        estimated_fare,
        total_fare,
        distance_km,
        duration_min,
        payment_method,
        payment_status,
        description,
        created_at,
        updated_at
      ) VALUES (
        ${data.senderId}::uuid,
        ${data.senderName ?? null},
        ${data.senderPhone ?? null},
        ${data.city},
        ST_SetSRID(ST_MakePoint(${data.pickup.lng}, ${data.pickup.lat}), 4326)::geography,
        ${data.pickupAddress},
        ST_SetSRID(ST_MakePoint(${data.dropoff.lng}, ${data.dropoff.lat}), 4326)::geography,
        ${data.dropoffAddress},
        ${data.recipientName},
        ${data.recipientPhone},
        ${data.parcelSize}::"ParcelSize",
        ${data.parcelDescription ?? null},
        ${data.parcelPhotoUrl ?? null},
        'bike'::"VehicleType",
        'requested'::"DeliveryStatus",
        ${data.estimatedFare},
        ${data.totalFare},
        ${data.distanceKm},
        ${data.durationMin},
        ${data.paymentMethod}::"PaymentMethod",
        'pending'::"PaymentStatus",
        ${data.description ?? null},
        NOW(),
        NOW()
      )
      RETURNING id;
    `;
    return rows[0].id;
  }

  private estimateDeliveryFare(distanceKm: number, parcelSize = 'small'): number {
    const sizeSurcharge = parcelSize === 'large' ? 30000 : parcelSize === 'medium' ? 15000 : 0;
    return Math.max(60000, Math.round((40000 + distanceKm * 12000 + sizeSurcharge) / 5000) * 5000);
  }

  private haversineDistance(p1: LatLng, p2: LatLng): number {
    const R = 6371;
    const dLat = ((p2.lat - p1.lat) * Math.PI) / 180;
    const dLng = ((p2.lng - p1.lng) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((p1.lat * Math.PI) / 180) *
        Math.cos((p2.lat * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  private mapDeliveryRow(row: any) {
    const pickup = JSON.parse(row.pickupGeoJson);
    const dropoff = JSON.parse(row.dropoffGeoJson);
    const tracking = row.trackingGeoJson ? JSON.parse(row.trackingGeoJson) : null;
    return {
      id: row.id,
      senderId: row.senderId,
      senderName: row.senderName,
      senderPhone: row.senderPhone,
      city: row.city,
      pickup: { lng: pickup.coordinates[0], lat: pickup.coordinates[1] },
      pickupAddress: row.pickupAddress,
      dropoff: { lng: dropoff.coordinates[0], lat: dropoff.coordinates[1] },
      dropoffAddress: row.dropoffAddress,
      recipientName: row.recipientName,
      recipientPhone: row.recipientPhone,
      parcelSize: row.parcelSize,
      parcelDescription: row.parcelDescription,
      parcelPhotoUrl: row.parcelPhotoUrl,
      vehicleType: row.vehicleType,
      status: row.status,
      riderId: row.riderId,
      riderName: row.riderName,
      riderPhone: row.riderPhone,
      riderPlate: row.riderPlate,
      riderAvatar: row.riderAvatar,
      estimatedFare: row.estimatedFare,
      totalFare: row.totalFare,
      distanceKm: row.distanceKm ? Number(row.distanceKm) : null,
      durationMin: row.durationMin,
      paymentMethod: row.paymentMethod,
      paymentStatus: row.paymentStatus,
      deliveryPhotoUrl: row.deliveryPhotoUrl,
      recipientVerified: row.recipientVerified,
      tracking: tracking ? { lng: tracking.coordinates[0], lat: tracking.coordinates[1] } : null,
      acceptedAt: row.acceptedAt ? row.acceptedAt.toISOString() : null,
      pickedUpAt: row.pickedUpAt ? row.pickedUpAt.toISOString() : null,
      deliveredAt: row.deliveredAt ? row.deliveredAt.toISOString() : null,
      cancelledAt: row.cancelledAt ? row.cancelledAt.toISOString() : null,
      cancelReason: row.cancelReason,
      description: row.description,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
