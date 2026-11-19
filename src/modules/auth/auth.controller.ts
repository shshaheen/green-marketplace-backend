import type { Request, Response } from 'express';
import { requireAdmin } from '../../middlewares/authenticate.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import * as authService from './auth.service.js';
import type { RequestMeta } from './auth.types.js';
import type {
  AdminLoginInput,
  RefreshTokenInput,
  SendOtpInput,
  SetPinInput,
  VerifyOtpInput,
} from './auth.validation.js';

function requestMeta(req: Request): RequestMeta {
  return { ip: req.ip, userAgent: req.get('user-agent') };
}

export async function login(req: Request, res: Response): Promise<void> {
  const credentials = req.body as AdminLoginInput;
  const result = await authService.login(credentials, requestMeta(req));
  sendSuccess(res, result);
}

export async function sendInitialPinOtp(req: Request, res: Response): Promise<void> {
  const { email } = req.body as SendOtpInput;
  const result = await authService.sendAdminInitialPinOtp(email);
  sendSuccess(res, result);
}

export async function verifyInitialPinOtp(req: Request, res: Response): Promise<void> {
  const { email, otp } = req.body as VerifyOtpInput;
  const result = await authService.verifyAdminInitialPinOtp(email, otp);
  sendSuccess(res, result);
}

export async function setInitialPin(req: Request, res: Response): Promise<void> {
  const input = req.body as SetPinInput;
  const result = await authService.setAdminInitialPin(input, requestMeta(req));
  sendSuccess(res, result, { status: 201 });
}

export async function sendForgotPinOtp(req: Request, res: Response): Promise<void> {
  const { email } = req.body as SendOtpInput;
  const result = await authService.sendAdminForgotPinOtp(email);
  sendSuccess(res, result);
}

export async function verifyForgotPinOtp(req: Request, res: Response): Promise<void> {
  const { email, otp } = req.body as VerifyOtpInput;
  const result = await authService.verifyAdminForgotPinOtp(email, otp);
  sendSuccess(res, result);
}

export async function resetPin(req: Request, res: Response): Promise<void> {
  const input = req.body as SetPinInput;
  const result = await authService.resetAdminPin(input);
  sendSuccess(res, result);
}

export async function refresh(req: Request, res: Response): Promise<void> {
  const { refreshToken } = req.body as RefreshTokenInput;
  sendSuccess(res, await authService.refresh(refreshToken, requestMeta(req)));
}

export async function logout(req: Request, res: Response): Promise<void> {
  const { refreshToken } = req.body as RefreshTokenInput;
  await authService.logout(refreshToken);
  sendSuccess(res, null);
}

export async function me(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await authService.getCurrentAdmin(requireAdmin(req).id));
}
