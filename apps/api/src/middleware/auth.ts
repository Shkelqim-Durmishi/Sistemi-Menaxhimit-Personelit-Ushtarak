// apps/api/src/middleware/auth.ts

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export type Role = 'ADMIN' | 'OFFICER' | 'OPERATOR' | 'COMMANDER' | 'AUDITOR';

export interface AuthUserPayload {
  id: string;
  username: string;
  role: Role;
  unitId: string | null;
}

// Tip ndihmës që ta kemi req.user të tipizuar
export interface RequestWithUser extends Request {
  user?: AuthUserPayload;
}

const ROLE_SET: Set<Role> = new Set(['ADMIN', 'OFFICER', 'OPERATOR', 'COMMANDER', 'AUDITOR']);

/**
 * Lexon token nga:
 *  - Authorization: Bearer xxx
 *  - ose ?auth=xxx (për export në new tab)
 *  - ose cookie token/access_token (opsionale)
 */
function extractToken(req: Request): string | null {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const t = authHeader.slice(7).trim();
    if (t) return t;
  }

  const qAuth = (req.query as any)?.auth;
  if (typeof qAuth === 'string' && qAuth.trim().length > 0) {
    return qAuth.trim();
  }

  // ✅ opsionale: token nga cookies (nëse i përdor)
  const c: any = (req as any).cookies;
  const cookieToken =
    (typeof c?.token === 'string' && c.token.trim()) ||
    (typeof c?.access_token === 'string' && c.access_token.trim()) ||
    null;

  if (cookieToken) return cookieToken;

  return null;
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) return res.status(401).json({ code: 'UNAUTHORIZED' });

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as any;

    // ✅ prano edhe "id" edhe "_id"
    const id = String(decoded?.id || decoded?._id || '').trim();
    const username = String(decoded?.username || '').trim();
    const roleRaw = String(decoded?.role || '').trim() as Role;
    const unitIdRaw = decoded?.unitId ?? null;

    if (!id || !username || !roleRaw) {
      return res.status(401).json({
        code: 'INVALID_TOKEN',
        message: 'Token payload missing id/username/role',
      });
    }

    // ✅ validim role
    if (!ROLE_SET.has(roleRaw)) {
      return res.status(401).json({
        code: 'INVALID_TOKEN',
        message: 'Token payload has invalid role',
      });
    }

    const user: AuthUserPayload = {
      id,
      username,
      role: roleRaw,
      unitId: unitIdRaw ? String(unitIdRaw) : null,
    };

    (req as RequestWithUser).user = user;
    next();
  } catch {
    return res.status(401).json({ code: 'INVALID_TOKEN' });
  }
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const r = req as RequestWithUser;
    const user = r.user;

    if (!user) return res.status(401).json({ code: 'UNAUTHORIZED' });

    if (!roles.includes(user.role)) {
      return res.status(403).json({ code: 'FORBIDDEN', message: 'Insufficient role' });
    }

    next();
  };
}
