import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { logger } from '../lib/logger.js';

let _transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (!_transporter) {
    _transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'localhost',
      port: Number(process.env.SMTP_PORT) || 1025,
      secure: process.env.SMTP_SECURE === 'true',
      auth:
        process.env.SMTP_USER && process.env.SMTP_PASS
          ? {
              user: process.env.SMTP_USER,
              pass: process.env.SMTP_PASS,
            }
          : undefined,
    });
  }
  return _transporter;
}

/** Retry a function with exponential backoff (max 3 retries, 1s/2s/4s delays). */
async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  const maxRetries = 3;
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        const delay = 1000 * Math.pow(2, attempt); // 1s, 2s, 4s
        logger.warn(`[email] ${label} attempt ${attempt + 1} failed, retrying in ${delay}ms`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
}

// Email content templates by language
const templates: Record<string, { subject: string; title: string; greeting: (u: string) => string; body: string; button: string; expiry: string; fallback: string; text: (url: string) => string }> = {
  en: {
    subject: 'Password Reset — CoMD',
    title: 'CoMD — Password Reset',
    greeting: (u) => `Hi ${u},`,
    body: 'We received a request to reset your password. Click the button below to reset it.',
    button: 'Reset Password',
    expiry: 'This link is valid for 15 minutes. If you did not request a password reset, please ignore this email.',
    fallback: 'If the button does not work, copy the link below into your browser:',
    text: (url) => `Reset your CoMD password by visiting: ${url}\n\nThis link is valid for 15 minutes. If you did not request a password reset, please ignore this email.`,
  },
  zh: {
    subject: '密码重置 — CoMD',
    title: 'CoMD — 密码重置',
    greeting: (u) => `你好 ${u}，`,
    body: '我们收到了你的密码重置请求。点击下方按钮重置密码。',
    button: '重置密码',
    expiry: '此链接在 15 分钟内有效。如果这不是你本人的操作，请忽略此邮件。',
    fallback: '如果按钮无法点击，请复制以下链接到浏览器：',
    text: (url) => `请访问以下链接重置 CoMD 密码：${url}\n\n此链接在 15 分钟内有效。如果这不是你本人的操作，请忽略此邮件。`,
  },
};

function getTemplate(lang?: string) {
  return templates[lang || ''] ?? templates.en;
}

export class EmailService {
  async sendPasswordResetEmail(to: string, username: string, resetToken: string, lang?: string): Promise<void> {
    const baseUrl = process.env.PASSWORD_RESET_BASE_URL || '';
    const from = process.env.SMTP_FROM || 'noreply@collab.local';

    if (!baseUrl) {
      throw new Error('PASSWORD_RESET_BASE_URL is not set — cannot send password reset email');
    }
    // Enforce HTTPS in production to prevent reset links from being sent over plaintext
    if (process.env.NODE_ENV === 'production' && !baseUrl.startsWith('https://')) {
      throw new Error('PASSWORD_RESET_BASE_URL must use HTTPS in production');
    }
    if (!to || !username || !resetToken) {
      throw new Error('Missing required fields for password reset email');
    }
    // HTML-escape user-controlled values to prevent XSS in email clients
    const safeUsername = String(username).replace(/[&<>"]/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] || c
    );
    const resetUrl = `${baseUrl}/password-reset/${resetToken}`;
    const t = getTemplate(lang);

    const html = `<!DOCTYPE html>
<html lang="${lang || 'en'}">
<head><meta charset="utf-8"></head>
<body style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
  <h2 style="color: #1a1a1a;">${t.title}</h2>
  <p style="color: #555;">${t.greeting(safeUsername)}</p>
  <p style="color: #555;">${t.body}</p>
  <p style="text-align: center; margin: 32px 0;">
    <a href="${resetUrl}"
       style="display: inline-block; padding: 12px 32px; background: #2563eb; color: #fff; text-decoration: none; border-radius: 6px; font-size: 14px; white-space: nowrap;">
      ${t.button}
    </a>
  </p>
  <p style="color: #888; font-size: 13px;">${t.expiry}</p>
  <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
  <p style="color: #aaa; font-size: 12px;">${t.fallback}<br><code style="word-break: break-all;">${resetUrl}</code></p>
</body>
</html>`;

    await withRetry(
      () =>
        getTransporter().sendMail({
          from: `CoMD <${from}>`,
          to,
          subject: t.subject,
          html,
          text: t.text(resetUrl),
        }),
      'sendPasswordResetEmail'
    );
  }
}

export const emailService = new EmailService();
