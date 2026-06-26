import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { RevenueSnapshotService } from './revenue-snapshot.service';
import { RevenueSnapshotJob } from './revenue-snapshot.job';
import { WeeklyKpiService } from './weekly-kpi.service';
import { WeeklyKpiSummaryJob } from './weekly-kpi-summary.job';

@Module({
  imports: [ScheduleModule.forRoot(), PrismaModule, RedisModule],
  providers: [
    WeeklyKpiService,
    RevenueSnapshotService,
    RevenueSnapshotJob,
    WeeklyKpiSummaryJob,
  ],
  exports: [WeeklyKpiService, RevenueSnapshotService],
})
export class JobsModule {}