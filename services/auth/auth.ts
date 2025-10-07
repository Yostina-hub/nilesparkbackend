// src/lib/auth.ts
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { username } from 'better-auth/plugins';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({ log: ['query', 'warn', 'error'] });

export const auth = betterAuth({
  url: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: prismaAdapter(prisma, {
    provider: 'postgresql',
  }),
  emailAndPassword: { enabled: true, autoSignIn: true },
  plugins: [
    username({
      minUsernameLength: 3,
      maxUsernameLength: 30,
      usernameValidator: (username) => /^[a-zA-Z0-9_]+$/.test(username),
    }),
  ],
  trustedOrigins: ['http://localhost:3000'],
  session: {
    // you can configure TTLs or other options here
    maxAge: 60 * 60 * 24 * 7, // 7 days, example
    freshAge: 60 * 60, // 1 hour, example
  },
});
