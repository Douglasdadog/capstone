import nodemailer from "nodemailer";
import { Resend } from "resend";

type EmailPayload = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

async function sendViaResend(payload: EmailPayload) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not set.");
  }

  const resend = new Resend(apiKey);
  const from = process.env.MAIL_FROM ?? "WIS <onboarding@resend.dev>";

  const { error } = await resend.emails.send({
    from,
    to: payload.to,
    subject: payload.subject,
    text: payload.text,
    html: payload.html
  });

  if (error) {
    throw new Error(error.message);
  }
}

async function sendViaSmtp(payload: EmailPayload) {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.MAIL_FROM ?? "WIS <no-reply@wis.local>";

  if (!host || !user || !pass) {
    throw new Error("Missing SMTP config: SMTP_HOST, SMTP_USER, SMTP_PASS.");
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass }
  });

  await transporter.sendMail({
    from,
    to: payload.to,
    subject: payload.subject,
    text: payload.text,
    html: payload.html
  });
}

export async function sendSmtpEmail(payload: EmailPayload) {
  await sendViaSmtp(payload);
}

export async function sendEmail(payload: EmailPayload) {
  if (process.env.RESEND_API_KEY?.trim()) {
    await sendViaResend(payload);
    return;
  }

  await sendViaSmtp(payload);
}
