import dayjs, { type ConfigType } from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);
dayjs.extend(timezone);

export const KST_TIME_ZONE = "Asia/Seoul";

export function kstNow() {
  return dayjs().tz(KST_TIME_ZONE);
}

export function toKst(value: ConfigType) {
  return dayjs(value).tz(KST_TIME_ZONE);
}

export function kstDateString(value: ConfigType) {
  return toKst(value).format("YYYY-MM-DD");
}

export function kstIsoString(value: ConfigType) {
  return toKst(value).format("YYYY-MM-DDTHH:mm:ssZ");
}

export function kstDayBounds(value: ConfigType) {
  const start = toKst(value).startOf("day");
  return {
    start: start.toDate(),
    end: start.add(1, "day").toDate(),
  };
}

export function kstWeekBounds(value: ConfigType) {
  const kst = toKst(value).startOf("day");
  const daysSinceMonday = (kst.day() + 6) % 7;
  const start = kst.subtract(daysSinceMonday, "day");
  return {
    start: start.toDate(),
    end: start.add(7, "day").toDate(),
  };
}

export function kstDateRange(date: string) {
  const start = dayjs.tz(date, "YYYY-MM-DD", KST_TIME_ZONE).startOf("day");
  return { start: start.toDate(), end: start.add(1, "day").toDate() };
}

export function isRollingOpen(
  startsAt: Date,
  rollingOpenDays: number,
  now: ConfigType = new Date(),
) {
  const lastOpenDate = toKst(now).startOf("day").add(rollingOpenDays, "day");
  return !toKst(startsAt).startOf("day").isAfter(lastOpenDate);
}

export function cancelDeadlineAt(startsAt: Date, cancelDeadlineMinutes: number) {
  return toKst(startsAt).subtract(cancelDeadlineMinutes, "minute").toDate();
}

export function isQuietHours(quietHoursStart: number, quietHoursEnd: number, now: ConfigType = new Date()) {
  const hour = toKst(now).hour();
  if (quietHoursStart < quietHoursEnd) {
    return hour >= quietHoursStart && hour < quietHoursEnd;
  }
  return hour >= quietHoursStart || hour < quietHoursEnd;
}
