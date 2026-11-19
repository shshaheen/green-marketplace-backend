import type { Request, Response } from 'express';
import { requireCustomer } from '../../middlewares/authenticate.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import type {
  CustomerLoginInput,
  RefreshTokenInput,
  SendOtpInput,
  SetPinInput,
  VerifyOtpInput,
} from '../auth/auth.validation.js';
import * as customerService from './customer.service.js';

function requestMeta(req: Request) {
  return { ip: req.ip, userAgent: req.headers['user-agent'] };
}

export async function sendRegisterOtp(req: Request, res: Response): Promise<void> {
  const { email } = req.body as SendOtpInput;
  const result = await customerService.sendRegistrationOtp(email);
  sendSuccess(res, result);
}

export async function verifyRegisterOtp(req: Request, res: Response): Promise<void> {
  const { email, otp } = req.body as VerifyOtpInput;
  const result = await customerService.verifyRegistrationOtp(email, otp);
  sendSuccess(res, result);
}

export async function setRegisterPin(req: Request, res: Response): Promise<void> {
  const input = req.body as SetPinInput;
  const result = await customerService.completeRegistration(input, requestMeta(req));
  sendSuccess(res, result, { status: 201 });
}

export async function login(req: Request, res: Response): Promise<void> {
  const { email, mpin } = req.body as CustomerLoginInput;
  const result = await customerService.loginCustomer(email, mpin, requestMeta(req));
  sendSuccess(res, result);
}

export async function sendForgotPinOtp(req: Request, res: Response): Promise<void> {
  const { email } = req.body as SendOtpInput;
  const result = await customerService.sendForgotPinOtp(email);
  sendSuccess(res, result);
}

export async function verifyForgotPinOtp(req: Request, res: Response): Promise<void> {
  const { email, otp } = req.body as VerifyOtpInput;
  const result = await customerService.verifyForgotPinOtp(email, otp);
  sendSuccess(res, result);
}

export async function resetPin(req: Request, res: Response): Promise<void> {
  const input = req.body as SetPinInput;
  const result = await customerService.resetCustomerPin(input);
  sendSuccess(res, result);
}

export async function refresh(req: Request, res: Response): Promise<void> {
  const { refreshToken } = req.body as RefreshTokenInput;
  const tokens = await customerService.refreshCustomerToken(refreshToken, requestMeta(req));
  sendSuccess(res, tokens);
}

export async function logout(req: Request, res: Response): Promise<void> {
  const { refreshToken } = req.body as RefreshTokenInput;
  await customerService.logoutCustomer(refreshToken);
  sendSuccess(res, { message: 'Logged out successfully' });
}

export async function me(req: Request, res: Response): Promise<void> {
  const current = requireCustomer(req);
  const customer = await customerService.getCurrentCustomer(current.id);
  sendSuccess(res, customer);
}
