import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';

export class MailDeliveryTimeoutError extends Error {
  constructor() {
    super('Mail delivery exceeded its configured deadline');
    this.name = 'MailDeliveryTimeoutError';
  }
}

export function mailTransportSettings(cfg: ConfigService) {
  const smtpUser = cfg.get<string>('mail.smtpUser');
  return {
    host: cfg.get<string>('mail.smtpHost') ?? 'localhost',
    port: cfg.get<number>('mail.smtpPort') ?? 1025,
    secure: false,
    connectionTimeout: cfg.get<number>('mail.connectionTimeoutMs') ?? 10_000,
    greetingTimeout: cfg.get<number>('mail.greetingTimeoutMs') ?? 10_000,
    socketTimeout: cfg.get<number>('mail.socketTimeoutMs') ?? 15_000,
    auth: smtpUser ? { user: smtpUser, pass: cfg.get<string>('mail.smtpPass') ?? '' } : undefined,
  };
}

@Injectable()
export class MailService {
  private readonly transporter: Transporter;
  private readonly from: string;
  private readonly deliveryTimeoutMs: number;

  constructor(cfg: ConfigService) {
    this.from = cfg.get<string>('mail.from') ?? 'no-reply@abonten.local';
    this.deliveryTimeoutMs = cfg.get<number>('mail.deliveryTimeoutMs') ?? 20_000;
    this.transporter = nodemailer.createTransport(mailTransportSettings(cfg));
  }

  async send(to: string, subject: string, html: string): Promise<void> {
    let timeout: NodeJS.Timeout | undefined;
    const delivery = this.transporter.sendMail({ from: this.from, to, subject, html });
    const deadline = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => {
        reject(new MailDeliveryTimeoutError());
      }, this.deliveryTimeoutMs);
      timeout.unref();
    });

    try {
      await Promise.race([delivery, deadline]);
    } catch (error) {
      if (error instanceof MailDeliveryTimeoutError) this.transporter.close();
      // Do not include recipient addresses, credentials, or email content in logs.
      Logger.warn('Mail delivery failed', 'MailService');
      throw error;
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }
}
