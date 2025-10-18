/**
 * Adaptive Learning Engine
 * 
 * Orchestrates personalized learning experiences by:
 * 1. Analyzing user performance and learning patterns
 * 2. Generating adaptive daily missions
 * 3. Adjusting learning algorithms based on user interaction
 * 4. Recommending optimal learning pace and content
 */

import { getDb } from "../db";
import { userProgress, learningAnalytics, phrases } from "../../drizzle/schema";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import { shouldReviewToday, calculateMasteryPercentage } from "./srs";

export interface DailyMission {
  type: "new_words" | "review_words" | "practice_conversation" | "grammar_focus";
  targetCount: number;
  difficulty: "easy" | "intermediate" | "hard";
  description: string;
  estimatedMinutes: number;
}

export interface UserLearningProfile {
  userId: string;
  totalWordsMastered: number;
  totalWordsLearning: number;
  averageAccuracy: number;
  optimalDailyLoad: number;
  learningPace: "slow" | "normal" | "fast";
  preferredStudyTime: string;
  weakCategories: string[];
  strongCategories: string[];
}

export interface AdaptiveRecommendation {
  missions: DailyMission[];
  estimatedTotalMinutes: number;
  motivationalMessage: string;
  focusAreas: string[];
}

/**
 * Generate personalized daily missions based on user performance
 * 
 * @param userId User ID
 * @returns Array of daily missions
 */
export async function generateDailyMissions(userId: string): Promise<DailyMission[]> {
  const db = getDb();
  
  // Get user's learning profile
  const profile = await getUserLearningProfile(userId);
  
  // Get words due for review
  const wordsForReview = await db
    .select()
    .from(userProgress)
    .where(
      and(
        eq(userProgress.userId, userId),
        lte(userProgress.nextReviewAt, new Date())
      )
    );

  // Get words currently being learned
  const wordsLearning = await db
    .select()
    .from(userProgress)
    .where(
      and(
        eq(userProgress.userId, userId),
        eq(userProgress.status, "learning")
      )
    )
    .limit(5);

  const missions: DailyMission[] = [];

  // Mission 1: Review words due today
  if (wordsForReview.length > 0) {
    missions.push({
      type: "review_words",
      targetCount: Math.min(wordsForReview.length, profile.optimalDailyLoad * 0.6),
      difficulty: "intermediate",
      description: `Review ${Math.min(wordsForReview.length, profile.optimalDailyLoad * 0.6)} words scheduled for today`,
      estimatedMinutes: Math.min(wordsForReview.length, profile.optimalDailyLoad * 0.6) * 2,
    });
  }

  // Mission 2: Learn new words (if not overloaded)
  const newWordsCount = Math.max(
    1,
    Math.floor(profile.optimalDailyLoad * 0.3)
  );
  
  missions.push({
    type: "new_words",
    targetCount: newWordsCount,
    difficulty: profile.learningPace === "fast" ? "hard" : "intermediate",
    description: `Learn ${newWordsCount} new German words`,
    estimatedMinutes: newWordsCount * 3,
  });

  // Mission 3: Conversational practice (if user is making good progress)
  if (profile.averageAccuracy > 70) {
    missions.push({
      type: "practice_conversation",
      targetCount: 1,
      difficulty: "intermediate",
      description: "Practice conversational German with the chatbot",
      estimatedMinutes: 10,
    });
  }

  // Mission 4: Focus on weak categories
  if (profile.weakCategories.length > 0) {
    missions.push({
      type: "grammar_focus",
      targetCount: 5,
      difficulty: "hard",
      description: `Focus on ${profile.weakCategories[0]} - your weakest area`,
      estimatedMinutes: 8,
    });
  }

  return missions;
}

/**
 * Get user's learning profile
 * 
 * @param userId User ID
 * @returns User learning profile
 */
export async function getUserLearningProfile(userId: string): Promise<UserLearningProfile> {
  const db = getDb();
  
  // Get learning analytics
  const analytics = await db
    .select()
    .from(learningAnalytics)
    .where(eq(learningAnalytics.userId, userId))
    .then(rows => rows[0]);

  // Get word statistics
  const wordStats = await db
    .select({
      status: userProgress.status,
      count: sql<number>`COUNT(*)`,
      avgAccuracy: sql<number>`AVG(CASE WHEN ${userProgress.correctCount} + ${userProgress.incorrectCount} > 0 THEN (${userProgress.correctCount} * 100) / (${userProgress.correctCount} + ${userProgress.incorrectCount}) ELSE 0 END)`,
    })
    .from(userProgress)
    .where(eq(userProgress.userId, userId))
    .groupBy(userProgress.status);

  const masteredWords = wordStats.find(w => w.status === "mastered")?.count || 0;
  const learningWords = wordStats.find(w => w.status === "learning")?.count || 0;
  const avgAccuracy = wordStats[0]?.avgAccuracy || 0;

  // Parse weak and strong categories from analytics
  const weakCategories = analytics?.weakCategories 
    ? JSON.parse(analytics.weakCategories) 
    : [];
  const strongCategories = analytics?.strongCategories 
    ? JSON.parse(analytics.strongCategories) 
    : [];

  return {
    userId,
    totalWordsMastered: masteredWords,
    totalWordsLearning: learningWords,
    averageAccuracy: avgAccuracy,
    optimalDailyLoad: analytics?.optimalDailyLoad || 20,
    learningPace: analytics?.learningPace || "normal",
    preferredStudyTime: analytics?.bestStudyTime || "morning",
    weakCategories,
    strongCategories,
  };
}

