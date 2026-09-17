import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';

type JwtPayload = {
  userId: string;
  email: string;
};

export interface AuthRequest extends Request {
  user?: JwtPayload;
}

export async function authMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Unauthorized',
    });
  }

  const token = authHeader.slice('Bearer '.length).trim();

  if (!token) {
    return res.status(401).json({
      error: 'Unauthorized',
    });
  }

  const secret = process.env.JWT_SECRET;

  if (!secret || !secret.trim()) {
    return res.status(500).json({
      error: 'ระบบยืนยันตัวตนยังไม่พร้อมใช้งาน',
    });
  }

  let payload: JwtPayload;

  try {
    const decoded = jwt.verify(token, secret);

    if (
      typeof decoded === 'string' ||
      typeof decoded.userId !== 'string' ||
      decoded.userId.trim() === '' ||
      typeof decoded.email !== 'string' ||
      decoded.email.trim() === ''
    ) {
      return res.status(401).json({
        error: 'Invalid token payload',
      });
    }

    payload = {
      userId: decoded.userId,
      email: decoded.email,
    };
  } catch {
    return res.status(401).json({
      error: 'Invalid or expired token',
    });
  }

  try {
    const user = await prisma.user.findFirst({
      where: {
        id: payload.userId,
        deletedAt: null,
      },
      select: {
        id: true,
        email: true,
      },
    });

    if (!user) {
      return res.status(401).json({
        error: 'บัญชีนี้ไม่สามารถใช้งานได้ กรุณาเข้าสู่ระบบใหม่',
      });
    }

    req.user = {
      userId: user.id,
      email: user.email,
    };
  } catch (error) {
    console.error('AUTH DATABASE ERROR:', error);

    return res.status(500).json({
      error: 'ไม่สามารถตรวจสอบบัญชีผู้ใช้ได้ กรุณาลองใหม่',
    });
  }

  next();
}