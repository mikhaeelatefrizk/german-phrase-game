/**
 * Learning Router
 * 
 * Exposes tRPC endpoints for:
 * - Spaced repetition and word review
 * - Adaptive learning and daily missions
 * - Progress tracking and analytics
 * - Chatbot interactions with context
 */

import { router, publicProcedure, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { getDb } from "../db";
import { userProgress, phrases, userStats, learningAnalytics, dailyTasks } from "../../drizzle/schema";
import { eq, and, lte, gte, desc, sql } from "drizzle-orm";
import * as srs from "../learning/srs";
import * as adaptiveEngine from "../learning/adaptiveEngine";
import * as llmIntegration from "../learning/llmIntegration";
import { v4 as uuidv4 } from "uuid";

export const learningRouter = router({
  /**
   * Get words due for review today
   */
  getWordsForReview: protectedProcedure
    .query(async ({ ctx }) => {
      const db = getDb();
      const userId = ctx.user.id;

      const wordsForReview = await db
        .select({
          id: userProgress.id,
          phraseId: userProgress.phraseId,
          german: phrases.german,
          english: phrases.english,
          pronunciation: phrases.pronunciation,
          difficulty: phrases.difficulty,
          interval: userProgress.interval,
          easeFactor: userProgress.easeFactor,
          repetitions: userProgress.repetitions,
          nextReviewAt: userProgress.nextReviewAt,
        })
        .from(userProgress)
        .innerJoin(phrases, eq(userProgress.phraseId, phrases.id))
        .where(
          and(
            eq(userProgress.userId, userId),
            lte(userProgress.nextReviewAt, new Date())
          )
        )
        .orderBy(desc(userProgress.nextReviewAt))
        .limit(20);

      return wordsForReview;
    }),

  /**
   * Submit a review answer and update SRS state
   */
  submitReview: protectedProcedure
    .input(
      z.object({
        userProgressId: z.string(),
        quality: z.number().min(0).max(5),
        timeSpentSeconds: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const userId = ctx.user.id;

      // Get current progress record
      const progressRecord = await db
        .select()
        .from(userProgress)
        .where(
          and(
            eq(userProgress.id, input.userProgressId),
            eq(userProgress.userId, userId)
          )
        )
        .then(rows => rows[0]);

      if (!progressRecord) {
        throw new Error("Progress record not found");
      }

      // Calculate new SRS state
      const currentState: srs.SRSState = {
        interval: progressRecord.interval,
        easeFactor: progressRecord.easeFactor,
        repetitions: progressRecord.repetitions,
        nextReviewAt: progressRecord.nextReviewAt,
      };

      const newState = srs.calculateNextReview(currentState, input.quality);
      const newStatus = srs.getWordStatus(newState);

      // Update progress record
      await db
        .update(userProgress)
        .set({
          interval: newState.interval,
          easeFactor: newState.easeFactor,
          repetitions: newState.repetitions,
          nextReviewAt: newState.nextReviewAt,
          status: newStatus,
          lastReviewedAt: new Date(),
          correctCount: input.quality >= 3 ? progressRecord.correctCount + 1 : progressRecord.correctCount,
          incorrectCount: input.quality < 3 ? progressRecord.incorrectCount + 1 : progressRecord.incorrectCount,
          updatedAt: new Date(),
        })
        .where(eq(userProgress.id, input.userProgressId));

      // Update user stats
      const masteryPercentage = srs.calculateMasteryPercentage(newState);

      // Return updated state
      return {
        success: true,
        newState,
        masteryPercentage,
        status: newStatus,
      };
    }),

  /**
   * Get daily missions for the user
   */
  getDailyMissions: protectedProcedure
    .query(async ({ ctx }) => {
      const userId = ctx.user.id;
      const missions = await adaptiveEngine.generateDailyMissions(userId);
      return missions;
    }),

  /**
   * Get adaptive recommendations
   */
  getAdaptiveRecommendations: protectedProcedure
    .query(async ({ ctx }) => {
      const userId = ctx.user.id;
      const recommendations = await adaptiveEngine.getAdaptiveRecommendations(userId);
      return recommendations;
    }),

  /**
   * Get user's learning profile
   */
  getUserLearningProfile: protectedProcedure
    .query(async ({ ctx }) => {
      const userId = ctx.user.id;
      const profile = await adaptiveEngine.getUserLearningProfile(userId);
      return profile;
    }),

  /**
   * Get learning analytics for the user
   */
  getLearningAnalytics: protectedProcedure
    .query(async ({ ctx }) => {
      const db = getDb();
      const userId = ctx.user.id;

      const analytics = await db
        .select()
        .from(learningAnalytics)
        .where(eq(learningAnalytics.userId, userId))
        .then(rows => rows[0]);

      if (!analytics) {
        // Create default analytics if not exists
        const newAnalytics = {
          id: uuidv4(),
          userId,
          avgPhrasesPerDay: 0,
          bestStudyTime: "morning",
          studyStreak: 0,
          longestStudyStreak: 0,
          optimalDailyLoad: 20,
          learningPace: "normal" as const,
          avgRetention: 0,
          weakCategories: JSON.stringify([]),
          strongCategories: JSON.stringify([]),
          lastAnalyzedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        await db.insert(learningAnalytics).values(newAnalytics);
        return newAnalytics;
      }

      return analytics;
    }),

  /**
   * Chat with the enhanced chatbot
   */
  chatWithBot: protectedProcedure
    .input(
      z.object({
        message: z.string(),
        topic: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;

      try {
        // Get user's learning profile for context
        const userProfile = await adaptiveEngine.getUserLearningProfile(userId);

        // Call the enhanced LLM with context
        const response = await llmIntegration.callLLMWithContext({
          userMessage: input.message,
          userProfile,
          systemPrompt: llmIntegration.generateDynamicSystemPrompt(
            userProfile,
            input.topic || "German vocabulary learning"
          ),
        });

        return {
          success: true,
          response: response.content,
          usage: response.usage,
        };
      } catch (error) {
        console.error("Error in chatbot:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }),

  /**
   * Get word explanation from LLM
   */
  getWordExplanation: publicProcedure
    .input(
      z.object({
        germanWord: z.string(),
        englishTranslation: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        const explanation = await llmIntegration.generateWordExplanation(
          input.germanWord,
          input.englishTranslation
        );

        return {
          success: true,
          explanation,
        };
      } catch (error) {
        console.error("Error generating explanation:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }),

  /**
   * Get conversation starter for practice
   */
  getConversationStarter: protectedProcedure
    .input(
      z.object({
        topic: z.string(),
        difficulty: z.enum(["easy", "intermediate", "hard"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const userProfile = await adaptiveEngine.getUserLearningProfile(ctx.user.id);

        const starter = await llmIntegration.generateConversationStarter(
          input.topic,
          input.difficulty,
          userProfile
        );

        return {
          success: true,
          starter,
        };
      } catch (error) {
        console.error("Error generating conversation starter:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }),

  /**
   * Evaluate a German response
   */
  evaluateResponse: protectedProcedure
    .input(
      z.object({
        userResponse: z.string(),
        expectedResponse: z.string(),
        context: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        const evaluation = await llmIntegration.evaluateGermanResponse(
          input.userResponse,
          input.expectedResponse,
          input.context
        );

        return {
          success: true,
          evaluation,
        };
      } catch (error) {
        console.error("Error evaluating response:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }),

  /**
   * Get grammar explanation
   */
  getGrammarExplanation: publicProcedure
    .input(
      z.object({
        topic: z.string(),
        difficulty: z.enum(["easy", "intermediate", "hard"]),
      })
    )
    .mutation(async ({ input }) => {
      try {
        const explanation = await llmIntegration.generateGrammarExplanation(
          input.topic,
          input.difficulty
        );

        return {
          success: true,
          explanation,
        };
      } catch (error) {
        console.error("Error generating grammar explanation:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }),

  /**
   * Get user progress summary
   */
  getProgressSummary: protectedProcedure
    .query(async ({ ctx }) => {
      const db = getDb();
      const userId = ctx.user.id;

      const stats = await db
        .select()
        .from(userStats)
        .where(eq(userStats.userId, userId))
        .then(rows => rows[0]);

      const wordProgress = await db
        .select({
          status: userProgress.status,
          count: sql<number>`COUNT(*)`,
        })
        .from(userProgress)
        .where(eq(userProgress.userId, userId))
        .groupBy(userProgress.status);

      return {
        stats,
        wordProgress,
      };
    }),

  /**
   * Adjust learning parameters based on performance
   */
  adjustLearningParameters: protectedProcedure
    .mutation(async ({ ctx }) => {
      const userId = ctx.user.id;
      await adaptiveEngine.adjustLearningParameters(userId);
      return { success: true };
    }),
});

