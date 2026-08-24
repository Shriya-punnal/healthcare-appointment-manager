import { TRPCError } from "@trpc/server";

export type WorkingWindow = { weekday: number; startMinute: number; endMinute: number; enabled: boolean };

function localParts(value: Date, timezone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(formatter.formatToParts(value).filter(part => part.type !== "literal").map(part => [part.type, part.value]));
  const weekdays: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { weekday: weekdays[parts.weekday] ?? -1, minute: Number(parts.hour) * 60 + Number(parts.minute) };
}

export function assertBookableSlot({
  startsAt,
  endsAt,
  timezone,
  durationMinutes,
  workingHours,
}: {
  startsAt: Date;
  endsAt: Date;
  timezone: string;
  durationMinutes: number;
  workingHours: WorkingWindow[];
}) {
  if (startsAt.getTime() <= Date.now()) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "PAST_SLOT: Appointment time must be in the future." });
  }
  if (endsAt.getTime() - startsAt.getTime() !== durationMinutes * 60_000) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "VALIDATION_ERROR: Slot duration does not match this doctor's schedule." });
  }
  const start = localParts(startsAt, timezone);
  const end = localParts(endsAt, timezone);
  const window = workingHours.find(item => item.enabled && item.weekday === start.weekday);
  if (!window || end.weekday !== start.weekday || start.minute < window.startMinute || end.minute > window.endMinute) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "OUTSIDE_WORKING_HOURS: This time is outside the doctor's published hours." });
  }
  if ((start.minute - window.startMinute) % durationMinutes !== 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "VALIDATION_ERROR: The selected time is not an available slot boundary." });
  }
}

export function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  return aStart.getTime() < bEnd.getTime() && aEnd.getTime() > bStart.getTime();
}

export function conflictError() {
  return new TRPCError({
    code: "CONFLICT",
    message: "SLOT_ALREADY_BOOKED: Sorry, this appointment slot was just booked by another patient.",
  });
}
