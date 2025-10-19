// server/_core/index.ts
import "dotenv/config";
import express2 from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";

// server/_core/systemRouter.ts
import { z } from "zod";

// server/_core/notification.ts
import { TRPCError } from "@trpc/server";

// server/_core/env.ts
var ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.ANTHROPIC_API_KEY ?? ""
};

// server/_core/notification.ts
var TITLE_MAX_LENGTH = 1200;
var CONTENT_MAX_LENGTH = 2e4;
var trimValue = (value) => value.trim();
var isNonEmptyString = (value) => typeof value === "string" && value.trim().length > 0;
var buildEndpointUrl = (baseUrl) => {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(
    "webdevtoken.v1.WebDevService/SendNotification",
    normalizedBase
  ).toString();
};
var validatePayload = (input) => {
  if (!isNonEmptyString(input.title)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification title is required."
    });
  }
  if (!isNonEmptyString(input.content)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification content is required."
    });
  }
  const title = trimValue(input.title);
  const content = trimValue(input.content);
  if (title.length > TITLE_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification title must be at most ${TITLE_MAX_LENGTH} characters.`
    });
  }
  if (content.length > CONTENT_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification content must be at most ${CONTENT_MAX_LENGTH} characters.`
    });
  }
  return { title, content };
};
async function notifyOwner(payload) {
  const { title, content } = validatePayload(payload);
  if (!ENV.forgeApiUrl) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service URL is not configured."
    });
  }
  if (!ENV.forgeApiKey) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service API key is not configured."
    });
  }
  const endpoint = buildEndpointUrl(ENV.forgeApiUrl);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${ENV.forgeApiKey}`,
        "content-type": "application/json",
        "connect-protocol-version": "1"
      },
      body: JSON.stringify({ title, content })
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(
        `[Notification] Failed to notify owner (${response.status} ${response.statusText})${detail ? `: ${detail}` : ""}`
      );
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[Notification] Error calling notification service:", error);
    return false;
  }
}

// client/src/shared/const.ts
var ONE_YEAR_MS = 1e3 * 60 * 60 * 24 * 365;
var UNAUTHED_ERR_MSG = "Please login (10001)";
var NOT_ADMIN_ERR_MSG = "You do not have required permission (10002)";
var TOTAL_PHRASES = 4e3;

// server/_core/trpc.ts
import { initTRPC, TRPCError as TRPCError2 } from "@trpc/server";
import superjson from "superjson";
var t = initTRPC.context().create({
  transformer: superjson
});
var router = t.router;
var publicProcedure = t.procedure;
var requireUser = t.middleware(async (opts) => {
  const { ctx, next } = opts;
  if (!ctx.user) {
    throw new TRPCError2({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user
    }
  });
});
var protectedProcedure = t.procedure.use(requireUser);
var adminProcedure = t.procedure.use(
  t.middleware(async (opts) => {
    const { ctx, next } = opts;
    if (!ctx.user || ctx.user.role !== "admin") {
      throw new TRPCError2({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    return next({
      ctx: {
        ...ctx,
        user: ctx.user
      }
    });
  })
);

// server/_core/systemRouter.ts
var systemRouter = router({
  health: publicProcedure.input(
    z.object({
      timestamp: z.number().min(0, "timestamp cannot be negative")
    })
  ).query(() => ({
    ok: true
  })),
  notifyOwner: adminProcedure.input(
    z.object({
      title: z.string().min(1, "title is required"),
      content: z.string().min(1, "content is required")
    })
  ).mutation(async ({ input }) => {
    const delivered = await notifyOwner(input);
    return {
      success: delivered
    };
  })
});

// server/routers.ts
import { z as z4 } from "zod";

// server/db.ts
import { eq, and, lte, sql, desc, asc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";

// drizzle/schema.ts
import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";
var users = mysqlTable("users", {
  id: varchar("id", { length: 64 }).primaryKey(),
  name: text("name"),
  email: varchar("email", { length: 320 }).unique().notNull(),
  passwordHash: varchar("passwordHash", { length: 255 }),
  salt: varchar("salt", { length: 255 }),
  loginMethod: varchar("loginMethod", { length: 64 }).default("email/password").notNull(),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow()
});
var phrases = mysqlTable("phrases", {
  id: varchar("id", { length: 64 }).primaryKey(),
  german: text("german").notNull(),
  english: text("english").notNull(),
  pronunciation: text("pronunciation").notNull(),
  // IPA pronunciation
  difficulty: mysqlEnum("difficulty", ["easy", "intermediate", "hard"]).default("intermediate").notNull(),
  category: varchar("category", { length: 64 }).default("general").notNull(),
  createdAt: timestamp("createdAt").defaultNow()
});
var userProgress = mysqlTable("userProgress", {
  id: varchar("id", { length: 64 }).primaryKey(),
  userId: varchar("userId", { length: 64 }).notNull(),
  phraseId: varchar("phraseId", { length: 64 }).notNull(),
  // Spaced repetition fields
  interval: int("interval").default(1).notNull(),
  // Days until next review
  easeFactor: int("easeFactor").default(2500).notNull(),
  // Ease factor * 1000 (2.5 default)
  repetitions: int("repetitions").default(0).notNull(),
  // Number of times reviewed
  // Performance tracking
  correctCount: int("correctCount").default(0).notNull(),
  incorrectCount: int("incorrectCount").default(0).notNull(),
  lastReviewedAt: timestamp("lastReviewedAt"),
  nextReviewAt: timestamp("nextReviewAt").defaultNow().notNull(),
  // Status
  status: mysqlEnum("status", ["new", "learning", "mastered"]).default("new").notNull(),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow()
});
var userStats = mysqlTable("userStats", {
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
  updatedAt: timestamp("updatedAt").defaultNow()
});
var mistakes = mysqlTable("mistakes", {
  id: varchar("id", { length: 64 }).primaryKey(),
  userId: varchar("userId", { length: 64 }).notNull(),
  phraseId: varchar("phraseId", { length: 64 }).notNull(),
  mistakeType: mysqlEnum("mistakeType", ["spelling", "grammar", "wrong_translation", "pronunciation", "other"]).notNull(),
  mistakeCount: int("mistakeCount").default(1).notNull(),
  userAnswer: text("userAnswer"),
  correctAnswer: text("correctAnswer"),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow()
});
var dailyTasks = mysqlTable("dailyTasks", {
  id: varchar("id", { length: 64 }).primaryKey(),
  userId: varchar("userId", { length: 64 }).notNull(),
  phraseId: varchar("phraseId", { length: 64 }).notNull(),
  // Task scheduling
  scheduledDate: timestamp("scheduledDate").notNull(),
  // When this task is scheduled
  taskType: mysqlEnum("taskType", ["new", "review_1", "review_3", "review_10", "review_21", "review_50", "exam"]).notNull(),
  daysFromLearning: int("daysFromLearning").notNull(),
  // How many days since first learning
  // Task status
  status: mysqlEnum("status", ["pending", "completed", "skipped"]).default("pending").notNull(),
  completedAt: timestamp("completedAt"),
  // Performance
  isCorrect: int("isCorrect"),
  // null = not done, 1 = correct, 0 = incorrect
  timeSpentSeconds: int("timeSpentSeconds"),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow()
});
var studySessions = mysqlTable("studySessions", {
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
  accuracy: int("accuracy").default(0).notNull(),
  // percentage
  // Streak tracking
  streakContinued: int("streakContinued").default(0).notNull(),
  // 1 = yes, 0 = no
  createdAt: timestamp("createdAt").defaultNow()
});
var learningAnalytics = mysqlTable("learningAnalytics", {
  id: varchar("id", { length: 64 }).primaryKey(),
  userId: varchar("userId", { length: 64 }).notNull().unique(),
  // Daily statistics
  avgPhrasesPerDay: int("avgPhrasesPerDay").default(0).notNull(),
  bestStudyTime: varchar("bestStudyTime", { length: 20 }),
  // e.g., "morning", "afternoon"
  studyStreak: int("studyStreak").default(0).notNull(),
  longestStudyStreak: int("longestStudyStreak").default(0).notNull(),
  // Learning pace
  optimalDailyLoad: int("optimalDailyLoad").default(20).notNull(),
  // phrases per day
  learningPace: mysqlEnum("learningPace", ["slow", "normal", "fast"]).default("normal").notNull(),
  // Retention metrics
  avgRetention: int("avgRetention").default(0).notNull(),
  // percentage
  weakCategories: text("weakCategories"),
  // JSON array of categories
  strongCategories: text("strongCategories"),
  // JSON array of categories
  lastAnalyzedAt: timestamp("lastAnalyzedAt"),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow()
});

// server/db.ts
var _db = null;
async function getDb() {
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
async function getUser(id) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return void 0;
  }
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result.length > 0 ? result[0] : void 0;
}

// server/routers.ts
import { eq as eq7, and as and6, lt, desc as desc4, sql as sql6 } from "drizzle-orm";

// server/taskScheduler.ts
import { eq as eq2, and as and2, gte as gte2, lte as lte2, sql as sql2 } from "drizzle-orm";
async function initializeDailyTasks(userId, dailyLoad = 20) {
  const db = await getDb();
  if (!db) return;
  try {
    const unlearned = await db.select({ id: phrases.id }).from(phrases).leftJoin(userProgress, eq2(phrases.id, userProgress.phraseId)).where(
      and2(
        sql2`${userProgress.id} IS NULL OR ${userProgress.userId} != ${userId}`
      )
    ).orderBy(sql2`RAND()`).limit(dailyLoad);
    if (unlearned.length === 0) return;
    const today = /* @__PURE__ */ new Date();
    today.setHours(0, 0, 0, 0);
    const tasksToCreate = unlearned.map((item, index) => ({
      id: `task_${userId}_${Date.now()}_${index}`,
      userId,
      phraseId: item.id,
      scheduledDate: today,
      taskType: "new",
      daysFromLearning: 0,
      status: "pending"
    }));
    await db.insert(dailyTasks).values(tasksToCreate);
  } catch (error) {
    console.error("[TaskScheduler] Error initializing daily tasks:", error);
  }
}
async function getTodaysTasks(userId) {
  const db = await getDb();
  if (!db) return [];
  try {
    const today = /* @__PURE__ */ new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tasks = await db.select({
      task: dailyTasks,
      phrase: phrases
    }).from(dailyTasks).innerJoin(phrases, eq2(dailyTasks.phraseId, phrases.id)).where(
      and2(
        eq2(dailyTasks.userId, userId),
        gte2(dailyTasks.scheduledDate, today),
        lte2(dailyTasks.scheduledDate, tomorrow)
      )
    ).orderBy(dailyTasks.taskType);
    return tasks;
  } catch (error) {
    console.error("[TaskScheduler] Error getting today's tasks:", error);
    return [];
  }
}
async function completeDailyTask(userId, taskId, phraseId, isCorrect, timeSpentSeconds) {
  const db = await getDb();
  if (!db) return;
  try {
    const now = /* @__PURE__ */ new Date();
    await db.update(dailyTasks).set({
      status: "completed",
      completedAt: now,
      isCorrect: isCorrect ? 1 : 0,
      timeSpentSeconds,
      updatedAt: now
    }).where(eq2(dailyTasks.id, taskId));
    const progress = await db.select().from(userProgress).where(
      and2(
        eq2(userProgress.userId, userId),
        eq2(userProgress.phraseId, phraseId)
      )
    ).limit(1);
    if (progress.length === 0) {
      await db.insert(userProgress).values({
        id: `progress_${userId}_${phraseId}_${Date.now()}`,
        userId,
        phraseId,
        correctCount: isCorrect ? 1 : 0,
        incorrectCount: isCorrect ? 0 : 1,
        status: "learning",
        nextReviewAt: new Date(now.getTime() + 1 * 24 * 60 * 60 * 1e3)
        // 1 day
      });
    } else {
      const p = progress[0];
      await db.update(userProgress).set({
        correctCount: p.correctCount + (isCorrect ? 1 : 0),
        incorrectCount: p.incorrectCount + (isCorrect ? 0 : 1),
        repetitions: p.repetitions + 1,
        lastReviewedAt: now,
        updatedAt: now
      }).where(eq2(userProgress.id, p.id));
    }
    if (isCorrect) {
      await scheduleNextReviews(userId, phraseId);
    }
  } catch (error) {
    console.error("[TaskScheduler] Error completing daily task:", error);
  }
}
async function scheduleNextReviews(userId, phraseId) {
  const db = await getDb();
  if (!db) return;
  try {
    const now = /* @__PURE__ */ new Date();
    const reviewSchedules = [
      { days: 1, type: "review_1" },
      { days: 3, type: "review_3" },
      { days: 10, type: "review_10" },
      { days: 21, type: "review_21" },
      { days: 50, type: "review_50" }
    ];
    for (const schedule of reviewSchedules) {
      const scheduledDate = new Date(now);
      scheduledDate.setDate(scheduledDate.getDate() + schedule.days);
      scheduledDate.setHours(0, 0, 0, 0);
      const existing = await db.select().from(dailyTasks).where(
        and2(
          eq2(dailyTasks.userId, userId),
          eq2(dailyTasks.phraseId, phraseId),
          eq2(dailyTasks.taskType, schedule.type)
        )
      ).limit(1);
      if (existing.length === 0) {
        await db.insert(dailyTasks).values({
          id: `task_${userId}_${phraseId}_${schedule.type}_${Date.now()}`,
          userId,
          phraseId,
          scheduledDate,
          taskType: schedule.type,
          daysFromLearning: schedule.days,
          status: "pending"
        });
      }
    }
  } catch (error) {
    console.error("[TaskScheduler] Error scheduling next reviews:", error);
  }
}
async function getTodaysTaskCount(userId) {
  const db = await getDb();
  if (!db) return 0;
  try {
    const today = /* @__PURE__ */ new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const result = await db.select({ count: sql2`COUNT(*)` }).from(dailyTasks).where(
      and2(
        eq2(dailyTasks.userId, userId),
        eq2(dailyTasks.status, "pending"),
        gte2(dailyTasks.scheduledDate, today),
        lte2(dailyTasks.scheduledDate, tomorrow)
      )
    );
    return result[0]?.count || 0;
  } catch (error) {
    console.error("[TaskScheduler] Error getting task count:", error);
    return 0;
  }
}
async function recordStudySession(userId, phrasesStudied, correctAnswers, incorrectAnswers) {
  const db = await getDb();
  if (!db) return;
  try {
    const now = /* @__PURE__ */ new Date();
    const accuracy = phrasesStudied > 0 ? Math.round(correctAnswers / phrasesStudied * 100) : 0;
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
      streakContinued: 1
    });
    await updateLearningAnalytics(userId);
  } catch (error) {
    console.error("[TaskScheduler] Error recording study session:", error);
  }
}
async function updateLearningAnalytics(userId) {
  const db = await getDb();
  if (!db) return;
  try {
    const thirtyDaysAgo = /* @__PURE__ */ new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const sessions = await db.select().from(studySessions).where(
      and2(
        eq2(studySessions.userId, userId),
        gte2(studySessions.sessionDate, thirtyDaysAgo)
      )
    );
    if (sessions.length === 0) return;
    const totalPhrases = sessions.reduce((sum, s) => sum + s.phrasesStudied, 0);
    const totalCorrect = sessions.reduce((sum, s) => sum + s.correctAnswers, 0);
    const avgAccuracy = sessions.length > 0 ? Math.round(totalCorrect / totalPhrases * 100) : 0;
    const avgPhrasesPerDay = Math.round(totalPhrases / 30);
    let learningPace = "normal";
    if (avgPhrasesPerDay < 15) learningPace = "slow";
    if (avgPhrasesPerDay > 30) learningPace = "fast";
    const existing = await db.select().from(learningAnalytics).where(eq2(learningAnalytics.userId, userId)).limit(1);
    if (existing.length > 0) {
      await db.update(learningAnalytics).set({
        avgPhrasesPerDay,
        avgRetention: avgAccuracy,
        learningPace,
        lastAnalyzedAt: /* @__PURE__ */ new Date(),
        updatedAt: /* @__PURE__ */ new Date()
      }).where(eq2(learningAnalytics.userId, userId));
    } else {
      await db.insert(learningAnalytics).values({
        id: `analytics_${userId}_${Date.now()}`,
        userId,
        avgPhrasesPerDay,
        avgRetention: avgAccuracy,
        learningPace,
        optimalDailyLoad: avgPhrasesPerDay,
        lastAnalyzedAt: /* @__PURE__ */ new Date()
      });
    }
  } catch (error) {
    console.error("[TaskScheduler] Error updating analytics:", error);
  }
}
async function getLearningAnalytics(userId) {
  const db = await getDb();
  if (!db) return null;
  try {
    const result = await db.select().from(learningAnalytics).where(eq2(learningAnalytics.userId, userId)).limit(1);
    return result.length > 0 ? result[0] : null;
  } catch (error) {
    console.error("[TaskScheduler] Error getting analytics:", error);
    return null;
  }
}

// server/chatbot.ts
import { eq as eq3, and as and3, desc as desc2, sql as sql3 } from "drizzle-orm";

// server/_core/llm.ts
var ensureArray = (value) => Array.isArray(value) ? value : [value];
var normalizeContentPart = (part) => {
  if (typeof part === "string") {
    return { type: "text", text: part };
  }
  if (part.type === "text") {
    return part;
  }
  if (part.type === "image_url") {
    return part;
  }
  if (part.type === "file_url") {
    return part;
  }
  throw new Error("Unsupported message content part");
};
var normalizeMessage = (message) => {
  const { role, name, tool_call_id } = message;
  if (role === "tool" || role === "function") {
    const content = ensureArray(message.content).map((part) => typeof part === "string" ? part : JSON.stringify(part)).join("\n");
    return {
      role,
      name,
      tool_call_id,
      content
    };
  }
  const contentParts = ensureArray(message.content).map(normalizeContentPart);
  if (contentParts.length === 1 && contentParts[0].type === "text") {
    return {
      role,
      name,
      content: contentParts[0].text
    };
  }
  return {
    role,
    name,
    content: contentParts
  };
};
var normalizeToolChoice = (toolChoice, tools) => {
  if (!toolChoice) return void 0;
  if (toolChoice === "none" || toolChoice === "auto") {
    return toolChoice;
  }
  if (toolChoice === "required") {
    if (!tools || tools.length === 0) {
      throw new Error(
        "tool_choice 'required' was provided but no tools were configured"
      );
    }
    if (tools.length > 1) {
      throw new Error(
        "tool_choice 'required' needs a single tool or specify the tool name explicitly"
      );
    }
    return {
      type: "function",
      function: { name: tools[0].function.name }
    };
  }
  if ("name" in toolChoice) {
    return {
      type: "function",
      function: { name: toolChoice.name }
    };
  }
  return toolChoice;
};
var resolveApiUrl = () => ENV.forgeApiUrl && ENV.forgeApiUrl.trim().length > 0 ? `${ENV.forgeApiUrl.replace(/\/$/, "")}/v1/chat/completions` : "https://forge.manus.im/v1/chat/completions";
var assertApiKey = () => {
  if (!ENV.forgeApiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
};
var normalizeResponseFormat = ({
  responseFormat,
  response_format,
  outputSchema,
  output_schema
}) => {
  const explicitFormat = responseFormat || response_format;
  if (explicitFormat) {
    if (explicitFormat.type === "json_schema" && !explicitFormat.json_schema?.schema) {
      throw new Error(
        "responseFormat json_schema requires a defined schema object"
      );
    }
    return explicitFormat;
  }
  const schema = outputSchema || output_schema;
  if (!schema) return void 0;
  if (!schema.name || !schema.schema) {
    throw new Error("outputSchema requires both name and schema");
  }
  return {
    type: "json_schema",
    json_schema: {
      name: schema.name,
      schema: schema.schema,
      ...typeof schema.strict === "boolean" ? { strict: schema.strict } : {}
    }
  };
};
async function invokeLLM(params) {
  assertApiKey();
  const {
    messages,
    tools,
    toolChoice,
    tool_choice,
    outputSchema,
    output_schema,
    responseFormat,
    response_format
  } = params;
  const payload = {
    model: "gemini-2.5-flash",
    messages: messages.map(normalizeMessage)
  };
  if (tools && tools.length > 0) {
    payload.tools = tools;
  }
  const normalizedToolChoice = normalizeToolChoice(
    toolChoice || tool_choice,
    tools
  );
  if (normalizedToolChoice) {
    payload.tool_choice = normalizedToolChoice;
  }
  payload.max_tokens = 32768;
  payload.thinking = {
    "budget_tokens": 128
  };
  const normalizedResponseFormat = normalizeResponseFormat({
    responseFormat,
    response_format,
    outputSchema,
    output_schema
  });
  if (normalizedResponseFormat) {
    payload.response_format = normalizedResponseFormat;
  }
  const response = await fetch(resolveApiUrl(), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${ENV.forgeApiKey}`
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `LLM invoke failed: ${response.status} ${response.statusText} \u2013 ${errorText}`
    );
  }
  return await response.json();
}

