import { Router } from 'express';
import { validate } from '../../middlewares/validate.js';
import { idParamsSchema } from '../../utils/validators.js';
import * as categoryController from './category.controller.js';
import {
  createCategorySchema,
  listCategoriesQuerySchema,
  updateCategorySchema,
} from './category.validation.js';

/** Mounted at /api/v1/categories */
export function createPublicCategoryRouter(): Router {
  const router = Router();
  router.get('/', categoryController.getPublicTree);
  return router;
}

/** Mounted at /api/v1/admin/categories, behind `authenticate`. */
export function createAdminCategoryRouter(): Router {
  const router = Router();

  router.get('/', validate({ query: listCategoriesQuerySchema }), categoryController.list);
  router.post('/', validate({ body: createCategorySchema }), categoryController.create);
  router.get('/:id', validate({ params: idParamsSchema }), categoryController.getById);
  router.patch(
    '/:id',
    validate({ params: idParamsSchema, body: updateCategorySchema }),
    categoryController.update,
  );
  router.delete('/:id', validate({ params: idParamsSchema }), categoryController.remove);

  return router;
}
