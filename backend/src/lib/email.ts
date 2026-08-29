export interface InvitationEmailPayload {
  teamName: string;
  inviterName: string;
  invitedRole: string;
  /** Raw invite token — the frontend/email template turns this into an accept link. */
  token: string;
}

/**
 * Abstraction over however invite emails actually get sent, so
 * lib/invitation.ts never needs to change when a real provider (Resend,
 * SMTP, ...) is wired up — only getEmailService()'s return value would. Same
 * shape as lib/notification.ts's NotificationService for the same reason.
 */
export interface EmailService {
  sendInvitationEmail(to: string, payload: InvitationEmailPayload): Promise<void>;
}

/**
 * The only implementation for now. No provider has been chosen yet (see
 * DECISIONS.md) — this project has no Resend/SMTP credentials to call an
 * actual API with. Logging exactly what *would* be sent, to whom, is honest
 * about that (per this repo's "no fake functionality presented as working"
 * guardrail) rather than silently no-op'ing or pretending delivery
 * succeeded. The raw token is still returned in the invitation-creation API
 * response regardless, so inviting someone works today even with no email
 * provider configured — this service is a delivery convenience on top of
 * that, not the only way to get the token to the invitee.
 */
class ConsoleEmailService implements EmailService {
  async sendInvitationEmail(to: string, payload: InvitationEmailPayload): Promise<void> {
    console.log("invitation email (no email provider configured yet — logging only)", { to, ...payload });
  }
}

let instance: EmailService | undefined;

export function getEmailService(): EmailService {
  if (!instance) {
    instance = new ConsoleEmailService();
  }
  return instance;
}
