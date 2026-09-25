import { displayNameInput, saveProfile } from '../lib/profile';
import express, { type Response, type NextFunction } from 'express';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { authMiddleware, type AuthRequest } from '../middleware/auth';
import { withGoalLock, GoalError, type GoalTx } from '../lib/goalWriteTransaction';
import { checkBudgetNotifications, currentBudgetPeriod } from '../lib/budgetNotifications';
export const settingsRouter = express.Router();
const money = z.string().regex(/^\d{1,10}(?:\.\d{1,2})?$/).refine(s => new Prisma.Decimal(s).lte('9999999999.99'));
export const settingsInput = z.object({
    displayName: displayNameInput, income: money.nullable(),
    paydayDay: z.number().int().min(1).max(31).nullable(), primaryGoalId: z.string().uuid().nullable(),
    budgetMonth: z.string().regex(/^\d{4}-\d{2}$/), budgetAmount: money.refine(s => new Prisma.Decimal(s).gt(0)).nullable(),
    notifyNearLimit: z.boolean(), notifyExceeded: z.boolean(), notifyAnomaly: z.boolean().optional(),
}).strict();
export function paydayDate(year: number, month: number, day: number) {
    return new Date(Date.UTC(year, month - 1, Math.min(day, new Date(Date.UTC(year, month, 0)).getUTCDate())));
}
const defaults = { enabled: false, notifyNearLimit: false, notifyExceeded: false, warningPercent: 80, totalBudget: true, categoryBudgets: true };
async function view(tx: GoalTx, userId: string, period = currentBudgetPeriod()) {
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } });
    const profile = await tx.profile.findUnique({ where: { userId }, select: { displayName: true, income: true, paydayDay: true, primaryGoalId: true, goal: true, avatarMime: true, primaryGoal: { select: { id: true, name: true, archivedAt: true } } } });
    const budget = await tx.budget.findUnique({ where: { userId_year_month: { userId, ...period } } });
    const notification = await tx.budgetNotificationSetting.findUnique({ where: { userId }, select: { enabled: true, notifyNearLimit: true, notifyExceeded: true, warningPercent: true, totalBudget: true, categoryBudgets: true } });
    const anomaly = await tx.anomalyNotificationSetting.findUnique({where:{userId}});
    const goals = await tx.goal.findMany({ where: { userId, archivedAt: null }, select: { id: true, name: true }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
    return { userId, email: user.email, displayName: profile?.displayName ?? null, income: profile?.income?.toFixed(2) ?? null,
        paydayDay: profile?.paydayDay ?? null, effectivePaydayDate: profile?.paydayDay ? paydayDate(period.year, period.month, profile.paydayDay).toISOString().slice(0, 10) : null, primaryGoalId: profile?.primaryGoalId ?? null, primaryGoal: profile?.primaryGoal ?? null,
        legacyGoal: profile?.goal ?? null, hasAvatar: Boolean(profile?.avatarMime), goals, budgetMonth: `${period.year}-${String(period.month).padStart(2, '0')}`,
        budgetAmount: budget?.amount.toFixed(2) ?? null, notifications: {...(notification ?? defaults), notifyAnomaly: anomaly?.enabled ?? false} };
}
function handle(work: (req: AuthRequest, res: Response) => Promise<unknown>) {
    return async (req: AuthRequest, res: Response) => {
        try {
            await work(req, res);
        }
        catch (e) {
            if (e instanceof z.ZodError) {
                res.status(400).json({ error: 'ข้อมูลไม่ถูกต้อง กรุณาตรวจช่องที่กรอก', fields: e.issues.map(i => i.path.join('.')) });
                return;
            }
            if (e instanceof GoalError) {
                res.status(e.status).json({ error: e.message, code: e.code });
                return;
            }
            // Do not log request bodies, password or database connection errors.
            res.status(500).json({ error: 'ดำเนินการไม่สำเร็จ กรุณาลองใหม่' });
        }
    };
}
async function write<T>(req: AuthRequest, work: (tx: GoalTx) => Promise<T>) {
    return withGoalLock(req.user!.userId, async (tx) => {
        const user = await tx.user.findUniqueOrThrow({ where: { id: req.user!.userId }, select: { authVersion: true } });
        if (user.authVersion !== (req.user!.authVersion ?? 0))
            throw new GoalError(401, 'SESSION_REVOKED', 'กรุณาเข้าสู่ระบบใหม่');
        return work(tx);
    });
}
settingsRouter.get('/settings', authMiddleware, handle(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json(await prisma.$transaction(tx => view(tx, req.user!.userId), { isolationLevel: 'RepeatableRead' }));
}));
settingsRouter.put('/settings', authMiddleware, handle(async (req, res) => {
    const input = settingsInput.parse(req.body), userId = req.user!.userId;
    const result = await write(req, async (tx) => {
        const period = currentBudgetPeriod();
        if (input.budgetMonth !== `${period.year}-${String(period.month).padStart(2, '0')}`)
            throw new GoalError(409, 'MONTH_CHANGED', 'เดือนเปลี่ยนแล้ว กรุณาโหลดค่าล่าสุดก่อนบันทึก');
        const existing = await tx.profile.findUnique({ where: { userId }, select: { primaryGoalId: true } });
        if (input.primaryGoalId) {
            const goal = await tx.goal.findFirst({ where: { id: input.primaryGoalId, userId }, select: { archivedAt: true } });
            if (!goal || (goal.archivedAt && existing?.primaryGoalId !== input.primaryGoalId))
                throw new GoalError(400, 'INVALID_GOAL', 'เลือกเป้าหมายที่ยังไม่เก็บถาวรของบัญชีนี้');
        }
        const data = { displayName: input.displayName, income: input.income, paydayDay: input.paydayDay, primaryGoalId: input.primaryGoalId };
        await saveProfile(tx, userId, data);
        if (input.budgetAmount === null)
            await tx.budget.deleteMany({ where: { userId, ...period } });
        else
            await tx.budget.upsert({ where: { userId_year_month: { userId, ...period } }, create: { userId, ...period, amount: input.budgetAmount }, update: { amount: input.budgetAmount } });
        const old = await tx.budgetNotificationSetting.findUnique({ where: { userId } });
        const enabled = input.notifyNearLimit || input.notifyExceeded;
        if (enabled && old && !old.totalBudget && !old.categoryBudgets)
            throw new GoalError(400, 'NO_SCOPE', 'กรุณาเลือกขอบเขตการแจ้งเตือนที่หน้างบประมาณก่อน');
        const toggles = { enabled, notifyNearLimit: input.notifyNearLimit, notifyExceeded: input.notifyExceeded };
        await tx.budgetNotificationSetting.upsert({ where: { userId }, create: { userId, ...toggles }, update: toggles });
        if(input.notifyAnomaly!==undefined){
          await tx.anomalyNotificationSetting.upsert({where:{userId},create:{userId,enabled:input.notifyAnomaly},update:{enabled:input.notifyAnomaly}});
          if(!input.notifyAnomaly)await tx.transaction.updateMany({where:{userId,anomalyPending:true},data:{anomalyPending:false}});
        }
        return view(tx, userId, period);
    });
    // Producer contains failures; a successful transaction must never be reported as failed.
    await checkBudgetNotifications(userId, [currentBudgetPeriod()]).catch(() => undefined);
    res.json(result);
}));
export function avatarType(bytes: Buffer): string | null {
    if (bytes.length >= 33 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && bytes.toString('ascii', 12, 16) === 'IHDR')
        return 'image/png';
    if (bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 && bytes[bytes.length - 2] === 255 && bytes[bytes.length - 1] === 217)
        return 'image/jpeg';
    if (bytes.length >= 20 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP' && bytes.readUInt32LE(4) + 8 === bytes.length && ['VP8 ', 'VP8L', 'VP8X'].includes(bytes.toString('ascii', 12, 16)))
        return 'image/webp';
    return null;
}
settingsRouter.get('/profile/avatar', authMiddleware, handle(async (req, res) => {
    const p = await prisma.profile.findUnique({ where: { userId: req.user!.userId }, select: { avatarData: true, avatarMime: true } });
    res.set({ 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
    if (!p?.avatarData || !p.avatarMime) {
        res.sendStatus(404);
        return;
    }
    res.type(p.avatarMime).send(Buffer.from(p.avatarData));
}));
settingsRouter.put('/profile/avatar', authMiddleware, express.raw({ type: () => true, limit: 1048576 }), handle(async (req, res) => {
    const data = req.body;
    const mime = req.get('Content-Type')?.split(';')[0]?.trim().toLowerCase();
    if (!Buffer.isBuffer(data) || !data.length || data.length > 1048576 || avatarType(data) !== mime || !['image/png', 'image/jpeg', 'image/webp'].includes(mime ?? ''))
        throw new GoalError(400, 'INVALID_IMAGE', 'รองรับ JPEG, PNG, WebP ที่ถูกต้อง ขนาดไม่เกิน 1 MB');
    const userId = req.user!.userId;
    await write(req, tx => tx.profile.upsert({ where: { userId }, create: { userId, avatarData: new Uint8Array(data), avatarMime: mime! }, update: { avatarData: new Uint8Array(data), avatarMime: mime! } }));
    res.json({ hasAvatar: true });
}));
settingsRouter.delete('/profile/avatar', authMiddleware, handle(async (req, res) => {
    await write(req, tx => tx.profile.updateMany({ where: { userId: req.user!.userId }, data: { avatarData: null, avatarMime: null } }));
    res.json({ hasAvatar: false });
}));
const currentPassword = z.string().min(1).max(1000);
settingsRouter.post('/auth/change-password', authMiddleware, handle(async (req, res) => {
    const input = z.object({ currentPassword, newPassword: z.string().min(6).refine(s => Buffer.byteLength(s, 'utf8') <= 72), confirmPassword: z.string() }).strict().refine(s => s.newPassword === s.confirmPassword).parse(req.body);
    await write(req, async (tx) => {
        const u = await tx.user.findUniqueOrThrow({ where: { id: req.user!.userId } });
        if (!await bcrypt.compare(input.currentPassword, u.passwordHash))
            throw new GoalError(400, 'WRONG_PASSWORD', 'รหัสผ่านปัจจุบันไม่ถูกต้อง');
        await tx.user.update({ where: { id: u.id }, data: { passwordHash: await bcrypt.hash(input.newPassword, 12), authVersion: { increment: 1 } } });
    });
    res.json({ logout: true });
}));
settingsRouter.post('/auth/close-account', authMiddleware, handle(async (req, res) => {
    const input = z.object({ currentPassword, confirmation: z.literal('ปิดบัญชีผู้ใช้') }).strict().parse(req.body);
    await write(req, async (tx) => {
        const u = await tx.user.findUniqueOrThrow({ where: { id: req.user!.userId } });
        if (!await bcrypt.compare(input.currentPassword, u.passwordHash))
            throw new GoalError(400, 'WRONG_PASSWORD', 'รหัสผ่านปัจจุบันไม่ถูกต้อง');
        await tx.user.update({ where: { id: u.id }, data: { deletedAt: new Date(), authVersion: { increment: 1 } } });
    });
    res.json({ logout: true });
}));
settingsRouter.use((err: {
    type?: string;
}, _req: AuthRequest, res: Response, next: NextFunction) => { if (err.type === 'entity.too.large')
    res.status(413).json({ error: 'รูปต้องมีขนาดไม่เกิน 1 MB' });
else
    next(err); });
