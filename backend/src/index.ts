import { goalsRouter } from './routes/goals';
import { withGoalLock, guardFundingTransaction, GoalError } from './lib/goalWriteTransaction';
import { Prisma } from '@prisma/client';
import { checkBudgetNotifications, currentBudgetPeriod, transactionPeriod, reconcileBudgetNotifications } from './lib/budgetNotifications';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { prisma } from './lib/prisma';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import {
  authMiddleware,
  type AuthRequest,
} from './middleware/auth';

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());
app.use(goalsRouter);

function getTransactionTodayKey(): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

type TransactionValueResult =
  | {
      ok: true;
      amount: string;
      transactionDate: Date;
      transactionTime: Date | null;
    }
  | {
      ok: false;
      error: string;
    };

function validateTransactionValues(
  amountInput: unknown,
  dateInput: unknown,
  timeInput: unknown
): TransactionValueResult {
  if (
    typeof amountInput !== 'string' &&
    typeof amountInput !== 'number'
  ) {
    return { ok: false, error: 'กรุณากรอกจำนวนเงินให้ถูกต้อง' };
  }

  const amountText = String(amountInput).trim();

  // Decimal(12, 2): จำนวนเต็มไม่เกิน 10 หลัก ทศนิยมไม่เกิน 2 หลัก
  if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(amountText)) {
    return {
      ok: false,
      error: 'จำนวนเงินต้องเป็นตัวเลข ทศนิยมไม่เกิน 2 ตำแหน่ง',
    };
  }

  const amountNumber = Number(amountText);

  if (
    !Number.isFinite(amountNumber) ||
    amountNumber <= 0 ||
    amountNumber > 9999999999.99
  ) {
    return {
      ok: false,
      error: 'จำนวนเงินต้องมากกว่า 0 และไม่เกิน 9,999,999,999.99 บาท',
    };
  }

  if (
    typeof dateInput !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(dateInput) ||
    dateInput.startsWith('0000-')
  ) {
    return {
      ok: false,
      error: 'วันที่ต้องอยู่ในรูปแบบ YYYY-MM-DD',
    };
  }

  // ใช้ UTC เป็นตัวแทนวันที่ตามปฏิทิน ไม่แปลงเวลาไทยเป็น UTC
  const transactionDate = new Date(`${dateInput}T00:00:00.000Z`);

  if (
    Number.isNaN(transactionDate.getTime()) ||
    transactionDate.toISOString().slice(0, 10) !== dateInput
  ) {
    return {
      ok: false,
      error: 'วันที่ไม่ถูกต้องหรือไม่มีอยู่จริง',
    };
  }

  if (dateInput > getTransactionTodayKey()) {
    return { ok: false, error: 'ไม่สามารถบันทึกวันที่อนาคตได้' };
  }

  let transactionTime: Date | null = null;

  if (
    timeInput !== undefined &&
    timeInput !== null &&
    timeInput !== ''
  ) {
    if (
      typeof timeInput !== 'string' ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(timeInput)
    ) {
      return {
        ok: false,
        error: 'เวลาต้องอยู่ในรูปแบบ HH:mm ตั้งแต่ 00:00 ถึง 23:59',
      };
    }

    transactionTime = new Date(`1970-01-01T${timeInput}:00.000Z`);
  }

  return {
    ok: true,
    amount: amountText,
    transactionDate,
    transactionTime,
  };
}

app.get('/categories', async (req, res) => {
  try {
    const categories = await prisma.category.findMany({
      orderBy: [
        { type: 'asc' },
        { name: 'asc' }
      ]
    });

    res.json(categories);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: 'Failed to load categories'
    });
  }
});

app.post(
  '/transactions',
  authMiddleware,
  async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;

      const {
        categoryId,
        type,
        amount,
        transactionDate,
        transactionTime,
        paymentMethod,
        description,
        note,
      } = req.body;

      if (
        !categoryId ||
        !type ||
        !amount ||
        !transactionDate
      ) {
        return res.status(400).json({
          error: 'Missing required fields',
        });
      }

      if (!['income', 'expense'].includes(type)) {
        return res.status(400).json({
          error: 'Invalid transaction type',
        });
      }

      const validated = validateTransactionValues(
  amount,
  transactionDate,
  transactionTime
);

if (!validated.ok) {
  return res.status(400).json({
    error: validated.error,
  });
}



      const category = await prisma.category.findUnique({
        where: {
          id: categoryId,
        },
      });

      if (!category) {
        return res.status(404).json({
          error: 'Category not found',
        });
      }

      if (category.type !== type) {
        return res.status(400).json({
          error: 'Category type does not match transaction type',
        });
      }

      const transaction = await withGoalLock(userId, tx => tx.transaction.create({
        data: {
          userId,
          categoryId,
          type,
          amount: validated.amount,
          transactionDate: validated.transactionDate,
          transactionTime: validated.transactionTime,
          paymentMethod: paymentMethod || null,
          description: description || null,
          note: note || null,
        },
        include: {
          category: true,
        },
      }));

      await checkBudgetNotifications(userId, [transactionPeriod(transaction.transactionDate)]);
      return res.status(201).json(transaction);
    } catch (error) {
      if(error instanceof GoalError) return res.status(error.status).json({error:error.message,code:error.code});
      console.error(error);

      return res.status(500).json({
        error: 'Failed to create transaction',
      });
    }
  }
);

app.get(
  '/transactions',
  authMiddleware,
  async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;

      const transactions = await prisma.transaction.findMany({
        where: {
          userId,
        },
        include: {
          category: true,
        },
        orderBy: [
          {
            transactionDate: 'desc',
          },
          {
            createdAt: 'desc',
          },
        ],
      });

      return res.json(transactions);
    } catch (error) {
      console.error(error);

      return res.status(500).json({
        error: 'Failed to load transactions',
      });
    }
  }
);

