import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { Invitation, User, Workspace } from '../models/index.js';
import { PLANS } from '../config.js';
import { HttpError, asyncHandler, requireAuth, signToken } from '../middleware/auth.js';
import { getUsage } from '../services/limits.js';

const router = Router();
const COLORS = ['#6D5EF5', '#0EA5A4', '#E8590C', '#2F9E44', '#D6336C', '#1C7ED6', '#B08900'];

const publicUser = (u) => ({ id: u._id, name: u.name, email: u.email, role: u.role, title: u.title, color: u.color, workspaceId: u.workspaceId });

export async function sessionPayload(user, workspace) {
  return {
    user: publicUser(user),
    workspace: {
      id: workspace._id,
      name: workspace.name,
      plan: workspace.plan,
      subscriptionStatus: workspace.subscriptionStatus,
      renewsAt: workspace.renewsAt,
    },
    plan: PLANS[workspace.plan],
    usage: await getUsage(workspace),
  };
}

const validatePassword = (p) => {
  if (!p || p.length < 8) throw new HttpError(400, 'Password must be at least 8 characters');
};

router.post(
  '/register',
  asyncHandler(async (req, res) => {
    const { name, email, password, workspaceName } = req.body;
    if (!name || !email || !workspaceName) throw new HttpError(400, 'Name, email and workspace name are required');
    validatePassword(password);
    if (await User.exists({ email: email.toLowerCase() })) throw new HttpError(409, 'An account with this email already exists');

    const workspace = await Workspace.create({ name: workspaceName });
    const user = await User.create({
      workspaceId: workspace._id,
      name,
      email,
      passwordHash: await bcrypt.hash(password, 10),
      role: 'admin',
      title: 'Workspace owner',
      color: COLORS[0],
    });
    res.status(201).json({ token: signToken(user), ...(await sessionPayload(user, workspace)) });
  })
);

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const user = await User.findOne({ email: (email || '').toLowerCase() }).select('+passwordHash');
    if (!user || !(await bcrypt.compare(password || '', user.passwordHash))) throw new HttpError(401, 'Incorrect email or password');
    user.lastActiveAt = new Date();
    await user.save();
    const workspace = await Workspace.findById(user.workspaceId);
    res.json({ token: signToken(user), ...(await sessionPayload(user, workspace)) });
  })
);

router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(await sessionPayload(req.user, req.workspace));
  })
);

/** Invitation preview + accept */
router.get(
  '/invite/:token',
  asyncHandler(async (req, res) => {
    const inv = await Invitation.findOne({ token: req.params.token, status: 'pending' }).lean();
    if (!inv) throw new HttpError(404, 'This invitation is invalid or has already been used');
    const ws = await Workspace.findById(inv.workspaceId).lean();
    res.json({ email: inv.email, role: inv.role, workspace: ws.name });
  })
);

router.post(
  '/invite/:token/accept',
  asyncHandler(async (req, res) => {
    const inv = await Invitation.findOne({ token: req.params.token, status: 'pending' });
    if (!inv) throw new HttpError(404, 'This invitation is invalid or has already been used');
    const { name, password } = req.body;
    if (!name) throw new HttpError(400, 'Name is required');
    validatePassword(password);
    if (await User.exists({ email: inv.email })) throw new HttpError(409, 'An account with this email already exists');
    const count = await User.countDocuments({ workspaceId: inv.workspaceId });
    const user = await User.create({
      workspaceId: inv.workspaceId,
      name,
      email: inv.email,
      passwordHash: await bcrypt.hash(password, 10),
      role: inv.role,
      color: COLORS[count % COLORS.length],
    });
    inv.status = 'accepted';
    await inv.save();
    const workspace = await Workspace.findById(inv.workspaceId);
    res.status(201).json({ token: signToken(user), ...(await sessionPayload(user, workspace)) });
  })
);

export default router;
