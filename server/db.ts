import { eq, and, gte, lte, sql, desc, asc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, phrases, userProgress, userStats, mistakes, Phrase, UserProgress, UserStats, Mistake } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.id) {
    throw new Error("User ID is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      id: user.id,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role === undefined) {
      if (user.id === ENV.ownerId) {
        user.role = 'admin';
        values.role = 'admin';
        updateSet.role = 'admin';
      }
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUser(id: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// Phrase management functions
export async function getAllPhrases(limit = 100, offset = 0): Promise<Phrase[]> {
  const db = await getDb();
  if (!db) return [];

  return await db.select().from(phrases).limit(limit).offset(offset);
}

export async function getPhraseById(id: string): Promise<Phrase | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(phrases).where(eq(phrases.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function insertPhrases(phraseList: Array<{ id: string; german: string; english: string; pronunciation: string; difficulty: 'easy' | 'intermediate' | 'hard'; category: string }>): Promise<void> {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot insert phrases: database not available");
    return;
  }

  try {
    await db.insert(phrases).values(phraseList).onDuplicateKeyUpdate({
      set: {
        german: sql`VALUES(german)`,
        english: sql`VALUES(english)`,
        pronunciation: sql`VALUES(pronunciation)`,
        difficulty: sql`VALUES(difficulty)`,
        category: sql`VALUES(category)`,
      },
    });
  } catch (error) {
    console.error("[Database] Failed to insert phrases:", error);
    throw error;
  }
}

// User progress functions
export async function getUserProgress(userId: string, phraseId: string): Promise<UserProgress | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(userProgress).where(
    and(eq(userProgress.userId, userId), eq(userProgress.phraseId, phraseId))
  ).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function getPhrasesForReview(userId: string, limit = 20): Promise<Array<{ progress: UserProgress; phrase: Phrase }>> {
  const db = await getDb();
  if (!db) return [];

  const now = new Date();
  const results = await db.select().from(userProgress)
    .innerJoin(phrases, eq(userProgress.phraseId, phrases.id))
    .where(
      and(
        eq(userProgress.userId, userId),
        lte(userProgress.nextReviewAt, now)
      )
    )
    .orderBy(asc(userProgress.nextReviewAt))
    .limit(limit);

  return results.map(r => ({ progress: r.userProgress, phrase: r.phrases }));
}

export async function updateUserProgress(userId: string, phraseId: string, isCorrect: boolean): Promise<void> {
  const db = await getDb();
  if (!db) return;

  let progress = await getUserProgress(userId, phraseId);

  if (!progress) {
    // Create new progress record
    const id = `${userId}-${phraseId}-${Date.now()}`;
    await db.insert(userProgress).values({
      id,
      userId,
      phraseId,
      correctCount: isCorrect ? 1 : 0,
      incorrectCount: isCorrect ? 0 : 1,
      status: 'learning',
      nextReviewAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 1 day
    });
  } else {
    // Update existing progress using SM-2 algorithm
    const quality = isCorrect ? 4 : 1; // Quality of response (0-5)
    let newEaseFactor = progress.easeFactor + (20 * quality - 50);
    if (newEaseFactor < 1300) newEaseFactor = 1300; // Minimum ease factor

    let newInterval = 1;
    if (progress.repetitions === 0) {
      newInterval = 1;
    } else if (progress.repetitions === 1) {
      newInterval = 3;
    } else {
      newInterval = Math.round(progress.interval * (newEaseFactor / 1000));
    }

    const nextReviewAt = new Date(Date.now() + newInterval * 24 * 60 * 60 * 1000);
    const newStatus = newInterval > 30 ? 'mastered' : 'learning';

    await db.update(userProgress).set({
      interval: newInterval,
      easeFactor: newEaseFactor,
      repetitions: progress.repetitions + 1,
      correctCount: progress.correctCount + (isCorrect ? 1 : 0),
      incorrectCount: progress.incorrectCount + (isCorrect ? 0 : 1),
      lastReviewedAt: new Date(),
      nextReviewAt,
      status: newStatus,
      updatedAt: new Date(),
    }).where(
      and(eq(userProgress.userId, userId), eq(userProgress.phraseId, phraseId))
    );
  }
}

// User stats functions
export async function getUserStats(userId: string): Promise<UserStats | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(userStats).where(eq(userStats.userId, userId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function initializeUserStats(userId: string): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const id = `${userId}-stats-${Date.now()}`;
  await db.insert(userStats).values({
    id,
    userId,
  }).onDuplicateKeyUpdate({
    set: { updatedAt: new Date() },
  });
}

export async function updateUserStats(userId: string, updates: Partial<UserStats>): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.update(userStats).set({
    ...updates,
    updatedAt: new Date(),
  }).where(eq(userStats.userId, userId));
}

// Mistakes tracking
export async function recordMistake(userId: string, phraseId: string, mistakeType: string, userAnswer?: string, correctAnswer?: string): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const existing = await db.select().from(mistakes).where(
    and(
      eq(mistakes.userId, userId),
      eq(mistakes.phraseId, phraseId),
      eq(mistakes.mistakeType, mistakeType as any)
    )
  ).limit(1);

  if (existing.length > 0) {
    await db.update(mistakes).set({
      mistakeCount: existing[0].mistakeCount + 1,
      updatedAt: new Date(),
    }).where(eq(mistakes.id, existing[0].id));
  } else {
    const id = `${userId}-${phraseId}-${mistakeType}-${Date.now()}`;
    await db.insert(mistakes).values({
      id,
      userId,
      phraseId,
      mistakeType: mistakeType as any,
      mistakeCount: 1,
      userAnswer,
      correctAnswer,
    });
  }
}

export async function getUserMistakes(userId: string, limit = 50): Promise<Array<{ mistake: Mistake; phrase: Phrase }>> {
  const db = await getDb();
  if (!db) return [];

  const results = await db.select().from(mistakes)
    .innerJoin(phrases, eq(mistakes.phraseId, phrases.id))
    .where(eq(mistakes.userId, userId))
    .orderBy(desc(mistakes.mistakeCount))
    .limit(limit);

  return results.map(r => ({ mistake: r.mistakes, phrase: r.phrases }));
}

