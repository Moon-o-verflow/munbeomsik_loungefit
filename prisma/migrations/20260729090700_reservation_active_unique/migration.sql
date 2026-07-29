CREATE UNIQUE INDEX "uq_reservation_active"
ON "reservation" ("class_schedule_id", "member_id")
WHERE "status" = 'RESERVED';
