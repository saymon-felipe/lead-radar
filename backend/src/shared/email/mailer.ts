import nodemailer from "nodemailer";

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

function smtpPort(): number {
  return Number(process.env.SMTP_PORT ?? 587);
}

function smtpSecure(): boolean {
  return String(process.env.SMTP_SECURE ?? "false").toLowerCase() === "true";
}

function fromAddress(): string {
  return process.env.MAIL_FROM ?? "Lead Radar <no-reply@lead-radar.local>";
}

function createTransporter() {
  if (!process.env.SMTP_HOST) {
    return nodemailer.createTransport({ jsonTransport: true });
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: smtpPort(),
    secure: smtpSecure(),
    auth: process.env.SMTP_USER
      ? {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS ?? ""
        }
      : undefined
  });
}

export async function sendMail(message: MailMessage) {
  const transporter = createTransporter();
  const result = await transporter.sendMail({
    from: fromAddress(),
    ...message
  });

  if (!process.env.SMTP_HOST) {
    console.info("[mail:dev]", JSON.stringify(result));
  }

  return result;
}
