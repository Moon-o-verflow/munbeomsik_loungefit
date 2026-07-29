ALTER TABLE "policy"
ADD CONSTRAINT "policy_id_must_be_one" CHECK ("id" = 1);
