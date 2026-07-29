CREATE UNIQUE INDEX "uq_waitlist_active"
ON "waitlist_entry" ("class_schedule_id", "member_id")
WHERE "status" IN ('WAITING', 'OFFERED');
