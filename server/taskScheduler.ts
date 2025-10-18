import { getDb } from "./db";
import { phrases, userProgress, dailyTasks, studySessions, learningAnalytics } from "../drizzle/schema";
import { eq, and, gte, lte, sql } from "drizzle-orm";

/**
 * Spaced Repetition Intervals (in days)
 * Based on scientific research: Ebbinghaus, SM-2, Duolingo
 */
const SPACED_REPETITION_INTERVALS = {
  new: 0, // Learn new phrase today
  review_1: 1, // Review after 1 day
  review_3: 3, // Review after 3 days
  review_10: 10, // Review after 10 days
  review_21: 21, // Review after 21 days
  review_50: 50, // Review after 50 days (mastered)
};

/**
 * Initialize daily tasks for a user
 * Creates initial batch of new phrases to learn
 */
export async function initializeDailyTasks(userId: string, dailyLoad: number = 20): Promise<void> {
  const db = await getDb();
  if (!db) return;

  try {
    // Get random phrases that user hasn't learned yet
    const unlearned = await db
      .select({ id: phrases.id })
      .from(phrases)
      .leftJoin(userProgress, eq(phrases.id, userProgress.phraseId))
      .where(
        and(
          sql`${userProgress.id} IS NULL OR ${userProgress.userId} != ${userId}`
        )
      )
      .orderBy(sql`RAND()`)
      .limit(dailyLoad);

    if (unlearned.length === 0) return;

    // Create daily tasks for today
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tasksToCreate = unlearned.map((item, index) => ({
      id: `task_${userId}_${Date.now()}_${index}`,
      userId,
      phraseId: item.id,
      scheduledDate: today,
      taskType: "new" as const,
      daysFromLearning: 0,
      status: "pending" as const,
    }));

    await db.insert(dailyTasks).values(tasksToCreate);
  } catch (error) {
    console.error("[TaskScheduler] Error initializing daily tasks:", error);
  }
}

/**
 * Get today's tasks for a user
 */
export async function getTodaysTasks(userId: string) {
  const db = await getDb();
  if (!db) return [];

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const tasks = await db
      .select({
        task: dailyTasks,
        phrase: phrases,
      })
      .from(dailyTasks)
      .innerJoin(phrases, eq(dailyTasks.phraseId, phrases.id))
      .where(
        and(
          eq(dailyTasks.userId, userId),
          gte(dailyTasks.scheduledDate, today),
          lte(dailyTasks.scheduledDate, tomorrow)
        )
      )
      .orderBy(dailyTasks.taskType);

    return tasks;
  } catch (error) {
    console.error("[TaskScheduler] Error getting today's tasks:", error);
    return [];
  }
}

/**
 * Complete a daily task and schedule next reviews
 */
export async function completeDailyTask(
  userId: string,
  taskId: string,
  phraseId: string,
  isCorrect: boolean,
  timeSpentSeconds: number
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  try {
    const now = new Date();

    // Mark task as completed
    await db
      .update(dailyTasks)
      .set({
        status: "completed",
        completedAt: now,
        isCorrect: isCorrect ? 1 : 0,
        timeSpentSeconds,
        updatedAt: now,
      })
      .where(eq(dailyTasks.id, taskId));

    // Update user progress
    const progress = await db
      .select()
      .from(userProgress)
      .where(
        and(
          eq(userProgress.userId, userId),
          eq(userProgress.phraseId, phraseId)
        )
      )
      .limit(1);

    if (progress.length === 0) {
      // Create new progress record
      await db.insert(userProgress).values({
        id: `progress_${userId}_${phraseId}_${Date.now()}`,
        userId,
        phraseId,
        correctCount: isCorrect ? 1 : 0,
        incorrectCount: isCorrect ? 0 : 1,
        status: "learning",
        nextReviewAt: new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000), // 1 day
      });
    } else {
      // Update existing progress
      const p = progress[0];
      await db
        .update(userProgress)
        .set({
          correctCount: p.correctCount + (isCorrect ? 1 : 0),
          incorrectCount: p.incorrectCount + (isCorrect ? 0 : 1),
          repetitions: p.repetitions + 1,
          lastReviewedAt: now,
          updatedAt: now,
        })
        .where(eq(userProgress.id, p.id));
    }

    // Schedule next reviews based on spaced repetition
    if (isCorrect) {
      await scheduleNextReviews(userId, phraseId);
    }
  } catch (error) {
    console.error("[TaskScheduler] Error completing daily task:", error);
  }
}

/**
 * Schedule next review tasks based on spaced repetition intervals
 */
