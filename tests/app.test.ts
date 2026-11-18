import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

describe('app', () => {
  const app = createApp();

  it('reports health with the database status', async () => {
    const res = await request(app).get('/health').expect(200);
    expect(res.body).toEqual({ success: true, data: { status: 'ok', database: 'up' } });
  });

  it('returns a consistent 404 body for unknown routes', async () => {
    const res = await request(app).get('/api/v1/does-not-exist').expect(404);
    expect(res.body).toEqual({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Route GET /api/v1/does-not-exist not found' },
    });
  });

  it('rejects malformed JSON with 400', async () => {
    const res = await request(app)
      .post('/api/v1/admin/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email":')
      .expect(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
  });

  it('rejects bodies over 100kb with 413', async () => {
    const res = await request(app)
      .post('/api/v1/admin/auth/login')
      .send({ email: 'a@example.com', password: 'x'.repeat(110_000) })
      .expect(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('sets security headers and hides the framework', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});
