import { config } from '../config.js';

export interface EmailMessage {
  to: string;
  subject: string;
  textBody: string;
  htmlBody?: string;
}

export interface EmailProvider {
  send(message: EmailMessage): Promise<void>;
}

/** Logs emails to console — for development. */
class ConsoleEmailProvider implements EmailProvider {
  async send(message: EmailMessage): Promise<void> {
    console.log('─── Email (console provider) ───');
    console.log(`To: ${message.to}`);
    console.log(`Subject: ${message.subject}`);
    console.log(`Body:\n${message.textBody}`);
    console.log('────────────────────────────────');
  }
}

/** Postmark transactional email. */
class PostmarkEmailProvider implements EmailProvider {
  private apiToken: string;
  private from: string;

  constructor(apiToken: string, from: string) {
    this.apiToken = apiToken;
    this.from = from;
  }

  async send(message: EmailMessage): Promise<void> {
    const res = await fetch('https://api.postmarkapp.com/email', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-Postmark-Server-Token': this.apiToken,
      },
      body: JSON.stringify({
        From: this.from,
        To: message.to,
        Subject: message.subject,
        TextBody: message.textBody,
        HtmlBody: message.htmlBody,
        MessageStream: 'outbound',
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Postmark error: ${res.status} — ${body}`);
    }
  }
}

/** Resend transactional email. */
class ResendEmailProvider implements EmailProvider {
  private apiKey: string;
  private from: string;

  constructor(apiKey: string, from: string) {
    this.apiKey = apiKey;
    this.from = from;
  }

  async send(message: EmailMessage): Promise<void> {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: this.from,
        to: [message.to],
        subject: message.subject,
        text: message.textBody,
        html: message.htmlBody,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Resend error: ${res.status} — ${body}`);
    }
  }
}

/** Get the configured email provider. */
export function getEmailProvider(): EmailProvider {
  switch (config.emailProvider) {
    case 'postmark':
      if (!config.postmarkApiToken) throw new Error('POSTMARK_API_TOKEN is required');
      return new PostmarkEmailProvider(config.postmarkApiToken, config.emailFrom);
    case 'resend':
      if (!config.resendApiKey) throw new Error('RESEND_API_KEY is required');
      return new ResendEmailProvider(config.resendApiKey, config.emailFrom);
    case 'console':
    default:
      return new ConsoleEmailProvider();
  }
}
