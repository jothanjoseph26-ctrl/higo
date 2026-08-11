import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { AuthGuard } from '../common/guards/auth.guard';
import { RateLimit, RateLimitGuard } from '../common/guards/rate-limit.guard';
import { AuthService } from './auth.service';
import {
  AdminLoginDto,
  GoogleAuthDto,
  LogoutDto,
  RefreshTokenDto,
  SendOtpDto,
  VerifyOtpDto,
  VerifyFirebasePhoneDto,
} from './dto/auth.dto';

const REFRESH_COOKIE = 'higo_rt';
// The API and every web client that consumes it live on different
// subdomains (api.hiconnectgo.com vs pilot./ride./portal.hiconnectgo.com) -
// a cookie set with no explicit Domain defaults to host-only scope
// (api.hiconnectgo.com alone) and is never sent on cross-subdomain
// requests, credentials: 'include' or not. That silently broke refresh for
// every real browser/WebView user: the 15-minute access token expires,
// the refresh call has no cookie to read, and the client force-logs-out
// and re-sends an OTP - repeatedly, all day, for every active user.
const COOKIE_DOMAIN = process.env.NODE_ENV === 'production' ? '.hiconnectgo.com' : undefined;

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Get('firebase-config')
  firebaseConfig() {
    return this.auth.getFirebaseWebConfig();
  }

  @Public()
  @UseGuards(RateLimitGuard)
  @RateLimit({
    scope: 'send-otp',
    limit: 5,
    windowSeconds: 3600,
    keyFrom: 'phone',
  })
  @Post('send-otp')
  sendOtp(@Body() dto: SendOtpDto) {
    return this.auth.sendOtp(dto);
  }

  @Public()
  @Post('verify-firebase-phone')
  async verifyFirebasePhone(
    @Body() dto: VerifyFirebasePhoneDto,
    @Headers('x-client-platform') platform: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.verifyFirebasePhone(dto);
    return this.attachRefresh(result, platform, res);
  }

  @Public()
  @Post('verify-otp')
  async verifyOtp(
    @Body() dto: VerifyOtpDto,
    @Headers('x-client-platform') platform: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.verifyOtp(dto);
    return this.attachRefresh(result, platform, res);
  }

  @Public()
  @Post('google')
  async google(
    @Body() dto: GoogleAuthDto,
    @Headers('x-client-platform') platform: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.googleAuth(dto);
    return this.attachRefresh(result, platform, res);
  }

  @Public()
  @Post('refresh')
  async refresh(
    @Body() dto: RefreshTokenDto,
    @Headers('x-client-platform') platform: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const cookieToken = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    const { response, refreshToken, setCookie } = await this.auth.refresh(
      dto,
      cookieToken,
    );

    if (setCookie) {
      this.setRefreshCookie(res, refreshToken);
      // App-like clients (native shell, installed PWA) also need the rotated
      // token in the body so they can persist it in localStorage - their
      // cookie jar isn't a dependable home for a 30-day credential. Without
      // this, a session created before the client began identifying itself as
      // app-like would stay cookie-only until the next full login.
      return platform && platform !== 'web'
        ? { ...response, refreshToken }
        : response;
    }

    return { ...response, refreshToken };
  }

  @Public()
  @UseGuards(RateLimitGuard)
  @RateLimit({ scope: 'admin-login', limit: 10, windowSeconds: 3600, keyFrom: 'email' })
  @Post('admin/login')
  async adminLogin(
    @Body() dto: AdminLoginDto,
    @Headers('x-client-platform') platform: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.adminLogin(dto);
    return this.attachRefresh(result, platform, res);
  }

  @UseGuards(AuthGuard)
  @Post('logout')
  async logout(
    @Body() dto: LogoutDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const cookieToken = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    const result = await this.auth.logout(dto, cookieToken);
    res.clearCookie(REFRESH_COOKIE, { path: '/', domain: COOKIE_DOMAIN });
    return result;
  }

  private attachRefresh<T extends { refreshToken?: string }>(
    result: T,
    platform: string | undefined,
    res: Response,
  ): T {
    if (platform === 'web' && result.refreshToken) {
      this.setRefreshCookie(res, result.refreshToken);
      const { refreshToken: _removed, ...rest } = result;
      return rest as T;
    }
    return result;
  }

  private setRefreshCookie(res: Response, token: string): void {
    const refreshTtl = this.config.get<number>('JWT_REFRESH_TTL', 2592000);
    res.cookie(REFRESH_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      domain: COOKIE_DOMAIN,
      maxAge: refreshTtl * 1000,
    });
  }
}