/**
 * Adjust learning parameters based on user performance
 * Called periodically (e.g., weekly) to optimize learning
 * 
 * @param userId User ID
 */
export async function adjustLearningParameters(userId: string): Promise<void> {
  const db = getDb();
  
  // Get recent study sessions (last 7 days)
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  // Get user's current performance
  const recentPerformance = await db
    .select({
      totalReviews: sql<number>`COUNT(*)`,
      correctReviews: sql<number>`SUM(CASE WHEN ${userProgress.correctCount} > 0 THEN 1 ELSE 0 END)`,
    })
    .from(userProgress)
    .where(
      and(
        eq(userProgress.userId, userId),
        gte(userProgress.lastReviewedAt, sevenDaysAgo)
      )
    );

  const performance = recentPerformance[0];
  const accuracy = performance?.totalReviews > 0 
    ? (performance.correctReviews / performance.totalReviews) * 100 
    : 0;

  // Adjust learning pace based on accuracy
  let newLearningPace: "slow" | "normal" | "fast" = "normal";
  let newOptimalDailyLoad = 20;

  if (accuracy > 85) {
    newLearningPace = "fast";
    newOptimalDailyLoad = 30;
  } else if (accuracy < 60) {
    newLearningPace = "slow";
    newOptimalDailyLoad = 10;
  }

  // Update learning analytics
  await db
    .update(learningAnalytics)
    .set({
      learningPace: newLearningPace,
      optimalDailyLoad: newOptimalDailyLoad,
      avgRetention: Math.round(accuracy),
      lastAnalyzedAt: new Date(),
    })
    .where(eq(learningAnalytics.userId, userId));
}

/**
 * Generate adaptive recommendations for the user
 * 
 * @param userId User ID
 * @returns Adaptive recommendations
 */
export async function getAdaptiveRecommendations(userId: string): Promise<AdaptiveRecommendation> {
  const missions = await generateDailyMissions(userId);
  const profile = await getUserLearningProfile(userId);

  const totalMinutes = missions.reduce((sum, m) => sum + m.estimatedMinutes, 0);
  
  let motivationalMessage = "";
  if (profile.totalWordsMastered > 100) {
    motivationalMessage = `Great progress! You've mastered ${profile.totalWordsMastered} words. Keep it up!`;
  } else if (profile.totalWordsMastered > 50) {
    motivationalMessage = `You're doing well! ${profile.totalWordsMastered} words mastered. Let's reach 100!`;
  } else if (profile.totalWordsMastered > 10) {
    motivationalMessage = `Good start! ${profile.totalWordsMastered} words learned. Consistency is key!`;
  } else {
    motivationalMessage = "Welcome to your German learning journey! Start with today's missions.";
  }

  return {
    missions,
    estimatedTotalMinutes: totalMinutes,
    motivationalMessage,
    focusAreas: profile.weakCategories.slice(0, 3),
  };
}

/**
 * Calculate optimal daily load based on user's learning pace
 * 
 * @param learningPace User's learning pace
 * @returns Optimal number of words per day
 */
export function calculateOptimalDailyLoad(learningPace: "slow" | "normal" | "fast"): number {
  switch (learningPace) {
    case "slow":
      return 10;
    case "normal":
      return 20;
    case "fast":
      return 30;
    default:
      return 20;
  }
}

/**
 * Identify weak and strong categories based on user performance
 * 
 * @param userId User ID
 * @returns Object with weak and strong categories
 */
export async function identifyWeakAndStrongCategories(
  userId: string
): Promise<{ weak: string[]; strong: string[] }> {
  const db = getDb();

  const categoryStats = await db
    .select({
      category: phrases.category,
      avgAccuracy: sql<number>`AVG(CASE WHEN ${userProgress.correctCount} + ${userProgress.incorrectCount} > 0 THEN (${userProgress.correctCount} * 100) / (${userProgress.correctCount} + ${userProgress.incorrectCount}) ELSE 0 END)`,
    })
    .from(userProgress)
    .innerJoin(phrases, eq(userProgress.phraseId, phrases.id))
    .where(eq(userProgress.userId, userId))
    .groupBy(phrases.category)
    .orderBy(sql`avgAccuracy DESC`);

  const weak = categoryStats
    .filter(c => c.avgAccuracy < 60)
    .map(c => c.category)
    .slice(0, 3);

  const strong = categoryStats
    .filter(c => c.avgAccuracy > 80)
    .map(c => c.category)
    .slice(0, 3);

  return { weak, strong };
}

