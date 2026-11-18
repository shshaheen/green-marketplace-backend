import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import { createApp } from '../src/app.js';
import { OrderRequest } from '../src/modules/order-requests/orderRequest.model.js';
import { createTestAdmin, loginAs } from './helpers.js';

const STATS = '/api/v1/admin/dashboard/stats';

describe('admin dashboard stats', () => {
  let app: Express;
  let auth: { Authorization: string };
  let category: string;

  async function createPlant(body: object): Promise<string> {
    const res = await request(app)
      .post('/api/v1/admin/plants')
      .set(auth)
      .send({ category, price: { amount: 10_000 }, priceUnit: 'per_plant', ...body })
      .expect(201);
    return res.body.data.id;
  }

  async function submit(items: { plantId: string; quantity: number }[]) {
    const res = await request(app)
      .post('/api/v1/order-requests')
      .send({
        customerDetails: {
          name: 'Asha',
          phone: '9876543210',
          location: 'Hyderabad',
          pincode: '500001',
        },
        items,
        intendedUse: 'resort',
      })
      .expect(201);
    const record = await OrderRequest.findOne({ referenceNumber: res.body.data.referenceNumber });
    return record!._id.toString();
  }

  const setStatus = (id: string, status: string) =>
    request(app)
      .patch(`/api/v1/admin/order-requests/${id}/status`)
      .set(auth)
      .send({ status })
      .expect(200);

  beforeEach(async () => {
    app = createApp();
    await createTestAdmin();
    const { accessToken } = await loginAs(app);
    auth = { Authorization: `Bearer ${accessToken}` };
    category = (
      await request(app).post('/api/v1/admin/categories').set(auth).send({ name: 'Outdoor' })
    ).body.data.id;
  });

  it('requires authentication', async () => {
    await request(app).get(STATS).expect(401);
  });

  it('returns zeros when there is no data', async () => {
    const res = await request(app).get(STATS).set(auth).expect(200);
    expect(res.body.data).toEqual({
      orderRequests: {
        total: 0,
        newRequests: 0,
        byStatus: {
          submitted: 0,
          under_review: 0,
          contacted: 0,
          accepted: 0,
          completed: 0,
          rejected: 0,
          cancelled: 0,
        },
        received: { today: 0, last7Days: 0, last30Days: 0 },
      },
      plants: { active: 0, outOfStock: 0 },
      topRequestedPlants: [],
      recentRequests: [],
    });
  });

  it('counts requests by status, time window, plants and top requested plants', async () => {
    const jade = await createPlant({ name: 'Jade' });
    const palm = await createPlant({ name: 'Palm', availability: 'out_of_stock' });
    const fern = await createPlant({ name: 'Fern' });
    await createPlant({ name: 'Hidden', isActive: false });

    const a = await submit([
      { plantId: jade, quantity: 10 },
      { plantId: palm, quantity: 5 },
    ]);
    const b = await submit([{ plantId: jade, quantity: 20 }]);
    const c = await submit([
      { plantId: palm, quantity: 50 },
      { plantId: fern, quantity: 1 },
    ]);
    await submit([{ plantId: jade, quantity: 1 }]);

    await setStatus(a, 'under_review');
    await setStatus(b, 'rejected');
    await setStatus(c, 'under_review');
    await setStatus(c, 'contacted');

    // Move one request back in time to check the date windows.
    await OrderRequest.collection.updateOne(
      { _id: (await OrderRequest.findById(b))!._id },
      { $set: { createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) } },
    );

    const { body } = await request(app).get(STATS).set(auth).expect(200);
    expect(body.data.orderRequests).toEqual({
      total: 4,
      newRequests: 1,
      byStatus: {
        submitted: 1,
        under_review: 1,
        contacted: 1,
        accepted: 0,
        completed: 0,
        rejected: 1,
        cancelled: 0,
      },
      received: { today: 3, last7Days: 3, last30Days: 4 },
    });
    expect(body.data.plants).toEqual({ active: 3, outOfStock: 1 });
    expect(body.data.topRequestedPlants).toEqual([
      { plantId: jade, plantName: 'Jade', requestCount: 3, totalQuantity: 31 },
      { plantId: palm, plantName: 'Palm', requestCount: 2, totalQuantity: 55 },
      { plantId: fern, plantName: 'Fern', requestCount: 1, totalQuantity: 1 },
    ]);

    expect(body.data.recentRequests).toHaveLength(4);
    expect(body.data.recentRequests[0]).toMatchObject({ status: 'submitted', itemCount: 1 });
    expect(JSON.stringify(body)).not.toContain('trackingTokenHash');
  });

  it('shows at most 5 recent requests', async () => {
    const jade = await createPlant({ name: 'Jade' });
    for (let i = 0; i < 6; i++) await submit([{ plantId: jade, quantity: 1 }]);
    const { body } = await request(app).get(STATS).set(auth).expect(200);
    expect(body.data.recentRequests).toHaveLength(5);
    expect(body.data.orderRequests.total).toBe(6);
  });
});