app.get(
  '/overview',
  authMiddleware,
  async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const { startDate, endDate } = req.query;

      // รองรับหน้าเว็บเดิมที่ยังไม่ได้ส่งช่วงวันที่
      const hasDateFilter =
        startDate !== undefined || endDate !== undefined;

      let start: Date | undefined;
      let end: Date | undefined;

      if (hasDateFilter) {
        if (
          typeof startDate !== 'string' ||
          typeof endDate !== 'string'
        ) {
          return res.status(400).json({
            error: 'กรุณาระบุ startDate และ endDate ให้ครบ',
          });
        }

        const parseDate = (value: string): Date | null => {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
            return null;
          }

          const date = new Date(`${value}T00:00:00.000Z`);

          if (
            Number.isNaN(date.getTime()) ||
            date.toISOString().slice(0, 10) !== value
          ) {
            return null;
          }

          return date;
        };

        const parsedStart = parseDate(startDate);
        const parsedEnd = parseDate(endDate);

        if (!parsedStart || !parsedEnd) {
          return res.status(400).json({
            error: 'กรุณาระบุวันที่จริงในรูปแบบ YYYY-MM-DD',
          });
        }

        if (parsedStart > parsedEnd) {
          return res.status(400).json({
            error: 'วันเริ่มต้นต้องไม่อยู่หลังวันสิ้นสุด',
          });
        }

        start = parsedStart;
        end = parsedEnd;
      }

      const transactions = await prisma.transaction.findMany({
        where: {
          userId,
          ...(start && end
            ? {
                transactionDate: {
                  gte: start,
                  lte: end,
                },
              }
            : {}),
        },
        select: {
  type: true,
  amount: true,
  categoryId: true,
  category: {
    select: {
      name: true,
    },
  },
},
      });

      // รวมเป็นหน่วยสตางค์ เพื่อลดปัญหาทศนิยมตอนบวกเงิน
      let incomeSatang = 0;
      let expenseSatang = 0;

      const categoryTotals = new Map<
  string,
  {
    categoryId: string;
    name: string;
    amountSatang: number;
  }
>();

      for (const transaction of transactions) {
        const amountSatang = Math.round(
          Number(transaction.amount) * 100
        );

        if (transaction.type === 'income') {
          incomeSatang += amountSatang;
        }

        if (transaction.type === 'expense') {
  expenseSatang += amountSatang;

  const existingCategory = categoryTotals.get(
    transaction.categoryId
  );

  if (existingCategory) {
    existingCategory.amountSatang += amountSatang;
  } else {
    categoryTotals.set(transaction.categoryId, {
      categoryId: transaction.categoryId,
      name: transaction.category.name,
      amountSatang,
    });
  }
}
      }

      const totalIncome = incomeSatang / 100;
      const totalExpense = expenseSatang / 100;
      const netCashFlow =
        (incomeSatang - expenseSatang) / 100;

      const savingRate =
        incomeSatang > 0
          ? new Prisma.Decimal(incomeSatang).minus(expenseSatang)
              .div(incomeSatang).mul(100)
              .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toNumber()
          : 0;

          const expenseCategories = Array.from(
  categoryTotals.values()
)
  .map((category) => ({
    categoryId: category.categoryId,
    name: category.name,
    amount: category.amountSatang / 100,
    percentage:
      expenseSatang > 0
        ? new Prisma.Decimal(category.amountSatang).div(expenseSatang).mul(100)
            .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toNumber()
        : 0,
  }))
  .sort(
    (a, b) =>
      b.amount - a.amount ||
      a.categoryId.localeCompare(b.categoryId)
  );

      return res.json({
  totalIncome,
  totalExpense,
  netCashFlow,
  savingRate,
  transactionCount: transactions.length,
  expenseCategories,
  period: {
          startDate: start
            ? start.toISOString().slice(0, 10)
            : null,
          endDate: end
            ? end.toISOString().slice(0, 10)
            : null,
        },
      });
    } catch (error) {
      console.error('GET OVERVIEW ERROR:', error);

      return res.status(500).json({
        error: 'ไม่สามารถโหลดข้อมูลภาพรวมได้',
      });
    }
  }
);

app.put(
  '/transactions/:id',
  authMiddleware,
  async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const id = req.params.id;

if (typeof id !== 'string' || id.trim() === '') {
  return res.status(400).json({
    error: 'รหัสธุรกรรมไม่ถูกต้อง',
  });
}

      const {
        categoryId,
        type,
        amount,
        transactionDate,
        transactionTime,
        paymentMethod,
        description,
        note,
      } = req.body;

      const existingTransaction =
        await prisma.transaction.findFirst({
          where: {
            id,
            userId,
          },
        });

      if (!existingTransaction) {
        return res.status(404).json({
          error: 'Transaction not found',
        });
      }

      if (
        !categoryId ||
        !type ||
        !amount ||
        !transactionDate
      ) {
        return res.status(400).json({
          error: 'Missing required fields',
        });
      }

      if (!['income', 'expense'].includes(type)) {
        return res.status(400).json({
          error: 'Invalid transaction type',
        });
      }

      const validated = validateTransactionValues(
  amount,
  transactionDate,
  transactionTime
);

if (!validated.ok) {
  return res.status(400).json({
    error: validated.error,
  });
}



      const category = await prisma.category.findUnique({
        where: {
          id: categoryId,
        },
      });

      if (!category) {
        return res.status(404).json({
          error: 'Category not found',
        });
      }

      if (category.type !== type) {
        return res.status(400).json({
          error: 'Category type does not match transaction type',
        });
      }

      const {transaction,previousDate} = await withGoalLock(userId,async tx=>{
        const current=await tx.transaction.findFirst({where:{id,userId}});
        if(!current) throw new GoalError(404,'TRANSACTION_NOT_FOUND','ไม่พบรายการ');
        await guardFundingTransaction(tx,userId,id,{type,amount:validated.amount,transactionDate:validated.transactionDate});
        const transaction=await tx.transaction.update({
        where: {
          id, userId,
        },
        data: {
          categoryId,
          type,
          amount: validated.amount,
          transactionDate: validated.transactionDate,
          transactionTime: validated.transactionTime,
          paymentMethod: paymentMethod || null,
          description: description || null,
          note: note || null,
        },
        include: {
          category: true,
        },
      });

        return {transaction,previousDate:current.transactionDate};
      });
      await checkBudgetNotifications(userId, [transactionPeriod(previousDate), transactionPeriod(transaction.transactionDate)]);
      return res.json(transaction);
    } catch (error) {
      if(error instanceof GoalError) return res.status(error.status).json({error:error.message,code:error.code});
      console.error(error);

      return res.status(500).json({
        error: 'Failed to update transaction',
      });
    }
  }
);

