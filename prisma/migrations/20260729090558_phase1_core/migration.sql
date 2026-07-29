-- CreateEnum
CREATE TYPE "ManagerRole" AS ENUM ('MANAGER', 'ADMIN');

-- CreateEnum
CREATE TYPE "TicketUsageStatus" AS ENUM ('HOLD', 'CONFIRMED', 'CONSUMED', 'RELEASED');

-- CreateEnum
CREATE TYPE "ClassScheduleStatus" AS ENUM ('SCHEDULED', 'CLOSED', 'CANCELED');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('RESERVED', 'CANCELED', 'LATE_CANCELED', 'ATTENDED', 'NO_SHOW', 'CLASS_CANCELED');

-- CreateEnum
CREATE TYPE "ReservationSource" AS ENUM ('MEMBER', 'PROXY');

-- CreateTable
CREATE TABLE "branch" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "branch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member" (
    "id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "phone_last4" TEXT NOT NULL,
    "is_suspended" BOOLEAN NOT NULL DEFAULT false,
    "suspended_reason" TEXT,
    "suspended_until" DATE,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manager" (
    "id" UUID NOT NULL,
    "branch_id" UUID,
    "login_id" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "ManagerRole" NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "manager_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_type" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket" (
    "id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "ticket_type_id" UUID NOT NULL,
    "total_count" INTEGER NOT NULL,
    "expires_at" DATE NOT NULL,
    "daily_limit" INTEGER,
    "weekly_limit" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_usage" (
    "id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "class_schedule_id" UUID,
    "status" "TicketUsageStatus" NOT NULL,
    "released_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_usage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_schedule" (
    "id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "ticket_type_id" UUID NOT NULL,
    "instructor_name" TEXT NOT NULL,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "capacity" INTEGER NOT NULL,
    "reserved_count" INTEGER NOT NULL DEFAULT 0,
    "status" "ClassScheduleStatus" NOT NULL DEFAULT 'SCHEDULED',
    "canceled_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "class_schedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservation" (
    "id" UUID NOT NULL,
    "class_schedule_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "ticket_usage_id" UUID NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'RESERVED',
    "source" "ReservationSource" NOT NULL DEFAULT 'MEMBER',
    "created_by_manager_id" UUID,
    "canceled_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "policy" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "cancel_deadline_minutes" INTEGER NOT NULL,
    "rolling_open_days" INTEGER NOT NULL,
    "rolling_open_hour" INTEGER NOT NULL,
    "waitlist_timeout_minutes" INTEGER NOT NULL,
    "waitlist_urgent_timeout_minutes" INTEGER NOT NULL,
    "waitlist_urgent_threshold_minutes" INTEGER NOT NULL,
    "quiet_hours_start" INTEGER NOT NULL,
    "quiet_hours_end" INTEGER NOT NULL,
    "class_close_deadline_minutes" INTEGER NOT NULL,
    "class_min_headcount" INTEGER NOT NULL,
    "noshow_threshold_count" INTEGER NOT NULL,
    "noshow_suspend_days" INTEGER NOT NULL,
    "noshow_reset_cycle" TEXT NOT NULL DEFAULT 'MONTHLY',
    "proxy_booking_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "policy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_code" (
    "id" UUID NOT NULL,
    "phone" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "consumed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_code_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "member_phone_key" ON "member"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "manager_login_id_key" ON "manager"("login_id");

-- CreateIndex
CREATE UNIQUE INDEX "ticket_type_code_key" ON "ticket_type"("code");

-- CreateIndex
CREATE INDEX "ticket_usage_ticket_id_status_idx" ON "ticket_usage"("ticket_id", "status");

-- CreateIndex
CREATE INDEX "ticket_usage_member_id_class_schedule_id_idx" ON "ticket_usage"("member_id", "class_schedule_id");

-- CreateIndex
CREATE INDEX "class_schedule_branch_id_starts_at_idx" ON "class_schedule"("branch_id", "starts_at");

-- CreateIndex
CREATE UNIQUE INDEX "reservation_ticket_usage_id_key" ON "reservation"("ticket_usage_id");

-- CreateIndex
CREATE INDEX "reservation_member_id_status_idx" ON "reservation"("member_id", "status");

-- CreateIndex
CREATE INDEX "reservation_class_schedule_id_status_idx" ON "reservation"("class_schedule_id", "status");

-- CreateIndex
CREATE INDEX "auth_code_phone_expires_at_idx" ON "auth_code"("phone", "expires_at");

-- AddForeignKey
ALTER TABLE "member" ADD CONSTRAINT "member_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manager" ADD CONSTRAINT "manager_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_ticket_type_id_fkey" FOREIGN KEY ("ticket_type_id") REFERENCES "ticket_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_usage" ADD CONSTRAINT "ticket_usage_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_usage" ADD CONSTRAINT "ticket_usage_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_usage" ADD CONSTRAINT "ticket_usage_class_schedule_id_fkey" FOREIGN KEY ("class_schedule_id") REFERENCES "class_schedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_schedule" ADD CONSTRAINT "class_schedule_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_schedule" ADD CONSTRAINT "class_schedule_ticket_type_id_fkey" FOREIGN KEY ("ticket_type_id") REFERENCES "ticket_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation" ADD CONSTRAINT "reservation_class_schedule_id_fkey" FOREIGN KEY ("class_schedule_id") REFERENCES "class_schedule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation" ADD CONSTRAINT "reservation_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation" ADD CONSTRAINT "reservation_ticket_usage_id_fkey" FOREIGN KEY ("ticket_usage_id") REFERENCES "ticket_usage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation" ADD CONSTRAINT "reservation_created_by_manager_id_fkey" FOREIGN KEY ("created_by_manager_id") REFERENCES "manager"("id") ON DELETE SET NULL ON UPDATE CASCADE;
