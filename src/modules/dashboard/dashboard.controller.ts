import type { Request, Response } from 'express';
import { sendSuccess } from '../../utils/apiResponse.js';
import { getDashboardStats } from './dashboard.service.js';

export async function stats(_req: Request, res: Response): Promise<void> {
  sendSuccess(res, await getDashboardStats());
}
