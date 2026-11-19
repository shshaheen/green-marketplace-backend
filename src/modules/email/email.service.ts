import { Resend } from 'resend';
import { env, isProduction, isTest } from '../../config/env.js';
import { ApiError } from '../../utils/ApiError.js';
import { logger } from '../../utils/logger.js';
import { renderOtpEmail, type OtpEmailPurpose } from './email.templates.js';

export interface SendOtpEmailOptions {
  to: string;
  otp: string;
  purpose: OtpEmailPurpose;
  expiryMinutes?: number;
}

export interface EmailService {
  sendOtpEmail(options: SendOtpEmailOptions): Promise<void>;
}

class ResendEmailService implements EmailService {
  private resend: Resend | null = null;

  private getClient(): Resend {
    if (!this.resend) {
      if (!env.RESEND_API_KEY) {
        throw ApiError.serviceUnavailable('Email delivery is not configured');
      }
      this.resend = new Resend(env.RESEND_API_KEY);
    }
    return this.resend;
  }

  async sendOtpEmail(options: SendOtpEmailOptions): Promise<void> {
    const expiryMinutes = options.expiryMinutes ?? env.OTP_EXPIRY_MINUTES;
    const { subject, html, text } = renderOtpEmail(options.purpose, options.otp, expiryMinutes);

    // In non-production environments without an API key, log a debug message instead of failing
    if (!isProduction && !env.RESEND_API_KEY) {
      logger.info(
        { to: options.to, purpose: options.purpose },
        'Email delivery simulated (RESEND_API_KEY not configured)',
      );
      return;
    }

    try {
      const client = this.getClient();
      const response = await client.emails.send({
        from: env.EMAIL_FROM,
        to: options.to,
        subject,
        html,
        text,
      });

      if (response.error) {
        logger.error({ err: response.error, to: options.to }, 'Resend returned error');
        throw ApiError.serviceUnavailable('Failed to deliver email. Please try again later.');
      }
    } catch (err: unknown) {
      if (err instanceof ApiError) throw err;
      logger.error({ err, to: options.to }, 'Email delivery failed');
      throw ApiError.serviceUnavailable('Failed to deliver email. Please try again later.');
    }
  }
}

/** In-memory email service for tests. */
export class FakeEmailService implements EmailService {
  public sentEmails: Array<{
    to: string;
    otp: string;
    purpose: OtpEmailPurpose;
    expiryMinutes: number;
  }> = [];

  public shouldFail = false;

  async sendOtpEmail(options: SendOtpEmailOptions): Promise<void> {
    if (this.shouldFail) {
      throw ApiError.serviceUnavailable('Email service unavailable');
    }
    this.sentEmails.push({
      to: options.to,
      otp: options.otp,
      purpose: options.purpose,
      expiryMinutes: options.expiryMinutes ?? env.OTP_EXPIRY_MINUTES,
    });
  }

  clear(): void {
    this.sentEmails = [];
    this.shouldFail = false;
  }
}

let activeEmailService: EmailService = isTest ? new FakeEmailService() : new ResendEmailService();

export function getEmailService(): EmailService {
  return activeEmailService;
}

export function setEmailService(service: EmailService): void {
  activeEmailService = service;
}
