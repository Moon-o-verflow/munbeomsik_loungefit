import type { Policy } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { PolicyValidationError } from "@/lib/errors";

export type PolicyPatch = Partial<Pick<Policy,
  "cancelDeadlineMinutes" | "rollingOpenDays" | "rollingOpenHour" |
  "waitlistTimeoutMinutes" | "waitlistUrgentTimeoutMinutes" | "waitlistUrgentThresholdMinutes" |
  "quietHoursStart" | "quietHoursEnd" | "classCloseDeadlineMinutes" | "classMinHeadcount" |
  "noshowThresholdCount" | "noshowSuspendDays" | "noshowResetCycle" | "proxyBookingEnabled"
>>;

export async function getAdminPolicy() {
  return prisma.policy.findUniqueOrThrow({ where: { id: 1 } });
}

export async function updateAdminPolicy(input: PolicyPatch) {
  const errors: Record<string, string> = {};
  const positive = ["waitlistTimeoutMinutes", "waitlistUrgentTimeoutMinutes", "waitlistUrgentThresholdMinutes", "classMinHeadcount", "noshowThresholdCount", "noshowSuspendDays"] as const;
  for (const field of positive) {
    const value = input[field];
    if (value !== undefined && (!Number.isInteger(value) || value < 1)) errors[field] = "1 이상의 정수여야 합니다.";
  }
  if (input.cancelDeadlineMinutes !== undefined && (!Number.isInteger(input.cancelDeadlineMinutes) || input.cancelDeadlineMinutes < 120)) errors.cancelDeadlineMinutes = "취소 마감은 수업 시작 120분 전보다 이를 수 없습니다.";
  if (input.classCloseDeadlineMinutes !== undefined && (!Number.isInteger(input.classCloseDeadlineMinutes) || input.classCloseDeadlineMinutes < 0)) errors.classCloseDeadlineMinutes = "0 이상의 정수여야 합니다.";
  if (input.rollingOpenDays !== undefined && (!Number.isInteger(input.rollingOpenDays) || input.rollingOpenDays < 0 || input.rollingOpenDays > 60)) errors.rollingOpenDays = "0~60일 범위여야 합니다.";
  for (const field of ["rollingOpenHour", "quietHoursStart", "quietHoursEnd"] as const) {
    const value = input[field];
    if (value !== undefined && (!Number.isInteger(value) || value < 0 || value > 23)) errors[field] = "0~23시 범위여야 합니다.";
  }
  if (input.noshowResetCycle !== undefined && input.noshowResetCycle !== "MONTHLY") errors.noshowResetCycle = "MONTHLY만 사용할 수 있습니다.";
  if (Object.keys(errors).length > 0) throw new PolicyValidationError(errors);
  return prisma.policy.update({ where: { id: 1 }, data: input });
}
