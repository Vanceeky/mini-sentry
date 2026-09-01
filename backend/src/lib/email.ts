import nodemailer, { type Transporter } from "nodemailer";

export interface InvitationEmailPayload {
  projectName: string;
  inviterName: string;
  /** Raw invite token — used to build the accept/register link, or shown as plain-text fallback. */
  token: string;
}

/**
 * Abstraction over however invite emails actually get sent, so
 * lib/invitation.ts never needs to change when the delivery mechanism
 * changes — only getEmailService()'s return value would. Same shape as
 * lib/notification.ts's NotificationService for the same reason.
 */
export interface EmailService {
  sendInvitationEmail(to: string, payload: InvitationEmailPayload): Promise<void>;
}

/**
 * Fallback used whenever SMTP isn't fully configured (e.g. local dev, or a
 * fresh deploy before SMTP_* env vars are set) — never a hard failure to
 * run the app at all. Logging exactly what *would* be sent, to whom, is
 * honest about that (per this repo's "no fake functionality presented as
 * working" guardrail) rather than silently no-op'ing or pretending delivery
 * succeeded. The raw token is also always returned in the invitation-
 * creation API response regardless, so inviting someone works today even
 * with no SMTP configured.
 */
class ConsoleEmailService implements EmailService {
  async sendInvitationEmail(to: string, payload: InvitationEmailPayload): Promise<void> {
    console.log("invitation email (SMTP not configured — logging only)", { to, ...payload });
  }
}

/**
 * Real delivery via SMTP (e.g. Gmail with an account "App Password":
 * https://myaccount.google.com/apppasswords). Constructed once and reused
 * — nodemailer transporters pool connections. Only ever selected by
 * getEmailService() when every one of SMTP_HOST/PORT/USER/PASS/FROM is
 * present; never half-configured.
 */
class SmtpEmailService implements EmailService {
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(config: { host: string; port: number; user: string; pass: string; from: string }) {
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      // Implicit TLS on 465; STARTTLS otherwise (587/25) — nodemailer
      // negotiates STARTTLS automatically when secure is false and the
      // server supports it, which covers Gmail's smtp.gmail.com:587.
      secure: config.port === 465,
      auth: { user: config.user, pass: config.pass },
    });
    this.from = config.from;
  }

  async sendInvitationEmail(to: string, payload: InvitationEmailPayload): Promise<void> {
    const webAppBaseUrl = process.env.WEB_APP_BASE_URL?.trim();
    const subject = `${payload.inviterName} invited you to join "${payload.projectName}" on Canary`;

    // No frontend is deployed yet to build a real accept link for — never
    // link to a page that doesn't exist. WEB_APP_BASE_URL lets this switch
    // on the moment one is, with no other code change.
    const bodyLines = webAppBaseUrl
      ? [
          `${payload.inviterName} has invited you to join the "${payload.projectName}" project on Canary.`,
          "",
          `Accept your invitation: ${webAppBaseUrl.replace(/\/$/, "")}/invitations/accept?token=${payload.token}`,
          "",
          "If you don't have an account yet, that link will let you create one and join automatically.",
        ]
      : [
          `${payload.inviterName} has invited you to join the "${payload.projectName}" project on Canary.`,
          "",
          "There's no web app link available yet for accepting this invitation directly. Use this invitation token when registering or accepting via the API:",
          "",
          payload.token,
          "",
          "(If you're not sure what to do with this, ask whoever invited you.)",
        ];

    await this.transporter.sendMail({ from: this.from, to, subject, text: bodyLines.join("\n") });
  }
}

let instance: EmailService | undefined;

export function getEmailService(): EmailService {
  if (!instance) {
    const host = process.env.SMTP_HOST?.trim();
    const portRaw = process.env.SMTP_PORT?.trim();
    const user = process.env.SMTP_USER?.trim();
    const pass = process.env.SMTP_PASS?.trim();
    const from = process.env.SMTP_FROM?.trim();

    if (host && portRaw && user && pass && from) {
      const port = Number(portRaw);
      // A malformed SMTP_PORT falls back rather than crashing at import
      // time — consistent with "never a hard failure" above.
      instance = Number.isFinite(port) ? new SmtpEmailService({ host, port, user, pass, from }) : new ConsoleEmailService();
    } else {
      instance = new ConsoleEmailService();
    }
  }
  return instance;
}
