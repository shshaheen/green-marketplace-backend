import { model, Schema, type HydratedDocument, type InferSchemaType } from 'mongoose';

export const OTP_PURPOSES = [
  'customer_registration',
  'customer_reset_pin',
  'admin_initial_pin',
  'admin_reset_pin',
] as const;

export type OtpPurpose = (typeof OTP_PURPOSES)[number];

const otpVerificationSchema = new Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true },
    otpHash: { type: String, required: true },
    purpose: { type: String, enum: OTP_PURPOSES, required: true },
    userType: { type: String, enum: ['customer', 'admin'], required: true },
    attempts: { type: Number, default: 0 },
    isVerified: { type: Boolean, default: false },
    verificationTokenHash: { type: String, default: null },
    resendAvailableAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
  },
  {
    timestamps: true,
    collection: 'otp_verifications',
  },
);

// TTL index automatically purges records when expiresAt is reached
otpVerificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
otpVerificationSchema.index({ email: 1, purpose: 1 });

export type OtpVerificationAttrs = InferSchemaType<typeof otpVerificationSchema>;
export type OtpVerificationDocument = HydratedDocument<OtpVerificationAttrs>;

export const OtpVerification = model('OtpVerification', otpVerificationSchema);
