import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import { createApp } from '../src/app.js';
import { createTestAdmin, loginAs } from './helpers.js';

const ADMIN = '/api/v1/admin/categories';
const PUBLIC = '/api/v1/categories';

describe('categories', () => {
  let app: Express;
  let auth: { Authorization: string };

  const create = (body: object) => request(app).post(ADMIN).set(auth).send(body);

  async function createOk(body: object) {
    const res = await create(body).expect(201);
    return res.body.data as { id: string; slug: string; name: string };
  }

  beforeEach(async () => {
    app = createApp();
    await createTestAdmin();
    const { accessToken } = await loginAs(app);
    auth = { Authorization: `Bearer ${accessToken}` };
  });

  describe('admin access', () => {
    it('requires authentication for every admin route', async () => {
      await request(app).get(ADMIN).expect(401);
      await request(app).post(ADMIN).send({ name: 'Indoor' }).expect(401);
    });
  });

  describe('create', () => {
    it('creates a top-level category with defaults and a slug', async () => {
      const res = await create({ name: '  Indoor Plants ' }).expect(201);
      expect(res.body.data).toMatchObject({
        name: 'Indoor Plants',
        slug: 'indoor-plants',
        description: '',
        parent: null,
        sortOrder: 0,
        isActive: true,
        deletedAt: null,
      });
    });

    it('creates a subcategory under a top-level category', async () => {
      const indoor = await createOk({ name: 'Indoor' });
      const res = await create({ name: 'Succulents', parent: indoor.id }).expect(201);
      expect(res.body.data.parent).toEqual({ id: indoor.id, name: 'Indoor' });
    });

    it('refuses a third level of nesting', async () => {
      const indoor = await createOk({ name: 'Indoor' });
      const succulents = await createOk({ name: 'Succulents', parent: indoor.id });
      const res = await create({ name: 'Cacti', parent: succulents.id }).expect(400);
      expect(res.body.error.details[0].field).toBe('parent');
    });

    it('refuses an unknown parent', async () => {
      await create({ name: 'Orphan', parent: '0123456789abcdef01234567' }).expect(400);
    });

    it('refuses a duplicate sibling name regardless of case', async () => {
      await createOk({ name: 'Outdoor' });
      const res = await create({ name: 'OUTDOOR' }).expect(409);
      expect(res.body.error.code).toBe('CONFLICT');
    });

    it('allows the same subcategory name under different parents, with distinct slugs', async () => {
      const indoor = await createOk({ name: 'Indoor' });
      const outdoor = await createOk({ name: 'Outdoor' });
      const a = await createOk({ name: 'Flowering', parent: indoor.id });
      const b = await createOk({ name: 'Flowering', parent: outdoor.id });
      expect(a.slug).toBe('flowering');
      expect(b.slug).toBe('flowering-2');
    });

    it('gives non-Latin names a fallback slug', async () => {
      const category = await createOk({ name: 'फूल' });
      expect(category.slug).toMatch(/^category-[a-f0-9]{6}$/);
    });

    it('rejects unknown fields and invalid values', async () => {
      const res = await create({ name: '', sortOrder: -1, slug: 'custom' }).expect(400);
      const fields = res.body.error.details.map((d: { field: string }) => d.field);
      expect(fields).toEqual(expect.arrayContaining(['body.name', 'body.sortOrder']));
    });
  });

  describe('list and get', () => {
    it('lists with pagination, parent and search filters', async () => {
      const indoor = await createOk({ name: 'Indoor', sortOrder: 1 });
      await createOk({ name: 'Outdoor', sortOrder: 2 });
      await createOk({ name: 'Ferns', parent: indoor.id });

      const all = await request(app).get(ADMIN).set(auth).query({ limit: 2 }).expect(200);
      expect(all.body.meta).toEqual({ page: 1, limit: 2, total: 3, totalPages: 2 });

      const roots = await request(app).get(ADMIN).set(auth).query({ parent: 'root' }).expect(200);
      expect(roots.body.data.map((c: { name: string }) => c.name)).toEqual(['Indoor', 'Outdoor']);

      const children = await request(app)
        .get(ADMIN)
        .set(auth)
        .query({ parent: indoor.id })
        .expect(200);
      expect(children.body.data.map((c: { name: string }) => c.name)).toEqual(['Ferns']);

      const search = await request(app).get(ADMIN).set(auth).query({ search: 'out' }).expect(200);
      expect(search.body.data.map((c: { name: string }) => c.name)).toEqual(['Outdoor']);
    });

    it('treats regex characters in search literally', async () => {
      await createOk({ name: 'Indoor' });
      const res = await request(app).get(ADMIN).set(auth).query({ search: '.*' }).expect(200);
      expect(res.body.data).toEqual([]);
    });

    it('rejects an invalid id and returns 404 for a missing one', async () => {
      await request(app).get(`${ADMIN}/not-an-id`).set(auth).expect(400);
      await request(app).get(`${ADMIN}/0123456789abcdef01234567`).set(auth).expect(404);
    });
  });

  describe('update', () => {
    it('renames and regenerates the slug, leaving other fields untouched', async () => {
      const category = await createOk({ name: 'Indoor', sortOrder: 5, description: 'Inside' });
      const res = await request(app)
        .patch(`${ADMIN}/${category.id}`)
        .set(auth)
        .send({ name: 'House Plants' })
        .expect(200);
      expect(res.body.data).toMatchObject({
        name: 'House Plants',
        slug: 'house-plants',
        sortOrder: 5,
        description: 'Inside',
      });
    });

    it('refuses an empty update', async () => {
      const category = await createOk({ name: 'Indoor' });
      await request(app).patch(`${ADMIN}/${category.id}`).set(auth).send({}).expect(400);
    });

    it('refuses renaming onto a sibling name', async () => {
      await createOk({ name: 'Indoor' });
      const outdoor = await createOk({ name: 'Outdoor' });
      await request(app)
        .patch(`${ADMIN}/${outdoor.id}`)
        .set(auth)
        .send({ name: 'indoor' })
        .expect(409);
    });

    it('refuses making a category its own parent', async () => {
      const category = await createOk({ name: 'Indoor' });
      await request(app)
        .patch(`${ADMIN}/${category.id}`)
        .set(auth)
        .send({ parent: category.id })
        .expect(400);
    });

    it('refuses moving a category that has subcategories under another', async () => {
      const indoor = await createOk({ name: 'Indoor' });
      const outdoor = await createOk({ name: 'Outdoor' });
      await createOk({ name: 'Ferns', parent: indoor.id });
      await request(app)
        .patch(`${ADMIN}/${indoor.id}`)
        .set(auth)
        .send({ parent: outdoor.id })
        .expect(409);
    });

    it('can move a subcategory to top level', async () => {
      const indoor = await createOk({ name: 'Indoor' });
      const ferns = await createOk({ name: 'Ferns', parent: indoor.id });
      const res = await request(app)
        .patch(`${ADMIN}/${ferns.id}`)
        .set(auth)
        .send({ parent: null })
        .expect(200);
      expect(res.body.data.parent).toBeNull();
    });
  });

  describe('delete', () => {
    it('refuses while subcategories exist', async () => {
      const indoor = await createOk({ name: 'Indoor' });
      await createOk({ name: 'Ferns', parent: indoor.id });
      await request(app).delete(`${ADMIN}/${indoor.id}`).set(auth).expect(409);
    });

    it('soft-deletes: hidden by default, visible with includeDeleted, name reusable', async () => {
      const indoor = await createOk({ name: 'Indoor' });
      await request(app).delete(`${ADMIN}/${indoor.id}`).set(auth).expect(200);

      await request(app).get(`${ADMIN}/${indoor.id}`).set(auth).expect(404);
      const list = await request(app).get(ADMIN).set(auth).expect(200);
      expect(list.body.data).toEqual([]);

      const withDeleted = await request(app)
        .get(ADMIN)
        .set(auth)
        .query({ includeDeleted: 'true' })
        .expect(200);
      expect(withDeleted.body.data[0]).toMatchObject({ id: indoor.id, isActive: false });
      expect(withDeleted.body.data[0].deletedAt).not.toBeNull();

      const again = await createOk({ name: 'Indoor' });
      expect(again.slug).toBe('indoor-2');
    });
  });

  describe('public tree', () => {
    it('needs no login and nests only active, non-deleted categories', async () => {
      const indoor = await createOk({ name: 'Indoor', sortOrder: 2 });
      const outdoor = await createOk({ name: 'Outdoor', sortOrder: 1 });
      await createOk({ name: 'Ferns', parent: indoor.id });
      await createOk({ name: 'Hidden Sub', parent: indoor.id, isActive: false });
      const deleted = await createOk({ name: 'Gone', parent: indoor.id });
      await request(app).delete(`${ADMIN}/${deleted.id}`).set(auth).expect(200);
      await createOk({ name: 'Palms', parent: outdoor.id });

      const res = await request(app).get(PUBLIC).expect(200);
      expect(res.body.data).toEqual([
        {
          id: outdoor.id,
          name: 'Outdoor',
          slug: 'outdoor',
          description: '',
          sortOrder: 1,
          subcategories: [expect.objectContaining({ name: 'Palms' })],
        },
        expect.objectContaining({
          name: 'Indoor',
          subcategories: [expect.objectContaining({ name: 'Ferns' })],
        }),
      ]);
    });

    it('hides subcategories of an inactive category', async () => {
      const indoor = await createOk({ name: 'Indoor' });
      await createOk({ name: 'Ferns', parent: indoor.id });
      await request(app)
        .patch(`${ADMIN}/${indoor.id}`)
        .set(auth)
        .send({ isActive: false })
        .expect(200);

      const res = await request(app).get(PUBLIC).expect(200);
      expect(res.body.data).toEqual([]);
    });
  });
});
