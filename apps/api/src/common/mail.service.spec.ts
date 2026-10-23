import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { ConfigService } from '@nestjs/config';
import { MailDeliveryTimeoutError, MailService, mailTransportSettings } from './mail.service';

function config(values: Record<string, unknown>): ConfigService {
  return {
    get<T>(key: string): T | undefined {
      return values[key] as T | undefined;
    },
  } as ConfigService;
}

describe('MailService', () => {
  it('passes matching HTML and plain-text alternatives to the configured sender', async () => {
    const service = new MailService(config({ 'mail.from': 'Abonten <noreply@updates.example>' }));
    let delivered: unknown;
    const internals = service as unknown as {
      transporter: { sendMail(value: unknown): Promise<void> };
    };
    internals.transporter = {
      sendMail: async (value) => {
        delivered = value;
      },
    };
    await service.send(
      'nora@harbourline.example',
      'Your invitation to Abonten',
      '<p>Invitation</p>',
      'Invitation',
    );
    assert.deepEqual(delivered, {
      from: 'Abonten <noreply@updates.example>',
      to: 'nora@harbourline.example',
      subject: 'Your invitation to Abonten',
      html: '<p>Invitation</p>',
      text: 'Invitation',
    });
  });
  it('configures explicit SMTP connection, greeting, and socket deadlines', () => {
    const settings = mailTransportSettings(
      config({
        'mail.smtpHost': 'smtp.example.test',
        'mail.smtpPort': 2525,
        'mail.connectionTimeoutMs': 1_100,
        'mail.greetingTimeoutMs': 1_200,
        'mail.socketTimeoutMs': 1_300,
      }),
    );

    assert.deepEqual(settings, {
      host: 'smtp.example.test',
      port: 2525,
      secure: false,
      connectionTimeout: 1_100,
      greetingTimeout: 1_200,
      socketTimeout: 1_300,
      auth: undefined,
    });
  });

  it('fails a stalled delivery at the overall deadline and closes the transport', async () => {
    const service = new MailService(config({ 'mail.deliveryTimeoutMs': 25 }));
    let closed = false;
    const internals = service as unknown as {
      transporter: {
        sendMail(): Promise<never>;
        close(): void;
      };
    };
    internals.transporter = {
      sendMail: () => new Promise<never>(() => undefined),
      close: () => {
        closed = true;
      },
    };

    const startedAt = Date.now();
    await assert.rejects(
      () => service.send('person@example.com', 'Subject', '<p>Body</p>', 'Body'),
      MailDeliveryTimeoutError,
    );
    assert.equal(closed, true);
    assert.ok(Date.now() - startedAt < 250, 'the overall deadline rejects promptly');
  });
});