app.delete(
  '/transactions/:id',
  authMiddleware,
  async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const id = req.params.id;

if (typeof id !== 'string' || id.trim() === '') {
  return res.status(400).json({
    error: 'รหัสธุรกรรมไม่ถูกต้อง',
  });
}

      const transaction =
        await prisma.transaction.findFirst({
          where: {
            id,
            userId,
          },
        });

      if (!transaction) {
        return res.status(404).json({
          error: 'Transaction not found',
        });
      }

      await withGoalLock(userId,async tx=>{
        const current=await tx.transaction.findFirst({where:{id,userId}});
        if(!current) throw new GoalError(404,'TRANSACTION_NOT_FOUND','ไม่พบรายการ');
        await guardFundingTransaction(tx,userId,id);
        await tx.transaction.delete({where:{id,userId}});
        transaction.transactionDate=current.transactionDate;
      });

      await checkBudgetNotifications(userId, [transactionPeriod(transaction.transactionDate)]);
      return res.json({
        message: 'Transaction deleted successfully',
      });
    } catch (error) {
      if(error instanceof GoalError) return res.status(error.status).json({error:error.message,code:error.code});
      console.error(error);

      return res.status(500).json({
        error: 'Failed to delete transaction',
      });
    }
  }
);


app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/health/db', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;

    res.json({
      status: 'ok',
      database: 'connected'
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      status: 'error',
      database: 'disconnected'
    });
  }
});

app.get(
  '/transactions/:id',
  authMiddleware,
  async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const id = req.params.id;

if (typeof id !== 'string' || id.trim() === '') {
  return res.status(400).json({
    error: 'รหัสธุรกรรมไม่ถูกต้อง',
  });
}

      const transaction = await prisma.transaction.findFirst({
        where: {
          id,
          userId,
        },
        include: {
          category: true,
        },
      });

      if (!transaction) {
        return res.status(404).json({
          error: 'Transaction not found',
        });
      }

      return res.json(transaction);
    } catch (error) {
      console.error(error);

      return res.status(500).json({
        error: 'Failed to load transaction',
      });
    }
  }
);

app.post('/auth/register', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: 'Email and password are required',
      });
    }

    if (typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({
        error: 'Invalid email or password',
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    if (password.length < 6) {
      return res.status(400).json({
        error: 'Password must be at least 6 characters',
      });
    }

    const existingUser = await prisma.user.findUnique({
      where: {
        email: normalizedEmail,
      },
    });

    if (existingUser) {
      return res.status(409).json({
        error: 'Email already exists',
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        passwordHash,
      },
      select: {
        id: true,
        email: true,
        createdAt: true,
      },
    });

    return res.status(201).json({
      message: 'Register successful',
      user,
    });
  } catch (error) {
    console.error('REGISTER ERROR:', error);

    return res.status(500).json({
      error: 'Failed to register',
    });
  }
});

app.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body ?? {};

    if (
      typeof email !== 'string' ||
      typeof password !== 'string' ||
      email.trim() === '' ||
      password === ''
    ) {
      return res.status(400).json({
        error: 'Email and password are required',
      });
    }

    const secret = process.env.JWT_SECRET;

    if (!secret || !secret.trim()) {
      return res.status(500).json({
        error: 'ระบบยืนยันตัวตนยังไม่พร้อมใช้งาน',
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const user = await prisma.user.findFirst({
      where: {
        email: normalizedEmail,
        deletedAt: null,
      },
      select: {
        id: true,
        email: true,
        passwordHash: true,
      },
    });

    if (!user) {
      return res.status(401).json({
        error: 'Invalid email or password',
      });
    }

    const passwordMatch = await bcrypt.compare(
      password,
      user.passwordHash
    );

    if (!passwordMatch) {
      return res.status(401).json({
        error: 'Invalid email or password',
      });
    }

    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
      },
      secret,
      {
        expiresIn: '7d',
      }
    );

    return res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        email: user.email,
      },
    });
  } catch (error) {
    console.error('LOGIN ERROR:', error);

    return res.status(500).json({
      error: 'Failed to login',
    });
  }
});

app.get(
  '/auth/me',
  authMiddleware,
  async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;

      const user = await prisma.user.findUnique({
        where: {
          id: userId,
        },
        select: {
          id: true,
          email: true,
          createdAt: true,
        },
      });

      if (!user) {
        return res.status(404).json({
          error: 'User not found',
        });
      }

      return res.json(user);
    } catch (error) {
      console.error(error);

      return res.status(500).json({
        error: 'Failed to load user',
      });
    }
  }
);

app.get(
  '/profile',
  authMiddleware,
  async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;

      const user = await prisma.user.findFirst({
        where: {
          id: userId,
          deletedAt: null,
        },
        select: {
          id: true,
          email: true,
          profile: {
            select: {
              displayName: true,
            },
          },
        },
      });

      if (!user) {
        return res.status(404).json({
          error: 'ไม่พบบัญชีผู้ใช้',
        });
      }

      return res.json({
        userId: user.id,
        email: user.email,
        displayName: user.profile?.displayName ?? null,
      });
    } catch (error) {
      console.error('GET PROFILE ERROR:', error);

      return res.status(500).json({
        error: 'ไม่สามารถโหลดโปรไฟล์ได้',
      });
    }
  }
);

