import { Router } from 'express';
import { imageUpload } from '../../middlewares/upload.js';
import { validate } from '../../middlewares/validate.js';
import { idParamsSchema } from '../../utils/validators.js';
import { MAX_IMAGES_PER_PLANT } from './plant.constants.js';
import * as plantController from './plant.controller.js';
import {
  adminListPlantsQuerySchema,
  createPlantSchema,
  imageParamsSchema,
  plantIdOrSlugParamsSchema,
  plantStatusSchema,
  publicListPlantsQuerySchema,
  reorderImagesSchema,
  updatePlantSchema,
} from './plant.validation.js';

/** Mounted at /api/v1/plants */
export function createPublicPlantRouter(): Router {
  const router = Router();

  router.get('/', validate({ query: publicListPlantsQuerySchema }), plantController.listPublic);
  router.get(
    '/:idOrSlug',
    validate({ params: plantIdOrSlugParamsSchema }),
    plantController.getPublic,
  );

  return router;
}

/** Mounted at /api/v1/admin/plants, behind `authenticate`. */
export function createAdminPlantRouter(): Router {
  const router = Router();

  router.get('/', validate({ query: adminListPlantsQuerySchema }), plantController.list);
  router.post('/', validate({ body: createPlantSchema }), plantController.create);
  router.get('/:id', validate({ params: idParamsSchema }), plantController.getById);
  router.patch(
    '/:id',
    validate({ params: idParamsSchema, body: updatePlantSchema }),
    plantController.update,
  );
  router.patch(
    '/:id/status',
    validate({ params: idParamsSchema, body: plantStatusSchema }),
    plantController.setStatus,
  );
  router.delete('/:id', validate({ params: idParamsSchema }), plantController.remove);

  router.post(
    '/:id/images',
    validate({ params: idParamsSchema }),
    ...imageUpload('images', MAX_IMAGES_PER_PLANT),
    plantController.addImages,
  );
  router.patch(
    '/:id/images/order',
    validate({ params: idParamsSchema, body: reorderImagesSchema }),
    plantController.reorderImages,
  );
  router.delete(
    '/:id/images/:imageId',
    validate({ params: imageParamsSchema }),
    plantController.removeImage,
  );

  return router;
}
