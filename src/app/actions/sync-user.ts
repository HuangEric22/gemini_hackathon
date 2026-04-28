'use server'

import { currentUser } from '@clerk/nextjs/server';
import { db, ensureDbSchema } from '@/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function syncClerkUser() {
  await ensureDbSchema();
  const clerkUser = await currentUser();
  if (!clerkUser) return null;

  const email = clerkUser.emailAddresses[0]?.emailAddress ?? '';
  const name = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ') || null;
  const imageUrl = clerkUser.imageUrl ?? null;

  const existing = await db
    .select()
    .from(users)
    .where(eq(users.clerkId, clerkUser.id))
    .limit(1);

  if (existing.length > 0) {
    const [updated] = await db
      .update(users)
      .set({ email, name, imageUrl })
      .where(eq(users.clerkId, clerkUser.id))
      .returning();
    return updated;
  }

  const [created] = await db
    .insert(users)
    .values({ clerkId: clerkUser.id, email, name, imageUrl })
    .returning();

  return created;
}
