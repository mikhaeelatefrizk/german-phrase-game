import { getDb } from "./db";
import { phrases, userProgress, studySessions, learningAnalytics, mistakes } from "../drizzle/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { invokeLLM } from "./_core/llm";
import { TOTAL_PHRASES } from "../client/src/shared/const";
/**
 * Get comprehensive user context for AI chatbot with deep analytics
 */
export async function getUserContext(userId: string) {
  const db = await getDb();
  if (!db) return null;
  try {
    // Get detailed progress stats
    const progressStats = await db
      .select({
        totalLearned: sql<number>`COUNT(DISTINCT CASE WHEN ${userProgress.correctCount} > 0 THEN ${userProgress.phraseId} END)`,
        totalReviewed: sql<number>`COUNT(DISTINCT ${userProgress.phraseId})`,
        totalCorrect: sql<number>`SUM(${userProgress.correctCount})`,
        totalIncorrect: sql<number>`SUM(${userProgress.incorrectCount})`,
        avgAccuracy: sql<number>`ROUND(SUM(${userProgress.correctCount}) / (SUM(${userProgress.correctCount}) + SUM(${userProgress.incorrectCount})) * 100)`,
        avgEaseFactor: sql<number>`ROUND(AVG(${userProgress.easeFactor}))`,
        avgInterval: sql<number>`ROUND(AVG(${userProgress.interval}))`,
      })
      .from(userProgress)
      .where(eq(userProgress.userId, userId));
    // Get recent study sessions with details
    const recentSessions = await db
      .select()
      .from(studySessions)
      .where(eq(studySessions.userId, userId))
      .orderBy(desc(studySessions.sessionDate))
      .limit(30);
    // Get learning analytics
    const analytics = await db
      .select()
      .from(learningAnalytics)
      .where(eq(learningAnalytics.userId, userId))
      .limit(1);
    // Get common mistakes with detailed breakdown
    const commonMistakes = await db
      .select({
        mistakeType: mistakes.mistakeType,
        count: sql<number>`COUNT(*)`,
        percentage: sql<number>`ROUND(COUNT(*) / (SELECT COUNT(*) FROM ${mistakes} WHERE ${eq(mistakes.userId, userId)}) * 100)`,
      })
      .from(mistakes)
      .where(eq(mistakes.userId, userId))
      .groupBy(mistakes.mistakeType)
      .orderBy(desc(sql<number>`COUNT(*)`))
      .limit(10);
    // Get phrases user is struggling with (more than 50% incorrect)
    const strugglingPhrases = await db
      .select({
        phrase: phrases,
        progress: userProgress,
        errorRate: sql<number>`ROUND(${userProgress.incorrectCount} / (${userProgress.correctCount} + ${userProgress.incorrectCount}) * 100)`,
      })
      .from(userProgress)
      .innerJoin(phrases, eq(userProgress.phraseId, phrases.id))
      .where(
        and(
          eq(userProgress.userId, userId),
          sql`${userProgress.incorrectCount} > ${userProgress.correctCount}`
        )
      )
      .orderBy(desc(userProgress.incorrectCount))
      .limit(10);
    // Get mastered phrases (5+ repetitions with high accuracy)
    const masteredCount = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(userProgress)
      .where(
        and(
          eq(userProgress.userId, userId),
          sql`${userProgress.repetitions} >= 5 AND ${userProgress.correctCount} > ${userProgress.incorrectCount}`
        )
      );
    // Get learning categories performance
    const categoryPerformance = await db
      .select({
        category: phrases.category,
        learned: sql<number>`COUNT(DISTINCT CASE WHEN ${userProgress.correctCount} > 0 THEN ${userProgress.phraseId} END)`,
        total: sql<number>`COUNT(DISTINCT ${userProgress.phraseId})`,
        accuracy: sql<number>`ROUND(SUM(${userProgress.correctCount}) / (SUM(${userProgress.correctCount}) + SUM(${userProgress.incorrectCount})) * 100)`,
      })
      .from(userProgress)
      .innerJoin(phrases, eq(userProgress.phraseId, phrases.id))
      .where(eq(userProgress.userId, userId))
      .groupBy(phrases.category)
      .orderBy(desc(sql<number>`COUNT(DISTINCT ${userProgress.phraseId})`));
    // Calculate study consistency
    const studyDaysCount = await db
      .select({ count: sql<number>`COUNT(DISTINCT DATE(${studySessions.sessionDate}))` })
      .from(studySessions)
      .where(eq(studySessions.userId, userId));
    const stats = progressStats[0] || {
      totalLearned: 0,
      totalReviewed: 0,
      totalCorrect: 0,
      totalIncorrect: 0,
      avgAccuracy: 0,
      avgEaseFactor: 2500,
      avgInterval: 1,
    };
    return {
      stats,
      recentSessions,
      analytics: analytics[0] || null,
      commonMistakes,
      strugglingPhrases,
      masteredCount: masteredCount[0]?.count || 0,
      totalPhrases: 4000,
      categoryPerformance,
      studyDaysCount: studyDaysCount[0]?.count || 0,
      totalSessions: recentSessions.length,
    };
  } catch (error) {
    console.error("[Chatbot] Error getting user context:", error);
    return null;
  }
}
/**
 * Get phrase details for chatbot explanation
 */
