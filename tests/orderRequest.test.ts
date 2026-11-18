import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import { createApp } from '../src/app.js';
import { OrderRequest } from '../src/modules/order-requests/orderRequest.model.js';
import { setImageStorage } from '../src/modules/upload/imageStorage.js';
import { createFakeImageStorage, createTestAdmin, loginAs, PNG_BYTES } from './helpers.js';

const CUSTOMER = '/api/v1/order-requests';
const ADMIN = '/api/v1/admin/order-requests';

const YEAR = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', year: 'numeric' }).format(
  new Date(),
);

function futureDate(days = 10): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

describe('order requests', () => {
  let app: Express;
  let auth: { Authorization: string };
  let jade: string; // ₹250 per pot, minimum 10, has an image
  let palm: string; // ₹1,200 per plant, out of stock
  let hidden: string; // inactive

  async function createPlant(body: object): Promise<string> {
    const res = await request(app).post('/api/v1/admin/plants').set(auth).send(body).expect(201);
    return res.body.data.id;
  }

  const validBody = (overrides: object = {}) => ({
    customerDetails: {
      name: 'Asha Rao',
      phone: '+91 98765-43210',
      email: 'Asha@Example.com',
      location: 'Farmhouse, Shamshabad, Hyderabad',
      pincode: '501218',
    },
    items: [
      { plantId: jade, quantity: 40 },
      { plantId: palm, quantity: 5 },
    ],
    intendedUse: 'farmhouse',
    preferredDeliveryDate: futureDate(),
    additionalNotes: 'Need delivery before the monsoon',
    ...overrides,
  });

  async function submit(overrides: object = {}) {
    const res = await request(app).post(CUSTOMER).send(validBody(overrides)).expect(201);
    return res.body.data as { referenceNumber: string; trackingToken: string; status: string };
  }

  async function adminIdFor(referenceNumber: string): Promise<string> {
    const record = await OrderRequest.findOne({ referenceNumber }).lean();
    return record!._id.toString();
  }

  const setStatus = (id: string, status: string, note?: string) =>
    request(app)
      .patch(`${ADMIN}/${id}/status`)
      .set(auth)
      .send(note === undefined ? { status } : { status, note });

  beforeEach(async () => {
    app = createApp();
    setImageStorage(createFakeImageStorage().storage);
    await createTestAdmin();
    const { accessToken } = await loginAs(app);
    auth = { Authorization: `Bearer ${accessToken}` };

    const category = (
      await request(app)
        .post('/api/v1/admin/categories')
        .set(auth)
        .send({ name: 'Outdoor' })
        .expect(201)
    ).body.data.id;

    jade = await createPlant({
      name: 'Jade Plant',
      category,
      price: { amount: 25_000 },
      priceUnit: 'per_pot',
      minOrderQty: 10,
    });
    await request(app)
      .post(`/api/v1/admin/plants/${jade}/images`)
      .set(auth)
      .attach('images', PNG_BYTES, { filename: 'jade.png', contentType: 'image/png' })
      .expect(201);
    palm = await createPlant({
      name: 'Areca Palm',
      category,
      price: { amount: 120_000 },
      priceUnit: 'per_plant',
      availability: 'out_of_stock',
    });
    hidden = await createPlant({
      name: 'Hidden',
      category,
      price: { amount: 100 },
      priceUnit: 'per_plant',
      isActive: false,
    });
  });

  describe('submit', () => {
    it('creates a request with reference number, token and snapshots', async () => {
      const res = await request(app).post(CUSTOMER).send(validBody()).expect(201);
      const data = res.body.data;

      expect(data.referenceNumber).toBe(`ORD-${YEAR}-00001`);
      expect(data.trackingToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(data).toMatchObject({
        status: 'submitted',
        customerName: 'Asha Rao',
        intendedUse: 'farmhouse',
        canCancel: true,
        additionalNotes: 'Need delivery before the monsoon',
        estimatedTotal: { amount: 40 * 25_000 + 5 * 120_000, currency: 'INR' },
      });
      expect(data.items[0]).toEqual({
        plantId: jade,
        plantNameSnapshot: 'Jade Plant',
        quantity: 40,
        unit: 'per_pot',
        indicativePriceSnapshot: { amount: 25_000, currency: 'INR' },
        imageUrlSnapshot: expect.stringMatching(/^https:\/\/images\.test\//),
        availabilitySnapshot: 'in_stock',
      });
      expect(data.items[1]).toMatchObject({ availabilitySnapshot: 'out_of_stock' });
      expect(data.statusHistory).toEqual([{ status: 'submitted', at: expect.any(String) }]);

      const body = JSON.stringify(data);
      expect(body).not.toContain('trackingTokenHash');
      expect(body).not.toContain('98765');
      expect(body).not.toContain('Shamshabad');
    });

    it('numbers requests sequentially and stores a normalised phone and email', async () => {
      await submit();
      const second = await submit();
      expect(second.referenceNumber).toBe(`ORD-${YEAR}-00002`);

      const record = await OrderRequest.findOne({ referenceNumber: second.referenceNumber })
        .select('+trackingTokenHash')
        .lean();
      expect(record!.customerDetails).toMatchObject({
        phone: '9876543210',
        email: 'asha@example.com',
      });
      expect(record!.trackingTokenHash).toMatch(/^[a-f0-9]{64}$/);
      expect(record!.trackingTokenHash).not.toBe(second.trackingToken);
    });

    it('rejects quantities below the minimum and unavailable plants, per item', async () => {
      const res = await request(app)
        .post(CUSTOMER)
        .send(
          validBody({
            items: [
              { plantId: jade, quantity: 5 },
              { plantId: hidden, quantity: 1 },
              { plantId: '0123456789abcdef01234567', quantity: 1 },
            ],
          }),
        )
        .expect(400);
      expect(res.body.error.details).toEqual([
        { field: 'items.0.quantity', message: 'Minimum order quantity for Jade Plant is 10' },
        { field: 'items.1.plantId', message: 'This plant is not available' },
        { field: 'items.2.plantId', message: 'This plant is not available' },
      ]);
      expect(await OrderRequest.countDocuments()).toBe(0);
    });

    it('validates contact details, dates, intended use and duplicates', async () => {
      const res = await request(app)
        .post(CUSTOMER)
        .send(
          validBody({
            customerDetails: { name: '', phone: '12345', location: '', pincode: '0123' },
            items: [
              { plantId: jade, quantity: 10 },
              { plantId: jade, quantity: 20 },
            ],
            intendedUse: 'party',
            preferredDeliveryDate: '2020-01-01',
          }),
        )
        .expect(400);
      const fields = res.body.error.details.map((d: { field: string }) => d.field);
      expect(fields).toEqual(
        expect.arrayContaining([
          'body.customerDetails.name',
          'body.customerDetails.phone',
          'body.customerDetails.location',
          'body.customerDetails.pincode',
          'body.items',
          'body.intendedUse',
          'body.preferredDeliveryDate',
        ]),
      );
    });

    it('does not let the client set prices, status or snapshots', async () => {
      await request(app)
        .post(CUSTOMER)
        .send(validBody({ items: [{ plantId: jade, quantity: 10, price: 1 }] }))
        .expect(400);
      await request(app)
        .post(CUSTOMER)
        .send({ ...validBody(), status: 'accepted' })
        .expect(400);
    });

    it('keeps snapshots after the plant changes or is deleted', async () => {
      const { trackingToken } = await submit();

      await request(app)
        .patch(`/api/v1/admin/plants/${jade}`)
        .set(auth)
        .send({ name: 'Crassula', price: { amount: 99_999 } })
        .expect(200);
      await request(app).delete(`/api/v1/admin/plants/${palm}`).set(auth).expect(200);

      const res = await request(app).get(`${CUSTOMER}/track/${trackingToken}`).expect(200);
      expect(
        res.body.data.items.map((i: { plantNameSnapshot: string }) => i.plantNameSnapshot),
      ).toEqual(['Jade Plant', 'Areca Palm']);
      expect(res.body.data.items[0].indicativePriceSnapshot.amount).toBe(25_000);
    });

    it('limits submissions per IP', async () => {
      for (let i = 0; i < 10; i++) await submit();
      const res = await request(app).post(CUSTOMER).send(validBody()).expect(429);
      expect(res.body.error.code).toBe('TOO_MANY_REQUESTS');
    });
  });

  describe('track', () => {
    it('tracks by token without exposing admin data', async () => {
      const { referenceNumber, trackingToken } = await submit();
      const id = await adminIdFor(referenceNumber);
      await request(app).patch(`${ADMIN}/${id}/notes`).set(auth).send({ adminNotes: 'VIP' });
      await setStatus(id, 'under_review', 'checking stock').expect(200);

      const res = await request(app).get(`${CUSTOMER}/track/${trackingToken}`).expect(200);
      expect(res.body.data).toMatchObject({ referenceNumber, status: 'under_review' });
      expect(res.body.data.statusHistory.map((h: { status: string }) => h.status)).toEqual([
        'submitted',
        'under_review',
      ]);
      const body = JSON.stringify(res.body);
      expect(body).not.toContain('VIP');
      expect(body).not.toContain('checking stock');
      expect(body).not.toContain('adminId');
    });

    it('returns 404 for an unknown token and 400 for a malformed one', async () => {
      await request(app)
        .get(`${CUSTOMER}/track/${'a'.repeat(43)}`)
        .expect(404);
      await request(app).get(`${CUSTOMER}/track/short`).expect(400);
    });

    it('tracks by reference number and phone as a fallback', async () => {
      const { referenceNumber } = await submit();
      const res = await request(app)
        .post(`${CUSTOMER}/track`)
        .send({ referenceNumber: referenceNumber.toLowerCase(), phone: '9876543210' })
        .expect(200);
      expect(res.body.data.referenceNumber).toBe(referenceNumber);
      expect(res.body.data).not.toHaveProperty('trackingToken');

      await request(app)
        .post(`${CUSTOMER}/track`)
        .send({ referenceNumber, phone: '9123456789' })
        .expect(404);
    });

    it('limits failed reference lookups', async () => {
      for (let i = 0; i < 10; i++) {
        await request(app)
          .post(`${CUSTOMER}/track`)
          .send({ referenceNumber: `ORD-${YEAR}-0000${i}`, phone: '9123456789' })
          .expect(404);
      }
      await request(app)
        .post(`${CUSTOMER}/track`)
        .send({ referenceNumber: `ORD-${YEAR}-00001`, phone: '9123456789' })
        .expect(429);
    });
  });

  describe('customer cancel', () => {
    it('cancels with the matching token, once', async () => {
      const { referenceNumber, trackingToken } = await submit();

      await request(app)
        .post(`${CUSTOMER}/${referenceNumber}/cancel`)
        .send({ token: 'b'.repeat(43) })
        .expect(404);

      const res = await request(app)
        .post(`${CUSTOMER}/${referenceNumber}/cancel`)
        .send({ token: trackingToken, reason: 'Plans changed' })
        .expect(200);
      expect(res.body.data).toMatchObject({ status: 'cancelled', canCancel: false });

      await request(app)
        .post(`${CUSTOMER}/${referenceNumber}/cancel`)
        .send({ token: trackingToken })
        .expect(409);

      const detail = await request(app)
        .get(`${ADMIN}/${await adminIdFor(referenceNumber)}`)
        .set(auth)
        .expect(200);
      expect(detail.body.data.statusHistory.at(-1)).toMatchObject({
        from: 'submitted',
        to: 'cancelled',
        by: 'customer',
        admin: null,
        note: 'Plans changed',
      });
      expect(detail.body.data.allowedTransitions).toEqual([]);
    });

    it('cannot cancel once accepted', async () => {
      const { referenceNumber, trackingToken } = await submit();
      const id = await adminIdFor(referenceNumber);
      for (const status of ['under_review', 'contacted', 'accepted']) {
        await setStatus(id, status).expect(200);
      }
      const res = await request(app)
        .post(`${CUSTOMER}/${referenceNumber}/cancel`)
        .send({ token: trackingToken })
        .expect(409);
      expect(res.body.error.code).toBe('CONFLICT');
    });

    it("cannot cancel another customer's request with its own token", async () => {
      const first = await submit();
      const second = await submit();
      await request(app)
        .post(`${CUSTOMER}/${first.referenceNumber}/cancel`)
        .send({ token: second.trackingToken })
        .expect(404);
    });
  });

  describe('admin', () => {
    it('requires authentication', async () => {
      await request(app).get(ADMIN).expect(401);
    });

    it('lists with status filter, search and pagination', async () => {
      const a = await submit();
      await submit({
        customerDetails: {
          ...validBody().customerDetails,
          name: 'Ravi Kumar',
          phone: '9000000001',
        },
      });
      await setStatus(await adminIdFor(a.referenceNumber), 'under_review').expect(200);

      const all = await request(app).get(ADMIN).set(auth).query({ limit: 1 }).expect(200);
      expect(all.body.meta).toEqual({ page: 1, limit: 1, total: 2, totalPages: 2 });
      expect(all.body.data[0]).toMatchObject({
        referenceNumber: `ORD-${YEAR}-00002`,
        itemCount: 2,
        totalQuantity: 45,
        customerDetails: { name: 'Ravi Kumar', phone: '9000000001' },
      });
      expect(all.body.data[0]).not.toHaveProperty('trackingTokenHash');

      const refs = async (query: object) =>
        (await request(app).get(ADMIN).set(auth).query(query).expect(200)).body.data.map(
          (r: { referenceNumber: string }) => r.referenceNumber,
        );
      expect(await refs({ status: 'under_review' })).toEqual([a.referenceNumber]);
      expect(await refs({ search: 'ravi' })).toEqual([`ORD-${YEAR}-00002`]);
      expect(await refs({ search: '98765' })).toEqual([a.referenceNumber]);
      expect(await refs({ search: `${YEAR}-00001` })).toEqual([a.referenceNumber]);
    });

    it('returns full details with notes, history and allowed transitions', async () => {
      const { referenceNumber } = await submit();
      const id = await adminIdFor(referenceNumber);
      await setStatus(id, 'under_review', 'Checking stock').expect(200);

      const res = await request(app).get(`${ADMIN}/${id}`).set(auth).expect(200);
      expect(res.body.data).toMatchObject({
        id,
        referenceNumber,
        status: 'under_review',
        customerDetails: {
          name: 'Asha Rao',
          phone: '9876543210',
          email: 'asha@example.com',
          location: 'Farmhouse, Shamshabad, Hyderabad',
          pincode: '501218',
        },
        adminNotes: null,
        allowedTransitions: ['contacted', 'rejected'],
      });
      expect(res.body.data.statusHistory[1]).toMatchObject({
        from: 'submitted',
        to: 'under_review',
        by: 'admin',
        admin: { name: 'Test Admin' },
        note: 'Checking stock',
      });
      expect(JSON.stringify(res.body)).not.toContain('trackingTokenHash');
    });

    it('updates and clears admin notes without changing status', async () => {
      const { referenceNumber } = await submit();
      const id = await adminIdFor(referenceNumber);
      let res = await request(app)
        .patch(`${ADMIN}/${id}/notes`)
        .set(auth)
        .send({ adminNotes: 'Call after 5pm' })
        .expect(200);
      expect(res.body.data).toMatchObject({ adminNotes: 'Call after 5pm', status: 'submitted' });

      res = await request(app)
        .patch(`${ADMIN}/${id}/notes`)
        .set(auth)
        .send({ adminNotes: null })
        .expect(200);
      expect(res.body.data.adminNotes).toBeNull();
    });
  });

  describe('status transitions', () => {
    let id: string;

    beforeEach(async () => {
      id = await adminIdFor((await submit()).referenceNumber);
    });

    it('follows the full path to completed', async () => {
      for (const status of ['under_review', 'contacted', 'accepted', 'completed']) {
        const res = await setStatus(id, status).expect(200);
        expect(res.body.data.status).toBe(status);
      }
      await setStatus(id, 'rejected').expect(400);
    });

    it('refuses skipping steps, going backwards and setting the same status', async () => {
      await setStatus(id, 'contacted').expect(400);
      await setStatus(id, 'under_review').expect(200);
      await setStatus(id, 'submitted').expect(400);
      await setStatus(id, 'under_review').expect(400);
    });

    it('lets admins reject before acceptance but not cancel', async () => {
      await setStatus(id, 'cancelled', 'no').expect(400);
      await setStatus(id, 'under_review').expect(200);
      await setStatus(id, 'contacted').expect(200);
      const res = await setStatus(id, 'rejected', 'Out of stock for this season').expect(200);
      expect(res.body.data.allowedTransitions).toEqual([]);
    });

    it('allows cancelling an accepted request only with a note', async () => {
      for (const status of ['under_review', 'contacted', 'accepted']) {
        await setStatus(id, status).expect(200);
      }
      const missing = await setStatus(id, 'cancelled').expect(400);
      expect(missing.body.error.details[0].field).toBe('note');
      await setStatus(id, 'rejected').expect(400);
      await setStatus(id, 'cancelled', 'Customer backed out').expect(200);
    });

    it('rejects unknown statuses and missing requests', async () => {
      await setStatus(id, 'shipped').expect(400);
      await setStatus('0123456789abcdef01234567', 'under_review').expect(404);
    });
  });
});
