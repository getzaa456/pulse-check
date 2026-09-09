import nodemailer from 'nodemailer';

import type { Config } from './config.js';

export class Notifier {
  constructor(private readonly config: Config) {}

  async send(monitorName: string, targetUrl: string, event: 'DOWN' | 'RECOVERED') {
    const message = `Pulse Check: ${monitorName} is ${event} (${targetUrl})`;
    const errors: Error[] = [];

    if (this.config.DISCORD_WEBHOOK_URL) {
      try {
        const response = await fetch(this.config.DISCORD_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ content: message }),
        });
        if (!response.ok) {
          throw new Error(`Discord returned ${response.status}`);
        }
      } catch (error) {
        errors.push(error instanceof Error ? error : new Error(String(error)));
      }
    }

    if (this.config.SMTP_HOST && this.config.SMTP_FROM && this.config.ALERT_EMAIL) {
      try {
        const transporter = nodemailer.createTransport({
          host: this.config.SMTP_HOST,
          port: this.config.SMTP_PORT,
          secure: this.config.SMTP_PORT === 465,
          auth: this.config.SMTP_USERNAME
            ? {
                user: this.config.SMTP_USERNAME,
                pass: this.config.SMTP_PASSWORD,
              }
            : undefined,
        });

        await transporter.sendMail({
          from: this.config.SMTP_FROM,
          to: this.config.ALERT_EMAIL,
          subject: message,
          text: message,
        });
      } catch (error) {
        errors.push(error instanceof Error ? error : new Error(String(error)));
      }
    }

    if (errors.length > 0) {
      throw new AggregateError(errors, 'notification delivery failed');
    }
  }
}
