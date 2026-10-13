/**
 * Development seed: a demo organization with two workspaces and three users (one per role).
 * Password for all demo users: DemoPass123
 */
import { PrismaClient, Role } from '@prisma/client';
import { hash } from '@node-rs/argon2';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await hash('DemoPass123');

  const existing = await prisma.user.findUnique({ where: { email: 'admin@demo.test' } });
  if (existing) {
    console.log('Seed already applied — skipping.');
    return;
  }

  const org = await prisma.organization.create({ data: { name: 'Demo Trading Co.' } });
  const main = await prisma.workspace.create({ data: { name: 'Main workspace', organizationId: org.id } });
  const eu = await prisma.workspace.create({ data: { name: 'EU sourcing', organizationId: org.id } });

  const users: Array<[string, string, Role]> = [
    ['admin@demo.test', 'Demo Admin', Role.ADMIN],
    ['manager@demo.test', 'Demo Manager', Role.MANAGER],
    ['member@demo.test', 'Demo Member', Role.MEMBER],
  ];
  for (const [email, name, role] of users) {
    const user = await prisma.user.create({ data: { email, name, passwordHash } });
    await prisma.membership.create({ data: { userId: user.id, workspaceId: main.id, role } });
    if (role === Role.ADMIN) {
      await prisma.membership.create({ data: { userId: user.id, workspaceId: eu.id, role } });
    }
  }

  const admin = await prisma.user.findUniqueOrThrow({ where: { email: 'admin@demo.test' } });
  await prisma.project.create({
    data: {
      workspaceId: main.id,
      name: 'Home & Kitchen — Q4 research',
      description: 'Sample project created by the seed script.',
      createdById: admin.id,
    },
  });

  console.log('Seeded demo org. Log in as admin@demo.test / DemoPass123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