app.put(
  '/profile',
  authMiddleware,
  async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const displayName = req.body?.displayName;

      if (typeof displayName !== 'string') {
        return res.status(400).json({
          error: 'กรุณากรอกชื่อเป็นข้อความ',
        });
      }

      const trimmedName = displayName.trim();

      if (!trimmedName) {
        return res.status(400).json({
          error: 'กรุณากรอกชื่อที่แสดง',
        });
      }

      if (trimmedName.length > 80) {
        return res.status(400).json({
          error: 'ชื่อยาวได้ไม่เกิน 80 ตัวอักษร',
        });
      }

      const user = await prisma.user.findFirst({
        where: {
          id: userId,
          deletedAt: null,
        },
        select: {
          id: true,
          email: true,
        },
      });

      if (!user) {
        return res.status(404).json({
          error: 'ไม่พบบัญชีผู้ใช้',
        });
      }

      const profile = await prisma.profile.upsert({
        where: {
          userId,
        },
        create: {
          userId,
          displayName: trimmedName,
        },
        update: {
          displayName: trimmedName,
        },
        select: {
          displayName: true,
        },
      });

      return res.json({
        userId: user.id,
        email: user.email,
        displayName: profile.displayName,
      });
    } catch (error) {
      console.error('PUT PROFILE ERROR:', error);

      return res.status(500).json({
        error: 'ไม่สามารถบันทึกชื่อได้',
      });
    }
  }
);

// ===== Category Budget API =====

app.get(
  '/budget/categories',
  authMiddleware,
  async (req: AuthRequest, res) => {
    try {
      const userId = req.user?.userId;

      if (!userId) {
        return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ' });
      }

      const yearInput = req.query.year;
      const monthInput = req.query.month;

      if (
        typeof yearInput !== 'string' ||
        typeof monthInput !== 'string' ||
        !/^\d{4}$/.test(yearInput) ||
        !/^\d{1,2}$/.test(monthInput)
      ) {
        return res.status(400).json({
          error: 'กรุณาระบุปี ค.ศ. และเดือนให้ถูกต้อง',
        });
      }

      const year = Number(yearInput);
      const month = Number(monthInput);

      if (!isValidBudgetPeriod(year, month)) {
        return res.status(400).json({
          error: 'กรุณาระบุปี ค.ศ. และเดือนให้ถูกต้อง',
        });
      }

      // transactionDate เป็นวันที่แบบ UTC ตามระบบธุรกรรมเดิม
      const startDate = new Date(Date.UTC(year, month - 1, 1));
      const endDate = new Date(Date.UTC(year, month, 1));

      const [categories, budgets, expenses] = await Promise.all([
        prisma.category.findMany({
          where: { type: 'expense' },
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        }),

        prisma.categoryBudget.findMany({
          where: { userId, year, month },
        }),

        prisma.transaction.groupBy({
          by: ['categoryId'],
          where: {
            userId,
            type: 'expense',
            transactionDate: {
              gte: startDate,
              lt: endDate,
            },
          },
          _sum: { amount: true },
        }),
      ]);

      const budgetMap = new Map(
        budgets.map((budget) => [budget.categoryId, budget])
      );

      const expenseMap = new Map(
        expenses.map((expense) => [
          expense.categoryId,
          expense._sum.amount,
        ])
      );

      const items = categories.map((category) => {
        const budget = budgetMap.get(category.id);
        const expense = expenseMap.get(category.id);

        const expenseAmount = expense ? expense.toNumber() : 0;
        const budgetAmount = budget ? budget.amount.toNumber() : null;

        // คำนวณส่วนต่างด้วย Decimal ก่อนแปลงเป็นตัวเลข
        const remainingAmount = budget
          ? budget.amount.minus(expense ?? 0).toNumber()
          : null;

        const status =
          remainingAmount === null
            ? 'not_set'
            : remainingAmount < 0
              ? 'over_budget'
              : remainingAmount === 0
                ? 'at_budget'
                : 'within_budget';

        return {
          categoryId: category.id,
          categoryName: category.name,
          budgetAmount,
          expenseAmount,
          remainingAmount,
          status,
        };
      });

      return res.json({ year, month, items });
    } catch (error) {
      console.error('GET /budget/categories error:', error);

      return res.status(500).json({
        error: 'ไม่สามารถโหลดงบรายหมวดได้',
      });
    }
  }
);

app.put(
  '/budget/categories/:categoryId',
  authMiddleware,
  async (req: AuthRequest, res) => {
    try {
      const userId = req.user?.userId;
      const categoryId = req.params.categoryId;
      const { year, month, amount } = req.body ?? {};

      if (!userId) {
        return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ' });
      }

      if (typeof categoryId !== 'string' || !categoryId.trim()) {
        return res.status(400).json({ error: 'กรุณาระบุหมวดหมู่' });
      }

      if (!isValidBudgetPeriod(year, month)) {
        return res.status(400).json({
          error: 'กรุณาส่งปี ค.ศ. และเดือนเป็นตัวเลขที่ถูกต้อง',
        });
      }

      if (typeof amount !== 'number' && typeof amount !== 'string') {
        return res.status(400).json({
          error: 'กรุณาระบุจำนวนเงินงบประมาณ',
        });
      }

      const amountText = String(amount).trim();

      if (
        !/^\d{1,10}(\.\d{1,2})?$/.test(amountText) ||
        Number(amountText) <= 0 ||
        Number(amountText) > 9999999999.99
      ) {
        return res.status(400).json({
          error:
            'งบต้องมากกว่า 0 ไม่เกิน 9,999,999,999.99 บาท และมีทศนิยมไม่เกิน 2 ตำแหน่ง',
        });
      }

      const category = await prisma.category.findFirst({
        where: {
          id: categoryId,
          type: 'expense',
        },
        select: { id: true },
      });

      if (!category) {
        return res.status(404).json({
          error: 'ไม่พบหมวดหมู่รายจ่าย',
        });
      }

      const budget = await prisma.categoryBudget.upsert({
        where: {
          userId_year_month_categoryId: {
            userId,
            year,
            month,
            categoryId,
          },
        },
        create: {
          userId,
          categoryId,
          year,
          month,
          amount: amountText,
        },
        update: {
          amount: amountText,
        },
      });

      await checkBudgetNotifications(userId, [{ year, month }]);
      return res.json({
        categoryId: budget.categoryId,
        year: budget.year,
        month: budget.month,
        budgetAmount: budget.amount.toNumber(),
      });
    } catch (error) {
      console.error('PUT /budget/categories error:', error);

      return res.status(500).json({
        error: 'ไม่สามารถบันทึกงบรายหมวดได้',
      });
    }
  }
);

