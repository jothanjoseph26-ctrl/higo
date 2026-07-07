CREATE TABLE "driver_training_completions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "driver_id" UUID NOT NULL,
    "module_key" TEXT NOT NULL,
    "completed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "score" INTEGER,
    "metadata" JSONB,

    CONSTRAINT "driver_training_completions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "driver_training_completions_driver_id_module_key_key"
    ON "driver_training_completions"("driver_id", "module_key");
CREATE INDEX "driver_training_completions_driver_id_idx"
    ON "driver_training_completions"("driver_id");

ALTER TABLE "driver_training_completions"
    ADD CONSTRAINT "driver_training_completions_driver_id_fkey"
    FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
