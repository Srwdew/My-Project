// Real Express HTTP + PostgreSQL. The Prisma entry point is redirected only in this
// test process to one rollback-only transaction; SQL/query/calculation code is real.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { Prisma } from '@prisma/client';
import { app } from '../src/index';
import { prisma } from '../src/lib/prisma';

const cents = (value: unknown): bigint => {
  const [whole, fraction = ''] = String(value).split('.');
  return BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, '0'));
};
const sum = (rows: any[], field = 'amount') => rows.reduce((n, row) => n + cents(row[field]), 0n);
const asMoney = (value: bigint) => Number(value) / 100;
const day = (value: Date) => value.toISOString().slice(0, 10);
const next = (value: string) => day(new Date(new Date(`${value}T00:00:00Z`).getTime() + 86400000));
const rollback = new Error('EXPECTED_RECONCILIATION_ROLLBACK');

test('PostgreSQL HTTP reconciliation against independent integer-satang totals', async t => {
  t.after(async () => prisma.$disconnect());
  const originalTransaction = prisma.$transaction.bind(prisma);
  const originalSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = randomUUID();
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const restores: (() => void)[] = [];
  const createdUserIds: string[] = [];
  function redirect(object: any, key: string, value: any) {
    const old = object[key]; object[key] = value; restores.push(() => { object[key] = old; });
  }
  try {
    await originalTransaction(async tx => {
      for (const model of ['user', 'category', 'transaction', 'budget', 'categoryBudget', 'budgetNotificationSetting', 'notification']) {
        for (const operation of ['findFirst', 'findMany', 'findUnique', 'create', 'update', 'delete', 'deleteMany', 'upsert', 'aggregate', 'groupBy', 'count', 'updateMany', 'createMany']) {
          const delegate = (tx as any)[model];
          redirect((prisma as any)[model], operation, delegate[operation].bind(delegate));
        }
      }
      redirect(prisma, '$transaction', (arg: any) => Array.isArray(arg) ? Promise.all(arg) : arg(tx));
      redirect(prisma, '$executeRaw', tx.$executeRaw.bind(tx));
      const existingUsers = await tx.user.findMany({ where: { deletedAt: null }, select: { id: true, email: true, authVersion: true } });
      const expenseA = await tx.category.create({ data: { name: `reconciliation-a-${randomUUID()}`, type: 'expense' } });
      const expenseB = await tx.category.create({ data: { name: `reconciliation-b-${randomUUID()}`, type: 'expense' } });
      const incomeCategory = await tx.category.create({ data: { name: `reconciliation-income-${randomUUID()}`, type: 'income' } });
      async function account() {
        const user = await tx.user.create({ data: { email: `reconciliation-${randomUUID()}@example.invalid`, passwordHash: 'rollback-only-no-login' } });
        createdUserIds.push(user.id);
        const token = jwt.sign({ userId: user.id, email: user.email }, process.env.JWT_SECRET!);
        return { id: user.id, token };
      }
      async function request(user: { token: string }, path: string, method = 'GET', body?: unknown, status = 200) {
        const response = await fetch(`http://127.0.0.1:${address.port}${path}`, {
          method, headers: { Authorization: `Bearer ${user.token}`, 'Content-Type': 'application/json' },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        assert.equal(response.status, status, `${method} ${path}`);
        return response.json() as Promise<any>;
      }
      async function assess(label: string, user: { id: string; token: string }, start: string, end: string, budgetMonth?: string) {
        // Independent oracle: fetch raw real rows and sum decimal strings as BigInt cents.
        const raw = await tx.transaction.findMany({ where: { userId: user.id } });
        const selected = raw.filter(row => day(row.transactionDate) >= start && day(row.transactionDate) <= end);
        const incomes = selected.filter(row => row.type === 'income');
        const expenses = selected.filter(row => row.type === 'expense');
        const expectedIncome = sum(incomes), expectedExpense = sum(expenses);
        const history = await request(user, '/transactions');
        assert.equal(history.length, raw.length, 'History API must return full data, not latest three dates');
        assert.ok(history.every((row: any) => row.userId === user.id));
        const historyRange = history.filter((row: any) => row.transactionDate.slice(0, 10) >= start && row.transactionDate.slice(0, 10) <= end);
        assert.equal(sum(historyRange.filter((row: any) => row.type === 'expense')), expectedExpense);
        const allTime = await request(user, '/overview');
        assert.equal(cents(allTime.totalIncome), sum(raw.filter(row => row.type === 'income')));
        assert.equal(cents(allTime.totalExpense), sum(raw.filter(row => row.type === 'expense')));
        const query = `startDate=${start}&endDate=${end}`;
        const overview = await request(user, `/overview?${query}`);
        const weekly = await request(user, `/overview/weekly?${query}`);
        assert.equal(overview.totalIncome, asMoney(expectedIncome), label + ' income');
        assert.equal(overview.totalExpense, asMoney(expectedExpense), label + ' expense');
        assert.equal(overview.netCashFlow, asMoney(expectedIncome - expectedExpense), label + ' net');
        assert.ok(Number.isFinite(overview.savingRate));
        const expectedRate = expectedIncome > 0n ? new Prisma.Decimal((expectedIncome - expectedExpense).toString()).div(expectedIncome.toString()).mul(100).toDecimalPlaces(2).toNumber() : 0;
        assert.equal(overview.savingRate, expectedRate, label + ' saving rate');
        assert.equal(sum(overview.expenseCategories), expectedExpense, label + ' overview categories');
        for (const category of overview.expenseCategories) {
          assert.equal(cents(category.amount), sum(expenses.filter(row => row.categoryId === category.categoryId)));
          const expectedPercent = expectedExpense > 0n ? new Prisma.Decimal(cents(category.amount).toString()).div(expectedExpense.toString()).mul(100).toDecimalPlaces(2).toNumber() : 0;
          assert.equal(category.percentage, expectedPercent, label + ' category percentage');
        }
        assert.equal(weekly.totalExpense, asMoney(expectedExpense), label + ' weekly');
        assert.equal(sum(weekly.weeks, 'totalExpense'), expectedExpense);
        let cursor = start;
        for (const [index, week] of weekly.weeks.entries()) {
          assert.equal(week.startDate, cursor);
          if (index > 0) assert.equal(new Date(`${week.startDate}T00:00:00Z`).getUTCDay(), 1);
          if (week.endDate < end) assert.equal(new Date(`${week.endDate}T00:00:00Z`).getUTCDay(), 0);
          assert.ok(week.endDate <= end);
          const rows = expenses.filter(row => day(row.transactionDate) >= week.startDate && day(row.transactionDate) <= week.endDate);
          assert.equal(cents(week.totalExpense), sum(rows));
          assert.equal(sum(week.categories), sum(rows));
          for (const category of week.categories) assert.equal(cents(category.amount), sum(rows.filter(row => row.categoryId === category.categoryId)));
          assert.equal(week.transactionCount, rows.length);
          cursor = next(week.endDate);
        }
        assert.equal(cursor, next(end));
        let budgetTotal: number | string = '-';
        if (budgetMonth) {
          const [year, month] = budgetMonth.split('-').map(Number);
          const params = `year=${year}&month=${month}`;
          const budget = await request(user, `/budget?${params}`);
          const categories = await request(user, `/budget/categories?${params}`);
          const monthly = raw.filter(row => row.type === 'expense' && day(row.transactionDate).startsWith(budgetMonth));
          const total = sum(monthly);
          assert.equal(cents(budget.totalExpense), total);
          assert.equal(sum(categories.items, 'expenseAmount'), total);
          for (const item of categories.items) assert.equal(cents(item.expenseAmount), sum(monthly.filter(row => row.categoryId === item.categoryId)));
          const unbudgeted = categories.items.find((row: any) => row.categoryId === expenseB.id);
          assert.equal(unbudgeted.budgetAmount, null);
          const storedBudget = await tx.budget.findUnique({ where: { userId_year_month: { userId: user.id, year: year!, month: month! } } });
          const expectedAmount = storedBudget ? storedBudget.amount.toNumber() : null;
          assert.equal(budget.budgetAmount, expectedAmount, 'Category budgets must not be added to total budget');
          const expectedUsed = storedBudget ? new Prisma.Decimal(total.toString()).div(cents(storedBudget.amount).toString()).mul(100).toDecimalPlaces(2).toNumber() : null;
          assert.equal(budget.usedPercentage, expectedUsed, label + ' budget percentage');
          assert.equal(budget.remaining, storedBudget ? asMoney(cents(storedBudget.amount) - total) : null);
          const bangkokToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
          const toDate = monthly.filter(row => day(row.transactionDate) <= bangkokToday);
          assert.equal(cents(budget.timeline.actualExpenseToDate), sum(toDate));
          const expectedPlan = storedBudget ? new Prisma.Decimal(storedBudget.amount.toString()).mul(100).mul(budget.timeline.elapsedDays).div(budget.timeline.daysInMonth).toDecimalPlaces(0) : null;
          assert.equal(budget.timeline.plannedExpenseToDate, expectedPlan ? expectedPlan.div(100).toNumber() : null);
          if (budget.timeline.monthState === 'future' || !expectedPlan) assert.equal(budget.timeline.deviation, null);
          else assert.equal(budget.timeline.deviation, asMoney(sum(toDate) - BigInt(expectedPlan.toFixed(0))));
          budgetTotal = budget.totalExpense;
        }
        console.log(`RECONCILE ${label}: expected income=${asMoney(expectedIncome)} expense=${asMoney(expectedExpense)}; actual overview=${overview.totalIncome}/${overview.totalExpense}, weekly=${weekly.totalExpense}, budget=${budgetTotal}; PASS`);
      }
      type Row = [string, 'income' | 'expense', string, boolean?];
      const cases: { name: string; start: string; end: string; month?: string; rows: Row[] }[] = [
        { name: 'empty', start: '2024-02-01', end: '2024-02-29', month: '2024-02', rows: [] },
        { name: 'income only', start: '2024-02-01', end: '2024-02-29', month: '2024-02', rows: [['2024-02-01','income','100.00']] },
        { name: 'expense only decimal', start: '2024-02-01', end: '2024-02-29', month: '2024-02', rows: [['2024-02-01','expense','0.07'],['2024-02-29','expense','0.01',true]] },
        { name: 'leap month and excluded boundaries', start: '2024-02-01', end: '2024-02-29', month: '2024-02', rows: [['2024-01-31','expense','999'],['2024-02-01','income','1000'],['2024-02-01','expense','10'],['2024-02-04','expense','20',true],['2024-02-05','expense','30'],['2024-02-29','expense','40',true],['2024-03-01','expense','888']] },
        { name: 'week straddles month', start: '2024-01-30', end: '2024-02-06', rows: [['2024-01-30','expense','1'],['2024-01-31','expense','2'],['2024-02-01','expense','3'],['2024-02-04','expense','4',true],['2024-02-05','expense','5'],['2024-02-06','expense','6']] },
        { name: 'year boundary', start: '2023-12-31', end: '2024-01-02', rows: [['2023-12-30','expense','777'],['2023-12-31','expense','7'],['2024-01-01','income','100'],['2024-01-01','expense','8'],['2024-01-02','expense','9',true]] },
        { name: 'percentage half-cent boundary', start: '2024-02-01', end: '2024-02-29', month: '2024-02', rows: [['2024-02-01','income','20000'],['2024-02-01','expense','19465']] },
        { name: 'category and budget percentage rounding', start: '2024-02-01', end: '2024-02-29', month: '2024-02', rows: [['2024-02-01','expense','535'],['2024-02-01','expense','19465',true]] },
      ];
      const foreign = await account();
      await tx.transaction.create({ data: { userId: foreign.id, categoryId: expenseA.id, type: 'expense', amount: '999999', transactionDate: new Date('2024-02-01T00:00:00Z') } });
      for (const scenario of cases) await t.test(scenario.name, async () => {
        const user = await account();
        await tx.budget.create({ data: { userId: user.id, year: 2024, month: 2, amount: '20000' } });
        await tx.categoryBudget.create({ data: { userId: user.id, categoryId: expenseA.id, year: 2024, month: 2, amount: '50' } });
        for (const [date,type,amount,second] of scenario.rows) await tx.transaction.create({ data: { userId:user.id, type, amount, categoryId:type === 'income' ? incomeCategory.id : second ? expenseB.id : expenseA.id, transactionDate:new Date(`${date}T00:00:00Z`) } });
        await assess(scenario.name, user, scenario.start, scenario.end, scenario.month);
      });
      await t.test('CRUD date/category/type changes and isolation', async () => {
        const user = await account();
        for (const month of [2,3]) await tx.budget.create({ data: { userId:user.id, year:2024, month, amount:'20000' } });
        const body = { type:'expense', categoryId:expenseA.id, amount:'0.07', transactionDate:'2024-02-29' };
        const created = await request(user,'/transactions','POST',body,201);
        await assess('after add',user,'2024-02-01','2024-02-29','2024-02');
        await request(user,`/transactions/${created.id}`,'PUT',{...body,amount:'0.01',categoryId:expenseB.id,transactionDate:'2024-03-01'});
        await assess('move old month',user,'2024-02-01','2024-02-29','2024-02');
        await assess('move new month/category',user,'2024-03-01','2024-03-31','2024-03');
        await request(user,`/transactions/${created.id}`,'PUT',{...body,type:'income',categoryId:incomeCategory.id,amount:'10',transactionDate:'2024-03-01'});
        await assess('change to income',user,'2024-03-01','2024-03-31','2024-03');
        await request(foreign,`/transactions/${created.id}`,'DELETE',undefined,404);
        await request(user,`/transactions/${created.id}`,'DELETE');
        await assess('after delete',user,'2024-03-01','2024-03-31','2024-03');
      });
      await t.test('Bangkok current month to date and future budget', async () => {
        const today = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
        const monthKey=today.slice(0,7), [year,month]=monthKey.split('-').map(Number);
        const user=await account();
        await tx.budget.create({data:{userId:user.id,year:year!,month:month!,amount:'20000'}});
        await request(user,'/transactions','POST',{type:'expense',categoryId:expenseA.id,amount:'0.08',transactionDate:today},201);
        await assess('current month',user,`${monthKey}-01`,today,monthKey);
        const future=new Date(Date.UTC(year!,month!,1)), futureKey=day(future).slice(0,7);
        await tx.budget.create({data:{userId:user.id,year:future.getUTCFullYear(),month:future.getUTCMonth()+1,amount:'20000'}});
        await assess('future budget without future transactions',user,`${futureKey}-01`,day(new Date(Date.UTC(future.getUTCFullYear(),future.getUTCMonth()+1,0))),futureKey);
      });
      await t.test('Time-based budget separates whole month from cutoff at Bangkok today', async clockTest => {
        const user=await account();
        await tx.budget.create({ data:{userId:user.id,year:2024,month:2,amount:'2900'} });
        for(const [date,amount] of [['2024-02-01','10'],['2024-02-15','20'],['2024-02-16','30'],['2024-02-29','40']]) {
          await tx.transaction.create({data:{userId:user.id,type:'expense',categoryId:expenseA.id,amount:amount!,transactionDate:new Date(date!+'T00:00:00Z')}});
        }
        // Fixtures are historical at real execution time. Only the reporting clock is frozen;
        // no future transaction is submitted through CRUD.
        clockTest.mock.timers.enable({apis:['Date'],now:new Date('2024-02-15T16:59:59Z')});
        await assess('simulated Bangkok Feb 15 cutoff',user,'2024-02-01','2024-02-29','2024-02');
        const before=await request(user,'/budget?year=2024&month=2');
        assert.equal(before.totalExpense,100);
        assert.equal(before.timeline.actualExpenseToDate,30);
        assert.equal(before.timeline.plannedExpenseToDate,1500);
        clockTest.mock.timers.setTime(new Date('2024-02-15T17:00:00Z').getTime());
        const after=await request(user,'/budget?year=2024&month=2');
        assert.equal(after.totalExpense,100);
        assert.equal(after.timeline.actualExpenseToDate,60);
        assert.equal(after.timeline.plannedExpenseToDate,1600);
        console.log('RECONCILE Bangkok midnight: whole month=100/100; to-date expected/actual=30/30 -> 60/60; planned=1500 -> 1600; PASS');
      });
      await t.test('Existing accounts and monthly ledger (read-only)', async () => {
        let checkedMonths=0;
        for (const [index,user] of existingUsers.entries()) {
          const rows=await tx.transaction.findMany({where:{userId:user.id},select:{transactionDate:true}});
          const months=[...new Set(rows.map(row=>day(row.transactionDate).slice(0,7)))].sort();
          const authenticated={id:user.id,token:jwt.sign({userId:user.id,email:user.email,authVersion:user.authVersion},process.env.JWT_SECRET!)};
          for(const monthKey of months) {
            const [year,month]=monthKey.split('-').map(Number);
            const end=day(new Date(Date.UTC(year!,month!,0)));
            await assess('existing account '+(index+1)+' '+monthKey,authenticated,monthKey+'-01',end,monthKey);
            checkedMonths++;
          }
        }
        console.log('Existing ledger checked: '+existingUsers.length+' active accounts, '+checkedMonths+' account-months; no original rows modified.');
      });
      throw rollback;
    }, { timeout: 120000, maxWait: 5000 });
  } catch(error) {
    if(error !== rollback) throw new Error('Reconciliation database harness failed; details suppressed to protect credentials');
  } finally {
    restores.reverse().forEach(restore=>restore());
    if(originalSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET=originalSecret;
    await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
  assert.equal(await prisma.user.count({where:{id:{in:createdUserIds}}}),0,'All fixtures must be rolled back');
  await prisma.$disconnect();
});
