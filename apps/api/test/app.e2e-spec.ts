import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import type { Worker } from 'bullmq';
import type { Redis } from 'ioredis';
import { createImportWorker, createRedisConnection, createStorageFromEnv } from '@app/core';
import { forWorkspace, PrismaClient } from '@app/db';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { loadConfig } from '../src/config';

const RUN = Date.now().toString(36);
const SAMPLES = path.resolve(__dirname, '../../../samples');
const CSV = readFileSync(path.join(SAMPLES, 'products-sample.csv'));
const XLSX = readFileSync(path.join(SAMPLES, 'products-sample.xlsx'));

interface Session {
  token: string;
  workspaceId: string;
  cookie: string;
  email: string;
}

describe('API e2e', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let redis: Redis;
  let worker: Worker | null = null;
  let http: ReturnType<typeof request>;

  const startWorker = () => {
    worker = createImportWorker({ prisma, storage: createStorageFromEnv(), connection: redis, chunkSize: 3, logger: { info() {}, error() {} } });
  };
  const stopWorker = async () => {
    await worker?.close();
    worker = null;
  };

  const as = (s: Session) => ({
    get: (url: string) => http.get(url).set('Authorization', `Bearer ${s.token}`).set('x-workspace-id', s.workspaceId),
    post: (url: string) => http.post(url).set('Authorization', `Bearer ${s.token}`).set('x-workspace-id', s.workspaceId),
    patch: (url: string) => http.patch(url).set('Authorization', `Bearer ${s.token}`).set('x-workspace-id', s.workspaceId),
    put: (url: string) => http.put(url).set('Authorization', `Bearer ${s.token}`).set('x-workspace-id', s.workspaceId),
    del: (url: string) => http.delete(url).set('Authorization', `Bearer ${s.token}`).set('x-workspace-id', s.workspaceId),
  });

  async function register(email: string, extra: Record<string, string> = {}): Promise<Session> {
    const res = await http
      .post('/api/auth/register')
      .send({ name: email.split('@')[0], email, password: 'CorrectHorse42', ...extra })
      .expect(201);
    const me = await http.get('/api/auth/me').set('Authorization', `Bearer ${res.body.accessToken}`).expect(200);
    const cookie = String(res.headers['set-cookie'][0]).split(';')[0];
    return { token: res.body.accessToken, workspaceId: me.body.workspaces[0].id, cookie, email };
  }

  async function waitForJob(s: Session, jobId: string, statuses: string[], timeoutMs = 20_000) {
    const until = Date.now() + timeoutMs;
    for (;;) {
      const res = await as(s).get(`/api/jobs/${jobId}`).expect(200);
      if (statuses.includes(res.body.status)) return res.body;
      if (Date.now() > until) throw new Error(`Job ${jobId} stuck in ${res.body.status}`);
      await new Promise((r) => setTimeout(r, 150));
    }
  }

  beforeAll(async () => {
    prisma = new PrismaClient();
    redis = createRedisConnection();
    await redis.flushdb();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app, loadConfig());
    await app.init();
    http = request(app.getHttpServer());
  });

  afterAll(async () => {
    await stopWorker();
    await app?.close();
    await redis?.quit();
    await prisma?.$disconnect();
  });

  // ---------------------------------------------------------------------------
  describe('authentication', () => {
    it('registers, logs in, rejects bad credentials and weak passwords', async () => {
      await register(`auth@${RUN}.test.dev`);
      await http.post('/api/auth/register').send({ name: 'x', email: `auth@${RUN}.test.dev`, password: 'CorrectHorse42' }).expect(409);
      await http.post('/api/auth/register').send({ name: 'x', email: `weak@${RUN}.test.dev`, password: 'short' }).expect(400);
      await http.post('/api/auth/login').send({ email: `auth@${RUN}.test.dev`, password: 'wrong-password-1' }).expect(401);
      await http.post('/api/auth/login').send({ email: `nobody@${RUN}.test.dev`, password: 'wrong-password-1' }).expect(401);
      const ok = await http.post('/api/auth/login').send({ email: `auth@${RUN}.test.dev`, password: 'CorrectHorse42' }).expect(200);
      expect(ok.body.accessToken).toBeTruthy();
      expect(String(ok.headers['set-cookie'])).toMatch(/rt=.*HttpOnly/i);
    });

    it('requires a token for protected routes', async () => {
      await http.get('/api/auth/me').expect(401);
      await http.get('/api/auth/me').set('Authorization', 'Bearer not-a-jwt').expect(401);
      await http.get('/api/health').expect(200);
    });

    it('rotates refresh tokens and revokes all sessions on reuse', async () => {
      const s = await register(`refresh@${RUN}.test.dev`);
      const first = await http.post('/api/auth/refresh').set('Cookie', s.cookie).expect(200);
      const rotated = String(first.headers['set-cookie'][0]).split(';')[0];
      expect(rotated).not.toBe(s.cookie);
      // A concurrent replay (within the grace window) is rejected but does not end the session.
      await http.post('/api/auth/refresh').set('Cookie', s.cookie).expect(401);
      const second = await http.post('/api/auth/refresh').set('Cookie', rotated).expect(200);
      const latest = String(second.headers['set-cookie'][0]).split(';')[0];

      // Replaying an old token after the grace window is treated as theft → every session revoked.
      await prisma.refreshToken.updateMany({
        where: { revokedAt: { not: null }, user: { email: s.email } },
        data: { revokedAt: new Date(Date.now() - 60_000) },
      });
      await http.post('/api/auth/refresh').set('Cookie', s.cookie).expect(401);
      await http.post('/api/auth/refresh').set('Cookie', latest).expect(401);
    });
  });

  // ---------------------------------------------------------------------------
  describe('tenant isolation & RBAC', () => {
    let alice: Session;
    let bob: Session;
    let aliceProjectId: string;

    beforeAll(async () => {
      alice = await register(`alice@${RUN}.test.dev`);
      bob = await register(`bob@${RUN}.test.dev`);
      const p = await as(alice).post('/api/projects').send({ name: 'Alice project' }).expect(201);
      aliceProjectId = p.body.id;
    });

    it('requires the workspace header on tenant routes', async () => {
      await http.get('/api/projects').set('Authorization', `Bearer ${alice.token}`).expect(400);
    });

    it("forbids using another user's workspace id", async () => {
      await http
        .get('/api/projects')
        .set('Authorization', `Bearer ${bob.token}`)
        .set('x-workspace-id', alice.workspaceId)
        .expect(403);
    });

    it("hides another workspace's records even when the id is known", async () => {
      await as(bob).get(`/api/projects/${aliceProjectId}`).expect(404);
      await as(bob).patch(`/api/projects/${aliceProjectId}`).send({ name: 'pwned' }).expect(404);
      await as(bob).del(`/api/projects/${aliceProjectId}`).expect(404);
      const list = await as(bob).get('/api/projects').expect(200);
      expect(list.body).toHaveLength(0);
    });

    it('tenant-scoped client refuses cross-workspace writes', async () => {
      const db = forWorkspace(prisma, bob.workspaceId);
      await expect(
        db.project.create({ data: { workspaceId: alice.workspaceId, name: 'x', createdById: 'u' } }),
      ).rejects.toThrow(/another workspace/);
      expect(await db.project.findFirst({ where: { id: aliceProjectId } })).toBeNull();
    });

    it('invites a MEMBER who can read and upload but not manage projects', async () => {
      const inv = await as(alice).post('/api/workspace/invitations').send({ email: `carol@${RUN}.test.dev`, role: 'MEMBER' }).expect(201);
      expect(inv.body.inviteUrl).toContain(inv.body.token);
      await http.get(`/api/invitations/${inv.body.token}`).expect(200);

      const carol = await register(`carol@${RUN}.test.dev`, { inviteToken: inv.body.token });
      expect(carol.workspaceId).toBe(alice.workspaceId);
      await http.get(`/api/invitations/${inv.body.token}`).expect(404); // single use

      await as(carol).get('/api/projects').expect(200);
      await as(carol).post('/api/projects').send({ name: 'nope' }).expect(403);
      await as(carol).get('/api/activity').expect(403);
      await as(carol).del('/api/activity').expect(403);
      await as(carol).post('/api/workspace/invitations').send({ email: `x@${RUN}.test.dev`, role: 'ADMIN' }).expect(403);

      const members = await as(alice).get('/api/workspace/members').expect(200);
      expect(members.body.map((m: { role: string }) => m.role).sort()).toEqual(['ADMIN', 'MEMBER']);
    });

    it('keeps at least one admin', async () => {
      const members = await as(alice).get('/api/workspace/members').expect(200);
      const adminMembership = members.body.find((m: { role: string }) => m.role === 'ADMIN');
      await as(alice).patch(`/api/workspace/members/${adminMembership.id}`).send({ role: 'MEMBER' }).expect(400);
    });

    it('records audited actions in the activity log', async () => {
      const res = await as(alice).get('/api/activity').expect(200);
      const actions = res.body.items.map((i: { action: string }) => i.action);
      expect(actions).toEqual(expect.arrayContaining(['project.created', 'member.invited']));
    });

    it('clears only the filtered entries when a filter is given', async () => {
      const all = (await as(alice).get('/api/activity').expect(200)).body.total;
      const members = (await as(alice).get('/api/activity?action=member').expect(200)).body.total;
      expect(members).toBeGreaterThan(0);
      expect(members).toBeLessThan(all);

      expect((await as(alice).del('/api/activity?action=member').expect(200)).body).toEqual({ deleted: members });
      expect((await as(alice).get('/api/activity?action=member').expect(200)).body.total).toBe(0);
      // Everything else is still there, plus the entry recording the clear.
      let remaining: Array<{ action: string; metadata: { count: number; filter: string } }> = [];
      for (let i = 0; i < 20 && remaining.length !== all - members + 1; i++) {
        remaining = (await as(alice).get('/api/activity').expect(200)).body.items;
        if (remaining.length !== all - members + 1) await new Promise((r) => setTimeout(r, 100));
      }
      expect(remaining).toHaveLength(all - members + 1);
      expect(remaining.map((i) => i.action)).toContain('project.created');
      expect(remaining.find((i) => i.action === 'activity.cleared')).toMatchObject({ metadata: { count: members, filter: 'member' } });
    });

    it('lets an admin clear the activity log, leaving a record of who cleared it', async () => {
      const before = (await as(alice).get('/api/activity').expect(200)).body.total;
      const res = await as(alice).del('/api/activity').expect(200);
      expect(res.body).toEqual({ deleted: before });

      // The "cleared" entry is written just after the response.
      let items: Array<{ action: string; actorEmail: string; metadata: { count: number } }> = [];
      for (let i = 0; i < 20 && !items.length; i++) {
        items = (await as(alice).get('/api/activity').expect(200)).body.items;
        if (!items.length) await new Promise((r) => setTimeout(r, 100));
      }
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({ action: 'activity.cleared', actorEmail: alice.email, metadata: { count: before } });
    });
  });

  // ---------------------------------------------------------------------------
  describe('file import pipeline', () => {
    let dana: Session;
    let projectId: string;

    beforeAll(async () => {
      dana = await register(`dana@${RUN}.test.dev`);
      projectId = (await as(dana).post('/api/projects').send({ name: 'Imports' }).expect(201)).body.id;
    });

    afterEach(stopWorker);

    it('imports a CSV: detects URLs, de-duplicates and flags invalid rows', async () => {
      startWorker();
      const up = await as(dana).post(`/api/projects/${projectId}/files`).attach('file', CSV, 'products-sample.csv').expect(201);
      const job = await waitForJob(dana, up.body.jobId, ['COMPLETED', 'FAILED']);
      expect(job).toMatchObject({ status: 'COMPLETED', total: 11, processed: 11, pending: 0 });

      const file = await as(dana).get(`/api/files/${up.body.id}`).expect(200);
      expect(file.body).toMatchObject({ status: 'PROCESSED', validCount: 6, duplicateCount: 2, invalidCount: 3, urlColumns: ['Amazon URL'] });

      const dupes = await as(dana).get(`/api/files/${up.body.id}/rows?status=DUPLICATE`).expect(200);
      expect(dupes.body.items.map((r: { rowNumber: number; duplicateOfRow: number }) => [r.rowNumber, r.duplicateOfRow])).toEqual([
        [3, 2],
        [12, 4],
      ]);
      const search = await as(dana).get(`/api/files/${up.body.id}/rows?q=b0c1234567`).expect(200);
      expect(search.body.items).toHaveLength(1);
      expect(search.body.items[0]).toMatchObject({ marketplace: 'GB', canonicalUrl: 'https://www.amazon.co.uk/dp/B0C1234567' });

      const logs = await as(dana).get(`/api/jobs/${up.body.jobId}/logs`).expect(200);
      expect(logs.body.at(-1).message).toMatch(/6 valid, 2 duplicate, 3 invalid/);
    });

    it('flags products already imported in the same project (XLSX with hyperlinks)', async () => {
      startWorker();
      const up = await as(dana).post(`/api/projects/${projectId}/files`).attach('file', XLSX, 'products-sample.xlsx').expect(201);
      await waitForJob(dana, up.body.jobId, ['COMPLETED']);
      const file = await as(dana).get(`/api/files/${up.body.id}`).expect(200);
      expect(file.body).toMatchObject({ validCount: 0, duplicateCount: 8, invalidCount: 3 });
    });

    it('exports results as CSV/XLSX and lists them under exported reports', async () => {
      const files = await as(dana).get(`/api/files?projectId=${projectId}`).expect(200);
      const csvFile = files.body.find((f: { originalName: string }) => f.originalName === 'products-sample.csv');

      const csv = await as(dana).get(`/api/files/${csvFile.id}/export?format=csv&status=VALID`).expect(200);
      expect(csv.headers['content-type']).toMatch(/text\/csv/);
      const lines = csv.text.replace('﻿', '').trim().split(/\r?\n/);
      expect(lines).toHaveLength(7); // header + 6 valid
      expect(lines[0]).toMatch(/^Row,Status,Marketplace,ASIN,Canonical URL/);
      expect(lines[0]).toContain('Product name');

      const xlsx = await as(dana)
        .get(`/api/files/${csvFile.id}/export?format=xlsx`)
        .buffer(true)
        .parse((res, cb) => {
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () => cb(null, Buffer.concat(chunks)));
        })
        .expect(200);
      expect((xlsx.body as Buffer).subarray(0, 2).toString()).toBe('PK');

      const exportsList = await as(dana).get('/api/exports').expect(200);
      expect(exportsList.body).toHaveLength(2);
      await as(dana).get(`/api/exports/${exportsList.body[0].id}/download`).expect(200);
    });

    it('supports pause and resume', async () => {
      const up = await as(dana).post(`/api/projects/${projectId}/files`).attach('file', CSV, 'again.csv').expect(201);
      const paused = await as(dana).post(`/api/jobs/${up.body.jobId}/pause`).expect(200);
      expect(paused.body.status).toBe('PAUSED');

      startWorker();
      await new Promise((r) => setTimeout(r, 1500));
      const still = await as(dana).get(`/api/jobs/${up.body.jobId}`).expect(200);
      expect(still.body).toMatchObject({ status: 'PAUSED', processed: 0 });

      await as(dana).post(`/api/jobs/${up.body.jobId}/resume`).expect(200);
      const done = await waitForJob(dana, up.body.jobId, ['COMPLETED']);
      expect(done.processed).toBe(11);
      await as(dana).post(`/api/jobs/${up.body.jobId}/pause`).expect(400); // terminal
    });

    it('rejects unsupported and disguised files', async () => {
      await as(dana).post(`/api/projects/${projectId}/files`).attach('file', Buffer.from('x'), 'legacy.xls').expect(400);
      await as(dana).post(`/api/projects/${projectId}/files`).attach('file', Buffer.from('a,b'), 'fake.xlsx').expect(400);
      await as(dana).post(`/api/projects/${projectId}/files`).attach('file', Buffer.from('MZ'), 'virus.exe').expect(400);
    });

    it('fails a file with no Amazon URLs without retrying', async () => {
      startWorker();
      const up = await as(dana)
        .post(`/api/projects/${projectId}/files`)
        .attach('file', Buffer.from('name,price\nmug,10\n'), 'no-urls.csv')
        .expect(201);
      const job = await waitForJob(dana, up.body.jobId, ['FAILED', 'COMPLETED']);
      expect(job.status).toBe('FAILED');
      expect(job.error).toMatch(/No column with Amazon product URLs/);
      const file = await as(dana).get(`/api/files/${up.body.id}`).expect(200);
      expect(file.body.status).toBe('FAILED');
    });
  });

  describe('project deletion', () => {
    it('removes rows, jobs and stored files', async () => {
      const s = await register(`frank@${RUN}.test.dev`);
      const pid = (await as(s).post('/api/projects').send({ name: 'Temp' }).expect(201)).body.id;
      startWorker();
      const up = await as(s).post(`/api/projects/${pid}/files`).attach('file', CSV, 'x.csv').expect(201);
      await waitForJob(s, up.body.jobId, ['COMPLETED']);
      await as(s).get(`/api/files/${up.body.id}/export?format=csv`).expect(200);
      await stopWorker();

      const file = await prisma.uploadedFile.findUniqueOrThrow({ where: { id: up.body.id } });
      const exp = await prisma.export.findFirstOrThrow({ where: { projectId: pid } });
      const storage = createStorageFromEnv();
      expect(await storage.exists(file.storageKey)).toBe(true);

      await as(s).del(`/api/projects/${pid}`).expect(204);
      expect(await storage.exists(file.storageKey)).toBe(false);
      expect(await storage.exists(exp.storageKey)).toBe(false);
      expect(await prisma.importRow.count({ where: { projectId: pid } })).toBe(0);
      expect(await prisma.job.count({ where: { projectId: pid } })).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  describe('integrations', () => {
    it('stores credentials encrypted and never returns them', async () => {
      const s = await register(`erin@${RUN}.test.dev`);
      const saved = await as(s)
        .put('/api/integrations')
        .send({ provider: 'KEEPA', credentials: { apiKey: 'keepa-secret-key-9876' } })
        .expect(200);
      expect(JSON.stringify(saved.body)).not.toContain('keepa-secret-key-9876');
      expect(saved.body.credentialHints).toEqual({ apiKey: '••••9876' });

      const row = await prisma.integration.findUniqueOrThrow({ where: { id: saved.body.id } });
      expect(row.encryptedCredentials).not.toContain('keepa-secret-key-9876');

      const list = await as(s).get('/api/integrations').expect(200);
      expect(JSON.stringify(list.body)).not.toContain('keepa-secret-key-9876');
    });
  });
});
