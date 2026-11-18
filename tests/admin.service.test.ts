import { describe, expect, it } from 'vitest';
import { Admin } from '../src/modules/admin/admin.model.js';
import { createAdmin } from '../src/modules/admin/admin.service.js';
import { ApiError } from '../src/utils/ApiError.js';
import { createTestAdmin, TEST_PASSWORD } from './helpers.js';

describe('createAdmin', () => {
  it('hashes the password and never returns it', async () => {
    const admin = await createTestAdmin();
    expect(admin).not.toHaveProperty('passwordHash');

    const stored = await Admin.findById(admin.id).select('+passwordHash').lean();
    expect(stored?.passwordHash).toMatch(/^\$2[aby]\$10\$/);
    expect(stored?.passwordHash).not.toContain(TEST_PASSWORD);
  });

  it('refuses a duplicate email', async () => {
    await createTestAdmin();
    await expect(
      createAdmin({ name: 'Other', email: 'admin@example.com', password: TEST_PASSWORD }),
    ).rejects.toBeInstanceOf(ApiError);
  });
});
