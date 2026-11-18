import type { Request, Response } from 'express';
import { requireAdmin } from '../../middlewares/authenticate.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import * as categoryService from './category.service.js';
import type {
  CreateCategoryInput,
  ListCategoriesQuery,
  UpdateCategoryInput,
} from './category.validation.js';

type IdParams = { id: string };

function params(req: Request): IdParams {
  return req.validated?.params as IdParams;
}

// Public

export async function getPublicTree(_req: Request, res: Response): Promise<void> {
  sendSuccess(res, await categoryService.getPublicCategoryTree());
}

// Admin

export async function list(req: Request, res: Response): Promise<void> {
  const query = req.validated?.query as ListCategoriesQuery;
  const { items, meta } = await categoryService.listCategories(query);
  sendSuccess(res, items, { meta });
}

export async function getById(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await categoryService.getCategory(params(req).id));
}

export async function create(req: Request, res: Response): Promise<void> {
  const admin = requireAdmin(req);
  const category = await categoryService.createCategory(req.body as CreateCategoryInput, admin.id);
  sendSuccess(res, category, { status: 201 });
}

export async function update(req: Request, res: Response): Promise<void> {
  const admin = requireAdmin(req);
  const category = await categoryService.updateCategory(
    params(req).id,
    req.body as UpdateCategoryInput,
    admin.id,
  );
  sendSuccess(res, category);
}

export async function remove(req: Request, res: Response): Promise<void> {
  const admin = requireAdmin(req);
  await categoryService.deleteCategory(params(req).id, admin.id);
  sendSuccess(res, null);
}
