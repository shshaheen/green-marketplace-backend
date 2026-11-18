import type { PublicAdmin } from '../admin/admin.model.js';

/** The admin identity attached to `req.admin` by the `authenticate` middleware. */
export interface AuthenticatedAdmin {
  id: string;
  name: string;
  email: string;
}

export interface RequestMeta {
  ip?: string | undefined;
  userAgent?: string | undefined;
}

export interface TokenPair {
  accessToken: string;
  accessTokenExpiresIn: number;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

export interface LoginResult extends TokenPair {
  admin: PublicAdmin;
}
