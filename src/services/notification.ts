export type NotificationTemplate = "WAIT_OPEN" | "WAIT_EXPIRED" | "CLASS_CANCELED" | "CLASS_CLOSED" | "INSTRUCTOR_CHANGED" | "BOOKING_BLOCKED";

export interface NotificationSender {
  send(input: { memberId: string; template: NotificationTemplate; payload: Record<string, string> }): Promise<{ channel: string; status: "SENT" | "FAILED" }>;
}

export const mockNotificationSender: NotificationSender = {
  async send() {
    return { channel: "mock", status: "SENT" };
  },
};
