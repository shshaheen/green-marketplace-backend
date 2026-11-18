import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import { createApp } from '../src/app.js';
import { setImageStorage } from '../src/modules/upload/imageStorage.js';
import { ApiError } from '../src/utils/ApiError.js';
import { createFakeImageStorage, createTestAdmin, loginAs, PNG_BYTES } from './helpers.js';

const ADMIN = '/api/v1/admin/plants';
const PUBLIC = '/api/v1/plants';
const CATEGORIES = '/api/v1/admin/categories';

describe('plants', () => {
  let app: Express;
  let auth: { Authorization: string };
  let fakeStorage: ReturnType<typeof createFakeImageStorage>;
  let indoor: string;
  let succulents: string;
  let outdoor: string;

  async function createCategory(body: object): Promise<string> {
    const res = await request(app).post(CATEGORIES).set(auth).send(body).expect(201);
    return res.body.data.id;
  }

  const basePlant = () => ({
    name: 'Jade Plant',
    category: indoor,
    subcategory: succulents,
    price: { amount: 25_000 },
    priceUnit: 'per_pot',
  });

  async function createPlant(overrides: object = {}) {
    const res = await request(app)
      .post(ADMIN)
      .set(auth)
      .send({ ...basePlant(), ...overrides })
      .expect(201);
    return res.body.data as { id: string; slug: string; images: { id: string }[] };
  }

  const upload = (plantId: string, count = 1) => {
    let req = request(app).post(`${ADMIN}/${plantId}/images`).set(auth);
    for (let i = 0; i < count; i++) {
      req = req.attach('images', PNG_BYTES, { filename: `p${i}.png`, contentType: 'image/png' });
    }
    return req;
  };

  beforeEach(async () => {
    app = createApp();
    fakeStorage = createFakeImageStorage();
    setImageStorage(fakeStorage.storage);
    await createTestAdmin();
    const { accessToken } = await loginAs(app);
    auth = { Authorization: `Bearer ${accessToken}` };

    indoor = await createCategory({ name: 'Indoor' });
    succulents = await createCategory({ name: 'Succulents', parent: indoor });
    outdoor = await createCategory({ name: 'Outdoor' });
  });

  describe('admin create', () => {
    it('requires authentication', async () => {
      await request(app).post(ADMIN).send(basePlant()).expect(401);
    });

    it('creates a plant with defaults', async () => {
      const res = await request(app).post(ADMIN).set(auth).send(basePlant()).expect(201);
      expect(res.body.data).toMatchObject({
        name: 'Jade Plant',
        slug: 'jade-plant',
        description: '',
        price: { amount: 25_000, currency: 'INR' },
        priceUnit: 'per_pot',
        minOrderQty: 1,
        availability: 'in_stock',
        image: null,
        images: [],
        attributes: { height: null, sunlight: null, watering: null },
        category: { id: indoor, name: 'Indoor', slug: 'indoor' },
        subcategory: { id: succulents, name: 'Succulents', slug: 'succulents' },
        isActive: true,
        deletedAt: null,
      });
    });

    it('stores optional attributes', async () => {
      const plant = await request(app)
        .post(ADMIN)
        .set(auth)
        .send({
          ...basePlant(),
          attributes: {
            height: { min: 1, max: 2, unit: 'ft' },
            sunlight: 'indirect_light',
            watering: 'Weekly',
          },
        })
        .expect(201);
      expect(plant.body.data.attributes).toEqual({
        height: { min: 1, max: 2, unit: 'ft' },
        sunlight: 'indirect_light',
        watering: 'Weekly',
      });
    });

    it('allows a plant with no subcategory', async () => {
      await createPlant({ category: outdoor, subcategory: null });
    });

    it('refuses a subcategory from another category', async () => {
      const res = await request(app)
        .post(ADMIN)
        .set(auth)
        .send({ ...basePlant(), category: outdoor })
        .expect(400);
      expect(res.body.error.details[0].field).toBe('subcategory');
    });

    it('refuses a subcategory given as the category', async () => {
      const res = await request(app)
        .post(ADMIN)
        .set(auth)
        .send({ ...basePlant(), category: succulents, subcategory: null })
        .expect(400);
      expect(res.body.error.details[0].field).toBe('category');
    });

    it('validates price, units, height and unknown fields', async () => {
      const res = await request(app)
        .post(ADMIN)
        .set(auth)
        .send({
          ...basePlant(),
          price: { amount: 12.5, currency: 'USD' },
          priceUnit: 'per_truck',
          minOrderQty: 0,
          attributes: { height: { min: 5, max: 2, unit: 'ft' } },
          images: [],
        })
        .expect(400);
      const fields = res.body.error.details.map((d: { field: string }) => d.field);
      expect(fields).toEqual(
        expect.arrayContaining([
          'body.price.amount',
          'body.price.currency',
          'body.priceUnit',
          'body.minOrderQty',
          'body.attributes.height.min',
        ]),
      );
    });
  });

  describe('admin update, status and delete', () => {
    it('updates only the sent fields and regenerates the slug on rename', async () => {
      const plant = await createPlant({ minOrderQty: 20, description: 'Hardy' });
      const res = await request(app)
        .patch(`${ADMIN}/${plant.id}`)
        .set(auth)
        .send({ name: 'Crassula Ovata', price: { amount: 30_000 } })
        .expect(200);
      expect(res.body.data).toMatchObject({
        name: 'Crassula Ovata',
        slug: 'crassula-ovata',
        price: { amount: 30_000, currency: 'INR' },
        minOrderQty: 20,
        description: 'Hardy',
      });
    });

    it('re-checks the category pair when only the category changes', async () => {
      const plant = await createPlant();
      await request(app)
        .patch(`${ADMIN}/${plant.id}`)
        .set(auth)
        .send({ category: outdoor })
        .expect(400);
      await request(app)
        .patch(`${ADMIN}/${plant.id}`)
        .set(auth)
        .send({ category: outdoor, subcategory: null })
        .expect(200);
    });

    it('does not accept isActive or images through PATCH', async () => {
      const plant = await createPlant();
      await request(app)
        .patch(`${ADMIN}/${plant.id}`)
        .set(auth)
        .send({ isActive: false })
        .expect(400);
    });

    it('toggles visibility through the status endpoint', async () => {
      const plant = await createPlant();
      const res = await request(app)
        .patch(`${ADMIN}/${plant.id}/status`)
        .set(auth)
        .send({ isActive: false })
        .expect(200);
      expect(res.body.data.isActive).toBe(false);
      await request(app).get(`${PUBLIC}/${plant.slug}`).expect(404);
    });

    it('soft-deletes and keeps images in storage', async () => {
      const plant = await createPlant();
      await upload(plant.id).expect(201);
      await request(app).delete(`${ADMIN}/${plant.id}`).set(auth).expect(200);

      await request(app).get(`${ADMIN}/${plant.id}`).set(auth).expect(404);
      const list = await request(app)
        .get(ADMIN)
        .set(auth)
        .query({ includeDeleted: 'true' })
        .expect(200);
      expect(list.body.data[0]).toMatchObject({ id: plant.id, isActive: false });
      expect(fakeStorage.destroyed).toEqual([]);
    });

    it('admin list filters by isActive', async () => {
      const a = await createPlant({ name: 'A' });
      await createPlant({ name: 'B' });
      await request(app)
        .patch(`${ADMIN}/${a.id}/status`)
        .set(auth)
        .send({ isActive: false })
        .expect(200);
      const res = await request(app).get(ADMIN).set(auth).query({ isActive: 'false' }).expect(200);
      expect(res.body.data.map((p: { name: string }) => p.name)).toEqual(['A']);
    });
  });

  describe('public catalogue', () => {
    it('needs no login and hides admin-only fields', async () => {
      await createPlant();
      const res = await request(app).get(PUBLIC).expect(200);
      expect(res.body.meta).toEqual({ page: 1, limit: 20, total: 1, totalPages: 1 });
      const item = res.body.data[0];
      expect(item).toMatchObject({ name: 'Jade Plant', availability: 'in_stock' });
      expect(item).not.toHaveProperty('isActive');
      expect(item).not.toHaveProperty('deletedAt');
      expect(item).not.toHaveProperty('description');
    });

    it('hides plants in inactive categories or subcategories', async () => {
      await createPlant({ name: 'In Succulents' });
      await createPlant({ name: 'In Outdoor', category: outdoor, subcategory: null });

      await request(app)
        .patch(`${CATEGORIES}/${succulents}`)
        .set(auth)
        .send({ isActive: false })
        .expect(200);
      let res = await request(app).get(PUBLIC).expect(200);
      expect(res.body.data.map((p: { name: string }) => p.name)).toEqual(['In Outdoor']);

      await request(app)
        .patch(`${CATEGORIES}/${outdoor}`)
        .set(auth)
        .send({ isActive: false })
        .expect(200);
      res = await request(app).get(PUBLIC).expect(200);
      expect(res.body.data).toEqual([]);
    });

    it('filters by category, search, availability and price, and sorts', async () => {
      await createPlant({ name: 'Jade', price: { amount: 30_000 } });
      await createPlant({ name: 'Aloe Vera', price: { amount: 10_000 }, availability: 'limited' });
      await createPlant({
        name: 'Bougainvillea',
        category: outdoor,
        subcategory: null,
        price: { amount: 20_000 },
        availability: 'out_of_stock',
      });

      const names = async (query: object) =>
        (await request(app).get(PUBLIC).query(query).expect(200)).body.data.map(
          (p: { name: string }) => p.name,
        );

      expect(await names({ category: indoor, sort: 'name' })).toEqual(['Aloe Vera', 'Jade']);
      expect(await names({ subcategory: succulents, sort: '-name' })).toEqual([
        'Jade',
        'Aloe Vera',
      ]);
      expect(await names({ search: 'vera' })).toEqual(['Aloe Vera']);
      expect(await names({ availability: 'out_of_stock' })).toEqual(['Bougainvillea']);
      expect(await names({ minPrice: 15_000, maxPrice: 25_000 })).toEqual(['Bougainvillea']);
      expect(await names({ sort: 'price' })).toEqual(['Aloe Vera', 'Bougainvillea', 'Jade']);
    });

    it('rejects an inverted price range and unknown sort', async () => {
      await request(app).get(PUBLIC).query({ minPrice: 500, maxPrice: 100 }).expect(400);
      await request(app).get(PUBLIC).query({ sort: 'isActive' }).expect(400);
    });

    it('returns full details by slug or id', async () => {
      const plant = await createPlant({ description: 'Easy care' });
      const bySlug = await request(app).get(`${PUBLIC}/${plant.slug}`).expect(200);
      expect(bySlug.body.data).toMatchObject({
        id: plant.id,
        description: 'Easy care',
        images: [],
      });
      await request(app).get(`${PUBLIC}/${plant.id}`).expect(200);
      await request(app).get(`${PUBLIC}/no-such-plant`).expect(404);
    });
  });

  describe('images', () => {
    it('uploads images; the first becomes the main image', async () => {
      const plant = await createPlant();
      const res = await upload(plant.id, 2).expect(201);
      expect(res.body.data.images).toHaveLength(2);
      expect(res.body.data.images[0]).toMatchObject({ width: 800, height: 600 });
      expect(res.body.data.images[0]).not.toHaveProperty('publicId');
      expect(res.body.data.image).toEqual(res.body.data.images[0]);
      expect(fakeStorage.uploaded).toEqual([
        `plants/${plant.id}/img-1`,
        `plants/${plant.id}/img-2`,
      ]);
    });

    it('rejects files that are not really images', async () => {
      const plant = await createPlant();
      await request(app)
        .post(`${ADMIN}/${plant.id}/images`)
        .set(auth)
        .attach('images', Buffer.from('not an image'), {
          filename: 'x.png',
          contentType: 'image/png',
        })
        .expect(400);
      await request(app)
        .post(`${ADMIN}/${plant.id}/images`)
        .set(auth)
        .attach('images', PNG_BYTES, { filename: 'x.gif', contentType: 'image/gif' })
        .expect(400);
      expect(fakeStorage.uploaded).toEqual([]);
    });

    it('requires at least one file', async () => {
      const plant = await createPlant();
      await request(app).post(`${ADMIN}/${plant.id}/images`).set(auth).expect(400);
    });

    it('rejects images over 5 MB', async () => {
      const plant = await createPlant();
      const big = Buffer.concat([PNG_BYTES, Buffer.alloc(5 * 1024 * 1024)]);
      await request(app)
        .post(`${ADMIN}/${plant.id}/images`)
        .set(auth)
        .attach('images', big, { filename: 'big.png', contentType: 'image/png' })
        .expect(413);
    });

    it('enforces the 10-image limit', async () => {
      const plant = await createPlant();
      await upload(plant.id, 8).expect(201);
      await upload(plant.id, 3).expect(400);
      await upload(plant.id, 2).expect(201);
    });

    it('cleans up uploaded files when one upload fails', async () => {
      const plant = await createPlant();
      fakeStorage.failOnUploadNumber = 2;
      const res = await upload(plant.id, 3).expect(503);
      expect(res.body.error.code).toBe('SERVICE_UNAVAILABLE');
      expect(fakeStorage.destroyed.sort()).toEqual(fakeStorage.uploaded.sort());

      const after = await request(app).get(`${ADMIN}/${plant.id}`).set(auth).expect(200);
      expect(after.body.data.images).toEqual([]);
    });

    it('returns 503 when image storage is not configured', async () => {
      setImageStorage({
        upload: async () => {
          throw ApiError.serviceUnavailable('Image storage is not configured');
        },
        destroy: async () => {},
      });
      const plant = await createPlant();
      const res = await upload(plant.id).expect(503);
      expect(res.body.error.message).toBe('Image storage is not configured');
    });

    it('removes an image from the plant and from storage', async () => {
      const plant = await createPlant();
      const { body } = await upload(plant.id, 2).expect(201);
      const [first, second] = body.data.images;

      const res = await request(app)
        .delete(`${ADMIN}/${plant.id}/images/${first.id}`)
        .set(auth)
        .expect(200);
      expect(res.body.data.images.map((i: { id: string }) => i.id)).toEqual([second.id]);
      expect(fakeStorage.destroyed).toEqual([`plants/${plant.id}/img-1`]);

      await request(app).delete(`${ADMIN}/${plant.id}/images/${first.id}`).set(auth).expect(404);
    });

    it('reorders images, changing the main image', async () => {
      const plant = await createPlant();
      const { body } = await upload(plant.id, 3).expect(201);
      const ids = body.data.images.map((i: { id: string }) => i.id);
      const reversed = [...ids].reverse();

      const res = await request(app)
        .patch(`${ADMIN}/${plant.id}/images/order`)
        .set(auth)
        .send({ imageIds: reversed })
        .expect(200);
      expect(res.body.data.images.map((i: { id: string }) => i.id)).toEqual(reversed);
      expect(res.body.data.image.id).toBe(reversed[0]);

      await request(app)
        .patch(`${ADMIN}/${plant.id}/images/order`)
        .set(auth)
        .send({ imageIds: [ids[0], ids[0], ids[1]] })
        .expect(400);
      await request(app)
        .patch(`${ADMIN}/${plant.id}/images/order`)
        .set(auth)
        .send({ imageIds: ids.slice(0, 2) })
        .expect(400);
    });
  });

  describe('category rules involving plants', () => {
    it('refuses deleting a category or subcategory that has plants', async () => {
      const plant = await createPlant();
      await request(app).delete(`${CATEGORIES}/${succulents}`).set(auth).expect(409);

      await request(app).delete(`${ADMIN}/${plant.id}`).set(auth).expect(200);
      await request(app).delete(`${CATEGORIES}/${succulents}`).set(auth).expect(200);
    });

    it('refuses moving a subcategory that has plants', async () => {
      await createPlant();
      await request(app)
        .patch(`${CATEGORIES}/${succulents}`)
        .set(auth)
        .send({ parent: outdoor })
        .expect(409);
    });
  });
});
