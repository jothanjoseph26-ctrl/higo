import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { OAuth2Client } from 'google-auth-library';
import { randomUUID } from 'crypto';
import * as bcrypt from 'bcryptjs';
import {
  GoogleAuthRequest,
  LogoutRequest,
  RefreshTokenRequest,
  RefreshTokenResponse,
  SendOtpRequest,
  SendOtpResponse,
  VerifyOtpRequest,
  VerifyOtpResponse,
} from '@higo/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { SmsService } from '../sms/sms.service';
import { FirebaseService } from '../firebase/firebase.service';
import { AppException } from '../common/errors/app.exception';
import { OtpService } from './otp.service';
import { VerifyFirebasePhoneDto } from './dto/auth.dto';
import { mapDriver, mapUser } from './auth.mappers';
import { JwtPayload } from './jwt.strategy';
import { AdminLoginDto } from './dto/auth.dto';

@Injectable()
export class AuthService {
  private readonly googleClient: OAuth2Client;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly redis: RedisService,
    private readonly sms: SmsService,
    private readonly otp: OtpService,
    private readonly firebase: FirebaseService,
  ) {
    this.googleClient = new OAuth2Client(
      config.getOrThrow<string>('GOOGLE_OAUTH_CLIENT_ID'),
    );
  }

  async sendOtp(dto: SendOtpRequest): Promise<SendOtpResponse> {
    const code = this.otp.generateCode();
    await this.otp.storeOtp(dto.phone, code);
    const { channel } = await this.sms.sendOtp(dto.phone, code);
    return { sent: true, expiresInSeconds: 300, channel };
  }

  async verifyFirebasePhone(
    dto: VerifyFirebasePhoneDto,
  ): Promise<VerifyOtpResponse> {
    if (!this.firebase.isEnabled()) {
      throw new AppException(
        'SERVICE_UNAVAILABLE',
        undefined,
        'Firebase authentication is not configured',
      );
    }

    const decoded = await this.firebase.verifyIdToken(dto.idToken);
    const phone = decoded.phone_number;
    if (!phone) {
      throw new AppException(
        'UNAUTHORIZED',
        undefined,
        'Firebase token missing phone_number claim',
      );
    }

    return this.issueAuthForPhone(phone, dto.userType);
  }

  async verifyOtp(dto: VerifyOtpRequest): Promise<VerifyOtpResponse> {
    await this.otp.verifyOtp(dto.phone, dto.code);
    return this.issueAuthForPhone(dto.phone, dto.userType);
  }

  private async issueAuthForPhone(
    phone: string,
    userType: 'passenger' | 'driver',
  ): Promise<VerifyOtpResponse> {
    if (userType === 'passenger') {
      let user = await this.prisma.user.findUnique({
        where: { phone },
      });
      const isNewUser = !user;
      if (!user) {
        user = await this.prisma.user.create({
          data: { phone },
        });
      }
      const tokens = await this.issueTokens({
        sub: user.id,
        type: 'passenger',
      });
      return {
        ...tokens,
        isNewUser,
        user: mapUser(user),
      };
    }

    let driver = await this.prisma.driver.findUnique({
      where: { phone },
    });
    const isNewUser = !driver;
    if (!driver) {
      driver = await this.prisma.driver.create({
        data: {
          phone,
          name: 'Driver',
          vehiclePlate: 'PENDING',
        },
      });
    }
    const tokens = await this.issueTokens({
      sub: driver.id,
      type: 'driver',
    });
    return {
      ...tokens,
      isNewUser,
      driver: mapDriver(driver),
    };
  }

  async googleAuth(dto: GoogleAuthRequest): Promise<VerifyOtpResponse> {
    const ticket = await this.googleClient.verifyIdToken({
      idToken: dto.idToken,
      audience: this.config.getOrThrow<string>('GOOGLE_OAUTH_CLIENT_ID'),
    });
    const payload = ticket.getPayload();
    if (!payload?.email) {
      throw new AppException('UNAUTHORIZED');
    }

    if (dto.userType === 'passenger') {
      let user = await this.prisma.user.findFirst({
        where: {
          OR: [{ email: payload.email }, ...(payload.sub ? [{ phone: payload.sub }] : [])],
        },
      });
      const isNewUser = !user;
      if (!user) {
        const phone =
          (payload as { phone_number?: string }).phone_number ??
          `google:${payload.sub}`;
        user = await this.prisma.user.create({
          data: {
            email: payload.email,
            phone,
            name: payload.name ?? null,
            avatarUrl: payload.picture ?? null,
            isVerified: true,
          },
        });
      }
      const tokens = await this.issueTokens({
        sub: user.id,
        type: 'passenger',
      });
      return { ...tokens, isNewUser, user: mapUser(user) };
    }

    let driver = await this.prisma.driver.findFirst({
      where: { email: payload.email },
    });
    const isNewUser = !driver;
    if (!driver) {
      driver = await this.prisma.driver.create({
        data: {
          email: payload.email,
          phone:
            (payload as { phone_number?: string }).phone_number ??
            `google:${payload.sub}`,
          name: payload.name ?? 'Driver',
          vehiclePlate: 'PENDING',
          avatarUrl: payload.picture ?? null,
        },
      });
    }
    const tokens = await this.issueTokens({
      sub: driver.id,
      type: 'driver',
    });
    return { ...tokens, isNewUser, driver: mapDriver(driver) };
  }

  async adminLogin(dto: AdminLoginDto): Promise<{
    response: { accessToken: string; accessTokenExpiresIn: number };
    refreshToken: string;
    user: any;
  }> {
    const admin = await this.prisma.adminUser.findUnique({
      where: { email: dto.email },
    });

    if (!admin || !admin.isActive) {
      throw new AppException('UNAUTHORIZED', undefined, 'Invalid credentials');
    }

    const passwordValid = await bcrypt.compare(dto.password, admin.passwordHash);
    if (!passwordValid) {
      throw new AppException('UNAUTHORIZED', undefined, 'Invalid credentials');
    }

    await this.prisma.adminUser.update({
      where: { id: admin.id },
      data: { lastLogin: new Date() },
    });

    const tokens = await this.issueTokens({
      sub: admin.id,
      type: 'admin',
      role: admin.role,
    });

    return {
      response: {
        accessToken: tokens.accessToken,
        accessTokenExpiresIn: tokens.accessTokenExpiresIn,
      },
      refreshToken: tokens.refreshToken,
      user: {
        id: admin.id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
      },
    };
  }

  async refresh(dto: RefreshTokenRequest, cookieToken?: string): Promise<{
    response: RefreshTokenResponse;
    refreshToken: string;
    setCookie: boolean;
  }> {
    const token = dto.refreshToken ?? cookieToken;
    if (!token) {
      throw new AppException('UNAUTHORIZED');
    }

    let payload: JwtPayload & { jti?: string };
    try {
      payload = await this.jwt.verifyAsync(token, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new AppException('UNAUTHORIZED');
    }

    if (!payload.jti) {
      throw new AppException('UNAUTHORIZED');
    }

    const denied = await this.redis.get(`refresh:denylist:${payload.jti}`);
    if (denied) {
      throw new AppException('UNAUTHORIZED');
    }

    const remainingTtl = await this.getRefreshRemainingTtl(token);
    await this.redis.set(
      `refresh:denylist:${payload.jti}`,
      '1',
      Math.max(remainingTtl, 1),
    );

    const tokens = await this.issueTokens({
      sub: payload.sub,
      type: payload.type,
      role: payload.role,
    });

    return {
      response: {
        accessToken: tokens.accessToken,
        accessTokenExpiresIn: tokens.accessTokenExpiresIn,
      },
      refreshToken: tokens.refreshToken!,
      setCookie: Boolean(cookieToken),
    };
  }

  async logout(
    dto: LogoutRequest,
    cookieToken?: string,
  ): Promise<{ loggedOut: boolean }> {
    const token = dto.refreshToken ?? cookieToken;
    if (!token) {
      return { loggedOut: true };
    }

    try {
      const payload = await this.jwt.verifyAsync<JwtPayload & { jti?: string }>(
        token,
        { secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET') },
      );
      if (payload.jti) {
        const remainingTtl = await this.getRefreshRemainingTtl(token);
        await this.redis.set(
          `refresh:denylist:${payload.jti}`,
          '1',
          Math.max(remainingTtl, 1),
        );
      }
    } catch {
      // ignore invalid token on logout
    }

    return { loggedOut: true };
  }

  private async issueTokens(payload: JwtPayload): Promise<{
    accessToken: string;
    refreshToken: string;
    accessTokenExpiresIn: number;
  }> {
    const accessTtl = this.config.get<number>('JWT_ACCESS_TTL', 900);
    const refreshTtl = this.config.get<number>('JWT_REFRESH_TTL', 604800);
    const jti = randomUUID();

    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: accessTtl,
    });

    const refreshToken = await this.jwt.signAsync(
      { ...payload, jti },
      {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: refreshTtl,
      },
    );

    return { accessToken, refreshToken, accessTokenExpiresIn: accessTtl };
  }

  private async getRefreshRemainingTtl(token: string): Promise<number> {
    const decoded = this.jwt.decode(token) as { exp?: number } | null;
    if (!decoded?.exp) {
      return this.config.get<number>('JWT_REFRESH_TTL', 604800);
    }
    return Math.max(decoded.exp - Math.floor(Date.now() / 1000), 1);
  }
}