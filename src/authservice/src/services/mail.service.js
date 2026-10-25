import nodemailer from 'nodemailer';
import { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM } from '../config/config.js';
import { otpTypesEnum } from '../utils/otp.types.js';

const subjects = {
  [otpTypesEnum.confirmEmail]: 'Confirm your Shopora email',
  [otpTypesEnum.resetPassword]: 'Reset your Shopora password',
};

const intros = {
  [otpTypesEnum.confirmEmail]: 'Use this code to confirm your email',
  [otpTypesEnum.resetPassword]: 'Use this code to reset your password',
};

let transporter;
let customSender = null;

// lets tests (or another mail provider) take over the sending
export const setMailSender = (sender) => {
  customSender = sender;
};

const getTransporter = () => {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
    });
  }
  return transporter;
};

export const buildOtpEmail = ({ email, otp, otpType }) => {
  const minutes = 10;
  return {
    from: MAIL_FROM,
    to: email,
    subject: subjects[otpType],
    text: `${intros[otpType]}: ${otp}\nIt expires in ${minutes} minutes. If this was not you, ignore this email.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:420px;margin:auto">
      <h2 style="color:#6C3AFF">Shopora</h2>
      <p>${intros[otpType]}:</p>
      <p style="font-size:32px;letter-spacing:6px;font-weight:bold;color:#0F172A">${otp}</p>
      <p style="color:#64748b">It expires in ${minutes} minutes. If this was not you, ignore this email.</p>
    </div>`,
  };
};

export const sendOtpEmail = async ({ email, otp, otpType, send }) => {
  const message = buildOtpEmail({ email, otp, otpType });

  const sender = send ?? customSender;
  if (sender) return await sender(message);

  if (!SMTP_HOST) {
    // development: no SMTP configured
    console.log(`[mail] SMTP is not configured. ${otpType} code for ${email}: ${otp}`);
    return { logged: true };
  }

  return await getTransporter().sendMail(message);
};
