-- CreateEnum
CREATE TYPE "WaitlistStatus" AS ENUM ('WAITING', 'OFFERED', 'CONFIRMED', 'EXPIRED', 'RELEASED');

-- CreateTable
CREATE TABLE "waitlist_entry" (
    "id" UUID NOT NULL,
    "class_schedule_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "ticket_usage_id" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "status" "WaitlistStatus" NOT NULL DEFAULT 'WAITING',
    "offered_at" TIMESTAMPTZ(3),
    "expires_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "waitlist_entry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "waitlist_entry_ticket_usage_id_key" ON "waitlist_entry"("ticket_usage_id");

-- CreateIndex
CREATE INDEX "waitlist_entry_class_schedule_id_status_sequence_idx" ON "waitlist_entry"("class_schedule_id", "status", "sequence");

-- CreateIndex
CREATE INDEX "waitlist_entry_status_expires_at_idx" ON "waitlist_entry"("status", "expires_at");

-- CreateIndex
CREATE INDEX "waitlist_entry_member_id_status_idx" ON "waitlist_entry"("member_id", "status");

-- AddForeignKey
ALTER TABLE "waitlist_entry" ADD CONSTRAINT "waitlist_entry_class_schedule_id_fkey" FOREIGN KEY ("class_schedule_id") REFERENCES "class_schedule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waitlist_entry" ADD CONSTRAINT "waitlist_entry_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waitlist_entry" ADD CONSTRAINT "waitlist_entry_ticket_usage_id_fkey" FOREIGN KEY ("ticket_usage_id") REFERENCES "ticket_usage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
