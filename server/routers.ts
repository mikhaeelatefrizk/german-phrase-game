import { COOKIE_NAME } from "../client/src/shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { getDb } from "./db";
import { phrases, userProgress } from "../drizzle/schema";
import { eq, and, lt, desc, sql } from "drizzle-orm";
import {
  getTodaysTasks,
  getTodaysTaskCount,
  completeDailyTask,
  getLearningAnalytics,
  initializeDailyTasks,
  recordStudySession,
} from "./taskScheduler";
import {
  generateChatbotResponse,
  getGrammarExplanation,
  getUserContext,
} from "./chatbot";
import { learningRouter } from "./routers/learning";

export const appRouter = router({
  system: systemRouter,
  advancedLearning: learningRouter,

  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // AI Chatbot
  chatbot: router({
    // Get AI response
    ask: protectedProcedure
      .input(
        z.object({
          message: z.string(),
          phraseId: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        return await generateChatbotResponse(
          ctx.user.id,
          input.message,
          input.phraseId
        );
      }),

    // Get grammar explanation
    explainGrammar: protectedProcedure
      .input(z.object({ phraseId: z.string() }))
      .query(async ({ input }) => {
        return await getGrammarExplanation(input.phraseId);
      }),

    // Get user context for chatbot
    getContext: protectedProcedure.query(async ({ ctx }) => {
      return await getUserContext(ctx.user.id);
    }),
  }),

  // Daily task management
  tasks: router({
    // Get today's tasks
    getTodaysTasks: protectedProcedure.query(async ({ ctx }) => {
      return await getTodaysTasks(ctx.user.id);
    }),

    // Get today's task count
    getTodaysTaskCount: protectedProcedure.query(async ({ ctx }) => {
      return await getTodaysTaskCount(ctx.user.id);
    }),

    // Complete a task
    completeTask: protectedProcedure
      .input(
        z.object({
          taskId: z.string(),
          phraseId: z.string(),
          isCorrect: z.boolean(),
          timeSpentSeconds: z.number(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        await completeDailyTask(
          ctx.user.id,
          input.taskId,
          input.phraseId,
          input.isCorrect,
          input.timeSpentSeconds
        );
        return { success: true };
      }),

    // Get learning analytics
    getAnalytics: protectedProcedure.query(async ({ ctx }) => {
      return await getLearningAnalytics(ctx.user.id);
    }),

    // Initialize daily tasks
    initializeTasks: protectedProcedure
      .input(z.object({ dailyLoad: z.number().optional() }))
      .mutation(async ({ ctx, input }) => {
        await initializeDailyTasks(ctx.user.id, input.dailyLoad || 20);
        return { success: true };
      }),

    // Record study session
    recordSession: protectedProcedure
      .input(
        z.object({
          phrasesStudied: z.number(),
          correctAnswers: z.number(),
          incorrectAnswers: z.number(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        await recordStudySession(
          ctx.user.id,
          input.phrasesStudied,
          input.correctAnswers,
          input.incorrectAnswers
        );
        return { success: true };
      }),
  }),

  // Core learning features
  learning: router({
    // Get next phrase to learn
    getNextPhrase: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return null;

      try {
        const now = new Date();
        const userId = ctx.user.id;

        // Get phrase due for review
        const duePhrase = await db
          .select({ phrase: phrases })
          .from(userProgress)
          .innerJoin(phrases, eq(userProgress.phraseId, phrases.id))
          .where(
            and(
              eq(userProgress.userId, userId),
              lt(userProgress.nextReviewAt, now)
            )
          )
          .orderBy(desc(userProgress.nextReviewAt))
          .limit(1);

        if (duePhrase.length > 0) {
          return duePhrase[0].phrase;
        }

        // Otherwise get a new phrase
        const newPhrase = await db
          .select()
          .from(phrases)
          .orderBy(sql`RAND()`)
          .limit(1);

        return newPhrase.length > 0 ? newPhrase[0] : null;
      } catch (error) {
        console.error("Error getting next phrase:", error);
        return null;
      }
    }),

    // Record answer and update progress
    recordAnswer: protectedProcedure
      .input(
        z.object({
          phraseId: z.string(),
          isCorrect: z.boolean(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return { success: false };

        try {
          const userId = ctx.user.id;
          const { phraseId, isCorrect } = input;
          const now = new Date();

          // Get or create progress
          const existing = await db
            .select()
            .from(userProgress)
            .where(
              and(
                eq(userProgress.userId, userId),
                eq(userProgress.phraseId, phraseId)
              )
            )
            .limit(1);

          let interval = 1;
          let easeFactor = 2500;
          let repetitions = 0;

          if (existing.length > 0) {
            const p = existing[0];
            repetitions = p.repetitions;
            easeFactor = p.easeFactor;
            interval = p.interval;

            // SM-2 Algorithm
            if (isCorrect) {
              repetitions++;
              if (repetitions === 1) {
                interval = 1;
              } else if (repetitions === 2) {
                interval = 3;
              } else {
                interval = Math.round(interval * (easeFactor / 1000));
              }
              easeFactor = Math.max(1300, easeFactor + 100 * (5 - 3));
            } else {
              repetitions = 0;
              interval = 1;
              easeFactor = Math.max(1300, easeFactor + 100 * (2 - 3));
            }

            const nextReviewAt = new Date(
              now.getTime() + interval * 24 * 60 * 60 * 1000
            );

            await db
              .update(userProgress)
              .set({
                interval,
                easeFactor,
                repetitions,
                correctCount: isCorrect ? p.correctCount + 1 : p.correctCount,
                incorrectCount: !isCorrect
                  ? p.incorrectCount + 1
                  : p.incorrectCount,
                lastReviewedAt: now,
                nextReviewAt,
                updatedAt: now,
              })
              .where(eq(userProgress.id, p.id));
          } else {
            // Create new progress
            if (isCorrect) {
              repetitions = 1;
              interval = 1;
              easeFactor = 2500;
            } else {
              repetitions = 0;
              interval = 1;
              easeFactor = 1300;
            }

            const nextReviewAt = new Date(
              now.getTime() + interval * 24 * 60 * 60 * 1000
            );

            await db.insert(userProgress).values({
              id: `progress_${Date.now()}_${Math.random()
                .toString(36)
                .substr(2, 9)}`,
              userId,
              phraseId,
              interval,
              easeFactor,
              repetitions,
              correctCount: isCorrect ? 1 : 0,
              incorrectCount: !isCorrect ? 1 : 0,
              lastReviewedAt: now,
              nextReviewAt,
              status: isCorrect ? "learning" : "new",
              createdAt: now,
              updatedAt: now,
            });
          }

          return { success: true };
        } catch (error) {
          console.error("Error recording answer:", error);
          return { success: false };
        }
      }),

    // Get today's phrases for session
    getTodaysPhrases: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];

      try {
        const userId = ctx.user.id;
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);

        // Get phrases due for review today
        const todaysPhrases = await db
          .select({ phrase: phrases })
          .from(userProgress)
          .innerJoin(phrases, eq(userProgress.phraseId, phrases.id))
          .where(
            and(
              eq(userProgress.userId, userId),
              sql`${userProgress.nextReviewAt} >= ${today} AND ${userProgress.nextReviewAt} < ${tomorrow}`
            )
          )
          .orderBy(desc(userProgress.nextReviewAt));

        // If not enough phrases for today, add new ones
        if (todaysPhrases.length < 20) {
          const newPhrases = await db
            .select()
            .from(phrases)
            .orderBy(sql`RAND()`)
            .limit(20 - todaysPhrases.length);
          
          return [...todaysPhrases.map(p => p.phrase), ...newPhrases];
        }

        return todaysPhrases.map(p => p.phrase);
      } catch (error) {
        console.error("Error getting today's phrases:", error);
        return [];
      }
    }),

    // Get progress stats
    getStats: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return { learned: 0, total: 0, accuracy: 0 };

      try {
        const userId = ctx.user.id;

        const [learned, total, accuracy] = await Promise.all([
          db
            .select({ count: sql<number>`COUNT(*)` })
            .from(userProgress)
            .where(
              and(
                eq(userProgress.userId, userId),
                sql`${userProgress.correctCount} > 0`
              )
            ),
          db
            .select({ count: sql<number>`COUNT(*)` })
            .from(userProgress)
            .where(eq(userProgress.userId, userId)),
          db
            .select({
              correct: sql<number>`SUM(${userProgress.correctCount})`,
              total: sql<number>`SUM(${userProgress.correctCount} + ${userProgress.incorrectCount})`,
            })
            .from(userProgress)
            .where(eq(userProgress.userId, userId)),
        ]);

        const totalReviews = accuracy[0]?.total || 0;
        const correctReviews = accuracy[0]?.correct || 0;
        const accuracyRate =
          totalReviews > 0 ? Math.round((correctReviews / totalReviews) * 100) : 0;

        return {
          learned: learned[0]?.count || 0,
          total: total[0]?.count || 0,
          accuracy: accuracyRate,
        };
      } catch (error) {
        console.error("Error getting stats:", error);
        return { learned: 0, total: 0, accuracy: 0 };
      }
    }),
  }),
});

export type AppRouter = typeof appRouter;

