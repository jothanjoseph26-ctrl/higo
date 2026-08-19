import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { EmailModule } from '../email/email.module';
import { RevenueSnapshotService } from './revenue-snapshot.service';
import { RevenueSnapshotJob } from './revenue-snapshot.job';
import { WeeklyKpiService } from './weekly-kpi.service';
import { WeeklyKpiSummaryJob } from './weekly-kpi-summary.job';
import { AutoCancelRidesService } from './auto-cancel-rides.service';
import { AutoCancelRidesJob } from './auto-cancel-rides.job';

@Module({
  imports: [ScheduleModule.forRoot(), PrismaModule, RedisModule, EmailModule],
  providers: [
    WeeklyKpiService,
    RevenueSnapshotService,
    AutoCancelRidesService,
    RevenueSnapshotJob,
    WeeklyKpiSummaryJob,
    AutoCancelRidesJob,
  ],
  exports: [WeeklyKpiService, RevenueSnapshotService, AutoCancelRidesService],
})
export class JobsModule {}