app.delete(
  '/budget/categories/:categoryId',
  authMiddleware,
  async (req: AuthRequest, res) => {
    try {
      const userId = req.user?.userId;
      const categoryId = req.params.categoryId;
      const yearInput = req.query.year;
      const monthInput = req.query.month;

      if (!userId) {
        return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ' });
      }

      if (typeof categoryId !== 'string' || !categoryId.trim()) {
        return res.status(400).json({ error: 'กรุณาระบุหมวดหมู่' });
      }

      if (
        typeof yearInput !== 'string' ||
        typeof monthInput !== 'string' ||
        !/^\d{4}$/.test(yearInput) ||
        !/^\d{1,2}$/.test(monthInput)
      ) {
        return res.status(400).json({
          error: 'กรุณาระบุปี ค.ศ. และเดือนให้ถูกต้อง',
        });
      }

      const year = Number(yearInput);
      const month = Number(monthInput);

      if (!isValidBudgetPeriod(year, month)) {
        return res.status(400).json({
          error: 'กรุณาระบุปี ค.ศ. และเดือนให้ถูกต้อง',
        });
      }

      await prisma.categoryBudget.deleteMany({
        where: {
          userId,
          categoryId,
          year,
          month,
        },
      });

      await checkBudgetNotifications(userId, [{ year, month }]);
      return res.json({ message: 'ยกเลิกงบรายหมวดแล้ว' });
    } catch (error) {
      console.error('DELETE /budget/categories error:', error);

      return res.status(500).json({
        error: 'ไม่สามารถยกเลิกงบรายหมวดได้',
      });
    }
  }
);

// ===== End Category Budget API =====

// Explicit retry; GET /notifications stays read-only.
app.post('/notifications/reconcile', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const ok = await reconcileBudgetNotifications(req.user!.userId);
    return res.status(ok ? 200 : 503).json({ reconciled: ok });
  } catch {
    return res.status(503).json({ error: 'ตรวจงบซ้ำไม่สำเร็จ กรุณาลองอีกครั้ง' });
  }
});
// ===== Notification API =====

// อ่านแจ้งเตือนล่าสุด 30 รายการ พร้อมจำนวนที่ยังไม่อ่านทั้งหมด
app.get(
  '/notifications',
  authMiddleware,
  async (req: AuthRequest, res) => {
    try {
      const userId = req.user?.userId;

      if (!userId) {
        return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ' });
      }

      const [items, unreadCount] = await prisma.$transaction([
        prisma.notification.findMany({
          where: { userId },
          orderBy: [
            { createdAt: 'desc' },
            { id: 'desc' },
          ],
          take: 30,
          select: {
            id: true,
            type: true,
            title: true,
            message: true,
            link: true,
            sourceId: true,
            readAt: true,
            createdAt: true,
          },
        }),
        prisma.notification.count({
          where: { userId, readAt: null },
        }),
      ]);

      return res.json({ items, unreadCount });
    } catch (error) {
      console.error('GET /notifications error:', error);

      return res.status(500).json({
        error: 'ไม่สามารถโหลดการแจ้งเตือนได้',
      });
    }
  }
);

// ทำเครื่องหมายแจ้งเตือนทั้งหมดของผู้ใช้ว่าอ่านแล้ว
app.patch(
  '/notifications/read-all',
  authMiddleware,
  async (req: AuthRequest, res) => {
    try {
      const userId = req.user?.userId;

      if (!userId) {
        return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ' });
      }

      const result = await prisma.notification.updateMany({
        where: {
          userId,
          readAt: null,
        },
        data: {
          readAt: new Date(),
        },
      });

      return res.json({ updatedCount: result.count });
    } catch (error) {
      console.error('PATCH /notifications/read-all error:', error);

      return res.status(500).json({
        error: 'ไม่สามารถทำเครื่องหมายว่าอ่านแล้วได้',
      });
    }
  }
);

// ทำเครื่องหมายแจ้งเตือนหนึ่งรายการว่าอ่านแล้ว
app.patch(
  '/notifications/:id/read',
  authMiddleware,
  async (req: AuthRequest, res) => {
    try {
      const userId = req.user?.userId;
      const id = req.params.id;

      if (!userId) {
        return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ' });
      }

      if (typeof id !== 'string' || !id.trim()) {
        return res.status(400).json({
          error: 'รหัสการแจ้งเตือนไม่ถูกต้อง',
        });
      }

      const notification = await prisma.notification.findFirst({
        where: { id, userId },
        select: { id: true },
      });

      if (!notification) {
        return res.status(404).json({
          error: 'ไม่พบการแจ้งเตือน',
        });
      }

      // เก็บเวลาอ่านครั้งแรกไว้ แม้กดรายการเดิมอีกครั้ง
      await prisma.notification.updateMany({
        where: {
          id,
          userId,
          readAt: null,
        },
        data: {
          readAt: new Date(),
        },
      });

      return res.json({ message: 'ทำเครื่องหมายว่าอ่านแล้ว' });
    } catch (error) {
      console.error('PATCH /notifications/:id/read error:', error);

      return res.status(500).json({
        error: 'ไม่สามารถทำเครื่องหมายว่าอ่านแล้วได้',
      });
    }
  }
);