// server/chatbot.ts
async function getUserContext(userId) {
  const db = await getDb();
  if (!db) return null;
  try {
    const progressStats = await db.select({
      totalLearned: sql3`COUNT(DISTINCT CASE WHEN ${userProgress.correctCount} > 0 THEN ${userProgress.phraseId} END)`,
      totalReviewed: sql3`COUNT(DISTINCT ${userProgress.phraseId})`,
      totalCorrect: sql3`SUM(${userProgress.correctCount})`,
      totalIncorrect: sql3`SUM(${userProgress.incorrectCount})`,
      avgAccuracy: sql3`ROUND(SUM(${userProgress.correctCount}) / (SUM(${userProgress.correctCount}) + SUM(${userProgress.incorrectCount})) * 100)`,
      avgEaseFactor: sql3`ROUND(AVG(${userProgress.easeFactor}))`,
      avgInterval: sql3`ROUND(AVG(${userProgress.interval}))`
    }).from(userProgress).where(eq3(userProgress.userId, userId));
    const recentSessions = await db.select().from(studySessions).where(eq3(studySessions.userId, userId)).orderBy(desc2(studySessions.sessionDate)).limit(30);
    const analytics = await db.select().from(learningAnalytics).where(eq3(learningAnalytics.userId, userId)).limit(1);
    const commonMistakes = await db.select({
      mistakeType: mistakes.mistakeType,
      count: sql3`COUNT(*)`,
      percentage: sql3`ROUND(COUNT(*) / (SELECT COUNT(*) FROM ${mistakes} WHERE ${eq3(mistakes.userId, userId)}) * 100)`
    }).from(mistakes).where(eq3(mistakes.userId, userId)).groupBy(mistakes.mistakeType).orderBy(desc2(sql3`COUNT(*)`)).limit(10);
    const strugglingPhrases = await db.select({
      phrase: phrases,
      progress: userProgress,
      errorRate: sql3`ROUND(${userProgress.incorrectCount} / (${userProgress.correctCount} + ${userProgress.incorrectCount}) * 100)`
    }).from(userProgress).innerJoin(phrases, eq3(userProgress.phraseId, phrases.id)).where(
      and3(
        eq3(userProgress.userId, userId),
        sql3`${userProgress.incorrectCount} > ${userProgress.correctCount}`
      )
    ).orderBy(desc2(userProgress.incorrectCount)).limit(10);
    const masteredCount = await db.select({ count: sql3`COUNT(*)` }).from(userProgress).where(
      and3(
        eq3(userProgress.userId, userId),
        sql3`${userProgress.repetitions} >= 5 AND ${userProgress.correctCount} > ${userProgress.incorrectCount}`
      )
    );
    const categoryPerformance = await db.select({
      category: phrases.category,
      learned: sql3`COUNT(DISTINCT CASE WHEN ${userProgress.correctCount} > 0 THEN ${userProgress.phraseId} END)`,
      total: sql3`COUNT(DISTINCT ${userProgress.phraseId})`,
      accuracy: sql3`ROUND(SUM(${userProgress.correctCount}) / (SUM(${userProgress.correctCount}) + SUM(${userProgress.incorrectCount})) * 100)`
    }).from(userProgress).innerJoin(phrases, eq3(userProgress.phraseId, phrases.id)).where(eq3(userProgress.userId, userId)).groupBy(phrases.category).orderBy(desc2(sql3`COUNT(DISTINCT ${userProgress.phraseId})`));
    const studyDaysCount = await db.select({ count: sql3`COUNT(DISTINCT DATE(${studySessions.sessionDate}))` }).from(studySessions).where(eq3(studySessions.userId, userId));
    const stats = progressStats[0] || {
      totalLearned: 0,
      totalReviewed: 0,
      totalCorrect: 0,
      totalIncorrect: 0,
      avgAccuracy: 0,
      avgEaseFactor: 2500,
      avgInterval: 1
    };
    return {
      stats,
      recentSessions,
      analytics: analytics[0] || null,
      commonMistakes,
      strugglingPhrases,
      masteredCount: masteredCount[0]?.count || 0,
      totalPhrases: 4e3,
      categoryPerformance,
      studyDaysCount: studyDaysCount[0]?.count || 0,
      totalSessions: recentSessions.length
    };
  } catch (error) {
    console.error("[Chatbot] Error getting user context:", error);
    return null;
  }
}
async function getPhraseDetails(phraseId, userId) {
  const db = await getDb();
  if (!db) return null;
  try {
    const phraseData = await db.select().from(phrases).where(eq3(phrases.id, phraseId)).limit(1);
    if (phraseData.length === 0) return null;
    const phrase = phraseData[0];
    const userProgressData = await db.select().from(userProgress).where(
      and3(
        eq3(userProgress.userId, userId),
        eq3(userProgress.phraseId, phraseId)
      )
    ).limit(1);
    const similarPhrases = await db.select().from(phrases).where(
      and3(
        eq3(phrases.category, phrase.category),
        sql3`${phrases.id} != ${phraseId}`
      )
    ).limit(3);
    return {
      phrase,
      userProgress: userProgressData[0] || null,
      similarPhrases
    };
  } catch (error) {
    console.error("[Chatbot] Error getting phrase details:", error);
    return null;
  }
}
function calculateCompletionTime(context) {
  if (!context) {
    return {
      estimate: "Unable to calculate",
      daysRemaining: 0,
      phrasesRemaining: TOTAL_PHRASES,
      dailyPace: 0
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
      dailyPace: 0
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
    dailyPace: avgPhrasesPerDay
  };
}
async function generateChatbotResponse(userId, userMessage, phraseId) {
  try {
    const context = await getUserContext(userId);
    if (!context) {
      return "I'm unable to access your learning data right now. Please try again in a moment.";
    }
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
${phraseData.similarPhrases.map((p) => `- "${p.german}" \u2192 "${p.english}"`).join("\n")}
`;
      }
    }
    const completionData = calculateCompletionTime(context);
    const systemPrompt = `You are an exceptionally skilled, empathetic, and highly intelligent German B1 language tutor and learning coach. Your primary goal is to provide personalized, accurate, and natural conversational responses that enhance the student's learning experience. You have complete, detailed access to the student's learning journey and performance data, and you are expected to leverage this information extensively to provide insightful, actionable, and motivating guidance. Your responses should be proactive, anticipate student needs, and demonstrate a deep understanding of German grammar and learning psychology.
=== STUDENT'S COMPREHENSIVE LEARNING PROFILE ===
OVERALL PROGRESS:
- Phrases mastered: ${context.stats.totalLearned} / ${TOTAL_PHRASES} (${Math.round(context.stats.totalLearned / TOTAL_PHRASES * 100)}%)
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
- Average ease factor: ${context.stats.avgEaseFactor / 1e3}
- Average review interval: ${context.stats.avgInterval} days
- SM-2 algorithm status: Actively optimizing retention
PERFORMANCE BY CATEGORY:
${context.categoryPerformance.map((cat) => `- ${cat.category}: ${cat.learned}/${cat.total} learned (${cat.accuracy}% accuracy)`).join("\n")}
COMMON MISTAKE PATTERNS:
${context.commonMistakes.map((m) => `- ${m.mistakeType}: ${m.count} occurrences (${m.percentage}% of all mistakes)`).join("\n")}
TOP 5 STRUGGLING PHRASES (Priority for improvement):
${context.strugglingPhrases.slice(0, 5).map((p) => `- "${p.phrase.german}" (Error rate: ${p.errorRate}%)`).join("\n")}
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
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        {
          role: "user",
          content: userMessage
        }
      ]
    });
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
async function getGrammarExplanation(phraseId) {
  const db = await getDb();
  if (!db) return "Unable to fetch phrase details";
  try {
    const phraseData = await db.select().from(phrases).where(eq3(phrases.id, phraseId)).limit(1);
    if (phraseData.length === 0) return "Phrase not found";
    const phrase = phraseData[0];
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
Be thorough but clear, using examples when helpful.`
        },
        {
          role: "user",
          content: `Provide a detailed grammar explanation for this German phrase:
German: "${phrase.german}"
English: "${phrase.english}"
Pronunciation: ${phrase.pronunciation}
Explain each word, the grammar rules applied, and why this phrase is structured this way.`
        }
      ]
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

// server/routers/learning.ts
import { z as z2 } from "zod";
import { eq as eq5, and as and5, lte as lte4, desc as desc3, sql as sql5 } from "drizzle-orm";

// server/learning/srs.ts
function calculateNextReview(state, quality) {
  if (quality < 0 || quality > 5) {
    throw new Error("Quality must be between 0 and 5");
  }
  let newEaseFactor = state.easeFactor;
  let newInterval = state.interval;
  let newRepetitions = state.repetitions;
  newEaseFactor = state.easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)) * 1e3;
  if (newEaseFactor < 1300) {
    newEaseFactor = 1300;
  }
  if (quality < 3) {
    newRepetitions = 0;
    newInterval = 1;
  } else {
    newRepetitions = state.repetitions + 1;
    if (newRepetitions === 1) {
      newInterval = 1;
    } else if (newRepetitions === 2) {
      newInterval = 3;
    } else {
      newInterval = Math.round(state.interval * (newEaseFactor / 1e3));
    }
  }
  const nextReviewAt = /* @__PURE__ */ new Date();
  nextReviewAt.setDate(nextReviewAt.getDate() + newInterval);
  return {
    interval: newInterval,
    easeFactor: Math.round(newEaseFactor),
    repetitions: newRepetitions,
    nextReviewAt
  };
}
function calculateMasteryPercentage(state) {
  const repetitionScore = Math.min(state.repetitions / 10, 1) * 50;
  const easeFactorScore = Math.min((state.easeFactor - 1300) / 1700, 1) * 50;
  return Math.round(repetitionScore + easeFactorScore);
}
function getWordStatus(state) {
  if (state.repetitions === 0) {
    return "new";
  } else if (state.repetitions < 5 || state.easeFactor < 2e3) {
    return "learning";
  } else {
    return "mastered";
  }
}

// server/learning/adaptiveEngine.ts
import { eq as eq4, and as and4, gte as gte3, lte as lte3, sql as sql4 } from "drizzle-orm";
async function generateDailyMissions(userId) {
  const db = getDb();
  const profile = await getUserLearningProfile(userId);
  const wordsForReview = await db.select().from(userProgress).where(
    and4(
      eq4(userProgress.userId, userId),
      lte3(userProgress.nextReviewAt, /* @__PURE__ */ new Date())
    )
  );
  const wordsLearning = await db.select().from(userProgress).where(
    and4(
      eq4(userProgress.userId, userId),
      eq4(userProgress.status, "learning")
    )
  ).limit(5);
  const missions = [];
  if (wordsForReview.length > 0) {
    missions.push({
      type: "review_words",
      targetCount: Math.min(wordsForReview.length, profile.optimalDailyLoad * 0.6),
      difficulty: "intermediate",
      description: `Review ${Math.min(wordsForReview.length, profile.optimalDailyLoad * 0.6)} words scheduled for today`,
      estimatedMinutes: Math.min(wordsForReview.length, profile.optimalDailyLoad * 0.6) * 2
    });
  }
  const newWordsCount = Math.max(
    1,
    Math.floor(profile.optimalDailyLoad * 0.3)
  );
  missions.push({
    type: "new_words",
    targetCount: newWordsCount,
    difficulty: profile.learningPace === "fast" ? "hard" : "intermediate",
    description: `Learn ${newWordsCount} new German words`,
    estimatedMinutes: newWordsCount * 3
  });
  if (profile.averageAccuracy > 70) {
    missions.push({
      type: "practice_conversation",
      targetCount: 1,
      difficulty: "intermediate",
      description: "Practice conversational German with the chatbot",
      estimatedMinutes: 10
    });
  }
  if (profile.weakCategories.length > 0) {
    missions.push({
      type: "grammar_focus",
      targetCount: 5,
      difficulty: "hard",
      description: `Focus on ${profile.weakCategories[0]} - your weakest area`,
      estimatedMinutes: 8
    });
  }
  return missions;
}
async function getUserLearningProfile(userId) {
  const db = getDb();
  const analytics = await db.select().from(learningAnalytics).where(eq4(learningAnalytics.userId, userId)).then((rows) => rows[0]);
  const wordStats = await db.select({
    status: userProgress.status,
    count: sql4`COUNT(*)`,
    avgAccuracy: sql4`AVG(CASE WHEN ${userProgress.correctCount} + ${userProgress.incorrectCount} > 0 THEN (${userProgress.correctCount} * 100) / (${userProgress.correctCount} + ${userProgress.incorrectCount}) ELSE 0 END)`
  }).from(userProgress).where(eq4(userProgress.userId, userId)).groupBy(userProgress.status);
  const masteredWords = wordStats.find((w) => w.status === "mastered")?.count || 0;
  const learningWords = wordStats.find((w) => w.status === "learning")?.count || 0;
  const avgAccuracy = wordStats[0]?.avgAccuracy || 0;
  const weakCategories = analytics?.weakCategories ? JSON.parse(analytics.weakCategories) : [];
  const strongCategories = analytics?.strongCategories ? JSON.parse(analytics.strongCategories) : [];
  return {
    userId,
    totalWordsMastered: masteredWords,
    totalWordsLearning: learningWords,
    averageAccuracy: avgAccuracy,
    optimalDailyLoad: analytics?.optimalDailyLoad || 20,
    learningPace: analytics?.learningPace || "normal",
    preferredStudyTime: analytics?.bestStudyTime || "morning",
    weakCategories,
    strongCategories
  };
}
async function adjustLearningParameters(userId) {
  const db = getDb();
  const sevenDaysAgo = /* @__PURE__ */ new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const recentPerformance = await db.select({
    totalReviews: sql4`COUNT(*)`,
    correctReviews: sql4`SUM(CASE WHEN ${userProgress.correctCount} > 0 THEN 1 ELSE 0 END)`
  }).from(userProgress).where(
    and4(
      eq4(userProgress.userId, userId),
      gte3(userProgress.lastReviewedAt, sevenDaysAgo)
    )
  );
  const performance = recentPerformance[0];
  const accuracy = performance?.totalReviews > 0 ? performance.correctReviews / performance.totalReviews * 100 : 0;
  let newLearningPace = "normal";
  let newOptimalDailyLoad = 20;
  if (accuracy > 85) {
    newLearningPace = "fast";
    newOptimalDailyLoad = 30;
  } else if (accuracy < 60) {
    newLearningPace = "slow";
    newOptimalDailyLoad = 10;
  }
  await db.update(learningAnalytics).set({
    learningPace: newLearningPace,
    optimalDailyLoad: newOptimalDailyLoad,
    avgRetention: Math.round(accuracy),
    lastAnalyzedAt: /* @__PURE__ */ new Date()
  }).where(eq4(learningAnalytics.userId, userId));
}
async function getAdaptiveRecommendations(userId) {
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
    focusAreas: profile.weakCategories.slice(0, 3)
  };
}

// server/learning/llmIntegration.ts
import Anthropic from "@anthropic-ai/sdk";
var client = new Anthropic();
function generateDynamicSystemPrompt(userProfile, currentTopic) {
  let prompt = `You are an intelligent German language learning chatbot designed to help users memorize and master German vocabulary and grammar.

Your primary objectives are:
1. Help users learn German words and phrases effectively
2. Provide clear explanations with contextual examples
3. Offer personalized feedback based on user performance
4. Maintain an encouraging and supportive tone
5. Adapt your teaching style to the user's learning pace and preferences

Current Learning Context:
- Topic: ${currentTopic}
- Format: Conversational and interactive`;
  if (userProfile) {
    prompt += `

User-Specific Information:
- Preferred topics: ${userProfile.preferredTopics.join(", ") || "General"}
- Areas needing improvement: ${userProfile.difficultAreas.join(", ") || "None identified yet"}
- Recent learnings: ${userProfile.recentLearnings.slice(0, 5).join(", ") || "None yet"}
- Learning style: ${userProfile.learningStyle}
- Communication style: ${userProfile.communicationStyle}
- Total interactions: ${userProfile.totalConversationTurns}`;
  }
  prompt += `

Important Guidelines:
1. Always provide German words with their English translations
2. Include example sentences when teaching new vocabulary
3. Offer pronunciation guidance using IPA notation when relevant
4. Explain grammar rules clearly and concisely
5. Provide positive reinforcement for correct answers
6. Gently correct mistakes and explain the correct form
7. Adapt difficulty level based on user responses
8. Keep responses concise but informative (2-3 paragraphs max)
9. Use the user's name if known to personalize the interaction
10. Track learning progress and acknowledge improvements

Remember: Your goal is to make German learning enjoyable, effective, and personalized to each user's unique learning journey.`;
  return prompt;
}
async function callLLMWithContext(request) {
  const {
    userMessage,
    userProfile,
    conversationContext,
    systemPrompt,
    temperature = 0.7,
    maxTokens = 1024
  } = request;
  const finalSystemPrompt = systemPrompt || generateDynamicSystemPrompt(userProfile || null, "German vocabulary learning");
  const messageHistory = [];
  if (conversationContext && conversationContext.length > 0) {
    const recentEpisode = conversationContext[conversationContext.length - 1];
    const recentTurns = recentEpisode.turns.slice(-10);
    for (const turn of recentTurns) {
      messageHistory.push({
        role: turn.role === "user" ? "user" : "assistant",
        content: turn.content
      });
    }
  }
  messageHistory.push({
    role: "user",
    content: userMessage
  });
  try {
    const response = await client.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: maxTokens,
      temperature,
      system: finalSystemPrompt,
      messages: messageHistory
    });
    const content = response.content.filter((block) => block.type === "text").map((block) => block.text).join("\n");
    return {
      content,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens
      }
    };
  } catch (error) {
    console.error("Error calling Claude API:", error);
    throw new Error(`Failed to call LLM: ${error instanceof Error ? error.message : String(error)}`);
  }
}
async function generateWordExplanation(germanWord, englishTranslation, context) {
  const prompt = `Provide a concise explanation for the German word "${germanWord}" (English: "${englishTranslation}").

Include:
1. Part of speech
2. Pronunciation guide (IPA)
3. 2-3 example sentences in German with English translations
4. Any relevant grammar notes or common usage patterns
${context ? `
Additional context: ${context}` : ""}

Format your response clearly with sections.`;
  const response = await callLLMWithContext({
    userMessage: prompt,
    systemPrompt: "You are a German language expert providing detailed word explanations for learners.",
    maxTokens: 500
  });
  return response.content;
}
async function generateConversationStarter(topic, difficulty, userProfile) {
  const difficultyDescriptions = {
    easy: "simple, everyday vocabulary",
    intermediate: "moderate vocabulary with some complex structures",
    hard: "advanced vocabulary and complex grammar"
  };
  const prompt = `Create a German conversation starter for practicing "${topic}" at ${difficulty} level using ${difficultyDescriptions[difficulty]}.

${userProfile ? `The learner has been studying for a while and is familiar with: ${userProfile.recentLearnings.join(", ")}` : ""}

Provide:
1. A German sentence or question to start the conversation
2. English translation
3. 2-3 suggested response options (in German with English translations)
4. Tips for continuing the conversation

Make it engaging and practical.`;
  const response = await callLLMWithContext({
    userMessage: prompt,
    userProfile,
    systemPrompt: "You are a German conversation teacher creating engaging practice scenarios.",
    maxTokens: 600
  });
  return response.content;
}
async function evaluateGermanResponse(userResponse, expectedResponse, context) {
  const prompt = `Evaluate this German language response:

Context: ${context}
User's response: "${userResponse}"
Expected/ideal response: "${expectedResponse}"

Provide:
1. Is the response correct? (yes/no)
2. Accuracy score (0-100)
3. Detailed feedback on grammar, vocabulary, and usage
4. If incorrect, provide the correct form and explanation

Be constructive and encouraging.`;
  const response = await callLLMWithContext({
    userMessage: prompt,
    systemPrompt: "You are a German language teacher evaluating student responses. Provide constructive feedback.",
    maxTokens: 500
  });
  const isCorrect = response.content.toLowerCase().includes("correct") && !response.content.toLowerCase().includes("incorrect");
  const accuracyMatch = response.content.match(/accuracy[:\s]+(\d+)/i);
  const accuracy = accuracyMatch ? parseInt(accuracyMatch[1]) : isCorrect ? 100 : 50;
  return {
    isCorrect,
    accuracy,
    feedback: response.content
  };
}
async function generateGrammarExplanation(grammarTopic, difficulty) {
  const prompt = `Explain the German grammar topic: "${grammarTopic}" at ${difficulty} level.

Include:
1. Clear explanation of the rule
2. Why it's important for German learners
3. 3-4 example sentences with English translations
4. Common mistakes to avoid
5. Practice tips

Make it accessible and practical.`;
  const response = await callLLMWithContext({
    userMessage: prompt,
    systemPrompt: "You are an expert German grammar teacher. Explain grammar concepts clearly with practical examples.",
    maxTokens: 800
  });
  return response.content;
}

