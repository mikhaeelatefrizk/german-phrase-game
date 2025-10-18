import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  id: varchar("id", { length: 64 }).primaryKey(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// Phrases table
export const phrases = mysqlTable("phrases", {
  id: varchar("id", { length: 64 }).primaryKey(),
  german: text("german").notNull(),
  english: text("english").notNull(),
  pronunciation: text("pronunciation").notNull(), // IPA pronunciation
  difficulty: mysqlEnum("difficulty", ["easy", "intermediate", "hard"]).default("intermediate").notNull(),
  category: varchar("category", { length: 64 }).default("general").notNull(),
  createdAt: timestamp("createdAt").defaultNow(),
});

export type Phrase = typeof phrases.$inferSelect;
export type InsertPhrase = typeof phrases.$inferInsert;

// User progress table - tracks which phrases the user has learned
export const userProgress = mysqlTable("userProgress", {
  id: varchar("id", { length: 64 }).primaryKey(),
  userId: varchar("userId", { length: 64 }).notNull(),
  phraseId: varchar("phraseId", { length: 64 }).notNull(),
  
  // Spaced repetition fields
  interval: int("interval").default(1).notNull(), // Days until next review
  easeFactor: int("easeFactor").default(2500).notNull(), // Ease factor * 1000 (2.5 default)
  repetitions: int("repetitions").default(0).notNull(), // Number of times reviewed
  
  // Performance tracking
  correctCount: int("correctCount").default(0).notNull(),
  incorrectCount: int("incorrectCount").default(0).notNull(),
  lastReviewedAt: timestamp("lastReviewedAt"),
  nextReviewAt: timestamp("nextReviewAt").defaultNow().notNull(),
  
  // Status
  status: mysqlEnum("status", ["new", "learning", "mastered"]).default("new").notNull(),
  
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
});

export type UserProgress = typeof userProgress.$inferSelect;
export type InsertUserProgress = typeof userProgress.$inferInsert;

// User statistics table - tracks overall learning progress
export const userStats = mysqlTable("userStats", {
  id: varchar("id", { length: 64 }).primaryKey(),
  userId: varchar("userId", { length: 64 }).notNull().unique(),
  
  // Learning metrics
  totalPhrasesLearned: int("totalPhrasesLearned").default(0).notNull(),
  totalPhrasesMastered: int("totalPhrasesMastered").default(0).notNull(),
  totalReviews: int("totalReviews").default(0).notNull(),
  correctReviews: int("correctReviews").default(0).notNull(),
  
  // Streak tracking
  currentStreak: int("currentStreak").default(0).notNull(),
  longestStreak: int("longestStreak").default(0).notNull(),
  lastActivityAt: timestamp("lastActivityAt"),
  
  // Gamification
  points: int("points").default(0).notNull(),
  level: int("level").default(1).notNull(),
  
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
});

export type UserStats = typeof userStats.$inferSelect;
export type InsertUserStats = typeof userStats.$inferInsert;

// Mistakes table - tracks common mistakes for targeted learning
export const mistakes = mysqlTable("mistakes", {
  id: varchar("id", { length: 64 }).primaryKey(),
  userId: varchar("userId", { length: 64 }).notNull(),
  phraseId: varchar("phraseId", { length: 64 }).notNull(),
  
  mistakeType: mysqlEnum("mistakeType", ["spelling", "grammar", "wrong_translation", "pronunciation", "other"]).notNull(),
  mistakeCount: int("mistakeCount").default(1).notNull(),
  userAnswer: text("userAnswer"),
  correctAnswer: text("correctAnswer"),
  
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
});

export type Mistake = typeof mistakes.$inferSelect;
export type InsertMistake = typeof mistakes.$inferInsert;

// Daily tasks table - tracks what user should study each day
export const dailyTasks = mysqlTable("dailyTasks", {
  id: varchar("id", { length: 64 }).primaryKey(),
  userId: varchar("userId", { length: 64 }).notNull(),
  phraseId: varchar("phraseId", { length: 64 }).notNull(),
  
  // Task scheduling
  scheduledDate: timestamp("scheduledDate").notNull(), // When this task is scheduled
  taskType: mysqlEnum("taskType", ["new", "review_1", "review_3", "review_10", "review_21", "review_50", "exam"]).notNull(),
  daysFromLearning: int("daysFromLearning").notNull(), // How many days since first learning
  
  // Task status
  status: mysqlEnum("status", ["pending", "completed", "skipped"]).default("pending").notNull(),
  completedAt: timestamp("completedAt"),
  
  // Performance
  isCorrect: int("isCorrect"), // null = not done, 1 = correct, 0 = incorrect
  timeSpentSeconds: int("timeSpentSeconds"),
  
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
});

export type DailyTask = typeof dailyTasks.$inferSelect;
export type InsertDailyTask = typeof dailyTasks.$inferInsert;

// Study sessions table - tracks user's study behavior
export const studySessions = mysqlTable("studySessions", {
  id: varchar("id", { length: 64 }).primaryKey(),
  userId: varchar("userId", { length: 64 }).notNull(),
  
  // Session details
  sessionDate: timestamp("sessionDate").notNull(),
  startTime: timestamp("startTime").notNull(),
  endTime: timestamp("endTime"),
  
  // Performance metrics
  phrasesStudied: int("phrasesStudied").default(0).notNull(),
  correctAnswers: int("correctAnswers").default(0).notNull(),
  incorrectAnswers: int("incorrectAnswers").default(0).notNull(),
  accuracy: int("accuracy").default(0).notNull(), // percentage
  
  // Streak tracking
  streakContinued: int("streakContinued").default(0).notNull(), // 1 = yes, 0 = no
  
  createdAt: timestamp("createdAt").defaultNow(),
});

export type StudySession = typeof studySessions.$inferSelect;
export type InsertStudySession = typeof studySessions.$inferInsert;

// Learning analytics table - tracks learning patterns
export const learningAnalytics = mysqlTable("learningAnalytics", {
  id: varchar("id", { length: 64 }).primaryKey(),
  userId: varchar("userId", { length: 64 }).notNull().unique(),
  
  // Daily statistics
  avgPhrasesPerDay: int("avgPhrasesPerDay").default(0).notNull(),
  bestStudyTime: varchar("bestStudyTime", { length: 20 }), // e.g., "morning", "afternoon"
  studyStreak: int("studyStreak").default(0).notNull(),
  longestStudyStreak: int("longestStudyStreak").default(0).notNull(),
  
  // Learning pace
  optimalDailyLoad: int("optimalDailyLoad").default(20).notNull(), // phrases per day
  learningPace: mysqlEnum("learningPace", ["slow", "normal", "fast"]).default("normal").notNull(),
  
  // Retention metrics
  avgRetention: int("avgRetention").default(0).notNull(), // percentage
  weakCategories: text("weakCategories"), // JSON array of categories
  strongCategories: text("strongCategories"), // JSON array of categories
  
  lastAnalyzedAt: timestamp("lastAnalyzedAt"),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
});

export type LearningAnalytics = typeof learningAnalytics.$inferSelect;
export type InsertLearningAnalytics = typeof learningAnalytics.$inferInsert;

// Tables defined above: phrases, userProgress, userStats, mistakes, dailyTasks, studySessions, learningAnalytics