export async function getPhraseDetails(phraseId: string, userId: string) {
  const db = await getDb();
  if (!db) return null;
  try {
    const phraseData = await db
      .select()
      .from(phrases)
      .where(eq(phrases.id, phraseId))
      .limit(1);
    if (phraseData.length === 0) return null;
    const phrase = phraseData[0];
    // Get user's progress on this phrase
    const userProgressData = await db
      .select()
      .from(userProgress)
      .where(
        and(
          eq(userProgress.userId, userId),
          eq(userProgress.phraseId, phraseId)
        )
      )
      .limit(1);
    // Get similar phrases in same category
    const similarPhrases = await db
      .select()
      .from(phrases)
      .where(
        and(
          eq(phrases.category, phrase.category),
          sql`${phrases.id} != ${phraseId}`
        )
      )
      .limit(3);
    return {
      phrase,
      userProgress: userProgressData[0] || null,
      similarPhrases,
    };
  } catch (error) {
    console.error("[Chatbot] Error getting phrase details:", error);
    return null;
  }
}
/**
 * Calculate estimated completion time with detailed breakdown
 */
export function calculateCompletionTime(context: any): {
  estimate: string;
  daysRemaining: number;
  phrasesRemaining: number;
  dailyPace: number;
} {
  if (!context) {
    return {
      estimate: "Unable to calculate",
      daysRemaining: 0,
      phrasesRemaining: TOTAL_PHRASES,
      dailyPace: 0,
    };
  }
  const { stats, analytics } = context;

  const phrasesLearned = stats.totalLearned || 0;
  const totalPhrases = TOTAL_PHRASES;
  const phrasesRemaining = totalPhrases - phrasesLearned;
  const avgPhrasesPerDay = analytics?.avgPhrasesPerDay || (stats.totalLearned > 0 && context.studyDaysCount > 0 ? Math.round(stats.totalLearned / context.studyDaysCount) : 20);
  if (avgPhrasesPerDay === 0) {
    return {
      estimate: "Start learning to get an estimate!",
      daysRemaining: 0,
      phrasesRemaining,
      dailyPace: 0,
    };
  }
  const daysRemaining = Math.ceil(phrasesRemaining / avgPhrasesPerDay);
  const weeksRemaining = Math.ceil(daysRemaining / 7);
  const monthsRemaining = Math.ceil(daysRemaining / 30);
  let estimate = "";
  if (daysRemaining < 7) {
    estimate = `${daysRemaining} days`;
  } else if (daysRemaining < 30) {
    estimate = `${weeksRemaining} weeks`;
  } else {
    estimate = `${monthsRemaining} months`;
  }
  return {
    estimate,
    daysRemaining,
    phrasesRemaining,
    dailyPace: avgPhrasesPerDay,
  };
}
/**
 * Generate advanced AI chatbot response with full context and natural language
 */