// อ่านการตั้งค่าแจ้งเตือนงบ
app.get(
  '/notification-settings/budget',
  authMiddleware,
  async (req: AuthRequest, res) => {
    try {
      const userId = req.user?.userId;

      if (!userId) {
        return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ' });
      }

      const setting = await prisma.budgetNotificationSetting.findUnique({
        where: { userId },
        select: {
          enabled: true,
          warningPercent: true,
          notifyExceeded: true,
          totalBudget: true,
          categoryBudgets: true,
        },
      });

      return res.json(
        setting ?? {
          enabled: false,
          warningPercent: 80,
          notifyExceeded: true,
          totalBudget: true,
          categoryBudgets: true,
        }
      );
    } catch (error) {
      console.error('GET notification settings error:', error);

      return res.status(500).json({
        error: 'ไม่สามารถโหลดการตั้งค่าแจ้งเตือนได้',
      });
    }
  }
);

// บันทึกการตั้งค่าแจ้งเตือนงบ
app.put(
  '/notification-settings/budget',
  authMiddleware,
  async (req: AuthRequest, res) => {
    try {
      const userId = req.user?.userId;

      if (!userId) {
        return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ' });
      }

      const {
        enabled,
        warningPercent,
        notifyExceeded,
        totalBudget,
        categoryBudgets,
      } = req.body ?? {};

      if (
        typeof enabled !== 'boolean' ||
        typeof notifyExceeded !== 'boolean' ||
        typeof totalBudget !== 'boolean' ||
        typeof categoryBudgets !== 'boolean'
      ) {
        return res.status(400).json({
          error: 'ค่าการเปิด–ปิดแจ้งเตือนต้องเป็น true หรือ false',
        });
      }

      if (
        typeof warningPercent !== 'number' ||
        !Number.isInteger(warningPercent) ||
        warningPercent < 1 ||
        warningPercent > 100
      ) {
        return res.status(400).json({
          error: 'เปอร์เซ็นต์แจ้งเตือนต้องเป็นจำนวนเต็มตั้งแต่ 1 ถึง 100',
        });
      }

      if (enabled && !totalBudget && !categoryBudgets) {
        return res.status(400).json({
          error: 'เลือกแจ้งเตือนงบรวมหรืองบรายหมวดอย่างน้อยหนึ่งรายการ',
        });
      }

      const values = {
        enabled,
        warningPercent,
        notifyExceeded,
        totalBudget,
        categoryBudgets,
      };

      const setting = await prisma.budgetNotificationSetting.upsert({
        where: { userId },
        create: {
          userId,
          ...values,
        },
        update: values,
        select: {
          enabled: true,
          warningPercent: true,
          notifyExceeded: true,
          totalBudget: true,
          categoryBudgets: true,
        },
      });

      await checkBudgetNotifications(userId, [currentBudgetPeriod()]);
      return res.json(setting);
    } catch (error) {
      console.error('PUT notification settings error:', error);

      return res.status(500).json({
        error: 'ไม่สามารถบันทึกการตั้งค่าแจ้งเตือนได้',
      });
    }
  }
);

// ===== End Notification API =====

function isValidBudgetPeriod(year: unknown, month: unknown) {
  return (
    typeof year === 'number' &&
    Number.isInteger(year) &&
    year >= 1900 &&
    year <= 9999 &&
    typeof month === 'number' &&
    Number.isInteger(month) &&
    month >= 1 &&
    month <= 12
  );
}

function getBudgetTimeline(year: number, month: number) {
  // ใช้วันที่ประเทศไทย เพื่อให้วันเปลี่ยนตรงกับผู้ใช้
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(new Date());

  const getPart = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value);

  const currentYear = getPart("year");
  const currentMonth = getPart("month");
  const currentDay = getPart("day");

  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  const selectedPeriod = year * 12 + month;
  const currentPeriod = currentYear * 12 + currentMonth;

  const monthState =
    selectedPeriod < currentPeriod
      ? "past"
      : selectedPeriod > currentPeriod
        ? "future"
        : "current";

  const elapsedDays =
    monthState === "past"
      ? daysInMonth
      : monthState === "future"
        ? 0
        : currentDay;

  return {
    monthState,
    daysInMonth,
    elapsedDays,
    // ขอบเขตแบบไม่รวมวันนี้ + 1 เพื่อรวมรายการของวันนี้ทั้งหมด
    expenseCutoff: new Date(Date.UTC(year, month - 1, elapsedDays + 1)),
  };
}