// server/routers/learning.ts
import { v4 as uuidv4 } from "uuid";
var learningRouter = router({
  /**
   * Get words due for review today
   */
  getWordsForReview: protectedProcedure.query(async ({ ctx }) => {
    const db = getDb();
    const userId = ctx.user.id;
    const wordsForReview = await db.select({
      id: userProgress.id,
      phraseId: userProgress.phraseId,
      german: phrases.german,
      english: phrases.english,
      pronunciation: phrases.pronunciation,
      difficulty: phrases.difficulty,
      interval: userProgress.interval,
      easeFactor: userProgress.easeFactor,
      repetitions: userProgress.repetitions,
      nextReviewAt: userProgress.nextReviewAt
    }).from(userProgress).innerJoin(phrases, eq5(userProgress.phraseId, phrases.id)).where(
      and5(
        eq5(userProgress.userId, userId),
        lte4(userProgress.nextReviewAt, /* @__PURE__ */ new Date())
      )
    ).orderBy(desc3(userProgress.nextReviewAt)).limit(20);
    return wordsForReview;
  }),
  /**
   * Submit a review answer and update SRS state
   */
  submitReview: protectedProcedure.input(
    z2.object({
      userProgressId: z2.string(),
      quality: z2.number().min(0).max(5),
      timeSpentSeconds: z2.number().optional()
    })
  ).mutation(async ({ ctx, input }) => {
    const db = getDb();
    const userId = ctx.user.id;
    const progressRecord = await db.select().from(userProgress).where(
      and5(
        eq5(userProgress.id, input.userProgressId),
        eq5(userProgress.userId, userId)
      )
    ).then((rows) => rows[0]);
    if (!progressRecord) {
      throw new Error("Progress record not found");
    }
    const currentState = {
      interval: progressRecord.interval,
      easeFactor: progressRecord.easeFactor,
      repetitions: progressRecord.repetitions,
      nextReviewAt: progressRecord.nextReviewAt
    };
    const newState = calculateNextReview(currentState, input.quality);
    const newStatus = getWordStatus(newState);
    await db.update(userProgress).set({
      interval: newState.interval,
      easeFactor: newState.easeFactor,
      repetitions: newState.repetitions,
      nextReviewAt: newState.nextReviewAt,
      status: newStatus,
      lastReviewedAt: /* @__PURE__ */ new Date(),
      correctCount: input.quality >= 3 ? progressRecord.correctCount + 1 : progressRecord.correctCount,
      incorrectCount: input.quality < 3 ? progressRecord.incorrectCount + 1 : progressRecord.incorrectCount,
      updatedAt: /* @__PURE__ */ new Date()
    }).where(eq5(userProgress.id, input.userProgressId));
    const masteryPercentage = calculateMasteryPercentage(newState);
    return {
      success: true,
      newState,
      masteryPercentage,
      status: newStatus
    };
  }),
  /**
   * Get daily missions for the user
   */
  getDailyMissions: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.user.id;
    const missions = await generateDailyMissions(userId);
    return missions;
  }),
  /**
   * Get adaptive recommendations
   */
  getAdaptiveRecommendations: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.user.id;
    const recommendations = await getAdaptiveRecommendations(userId);
    return recommendations;
  }),
  /**
   * Get user's learning profile
   */
  getUserLearningProfile: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.user.id;
    const profile = await getUserLearningProfile(userId);
    return profile;
  }),
  /**
   * Get learning analytics for the user
   */
  getLearningAnalytics: protectedProcedure.query(async ({ ctx }) => {
    const db = getDb();
    const userId = ctx.user.id;
    const analytics = await db.select().from(learningAnalytics).where(eq5(learningAnalytics.userId, userId)).then((rows) => rows[0]);
    if (!analytics) {
      const newAnalytics = {
        id: uuidv4(),
        userId,
        avgPhrasesPerDay: 0,
        bestStudyTime: "morning",
        studyStreak: 0,
        longestStudyStreak: 0,
        optimalDailyLoad: 20,
        learningPace: "normal",
        avgRetention: 0,
        weakCategories: JSON.stringify([]),
        strongCategories: JSON.stringify([]),
        lastAnalyzedAt: /* @__PURE__ */ new Date(),
        createdAt: /* @__PURE__ */ new Date(),
        updatedAt: /* @__PURE__ */ new Date()
      };
      await db.insert(learningAnalytics).values(newAnalytics);
      return newAnalytics;
    }
    return analytics;
  }),
  /**
   * Chat with the enhanced chatbot
   */
  chatWithBot: protectedProcedure.input(
    z2.object({
      message: z2.string(),
      topic: z2.string().optional()
    })
  ).mutation(async ({ ctx, input }) => {
    const userId = ctx.user.id;
    try {
      const userProfile = await getUserLearningProfile(userId);
      const response = await callLLMWithContext({
        userMessage: input.message,
        userProfile,
        systemPrompt: generateDynamicSystemPrompt(
          userProfile,
          input.topic || "German vocabulary learning"
        )
      });
      return {
        success: true,
        response: response.content,
        usage: response.usage
      };
    } catch (error) {
      console.error("Error in chatbot:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  }),
  /**
   * Get word explanation from LLM
   */
  getWordExplanation: publicProcedure.input(
    z2.object({
      germanWord: z2.string(),
      englishTranslation: z2.string()
    })
  ).mutation(async ({ input }) => {
    try {
      const explanation = await generateWordExplanation(
        input.germanWord,
        input.englishTranslation
      );
      return {
        success: true,
        explanation
      };
    } catch (error) {
      console.error("Error generating explanation:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  }),
  /**
   * Get conversation starter for practice
   */
  getConversationStarter: protectedProcedure.input(
    z2.object({
      topic: z2.string(),
      difficulty: z2.enum(["easy", "intermediate", "hard"])
    })
  ).mutation(async ({ ctx, input }) => {
    try {
      const userProfile = await getUserLearningProfile(ctx.user.id);
      const starter = await generateConversationStarter(
        input.topic,
        input.difficulty,
        userProfile
      );
      return {
        success: true,
        starter
      };
    } catch (error) {
      console.error("Error generating conversation starter:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  }),
  /**
   * Evaluate a German response
   */
  evaluateResponse: protectedProcedure.input(
    z2.object({
      userResponse: z2.string(),
      expectedResponse: z2.string(),
      context: z2.string()
    })
  ).mutation(async ({ input }) => {
    try {
      const evaluation = await evaluateGermanResponse(
        input.userResponse,
        input.expectedResponse,
        input.context
      );
      return {
        success: true,
        evaluation
      };
    } catch (error) {
      console.error("Error evaluating response:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  }),
  /**
   * Get grammar explanation
   */
  getGrammarExplanation: publicProcedure.input(
    z2.object({
      topic: z2.string(),
      difficulty: z2.enum(["easy", "intermediate", "hard"])
    })
  ).mutation(async ({ input }) => {
    try {
      const explanation = await generateGrammarExplanation(
        input.topic,
        input.difficulty
      );
      return {
        success: true,
        explanation
      };
    } catch (error) {
      console.error("Error generating grammar explanation:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  }),
  /**
   * Get user progress summary
   */
  getProgressSummary: protectedProcedure.query(async ({ ctx }) => {
    const db = getDb();
    const userId = ctx.user.id;
    const stats = await db.select().from(userStats).where(eq5(userStats.userId, userId)).then((rows) => rows[0]);
    const wordProgress = await db.select({
      status: userProgress.status,
      count: sql5`COUNT(*)`
    }).from(userProgress).where(eq5(userProgress.userId, userId)).groupBy(userProgress.status);
    return {
      stats,
      wordProgress
    };
  }),
  /**
   * Adjust learning parameters based on performance
   */
  adjustLearningParameters: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.user.id;
    await adjustLearningParameters(userId);
    return { success: true };
  })
});

// server/routers/auth.ts
import { z as z3 } from "zod";

// server/authService.ts
import crypto from "crypto";
import { eq as eq6 } from "drizzle-orm";
var SALT_LENGTH = 32;
var HASH_ITERATIONS = 1e5;
var HASH_ALGORITHM = "sha256";
var HASH_KEY_LENGTH = 64;
function generateSalt() {
  return crypto.randomBytes(SALT_LENGTH).toString("hex");
}
function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, HASH_ITERATIONS, HASH_KEY_LENGTH, HASH_ALGORITHM).toString("hex");
}
function verifyPassword(password, salt, hash) {
  const newHash = hashPassword(password, salt);
  return newHash === hash;
}
function generateUserId() {
  return crypto.randomBytes(32).toString("hex");
}
async function registerUser(email, password, name) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new Error("Invalid email format");
  }
  if (password.length < 8) {
    throw new Error("Password must be at least 8 characters long");
  }
  const db = await getDb();
  if (!db) {
    throw new Error("Database connection not available");
  }
  const existingUser = await db.select().from(users).where(eq6(users.email, email));
  if (existingUser.length > 0) {
    throw new Error("User with this email already exists");
  }
  const salt = generateSalt();
  const passwordHash = hashPassword(password, salt);
  const userId = generateUserId();
  await db.insert(users).values({
    id: userId,
    email,
    name: name || email.split("@")[0],
    // Use part of email as default name
    passwordHash,
    salt,
    loginMethod: "email/password",
    role: "user"
  });
  return {
    userId,
    email
  };
}
async function loginUser(email, password) {
  const db = await getDb();
  if (!db) {
    throw new Error("Database connection not available");
  }
  const userResult = await db.select().from(users).where(eq6(users.email, email));
  if (userResult.length === 0) {
    throw new Error("Invalid email or password");
  }
  const user = userResult[0];
  if (!user.passwordHash || !user.salt) {
    throw new Error("Invalid email or password");
  }
  const isPasswordValid = verifyPassword(password, user.salt, user.passwordHash);
  if (!isPasswordValid) {
    throw new Error("Invalid email or password");
  }
  await db.update(users).set({ lastSignedIn: /* @__PURE__ */ new Date() }).where(eq6(users.id, user.id));
  return {
    userId: user.id,
    email: user.email || "",
    name: user.name
  };
}
async function getUserById(userId) {
  const db = await getDb();
  if (!db) {
    return null;
  }
  const userResult = await db.select().from(users).where(eq6(users.id, userId));
  if (userResult.length === 0) {
    return null;
  }
  const user = userResult[0];
  return {
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role
  };
}
async function updatePassword(userId, newPassword) {
  if (newPassword.length < 8) {
    throw new Error("Password must be at least 8 characters long");
  }
  const db = await getDb();
  if (!db) {
    throw new Error("Database connection not available");
  }
  const salt = generateSalt();
  const passwordHash = hashPassword(newPassword, salt);
  await db.update(users).set({ passwordHash, salt }).where(eq6(users.id, userId));
}
async function deleteUser(userId) {
  const db = await getDb();
  if (!db) {
    throw new Error("Database connection not available");
  }
  await db.delete(users).where(eq6(users.id, userId));
}

// server/routers/auth.ts
import crypto2 from "crypto";
var JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-in-production";
var TOKEN_EXPIRY = 24 * 60 * 60 * 1e3;
function generateJWT(userId) {
  const header = Buffer.from(
    JSON.stringify({ alg: "HS256", typ: "JWT" })
  ).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      userId,
      iat: Math.floor(Date.now() / 1e3),
      exp: Math.floor((Date.now() + TOKEN_EXPIRY) / 1e3)
    })
  ).toString("base64url");
  const signature = crypto2.createHmac("sha256", JWT_SECRET).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}
function verifyJWT(token) {
  try {
    const [header, payload, signature] = token.split(".");
    const expectedSignature = crypto2.createHmac("sha256", JWT_SECRET).update(`${header}.${payload}`).digest("base64url");
    if (signature !== expectedSignature) {
      return null;
    }
    const decodedPayload = JSON.parse(
      Buffer.from(payload, "base64url").toString()
    );
    if (decodedPayload.exp < Math.floor(Date.now() / 1e3)) {
      return null;
    }
    return { userId: decodedPayload.userId };
  } catch (error) {
    return null;
  }
}
var authRouter = router({
  /**
   * Register a new user
   */
  registerUser: publicProcedure.input(
    z3.object({
      email: z3.string().email("Invalid email address"),
      password: z3.string().min(8, "Password must be at least 8 characters long"),
      name: z3.string().optional()
    })
  ).mutation(async ({ input }) => {
    try {
      const result = await registerUser(input.email, input.password, input.name);
      const token = generateJWT(result.userId);
      return {
        success: true,
        userId: result.userId,
        email: result.email,
        token
      };
    } catch (error) {
      throw new Error(
        error instanceof Error ? error.message : "Registration failed"
      );
    }
  }),
  /**
   * Login user
   */
  loginUser: publicProcedure.input(
    z3.object({
      email: z3.string().email("Invalid email address"),
      password: z3.string()
    })
  ).mutation(async ({ input }) => {
    try {
      const result = await loginUser(input.email, input.password);
      const token = generateJWT(result.userId);
      return {
        success: true,
        userId: result.userId,
        email: result.email,
        name: result.name,
        token
      };
    } catch (error) {
      throw new Error(
        error instanceof Error ? error.message : "Login failed"
      );
    }
  }),
  /**
   * Get current user session
   */
  getSession: publicProcedure.input(z3.object({ token: z3.string() })).query(async ({ input }) => {
    const decoded = verifyJWT(input.token);
    if (!decoded) {
      return null;
    }
    const user = await getUserById(decoded.userId);
    return user;
  }),
  /**
   * Verify token validity
   */
  verifyToken: publicProcedure.input(z3.object({ token: z3.string() })).query(({ input }) => {
    const decoded = verifyJWT(input.token);
    return {
      valid: decoded !== null,
      userId: decoded?.userId || null
    };
  }),
  /**
   * Update user password
   */
  updatePassword: publicProcedure.input(
    z3.object({
      userId: z3.string(),
      currentPassword: z3.string(),
      newPassword: z3.string().min(8, "Password must be at least 8 characters long"),
      token: z3.string()
    })
  ).mutation(async ({ input }) => {
    try {
      const decoded = verifyJWT(input.token);
      if (!decoded || decoded.userId !== input.userId) {
        throw new Error("Unauthorized");
      }
      const user = await getUserById(input.userId);
      if (!user) {
        throw new Error("User not found");
      }
      await updatePassword(input.userId, input.newPassword);
      return {
        success: true,
        message: "Password updated successfully"
      };
    } catch (error) {
      throw new Error(
        error instanceof Error ? error.message : "Password update failed"
      );
    }
  }),
  /**
   * Delete user account
   */
  deleteAccount: publicProcedure.input(
    z3.object({
      userId: z3.string(),
      password: z3.string(),
      token: z3.string()
    })
  ).mutation(async ({ input }) => {
    try {
      const decoded = verifyJWT(input.token);
      if (!decoded || decoded.userId !== input.userId) {
        throw new Error("Unauthorized");
      }
      await deleteUser(input.userId);
      return {
        success: true,
        message: "Account deleted successfully"
      };
    } catch (error) {
      throw new Error(
        error instanceof Error ? error.message : "Account deletion failed"
      );
    }
  }),
  /**
   * Logout (client-side operation, but included for completeness)
   */
  logout: publicProcedure.input(z3.object({ token: z3.string() })).mutation(async ({ input }) => {
    const decoded = verifyJWT(input.token);
    if (!decoded) {
      throw new Error("Invalid token");
    }
    return {
      success: true,
      message: "Logged out successfully"
    };
  })
});

// server/routers.ts
var appRouter = router({
  system: systemRouter,
  advancedLearning: learningRouter,
  auth: authRouter,
  // AI Chatbot
  chatbot: router({
    // Get AI response
    ask: protectedProcedure.input(
      z4.object({
        message: z4.string(),
        phraseId: z4.string().optional()
      })
    ).mutation(async ({ ctx, input }) => {
      return await generateChatbotResponse(
        ctx.user.id,
        input.message,
        input.phraseId
      );
    }),
    // Get grammar explanation
    explainGrammar: protectedProcedure.input(z4.object({ phraseId: z4.string() })).query(async ({ input }) => {
      return await getGrammarExplanation(input.phraseId);
    }),
    // Get user context for chatbot
    getContext: protectedProcedure.query(async ({ ctx }) => {
      return await getUserContext(ctx.user.id);
    })
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
    completeTask: protectedProcedure.input(
      z4.object({
        taskId: z4.string(),
        phraseId: z4.string(),
        isCorrect: z4.boolean(),
        timeSpentSeconds: z4.number()
      })
    ).mutation(async ({ ctx, input }) => {
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
    initializeTasks: protectedProcedure.input(z4.object({ dailyLoad: z4.number().optional() })).mutation(async ({ ctx, input }) => {
      await initializeDailyTasks(ctx.user.id, input.dailyLoad || 20);
      return { success: true };
    }),
    // Record study session
    recordSession: protectedProcedure.input(
      z4.object({
        phrasesStudied: z4.number(),
        correctAnswers: z4.number(),
        incorrectAnswers: z4.number()
      })
    ).mutation(async ({ ctx, input }) => {
      await recordStudySession(
        ctx.user.id,
        input.phrasesStudied,
        input.correctAnswers,
        input.incorrectAnswers
      );
      return { success: true };
    })
  }),
  // Core learning features
  learning: router({
    // Get next phrase to learn
    getNextPhrase: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return null;
      try {
        const now = /* @__PURE__ */ new Date();
        const userId = ctx.user.id;
        const duePhrase = await db.select({ phrase: phrases }).from(userProgress).innerJoin(phrases, eq7(userProgress.phraseId, phrases.id)).where(
          and6(
            eq7(userProgress.userId, userId),
            lt(userProgress.nextReviewAt, now)
          )
        ).orderBy(desc4(userProgress.nextReviewAt)).limit(1);
        if (duePhrase.length > 0) {
          return duePhrase[0].phrase;
        }
        const newPhrase = await db.select().from(phrases).orderBy(sql6`RAND()`).limit(1);
        return newPhrase.length > 0 ? newPhrase[0] : null;
      } catch (error) {
        console.error("Error getting next phrase:", error);
        return null;
      }
    }),
    // Record answer and update progress
    recordAnswer: protectedProcedure.input(
      z4.object({
        phraseId: z4.string(),
        isCorrect: z4.boolean()
      })
    ).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { success: false };
      try {
        const userId = ctx.user.id;
        const { phraseId, isCorrect } = input;
        const now = /* @__PURE__ */ new Date();
        const existing = await db.select().from(userProgress).where(
          and6(
            eq7(userProgress.userId, userId),
            eq7(userProgress.phraseId, phraseId)
          )
        ).limit(1);
        let interval = 1;
        let easeFactor = 2500;
        let repetitions = 0;
        if (existing.length > 0) {
          const p = existing[0];
          repetitions = p.repetitions;
          easeFactor = p.easeFactor;
          interval = p.interval;
          if (isCorrect) {
            repetitions++;
            if (repetitions === 1) {
              interval = 1;
            } else if (repetitions === 2) {
              interval = 3;
            } else {
              interval = Math.round(interval * (easeFactor / 1e3));
            }
            easeFactor = Math.max(1300, easeFactor + 100 * (5 - 3));
          } else {
            repetitions = 0;
            interval = 1;
            easeFactor = Math.max(1300, easeFactor + 100 * (2 - 3));
          }
          const nextReviewAt = new Date(
            now.getTime() + interval * 24 * 60 * 60 * 1e3
          );
          await db.update(userProgress).set({
            interval,
            easeFactor,
            repetitions,
            correctCount: isCorrect ? p.correctCount + 1 : p.correctCount,
            incorrectCount: !isCorrect ? p.incorrectCount + 1 : p.incorrectCount,
            lastReviewedAt: now,
            nextReviewAt,
            updatedAt: now
          }).where(eq7(userProgress.id, p.id));
        } else {
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
            now.getTime() + interval * 24 * 60 * 60 * 1e3
          );
          await db.insert(userProgress).values({
            id: `progress_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
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
            updatedAt: now
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
        const now = /* @__PURE__ */ new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1e3);
        const todaysPhrases = await db.select({ phrase: phrases }).from(userProgress).innerJoin(phrases, eq7(userProgress.phraseId, phrases.id)).where(
          and6(
            eq7(userProgress.userId, userId),
            sql6`${userProgress.nextReviewAt} >= ${today} AND ${userProgress.nextReviewAt} < ${tomorrow}`
          )
        ).orderBy(desc4(userProgress.nextReviewAt));
        if (todaysPhrases.length < 20) {
          const newPhrases = await db.select().from(phrases).orderBy(sql6`RAND()`).limit(20 - todaysPhrases.length);
          return [...todaysPhrases.map((p) => p.phrase), ...newPhrases];
        }
        return todaysPhrases.map((p) => p.phrase);
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
          db.select({ count: sql6`COUNT(*)` }).from(userProgress).where(
            and6(
              eq7(userProgress.userId, userId),
              sql6`${userProgress.correctCount} > 0`
            )
          ),
          db.select({ count: sql6`COUNT(*)` }).from(userProgress).where(eq7(userProgress.userId, userId)),
          db.select({
            correct: sql6`SUM(${userProgress.correctCount})`,
            total: sql6`SUM(${userProgress.correctCount} + ${userProgress.incorrectCount})`
          }).from(userProgress).where(eq7(userProgress.userId, userId))
        ]);
        const totalReviews = accuracy[0]?.total || 0;
        const correctReviews = accuracy[0]?.correct || 0;
        const accuracyRate = totalReviews > 0 ? Math.round(correctReviews / totalReviews * 100) : 0;
        return {
          learned: learned[0]?.count || 0,
          total: total[0]?.count || 0,
          accuracy: accuracyRate
        };
      } catch (error) {
        console.error("Error getting stats:", error);
        return { learned: 0, total: 0, accuracy: 0 };
      }
    })
  })
});

// server/_core/context.ts
async function createContext(opts) {
  let user = null;
  let userId = null;
  try {
    const authHeader = opts.req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      const decoded = verifyJWT(token);
      if (decoded && decoded.userId) {
        userId = decoded.userId;
        user = await getUser(decoded.userId);
      }
    }
  } catch (error) {
    user = null;
    userId = null;
  }
  return {
    req: opts.req,
    res: opts.res,
    user,
    userId
  };
}

// server/_core/vite.ts
import express from "express";
import fs from "fs";
import { nanoid } from "nanoid";
import path from "path";
import { createServer as createViteServer } from "vite";
async function setupVite(app, server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true
  };
  const vite = await createViteServer({
    // ...viteConfig, // Removed usage of non-existent viteConfig
    configFile: false,
    server: serverOptions,
    appType: "custom",
    // Define a minimal Vite config directly here for the server's use
    define: {
      "import.meta.env.VITE_OAUTH_PORTAL_URL": JSON.stringify("https://oauth.manus.im"),
      "import.meta.env.VITE_APP_ID": JSON.stringify("german-phrase-game-app")
    },
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "..", "..", "client", "src"),
        "@shared": path.resolve(import.meta.dirname, "..", "..", "shared"),
        "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets")
      }
    },
    envDir: path.resolve(import.meta.dirname, "..", ".."),
    root: path.resolve(import.meta.dirname, "..", "..", "client"),
    publicDir: path.resolve(import.meta.dirname, "..", "..", "client", "public"),
    build: {
      outDir: path.resolve(import.meta.dirname, "..", "..", "dist", "public"),
      emptyOutDir: true
    }
  });
  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;
    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "../..",
        "client",
        "index.html"
      );
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e);
      next(e);
    }
  });
}
function serveStatic(app) {
  const distPath = process.env.NODE_ENV === "development" ? path.resolve(import.meta.dirname, "../..", "dist", "public") : path.resolve(import.meta.dirname, "public");
  if (!fs.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }
  app.use(express.static(distPath));
  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}

// server/_core/index.ts
function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}
async function findAvailablePort(startPort = 3e3) {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}
async function startServer() {
  const app = express2();
  const server = createServer(app);
  app.use(express2.json({ limit: "50mb" }));
  app.use(express2.urlencoded({ limit: "50mb", extended: true }));
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext
    })
  );
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }
  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);
  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }
  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}
startServer().catch(console.error);