async function scheduleNextReviews(userId: string, phraseId: string): Promise<void> {
  const db = await getDb();
  if (!db) return;

  try {
    const now = new Date();

    // Schedule review tasks at each interval
    const reviewSchedules = [
      { days: 1, type: "review_1" },
      { days: 3, type: "review_3" },
      { days: 10, type: "review_10" },
      { days: 21, type: "review_21" },
      { days: 50, type: "review_50" },
    ];

    for (const schedule of reviewSchedules) {
      const scheduledDate = new Date(now);
      scheduledDate.setDate(scheduledDate.getDate() + schedule.days);
      scheduledDate.setHours(0, 0, 0, 0);

      // Check if task already exists
      const existing = await db
        .select()
        .from(dailyTasks)
        .where(
          and(
            eq(dailyTasks.userId, userId),
            eq(dailyTasks.phraseId, phraseId),
            eq(dailyTasks.taskType, schedule.type as any)
          )
        )
        .limit(1);

      if (existing.length === 0) {
        await db.insert(dailyTasks).values({
          id: `task_${userId}_${phraseId}_${schedule.type}_${Date.now()}`,
          userId,
          phraseId,
          scheduledDate,
          taskType: schedule.type as any,
          daysFromLearning: schedule.days,
          status: "pending",
        });
      }
    }
  } catch (error) {
    console.error("[TaskScheduler] Error scheduling next reviews:", error);
  }
}

/**
 * Get pending tasks count for today
 */
export async function getTodaysTaskCount(userId: string): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const result = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(dailyTasks)
      .where(
        and(
          eq(dailyTasks.userId, userId),
          eq(dailyTasks.status, "pending"),
          gte(dailyTasks.scheduledDate, today),
          lte(dailyTasks.scheduledDate, tomorrow)
        )
      );

    return result[0]?.count || 0;
  } catch (error) {
    console.error("[TaskScheduler] Error getting task count:", error);
    return 0;
  }
}

/**
 * Record a study session
 */
export async function recordStudySession(
  userId: string,
  phrasesStudied: number,
  correctAnswers: number,
  incorrectAnswers: number
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  try {
    const now = new Date();
    const accuracy = phrasesStudied > 0 ? Math.round((correctAnswers / phrasesStudied) * 100) : 0;

    await db.insert(studySessions).values({
      id: `session_${userId}_${Date.now()}`,
      userId,
      sessionDate: now,
      startTime: now,
      endTime: now,
      phrasesStudied,
      correctAnswers,
      incorrectAnswers,
      accuracy,
      streakContinued: 1,
    });

    // Update learning analytics
    await updateLearningAnalytics(userId);
  } catch (error) {
    console.error("[TaskScheduler] Error recording study session:", error);
  }
}

/**
 * Update learning analytics based on study patterns
 */
async function updateLearningAnalytics(userId: string): Promise<void> {
  const db = await getDb();
  if (!db) return;

  try {
    // Get last 30 days of study sessions
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const sessions = await db
      .select()
      .from(studySessions)
      .where(
        and(
          eq(studySessions.userId, userId),
          gte(studySessions.sessionDate, thirtyDaysAgo)
        )
      );

    if (sessions.length === 0) return;

    // Calculate metrics
    const totalPhrases = sessions.reduce((sum, s) => sum + s.phrasesStudied, 0);
    const totalCorrect = sessions.reduce((sum, s) => sum + s.correctAnswers, 0);
    const avgAccuracy = sessions.length > 0 ? Math.round(totalCorrect / totalPhrases * 100) : 0;
    const avgPhrasesPerDay = Math.round(totalPhrases / 30);

    // Determine learning pace
    let learningPace: "slow" | "normal" | "fast" = "normal";
    if (avgPhrasesPerDay < 15) learningPace = "slow";
    if (avgPhrasesPerDay > 30) learningPace = "fast";

    // Update or create analytics record
    const existing = await db
      .select()
      .from(learningAnalytics)
      .where(eq(learningAnalytics.userId, userId))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(learningAnalytics)
        .set({
          avgPhrasesPerDay,
          avgRetention: avgAccuracy,
          learningPace,
          lastAnalyzedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(learningAnalytics.userId, userId));
    } else {
      await db.insert(learningAnalytics).values({
        id: `analytics_${userId}_${Date.now()}`,
        userId,
        avgPhrasesPerDay,
        avgRetention: avgAccuracy,
        learningPace,
        optimalDailyLoad: avgPhrasesPerDay,
        lastAnalyzedAt: new Date(),
      });
    }
  } catch (error) {
    console.error("[TaskScheduler] Error updating analytics:", error);
  }
}

/**
 * Get learning analytics for a user
 */
export async function getLearningAnalytics(userId: string) {
  const db = await getDb();
  if (!db) return null;

  try {
    const result = await db
      .select()
      .from(learningAnalytics)
      .where(eq(learningAnalytics.userId, userId))
      .limit(1);

    return result.length > 0 ? result[0] : null;
  } catch (error) {
    console.error("[TaskScheduler] Error getting analytics:", error);
    return null;
  }
}