app.get("/budget", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const yearQuery = req.query.year;
    const monthQuery = req.query.month;

    if (
      typeof yearQuery !== "string" ||
      typeof monthQuery !== "string" ||
      !/^\d{4}$/.test(yearQuery) ||
      !/^\d{1,2}$/.test(monthQuery)
    ) {
      return res.status(400).json({
        message: "กรุณาระบุปีและเดือนให้ถูกต้อง",
      });
    }

    const year = Number(yearQuery);
    const month = Number(monthQuery);

    if (!isValidBudgetPeriod(year, month)) {
      return res.status(400).json({
        message: "ปีหรือเดือนไม่ถูกต้อง",
      });
    }

    const userId = req.user!.userId;

    const user = await prisma.user.findFirst({
      where: {
        id: userId,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!user) {
      return res.status(404).json({
        message: "ไม่พบผู้ใช้",
      });
    }

    const startDate = new Date(Date.UTC(year, month - 1, 1));
    const nextMonth = new Date(Date.UTC(year, month, 1));
    const timeline = getBudgetTimeline(year, month);

    const [budget, monthlyExpenses, expensesToDate] = await Promise.all([
      prisma.budget.findUnique({
        where: {
          userId_year_month: { userId, year, month },
        },
      }),

      // รายจ่ายทั้งเดือน สำหรับยอดสรุปเดิม
      prisma.transaction.aggregate({
        where: {
          userId,
          type: "expense",
          transactionDate: {
            gte: startDate,
            lt: nextMonth,
          },
        },
        _sum: { amount: true },
      }),

      // รายจ่ายถึงวันนี้ สำหรับเทียบกับแผนตามเวลา
      prisma.transaction.aggregate({
        where: {
          userId,
          type: "expense",
          transactionDate: {
            gte: startDate,
            lt: timeline.expenseCutoff,
          },
        },
        _sum: { amount: true },
      }),
    ]);

    const budgetSatang = budget
      ? Math.round(Number(budget.amount) * 100)
      : null;

    const monthlyExpenseSatang = Math.round(
      Number(monthlyExpenses._sum.amount ?? 0) * 100
    );

    const expenseToDateSatang = Math.round(
      Number(expensesToDate._sum.amount ?? 0) * 100
    );

    const remainingSatang =
      budgetSatang === null
        ? null
        : budgetSatang - monthlyExpenseSatang;

    const usedPercentage =
      budgetSatang === null || budgetSatang <= 0
        ? null
        : new Prisma.Decimal(monthlyExpenseSatang).div(budgetSatang).mul(100)
            .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toNumber();

    const status =
      budgetSatang === null
        ? "not_set"
        : monthlyExpenseSatang > budgetSatang
          ? "over_budget"
          : monthlyExpenseSatang === budgetSatang
            ? "at_limit"
            : "within_budget";

    const plannedSatang =
      budgetSatang === null
        ? null
        : Math.round(
            (budgetSatang * timeline.elapsedDays) / timeline.daysInMonth
          );

    // บวก = ใช้เกินแผน, ลบ = ใช้น้อยกว่าแผน
    // เดือนอนาคตยังไม่ประเมิน
    const deviationSatang =
      plannedSatang === null || timeline.monthState === "future"
        ? null
        : expenseToDateSatang - plannedSatang;

    const paceStatus =
      budgetSatang === null
        ? "not_set"
        : deviationSatang === null
          ? "not_started"
          : deviationSatang > 0
            ? "above_plan"
            : deviationSatang < 0
              ? "below_plan"
              : "on_plan";

    return res.json({
      year,
      month,

      // ข้อมูลเดิมที่หน้า Budget ใช้อยู่
      budgetAmount: budgetSatang === null ? null : budgetSatang / 100,
      totalExpense: monthlyExpenseSatang / 100,
      remaining: remainingSatang === null ? null : remainingSatang / 100,
      usedPercentage,
      status,

      // ข้อมูลใหม่
      timeline: {
        monthState: timeline.monthState,
        daysInMonth: timeline.daysInMonth,
        elapsedDays: timeline.elapsedDays,
        plannedExpenseToDate:
          plannedSatang === null ? null : plannedSatang / 100,
        actualExpenseToDate: expenseToDateSatang / 100,
        deviation:
          deviationSatang === null ? null : deviationSatang / 100,
        paceStatus,
      },
    });
  } catch (error) {
    console.error("GET /budget error:", error);

    return res.status(500).json({
      message: "ไม่สามารถโหลดข้อมูลงบประมาณได้",
    });
  }
});

app.put(
  '/budget',
  authMiddleware,
  async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const { year, month, amount } = req.body ?? {};

      if (!isValidBudgetPeriod(year, month)) {
        return res.status(400).json({
          error: 'กรุณาส่งปี ค.ศ. และเดือนเป็นตัวเลขที่ถูกต้อง',
        });
      }

      if (
        typeof amount !== 'number' &&
        typeof amount !== 'string'
      ) {
        return res.status(400).json({
          error: 'กรุณาระบุจำนวนเงินงบประมาณ',
        });
      }

      const amountText = String(amount).trim();

      // รองรับจำนวนเต็มสูงสุด 10 หลัก และทศนิยมไม่เกิน 2 ตำแหน่ง
      if (!/^\d{1,10}(\.\d{1,2})?$/.test(amountText)) {
        return res.status(400).json({
          error: 'จำนวนเงินต้องเป็นตัวเลข ทศนิยมไม่เกิน 2 ตำแหน่ง',
        });
      }

      const amountNumber = Number(amountText);

      if (
        !Number.isFinite(amountNumber) ||
        amountNumber <= 0 ||
        amountNumber > 9999999999.99
      ) {
        return res.status(400).json({
          error: 'งบต้องมากกว่า 0 และไม่เกิน 9,999,999,999.99 บาท',
        });
      }

      const user = await prisma.user.findFirst({
        where: {
          id: userId,
          deletedAt: null,
        },
        select: {
          id: true,
        },
      });

      if (!user) {
        return res.status(404).json({
          error: 'ไม่พบบัญชีผู้ใช้',
        });
      }

      const budget = await prisma.budget.upsert({
        where: {
          userId_year_month: {
            userId,
            year,
            month,
          },
        },
        create: {
          userId,
          year,
          month,
          amount: amountText,
        },
        update: {
          amount: amountText,
        },
      });

      await checkBudgetNotifications(userId, [{ year, month }]);
      return res.json({
        message: 'บันทึกงบประมาณเรียบร้อยแล้ว',
        year: budget.year,
        month: budget.month,
        budgetAmount: Number(budget.amount),
      });
    } catch (error) {
      console.error('PUT BUDGET ERROR:', error);

      return res.status(500).json({
        error: 'ไม่สามารถบันทึกงบประมาณได้',
      });
    }
  }
);