export async function generateChatbotResponse(
  userId: string,
  userMessage: string,
  phraseId?: string
): Promise<string> {
  try {
    // Get comprehensive user context
    const context = await getUserContext(userId);
    if (!context) {
      return "I'm unable to access your learning data right now. Please try again in a moment.";
    }
    // Get phrase details if provided
    let phraseContext = "";
    if (phraseId) {
      const phraseData = await getPhraseDetails(phraseId, userId);
      if (phraseData) {
        phraseContext = `
CURRENT PHRASE BEING STUDIED:
- German: "${phraseData.phrase.german}"
- English: "${phraseData.phrase.english}"
- Pronunciation: ${phraseData.phrase.pronunciation}
- Category: ${phraseData.phrase.category}
- User's performance: ${phraseData.userProgress?.correctCount || 0} correct, ${phraseData.userProgress?.incorrectCount || 0} incorrect
- Difficulty level: ${phraseData.userProgress?.repetitions || 0} reviews completed
SIMILAR PHRASES IN THIS CATEGORY:
${phraseData.similarPhrases.map((p: any) => `- "${p.german}" → "${p.english}"`).join("\n")}
`;
      }
    }
    // Calculate completion time
    const completionData = calculateCompletionTime(context);
    // Build detailed system prompt with personality
    const systemPrompt = `You are an exceptionally skilled, empathetic, and highly intelligent German B1 language tutor and learning coach. Your primary goal is to provide personalized, accurate, and natural conversational responses that enhance the student's learning experience. You have complete, detailed access to the student's learning journey and performance data, and you are expected to leverage this information extensively to provide insightful, actionable, and motivating guidance. Your responses should be proactive, anticipate student needs, and demonstrate a deep understanding of German grammar and learning psychology.
=== STUDENT'S COMPREHENSIVE LEARNING PROFILE ===
OVERALL PROGRESS:
- Phrases mastered: ${context.stats.totalLearned} / ${TOTAL_PHRASES} (${Math.round((context.stats.totalLearned / TOTAL_PHRASES) * 100)}%)
- Phrases reviewed: ${context.stats.totalReviewed}
- Total correct answers: ${context.stats.totalCorrect}
- Total incorrect answers: ${context.stats.totalIncorrect}
- Overall accuracy rate: ${context.stats.avgAccuracy}%
- Phrases fully mastered (5+ reviews): ${context.masteredCount}
LEARNING VELOCITY & PACE:
- Daily learning pace: ${context.analytics?.avgPhrasesPerDay || 20} phrases/day
- Study consistency: ${context.studyDaysCount} days of study
- Total study sessions: ${context.totalSessions}
- Learning pace classification: ${context.analytics?.learningPace || "steady"}
- Estimated completion: ${completionData.estimate} (${completionData.phrasesRemaining} phrases remaining)
SPACED REPETITION METRICS:
- Average ease factor: ${context.stats.avgEaseFactor / 1000}
- Average review interval: ${context.stats.avgInterval} days
- SM-2 algorithm status: Actively optimizing retention
PERFORMANCE BY CATEGORY:
${context.categoryPerformance.map((cat: any) => `- ${cat.category}: ${cat.learned}/${cat.total} learned (${cat.accuracy}% accuracy)`).join("\n")}
COMMON MISTAKE PATTERNS:
${context.commonMistakes.map((m: any) => `- ${m.mistakeType}: ${m.count} occurrences (${m.percentage}% of all mistakes)`).join("\n")}
TOP 5 STRUGGLING PHRASES (Priority for improvement):
${context.strugglingPhrases.slice(0, 5).map((p: any) => `- "${p.phrase.german}" (Error rate: ${p.errorRate}%)`).join("\n")}
${phraseContext}
=== YOUR ROLE & RESPONSIBILITIES ===
Your core responsibilities are to:
1. Provide **Advanced Context Awareness**: Understand and utilize all provided learning data (progress, mistakes, pace, etc.) to give highly relevant and personalized advice.
2. Engage in **Natural Language Processing for Conversational Responses**: Maintain a natural, fluid, and human-like conversation style. Understand nuances in user queries and respond empathetically and intelligently.
3. Perform **Intelligent Analysis of Learning Patterns**: Identify trends, strengths, and weaknesses in the student's data. Offer predictive insights and suggest optimal learning paths.
4. Demonstrate **Grammar Expertise with Detailed Explanations**: Break down complex German grammar concepts (cases, verb tenses, sentence structure, idioms) with clarity, using examples directly relevant to the student's phrases and progress.
5. Offer **Personalized Recommendations**: Suggest specific phrases to review, learning techniques, or areas of focus based on their individual performance and goals.
6. Adapt in **Real-time from Conversation History**: Remember previous interactions and build upon them, ensuring continuity and a personalized learning journey.
7. Provide **Motivational Support and Gamification Integration**: Encourage the student, celebrate their progress, and subtly integrate gamification elements (e.g., streaks, mastery levels) into your advice to keep them engaged.
8. Answer questions about the application's functionality, spaced repetition algorithm, and learning methodology.

=== COMMUNICATION STYLE ===
Always maintain a persona that is:
- **Highly Intelligent & Knowledgeable**: Demonstrate profound expertise in German language, grammar, and effective learning strategies.
- **Empathetic & Supportive**: Show genuine understanding and encouragement, especially when students face difficulties.
- **Proactive & Insightful**: Offer guidance and observations before being explicitly asked, based on your analysis of their data.
- **Clear, Concise, and Thorough**: Explain complex topics simply but comprehensively, avoiding jargon where possible.
- **Natural & Conversational**: Engage in dialogue that feels human, not robotic or script-driven.
- **Action-Oriented**: Provide concrete, actionable advice and next steps.
When responding, ensure you:
- **Reference specific data points** from their learning profile to justify your recommendations or observations.
- **Use examples** from their own studied phrases or common B1 scenarios.
- **Break down complex German phrases** or grammar points into understandable components.
- **Offer alternative ways** to phrase things in German or explain cultural nuances.
- **Encourage self-reflection** on their learning process.
- **Celebrate even small victories** to boost motivation.
- **Avoid generic responses**; every interaction should feel tailored.
- **If asked about the app's features**, explain them clearly and concisely, referring to the spaced repetition, daily tasks, or other functionalities.


`;
    // Call Claude API with advanced settings
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: userMessage,
        },
      ],
    });
    // Extract and return response
    console.log("[Chatbot] LLM Response:", JSON.stringify(response, null, 2));
    const textContent = response.choices[0]?.message?.content;
    if (typeof textContent === "string") {
      return textContent;
    }
    return "I'm having trouble generating a response. Please try again.";
  } catch (error) {
    console.error("[Chatbot] Error generating response:", error);
    return "I encountered an error processing your request. Please try again in a moment.";
  }
}
/**
 * Get advanced grammar explanation for a phrase
 */
