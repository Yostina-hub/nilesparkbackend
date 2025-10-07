import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter, SendMailOptions } from 'nodemailer';

export type EmailJobData = {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  template?: string;
  data?: Record<string, any>;
  headers?: Record<string, string>;
};

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: Transporter;
  private defaultFrom = 'no-reply@sandbox.local';

  constructor(@Optional() private readonly config?: ConfigService) {
    // Resolve config (works with or without ConfigService)
    const host = this.config?.get<string>('SMTP_HOST') ?? process.env.SMTP_HOST;
    const port = Number(
      this.config?.get<string>('SMTP_PORT') ?? process.env.SMTP_PORT ?? 1025,
    );
    const secure =
      (
        this.config?.get<string>('SMTP_SECURE') ??
        process.env.SMTP_SECURE ??
        'false'
      ).toLowerCase() === 'true';
    const url =
      this.config?.get<string>('SMTP_URL') ??
      process.env.SMTP_URL ??
      process.env.MAILHOG_SMTP; // e.g. smtp://mailhog:1025
    const user =
      this.config?.get<string>('SMTP_USER') ?? process.env.SMTP_USER ?? '';
    const pass =
      this.config?.get<string>('SMTP_PASS') ?? process.env.SMTP_PASS ?? '';
    this.defaultFrom =
      this.config?.get<string>('EMAIL_FROM') ??
      process.env.EMAIL_FROM ??
      'Dev Mailer <dev@localhost>';

    // Prefer host/port, then URL, then dev default
    if (host) {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure, // MailHog -> false
        auth: user || pass ? { user, pass } : undefined,
      });
      this.logger.log(`SMTP via host: ${host}:${port} (secure=${secure})`);
    } else if (url) {
      this.transporter = nodemailer.createTransport(url);
      this.logger.log(`SMTP via url: ${url}`);
    } else {
      // dev-friendly default for docker-compose service named "mailhog"
      this.transporter = nodemailer.createTransport('smtp://mailhog:1025');
      this.logger.log('SMTP via default: smtp://mailhog:1025');
    }

    // Non-fatal verify to surface connectivity status
    this.transporter
      .verify()
      .then(() => this.logger.log('SMTP verify: OK'))
      .catch((err) => this.logger.warn(`SMTP verify: ${err?.message || err}`));
  }

  /**
   * Aligned with NotificationProcessor: send({ to, subject, text, html, template, data, ... })
   * If you want template rendering, you can add it later; this sends html/text directly.
   */
  async send(payload: EmailJobData): Promise<{ ok: true; messageId: string }> {
    const mail: SendMailOptions = {
      from: this.defaultFrom,
      to: payload.to,
      subject: payload.subject,
      text: payload.text,
      html: payload.html,
      headers: payload.headers,
    };

    try {
      const info = await this.transporter.sendMail(mail);
      this.logger.log(`Sent email -> ${payload.to} (id=${info.messageId})`);
      return { ok: true, messageId: info.messageId };
    } catch (err: any) {
      // Make error explicit so processor can classify transient vs permanent
      const code = err?.code || err?.responseCode;
      const msg = `SMTP send failed${code ? ` [${code}]` : ''}: ${
        err?.message || err
      }`;
      this.logger.error(msg);
      throw new Error(msg);
    }
  }
}
