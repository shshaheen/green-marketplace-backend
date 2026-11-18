import type { Request, Response } from 'express';
import { requireAdmin } from '../../middlewares/authenticate.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import * as plantService from './plant.service.js';
import type {
  AdminListPlantsQuery,
  CreatePlantInput,
  PublicListPlantsQuery,
  UpdatePlantInput,
} from './plant.validation.js';

function params<T>(req: Request): T {
  return req.validated?.params as T;
}

// Public

export async function listPublic(req: Request, res: Response): Promise<void> {
  const { items, meta } = await plantService.listPublicPlants(
    req.validated?.query as PublicListPlantsQuery,
  );
  sendSuccess(res, items, { meta });
}

export async function getPublic(req: Request, res: Response): Promise<void> {
  const { idOrSlug } = params<{ idOrSlug: string }>(req);
  sendSuccess(res, await plantService.getPublicPlant(idOrSlug));
}

// Admin

export async function list(req: Request, res: Response): Promise<void> {
  const { items, meta } = await plantService.listAdminPlants(
    req.validated?.query as AdminListPlantsQuery,
  );
  sendSuccess(res, items, { meta });
}

export async function getById(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await plantService.getAdminPlant(params<{ id: string }>(req).id));
}

export async function create(req: Request, res: Response): Promise<void> {
  const admin = requireAdmin(req);
  const plant = await plantService.createPlant(req.body as CreatePlantInput, admin.id);
  sendSuccess(res, plant, { status: 201 });
}

export async function update(req: Request, res: Response): Promise<void> {
  const admin = requireAdmin(req);
  const { id } = params<{ id: string }>(req);
  sendSuccess(res, await plantService.updatePlant(id, req.body as UpdatePlantInput, admin.id));
}

export async function setStatus(req: Request, res: Response): Promise<void> {
  const admin = requireAdmin(req);
  const { id } = params<{ id: string }>(req);
  const { isActive } = req.body as { isActive: boolean };
  sendSuccess(res, await plantService.setPlantStatus(id, isActive, admin.id));
}

export async function remove(req: Request, res: Response): Promise<void> {
  const admin = requireAdmin(req);
  await plantService.deletePlant(params<{ id: string }>(req).id, admin.id);
  sendSuccess(res, null);
}

export async function addImages(req: Request, res: Response): Promise<void> {
  const admin = requireAdmin(req);
  const { id } = params<{ id: string }>(req);
  const files = (req.files ?? []) as Express.Multer.File[];
  const plant = await plantService.addPlantImages(
    id,
    files.map((file) => file.buffer),
    admin.id,
  );
  sendSuccess(res, plant, { status: 201 });
}

export async function removeImage(req: Request, res: Response): Promise<void> {
  const admin = requireAdmin(req);
  const { id, imageId } = params<{ id: string; imageId: string }>(req);
  sendSuccess(res, await plantService.removePlantImage(id, imageId, admin.id));
}

export async function reorderImages(req: Request, res: Response): Promise<void> {
  const admin = requireAdmin(req);
  const { id } = params<{ id: string }>(req);
  const { imageIds } = req.body as { imageIds: string[] };
  sendSuccess(res, await plantService.reorderPlantImages(id, imageIds, admin.id));
}
