import type { AuthedUser } from './domain.js';

// Augment Express Request with the authenticated user (populated by auth middleware).
declare global {
  namespace Express {
    interface Request {
      user?: AuthedUser;
    }
  }
}

export {};
