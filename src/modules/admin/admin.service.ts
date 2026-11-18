import { hashPassword } from '../auth/password.js';
import { Admin, toPublicAdmin, type PublicAdmin } from './admin.model.js';
import type { CreateAdminInput } from './admin.validation.js';
import { ApiError } from '../../utils/ApiError.js';

/** Creates an admin account. There is no public route for this; it is used by the seed script. */
export async function createAdmin(input: CreateAdminInput): Promise<PublicAdmin> {
  if (await Admin.exists({ email: input.email })) {
    throw ApiError.conflict('An admin with this email already exists');
  }

  const admin = await Admin.create({
    name: input.name,
    email: input.email,
    passwordHash: await hashPassword(input.password),
  });

  return toPublicAdmin(admin);
}

export async function findAdminByEmail(email: string) {
  return Admin.findOne({ email }).lean();
}
