-- CreateTable
CREATE TABLE "revenue_daily_summary" (
    "date" TIMESTAMP(3) NOT NULL,
    "gross_gmv" INTEGER NOT NULL DEFAULT 0,
    "platform_commission" INTEGER NOT NULL DEFAULT 0,
    "subscription_revenue" INTEGER NOT NULL DEFAULT 0,
    "verification_revenue" INTEGER NOT NULL DEFAULT 0,
    "cash_fee_collected" INTEGER NOT NULL DEFAULT 0,
    "cash_fee_outstanding" INTEGER NOT NULL DEFAULT 0,
    "refunds_issued" INTEGER NOT NULL DEFAULT 0,
    "net_revenue" INTEGER NOT NULL DEFAULT 0,
    "active_drivers" INTEGER NOT NULL DEFAULT 0,
    "completed_trips" INTEGER NOT NULL DEFAULT 0,
    "avg_trip_value" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "revenue_daily_summary_pkey" PRIMARY KEY ("date")
);