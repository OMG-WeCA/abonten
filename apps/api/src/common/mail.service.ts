import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';

@Injectable()
export class MailService {
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(cfg: ConfigService) {
    this.from = cfg.get<string>('mail.from') ?? 'no-reply@abonten.local';
    this.transporter = nodemailer.createTransport({
      host: cfg.get<string>('mail.smtpHost') ?? 'localhost',
      port: cfg.get<number>('mail.smtpPort') ?? 1025,
      secure: false,
      auth: cfg.get<string>('mail.smtpUser')
        ? { user: cfg.get<string>('mail.smtpUser')!, pass: cfg.get<string>('mail.smtpPass') ?? '' }
        : undefined,
    });
  }

  async send(to: string, subject: string, html: string): Promise<void> {
    try {
      await this.transporter.sendMail({ from: this.from, to, subject, html });
    } catch (err) {
      // Dev (Mailpit down): log but do not crash the request flow.
      Logger.warn(`Mail send failed (Mailpit may be down): ${String((err as Error).message ?? err)}`, 'MailService');
    }
  }
}
