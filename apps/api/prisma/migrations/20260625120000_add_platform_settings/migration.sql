-- CreateTable
CREATE TABLE "platform_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "settings" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("id")
);

-- Seed default platform settings (singleton row)
INSERT INTO "platform_settings" ("id", "settings", "updated_at")
VALUES (
    'default',
    '{
        "googleMapsOriginRestriction": "https://admin.higo.ng/*",
        "smsGatewayChannel": "termii",
        "fcmServerKey": "",
        "maintenanceMode": false
    }'::jsonb,
    CURRENT_TIMESTAMP
);