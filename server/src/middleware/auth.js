import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { User, Workspace } from '../models/index.js';

export const signToken = (user) =>
  jwt.sign({ uid: user._id.toString(), wid: user.workspaceId.toString() }, config.jwtSecret, { expiresIn: '7d' });

/** Verifies the bearer token and attaches `req.user` + `req.workspace`. Every query downstream is scoped by `req.wid`. */
export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Authentication required' });

    const payload = jwt.verify(token, config.jwtSecret);
    const user = await User.findById(payload.uid).lean();
    if (!user || user.workspaceId.toString() !== payload.wid) {
      return res.status(401).json({ error: 'Session is no longer valid' });
    }
    const workspace = await Workspace.findById(user.workspaceId);
    if (!workspace) return res.status(401).json({ error: 'Workspace not found' });

    req.user = user;
    req.wid = user.workspaceId;
    req.workspace = workspace;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/** Role gate: `requireRole('admin', 'manager')` */
export const requireRole =
  (...roles) =>
  (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: `Requires ${roles.join(' or ')} role` });
    }
    next();
  };

/** Reps can only mutate records they own; managers/admins can mutate anything in the workspace. */
export const canEditRecord = (user, record) =>
  user.role !== 'rep' || (record.ownerId && record.ownerId.toString() === user._id.toString());

export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function errorHandler(err, req, res, _next) {
  if (err.name === 'ValidationError') return res.status(400).json({ error: err.message });
  if (err.name === 'CastError') return res.status(400).json({ error: 'Invalid identifier' });
  if (err.code === 11000) return res.status(409).json({ error: 'That value is already in use' });
  if (config.env !== 'test') console.error(err);
  res.status(err.status || 500).json({
    error: err.status ? err.message : 'Something went wrong on our side',
    ...(err.status === 402 ? { code: err.code, limitKey: err.limitKey } : {}),
  });
}

export class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    Object.assign(this, extra);
  }
}