export async function getGrammarExplanation(phraseId: string): Promise<string> {
  const db = await getDb();
  if (!db) return "Unable to fetch phrase details";
  try {
    const phraseData = await db
      .select()
      .from(phrases)
      .where(eq(phrases.id, phraseId))
      .limit(1);
    if (phraseData.length === 0) return "Phrase not found";
    const phrase = phraseData[0];
    // Use Claude to generate detailed grammar explanation
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are an expert German grammar instructor. Provide detailed, clear explanations of German grammar for B1 level students. Break down phrases word-by-word, explaining:
1. Each word's grammatical function
2. Case, gender, and number (for nouns and articles)
3. Verb tense and conjugation
4. Sentence structure and word order
5. Any special grammar rules or exceptions
6. Common usage patterns
Be thorough but clear, using examples when helpful.`,
        },
        {
          role: "user",
          content: `Provide a detailed grammar explanation for this German phrase:
German: "${phrase.german}"
English: "${phrase.english}"
Pronunciation: ${phrase.pronunciation}
Explain each word, the grammar rules applied, and why this phrase is structured this way.`,
        },
      ],
    });
    const textContent = response.choices[0]?.message?.content;
    if (typeof textContent === "string") {
      return textContent;
    }
    return "Unable to generate grammar explanation";
  } catch (error) {
    console.error("[Chatbot] Error generating grammar explanation:", error);
    return "I encountered an error generating the grammar explanation. Please try again.";
  }
}
