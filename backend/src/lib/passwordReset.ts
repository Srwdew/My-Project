import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import bcrypt from 'bcrypt';
import { Prisma, type PrismaClient } from '@prisma/client';
import type { ResetMailer } from './passwordResetMail';

// Proposed values; opt-in isolated local-test only, not a production policy.
export const RESET_POLICY = {
  version:'proposal-v1', ttlMs:15*60_000,
  requestIp:{limit:20,windowMs:15*60_000}, emailMinute:{limit:1,windowMs:60_000},
  emailHour:{limit:5,windowMs:60*60_000}, resetIp:{limit:30,windowMs:15*60_000},
  resetToken:{limit:5,windowMs:15*60_000},
} as const;
export const RESET_MESSAGE='หากอีเมลนี้ใช้งานได้ ระบบจะส่งวิธีตั้งรหัสผ่านใหม่ให้';
export class ResetError extends Error { constructor(public status:number, public code:string) { super(code); } }
export const tokenHash=(token:string)=>createHash('sha256').update(token).digest('hex');
export type ResetPolicy={version:string;ttlMs:number;requestIp:{limit:number;windowMs:number};emailMinute:{limit:number;windowMs:number};emailHour:{limit:number;windowMs:number};resetIp:{limit:number;windowMs:number};resetToken:{limit:number;windowMs:number}};
type Tx=Prisma.TransactionClient;
type Config={secret:string;origin:string;mailer:ResetMailer;policy?:ResetPolicy;production?:boolean;allowedOrigins?:string[]};
export class PasswordResetService {
  private jobs=new Set<Promise<void>>();
  private reservations=0;
  private policy:ResetPolicy;
  constructor(private db:PrismaClient,private config:Config) {
    this.policy=config.policy??RESET_POLICY;
    if(config.production&&(!config.policy||config.policy.version!=='configured-v1'))throw new Error('Production rate policy required');
    if(config.secret.length<32)throw new Error('Reset limiter key required');
    const origin=new URL(config.origin);
    if((config.production ? origin.protocol!=='https:'||!config.allowedOrigins?.includes(config.origin)||origin.origin!==config.origin : origin.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(origin.hostname))||origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash)
      throw new Error('Local reset origin required');
  }
  retryAfterSeconds(reset:boolean) { return Math.ceil(Math.max(...(reset?[this.policy.resetIp,this.policy.resetToken]:[this.policy.requestIp]).map(r=>r.windowMs))/1000); }
  private subject(kind:string,value:string) { return createHmac('sha256',this.config.secret).update(kind+'\0'+value).digest('hex'); }
  private async take(tx:Tx,scope:string,subject:string,rule:{limit:number;windowMs:number}) {
    const rows=await tx.$queryRaw<{hits:number}[]>(Prisma.sql`
      INSERT INTO "PasswordResetRateLimit" (scope,"subjectHash","windowStart",hits,"expiresAt")
      VALUES (${scope},${subject},to_timestamp(floor(extract(epoch from clock_timestamp())*1000/${rule.windowMs})*${rule.windowMs}/1000) AT TIME ZONE 'UTC',1,
      (clock_timestamp() AT TIME ZONE 'UTC')+(${rule.windowMs}*interval '1 millisecond'))
      ON CONFLICT (scope,"subjectHash","windowStart") DO UPDATE
      SET hits=LEAST("PasswordResetRateLimit".hits+1,${rule.limit+1})
      RETURNING hits`);
    return rows[0]!.hits<=rule.limit;
  }
  async request(email:string,ip:string) {
    if(this.reservations+this.jobs.size>=100)throw new ResetError(503,'RESET_BUSY');
    this.reservations++;
    try {
      const permitted=await this.db.$transaction(async tx=>{
        const ipAllowed=await this.take(tx,'request-ip',this.subject('ip',ip),this.policy.requestIp);
        if(!ipAllowed)return {ip:false,email:false};
        const subject=this.subject('email',email);
        const minute=await this.take(tx,'email-minute',subject,this.policy.emailMinute);
        const hour=await this.take(tx,'email-hour',subject,this.policy.emailHour);
        return {ip:true,email:minute&&hour};
      });
      if(!permitted.ip)throw new ResetError(429,'RESET_RATE_LIMIT');
      // Existence lookup and mail delivery are outside the HTTP response path.
      if(permitted.email) {
        const job=new Promise<void>(resolve=>setImmediate(resolve)).then(()=>this.issue(email)).catch(()=>{
          console.warn('PASSWORD_RESET_DELIVERY_FAILED'); // No raw exceptions or request data.
        });
        this.jobs.add(job);void job.finally(()=>this.jobs.delete(job));
      }
    } finally { this.reservations--; }
  }
  async drain() { await Promise.all([...this.jobs]); }
  private async issue(email:string) {
    const raw=randomBytes(32).toString('base64url'),hash=tokenHash(raw),id=randomUUID();
    const issued=await this.db.$transaction(async tx=>{
      const users=await tx.$queryRaw<{id:string;authVersion:number;deletedAt:Date|null}[]>(Prisma.sql`
        SELECT id,"authVersion","deletedAt" FROM "User" WHERE email=${email} FOR UPDATE`);
      const u=users[0];if(!u||u.deletedAt)return false;
      await tx.$executeRaw(Prisma.sql`INSERT INTO "PasswordResetToken"
        (id,"userId","tokenHash","authVersionAtIssue","createdAt","expiresAt")
        VALUES (${id},${u.id},${hash},${u.authVersion},statement_timestamp() AT TIME ZONE 'UTC',
        (statement_timestamp() AT TIME ZONE 'UTC')+interval '15 minutes')`);
      return true;
    });
    if(!issued)return;
    try {
      await this.config.mailer.send({to:email,resetUrl:this.config.origin.replace(/\/$/,'')+'/reset-password#token='+raw,expiresInMinutes:15});
      console.info('PASSWORD_RESET_DELIVERY_SUCCEEDED');
    } catch {
      await this.db.$executeRaw(Prisma.sql`UPDATE "PasswordResetToken" SET "revokedAt"=clock_timestamp() AT TIME ZONE 'UTC'
        WHERE id=${id} AND "usedAt" IS NULL AND "revokedAt" IS NULL`);
      throw new Error('Delivery failed');
    }
  }
  async reset(token:string,password:string,ip:string) {
    const hash=tokenHash(token);
    const allowed=await this.db.$transaction(async tx=>{
      const a=await this.take(tx,'reset-ip',this.subject('ip',ip),this.policy.resetIp);
      const b=a&&await this.take(tx,'reset-token',this.subject('token',hash),this.policy.resetToken);
      return a&&b;
    });
    if(!allowed)throw new ResetError(429,'RESET_RATE_LIMIT');
    const found=await this.db.$queryRaw<{userId:string}[]>(Prisma.sql`SELECT "userId" FROM "PasswordResetToken"
      WHERE "tokenHash"=${hash} AND "usedAt" IS NULL AND "revokedAt" IS NULL
      AND "expiresAt">clock_timestamp() AT TIME ZONE 'UTC'`);
    if(!found[0])throw new ResetError(400,'INVALID_RESET_TOKEN');
    const passwordHash=await bcrypt.hash(password,12);
    await this.db.$transaction(async tx=>{
      const users=await tx.$queryRaw<{id:string;authVersion:number;deletedAt:Date|null}[]>(Prisma.sql`
        SELECT id,"authVersion","deletedAt" FROM "User" WHERE id=${found[0]!.userId} FOR UPDATE`);
      const u=users[0];if(!u||u.deletedAt)throw new ResetError(400,'INVALID_RESET_TOKEN');
      const consumed=await tx.$executeRaw(Prisma.sql`UPDATE "PasswordResetToken"
        SET "usedAt"=clock_timestamp() AT TIME ZONE 'UTC'
        WHERE "tokenHash"=${hash} AND "userId"=${u.id} AND "authVersionAtIssue"=${u.authVersion}
        AND "usedAt" IS NULL AND "revokedAt" IS NULL AND "expiresAt">clock_timestamp() AT TIME ZONE 'UTC'`);
      if(consumed!==1)throw new ResetError(400,'INVALID_RESET_TOKEN');
      await tx.user.update({where:{id:u.id},data:{passwordHash,authVersion:{increment:1}}});
      await tx.$executeRaw(Prisma.sql`UPDATE "PasswordResetToken" SET "revokedAt"=clock_timestamp() AT TIME ZONE 'UTC'
        WHERE "userId"=${u.id} AND "usedAt" IS NULL AND "revokedAt" IS NULL`);
    });
  }
}
