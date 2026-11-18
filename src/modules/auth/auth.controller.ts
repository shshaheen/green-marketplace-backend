import type { Request, Response } from 'express';
import { requireAdmin } from '../../middlewares/authenticate.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import * as authService from './auth.service.js';
import type { RequestMeta } from './auth.types.js';
import type { LoginInput, RefreshTokenInput } from './auth.validation.js';

function requestMeta(req: Request): RequestMeta {
  return { ip: req.ip, userAgent: req.get('user-agent') };
}

export async function login(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body as LoginInput;
  sendSuccess(res, await authService.login(email, password, requestMeta(req)));
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