app.get(
  "/overview/weekly",
  authMiddleware,
  async (req: AuthRequest, res) => {
    try {
      const DAY_MS = 24 * 60 * 60 * 1000;

      function parseDate(value: unknown): Date | null {
        if (
          typeof value !== "string" ||
          !/^\d{4}-\d{2}-\d{2}$/.test(value)
        ) {
          return null;
        }

        const year = Number(value.slice(0, 4));

        if (year < 1900 || year > 9999) {
          return null;
        }

        const date = new Date(`${value}T00:00:00.000Z`);

        if (
          Number.isNaN(date.getTime()) ||
          date.toISOString().slice(0, 10) !== value
        ) {
          return null;
        }

        return date;
      }

      function formatDate(date: Date) {
        return date.toISOString().slice(0, 10);
      }

      let startDate: Date;
      let endDate: Date;

      // เก็บไว้เพื่อรองรับ Frontend แบบเลือกเดือนเดิม
      let year: number | null = null;
      let month: number | null = null;

      const hasDateRange =
        req.query.startDate !== undefined ||
        req.query.endDate !== undefined;

      if (hasDateRange) {
        const parsedStart = parseDate(req.query.startDate);
        const parsedEnd = parseDate(req.query.endDate);

        if (!parsedStart || !parsedEnd) {
          return res.status(400).json({
            message:
              "กรุณาระบุ startDate และ endDate เป็นวันที่จริงในรูปแบบ YYYY-MM-DD",
          });
        }

        startDate = parsedStart;
        endDate = parsedEnd;
      } else {
        const yearQuery = req.query.year;
        const monthQuery = req.query.month;

        if (
          typeof yearQuery !== "string" ||
          typeof monthQuery !== "string" ||
          !/^\d{4}$/.test(yearQuery) ||
          !/^\d{1,2}$/.test(monthQuery)
        ) {
          return res.status(400).json({
            message: "กรุณาระบุช่วงวันที่ หรือปีและเดือนให้ถูกต้อง",
          });
        }

        year = Number(yearQuery);
        month = Number(monthQuery);

        if (!isValidBudgetPeriod(year, month)) {
          return res.status(400).json({
            message: "ปีหรือเดือนไม่ถูกต้อง",
          });
        }

        startDate = new Date(Date.UTC(year, month - 1, 1));
        endDate = new Date(Date.UTC(year, month, 0));
      }

      if (startDate > endDate) {
        return res.status(400).json({
          message: "วันเริ่มต้นต้องไม่อยู่หลังวันสิ้นสุด",
        });
      }

      const dayCount =
        Math.round(
          (endDate.getTime() - startDate.getTime()) / DAY_MS
        ) + 1;

      // ขอบเขตสำหรับ API รายสัปดาห์รอบนี้
      if (dayCount > 366) {
        return res.status(400).json({
          message: "กรุณาเลือกช่วงเวลาไม่เกิน 366 วัน",
        });
      }

      const userId = req.user!.userId;

      const user = await prisma.user.findFirst({
        where: {
          id: userId,
          deletedAt: null,
        },
        select: { id: true },
      });

      if (!user) {
        return res.status(404).json({
          message: "ไม่พบผู้ใช้",
        });
      }

      const endExclusive = new Date(endDate.getTime() + DAY_MS);

      const transactions = await prisma.transaction.findMany({
        where: {
          userId,
          type: "expense",
          transactionDate: {
            gte: startDate,
            lt: endExclusive,
          },
        },
        select: {
          amount: true,
          transactionDate: true,
          categoryId: true,
          category: {
            select: { name: true },
          },
        },
      });

      type CategoryBucket = {
        categoryId: string;
        name: string;
        totalSatang: number;
        transactionCount: number;
      };

      type WeekBucket = {
        weekNumber: number;
        start: Date;
        end: Date;
        totalSatang: number;
        transactionCount: number;
        categories: Map<string, CategoryBucket>;
      };

      const weeks: WeekBucket[] = [];
      let cursor = new Date(startDate.getTime());

      // แบ่งจันทร์–อาทิตย์ โดยตัดขอบตามช่วงที่เลือก
      while (cursor <= endDate) {
        const daysUntilSunday = (7 - cursor.getUTCDay()) % 7;

        const weekEnd = new Date(
          Math.min(
            cursor.getTime() + daysUntilSunday * DAY_MS,
            endDate.getTime()
          )
        );

        weeks.push({
          weekNumber: weeks.length + 1,
          start: new Date(cursor.getTime()),
          end: weekEnd,
          totalSatang: 0,
          transactionCount: 0,
          categories: new Map(),
        });

        cursor = new Date(weekEnd.getTime() + DAY_MS);
      }

      for (const transaction of transactions) {
        const timestamp = transaction.transactionDate.getTime();

        const week = weeks.find(
          (item) =>
            timestamp >= item.start.getTime() &&
            timestamp < item.end.getTime() + DAY_MS
        );

        if (!week) continue;

        const satang = Math.round(
          Number(transaction.amount) * 100
        );

        week.totalSatang += satang;
        week.transactionCount += 1;

        const existing = week.categories.get(
          transaction.categoryId
        );

        if (existing) {
          existing.totalSatang += satang;
          existing.transactionCount += 1;
        } else {
          week.categories.set(transaction.categoryId, {
            categoryId: transaction.categoryId,
            name: transaction.category.name,
            totalSatang: satang,
            transactionCount: 1,
          });
        }
      }

      const totalSatang = weeks.reduce(
        (sum, week) => sum + week.totalSatang,
        0
      );

      return res.json({
        year,
        month,
        period: {
          startDate: formatDate(startDate),
          endDate: formatDate(endDate),
          dayCount,
        },
        weekStartsOn: "monday",
        totalExpense: totalSatang / 100,
        transactionCount: transactions.length,

        weeks: weeks.map((week) => ({
          weekNumber: week.weekNumber,
          startDate: formatDate(week.start),
          endDate: formatDate(week.end),
          dayCount:
            Math.round(
              (week.end.getTime() - week.start.getTime()) / DAY_MS
            ) + 1,
          totalExpense: week.totalSatang / 100,
          transactionCount: week.transactionCount,

          categories: Array.from(week.categories.values())
            .sort(
              (a, b) =>
                b.totalSatang - a.totalSatang ||
                a.categoryId.localeCompare(b.categoryId)
            )
            .map((category) => ({
              categoryId: category.categoryId,
              name: category.name,
              amount: category.totalSatang / 100,
              transactionCount: category.transactionCount,
            })),
        })),
      });
    } catch (error) {
      console.error("GET /overview/weekly error:", error);

      return res.status(500).json({
        message: "ไม่สามารถโหลดสรุปรายจ่ายรายสัปดาห์ได้",
      });
    }
  }
);

export { app };

if (require.main === module) {
  const PORT = Number(process.env.PORT) || 4000;
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
  server.on('error', (error) => {
    console.error('Server error:', error);
  });
}