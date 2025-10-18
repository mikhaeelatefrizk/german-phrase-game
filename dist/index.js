// server/_core/index.ts
import "dotenv/config";
import express2 from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";

// shared/const.ts
var COOKIE_NAME = "app_session_id";
var ONE_YEAR_MS = 1e3 * 60 * 60 * 24 * 365;
var AXIOS_TIMEOUT_MS = 3e4;
var UNAUTHED_ERR_MSG = "Please login (10001)";
var NOT_ADMIN_ERR_MSG = "You do not have required permission (10002)";

// server/db.ts
import { eq, and, lte, sql, desc, asc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";

// drizzle/schema.ts
import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";
var users = mysqlTable("users", {
  id: varchar("id", { length: 64 }).primaryKey(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
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

// server/_core/env.ts
var ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? ""
};

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
async function upsertUser(user) {
  if (!user.id) {
    throw new Error("User ID is required for upsert");
  }
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }
  try {
    const values = {
      id: user.id
    };
    const updateSet = {};
    const textFields = ["name", "email", "loginMethod"];
    const assignNullable = (field) => {
      const value = user[field];
      if (value === void 0) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== void 0) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role === void 0) {
      if (user.id === ENV.ownerId) {
        user.role = "admin";
        values.role = "admin";
        updateSet.role = "admin";
      }
    }
    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = /* @__PURE__ */ new Date();
    }
    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
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

// server/_core/cookies.ts
function isSecureRequest(req) {
  if (req.protocol === "https") return true;
  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;
  const protoList = Array.isArray(forwardedProto) ? forwardedProto : forwardedProto.split(",");
  return protoList.some((proto) => proto.trim().toLowerCase() === "https");
}
function getSessionCookieOptions(req) {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "none",
    secure: isSecureRequest(req)
  };
}

// shared/_core/errors.ts
var HttpError = class extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
    this.name = "HttpError";
  }
};
var ForbiddenError = (msg) => new HttpError(403, msg);

// server/_core/sdk.ts
import axios from "axios";
import { parse as parseCookieHeader } from "cookie";
import { SignJWT, jwtVerify } from "jose";
var isNonEmptyString = (value) => typeof value === "string" && value.length > 0;
var EXCHANGE_TOKEN_PATH = `/webdev.v1.WebDevAuthPublicService/ExchangeToken`;
var GET_USER_INFO_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfo`;
var GET_USER_INFO_WITH_JWT_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfoWithJwt`;
var OAuthService = class {
  constructor(client) {
    this.client = client;
    console.log("[OAuth] Initialized with baseURL:", ENV.oAuthServerUrl);
    if (!ENV.oAuthServerUrl) {
      console.error(
        "[OAuth] ERROR: OAUTH_SERVER_URL is not configured! Set OAUTH_SERVER_URL environment variable."
      );
    }
  }
  decodeState(state) {
    const redirectUri = atob(state);
    return redirectUri;
  }
  async getTokenByCode(code, state) {
    const payload = {
      clientId: ENV.appId,
      grantType: "authorization_code",
      code,
      redirectUri: this.decodeState(state)
    };
    const { data } = await this.client.post(
      EXCHANGE_TOKEN_PATH,
      payload
    );
    return data;
  }
  async getUserInfoByToken(token) {
    const { data } = await this.client.post(
      GET_USER_INFO_PATH,
      {
        accessToken: token.accessToken
      }
    );
    return data;
  }
};
var createOAuthHttpClient = () => axios.create({
  baseURL: ENV.oAuthServerUrl,
  timeout: AXIOS_TIMEOUT_MS
});
var SDKServer = class {
  client;
  oauthService;
  constructor(client = createOAuthHttpClient()) {
    this.client = client;
    this.oauthService = new OAuthService(this.client);
  }
  deriveLoginMethod(platforms, fallback) {
    if (fallback && fallback.length > 0) return fallback;
    if (!Array.isArray(platforms) || platforms.length === 0) return null;
    const set = new Set(
      platforms.filter((p) => typeof p === "string")
    );
    if (set.has("REGISTERED_PLATFORM_EMAIL")) return "email";
    if (set.has("REGISTERED_PLATFORM_GOOGLE")) return "google";
    if (set.has("REGISTERED_PLATFORM_APPLE")) return "apple";
    if (set.has("REGISTERED_PLATFORM_MICROSOFT") || set.has("REGISTERED_PLATFORM_AZURE"))
      return "microsoft";
    if (set.has("REGISTERED_PLATFORM_GITHUB")) return "github";
    const first = Array.from(set)[0];
    return first ? first.toLowerCase() : null;
  }
  /**
   * Exchange OAuth authorization code for access token
   * @example
   * const tokenResponse = await sdk.exchangeCodeForToken(code, state);
   */
  async exchangeCodeForToken(code, state) {
    return this.oauthService.getTokenByCode(code, state);
  }
  /**
   * Get user information using access token
   * @example
   * const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
   */
  async getUserInfo(accessToken) {
    const data = await this.oauthService.getUserInfoByToken({
      accessToken
    });
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  parseCookies(cookieHeader) {
    if (!cookieHeader) {
      return /* @__PURE__ */ new Map();
    }
    const parsed = parseCookieHeader(cookieHeader);
    return new Map(Object.entries(parsed));
  }
  getSessionSecret() {
    const secret = ENV.cookieSecret;
    return new TextEncoder().encode(secret);
  }
  /**
   * Create a session token for a user ID
   * @example
   * const sessionToken = await sdk.createSessionToken(userInfo.id);
   */
  async createSessionToken(userId, options = {}) {
    return this.signSession(
      {
        openId: userId,
        appId: ENV.appId,
        name: options.name || ""
      },
      options
    );
  }
  async signSession(payload, options = {}) {
    const issuedAt = Date.now();
    const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS;
    const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1e3);
    const secretKey = this.getSessionSecret();
    return new SignJWT({
      openId: payload.openId,
      appId: payload.appId,
      name: payload.name
    }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setExpirationTime(expirationSeconds).sign(secretKey);
  }
  async verifySession(cookieValue) {
    if (!cookieValue) {
      console.warn("[Auth] Missing session cookie");
      return null;
    }
    try {
      const secretKey = this.getSessionSecret();
      const { payload } = await jwtVerify(cookieValue, secretKey, {
        algorithms: ["HS256"]
      });
      const { openId, appId, name } = payload;
      if (!isNonEmptyString(openId) || !isNonEmptyString(appId) || !isNonEmptyString(name)) {
        console.warn("[Auth] Session payload missing required fields");
        return null;
      }
      return {
        openId,
        appId,
        name
      };
    } catch (error) {
      console.warn("[Auth] Session verification failed", String(error));
      return null;
    }
  }
  async getUserInfoWithJwt(jwtToken) {
    const payload = {
      jwtToken,
      projectId: ENV.appId
    };
    const { data } = await this.client.post(
      GET_USER_INFO_WITH_JWT_PATH,
      payload
    );
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  async authenticateRequest(req) {
    const cookies = this.parseCookies(req.headers.cookie);
    const sessionCookie = cookies.get(COOKIE_NAME);
    const session = await this.verifySession(sessionCookie);
    if (!session) {
      throw ForbiddenError("Invalid session cookie");
    }
    const sessionUserId = session.openId;
    const signedInAt = /* @__PURE__ */ new Date();
    let user = await getUser(sessionUserId);
    if (!user) {
      try {
        const userInfo = await this.getUserInfoWithJwt(sessionCookie ?? "");
        await upsertUser({
          id: userInfo.openId,
          name: userInfo.name || null,
          email: userInfo.email ?? null,
          loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
          lastSignedIn: signedInAt
        });
        user = await getUser(userInfo.openId);
      } catch (error) {
        console.error("[Auth] Failed to sync user from OAuth:", error);
        throw ForbiddenError("Failed to sync user info");
      }
    }
    if (!user) {
      throw ForbiddenError("User not found");
    }
    await upsertUser({
      id: user.id,
      lastSignedIn: signedInAt
    });
    return user;
  }
};
var sdk = new SDKServer();

// server/_core/oauth.ts
function getQueryParam(req, key) {
  const value = req.query[key];
  return typeof value === "string" ? value : void 0;
}
function registerOAuthRoutes(app) {
  app.get("/api/oauth/callback", async (req, res) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");
    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }
    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }
      await upsertUser({
        id: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: /* @__PURE__ */ new Date()
      });
      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS
      });
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      res.redirect(302, "/");
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}

// server/_core/systemRouter.ts
import { z } from "zod";

// server/_core/notification.ts
import { TRPCError } from "@trpc/server";
var TITLE_MAX_LENGTH = 1200;
var CONTENT_MAX_LENGTH = 2e4;
var trimValue = (value) => value.trim();
var isNonEmptyString2 = (value) => typeof value === "string" && value.trim().length > 0;
var buildEndpointUrl = (baseUrl) => {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(
    "webdevtoken.v1.WebDevService/SendNotification",
    normalizedBase
  ).toString();
};
var validatePayload = (input) => {
  if (!isNonEmptyString2(input.title)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification title is required."
    });
  }
  if (!isNonEmptyString2(input.content)) {
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
import { z as z2 } from "zod";
import { eq as eq4, and as and4, lt, desc as desc3, sql as sql4 } from "drizzle-orm";

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
      avgAccuracy: sql3`ROUND(SUM(${userProgress.correctCount}) / (SUM(${userProgress.correctCount}) + SUM(${userProgress.incorrectCount})) * 100)`
    }).from(userProgress).where(eq3(userProgress.userId, userId));
    const recentSessions = await db.select().from(studySessions).where(eq3(studySessions.userId, userId)).orderBy(desc2(studySessions.sessionDate)).limit(10);
    const analytics = await db.select().from(learningAnalytics).where(eq3(learningAnalytics.userId, userId)).limit(1);
    const commonMistakes = await db.select({
      mistakeType: mistakes.mistakeType,
      count: sql3`COUNT(*)`
    }).from(mistakes).where(eq3(mistakes.userId, userId)).groupBy(mistakes.mistakeType).orderBy(desc2(sql3`COUNT(*)`)).limit(5);
    const strugglingPhrases = await db.select({
      phrase: phrases,
      progress: userProgress
    }).from(userProgress).innerJoin(phrases, eq3(userProgress.phraseId, phrases.id)).where(
      and3(
        eq3(userProgress.userId, userId),
        sql3`${userProgress.incorrectCount} > ${userProgress.correctCount}`
      )
    ).orderBy(desc2(userProgress.incorrectCount)).limit(5);
    const masteredCount = await db.select({ count: sql3`COUNT(*)` }).from(userProgress).where(
      and3(
        eq3(userProgress.userId, userId),
        sql3`${userProgress.repetitions} >= 5`
      )
    );
    return {
      stats: progressStats[0] || {
        totalLearned: 0,
        totalReviewed: 0,
        totalCorrect: 0,
        totalIncorrect: 0,
        avgAccuracy: 0
      },
      recentSessions,
      analytics: analytics[0] || null,
      commonMistakes,
      strugglingPhrases,
      masteredCount: masteredCount[0]?.count || 0,
      totalPhrases: 4e3
    };
  } catch (error) {
    console.error("[Chatbot] Error getting user context:", error);
    return null;
  }
}
async function getPhrasDetails(phraseId, userId) {
  const db = await getDb();
  if (!db) return null;
  try {
    const phraseData = await db.select().from(phrases).where(eq3(phrases.id, phraseId)).limit(1);
    if (phraseData.length === 0) return null;
    const phrase = phraseData[0];
    const userProgress_ = await db.select().from(userProgress).where(
      and3(
        eq3(userProgress.userId, userId),
        eq3(userProgress.phraseId, phraseId)
      )
    ).limit(1);
    return {
      phrase,
      userProgress: userProgress_[0] || null
    };
  } catch (error) {
    console.error("[Chatbot] Error getting phrase details:", error);
    return null;
  }
}
function calculateCompletionTime(context) {
  if (!context) return "Unable to calculate";
  const { stats, analytics } = context;
  const phrasesLearned = stats.totalLearned || 0;
  const totalPhrases = 4e3;
  const phrasesRemaining = totalPhrases - phrasesLearned;
  const avgPhrasesPerDay = analytics?.avgPhrasesPerDay || 20;
  if (avgPhrasesPerDay === 0) {
    return "Start learning to get an estimate!";
  }
  const daysRemaining = Math.ceil(phrasesRemaining / avgPhrasesPerDay);
  const weeksRemaining = Math.ceil(daysRemaining / 7);
  const monthsRemaining = Math.ceil(daysRemaining / 30);
  if (daysRemaining < 7) {
    return `${daysRemaining} days`;
  } else if (daysRemaining < 30) {
    return `${weeksRemaining} weeks`;
  } else {
    return `${monthsRemaining} months`;
  }
}
async function generateChatbotResponse(userId, userMessage, phraseId) {
  try {
    const context = await getUserContext(userId);
    if (!context) {
      return "I'm unable to access your learning data. Please try again.";
    }
    let phraseContext = "";
    if (phraseId) {
      const phraseData = await getPhrasDetails(phraseId, userId);
      if (phraseData) {
        phraseContext = `
Current phrase being studied:
- German: ${phraseData.phrase.german}
- English: ${phraseData.phrase.english}
- Pronunciation: ${phraseData.phrase.pronunciation}
- Category: ${phraseData.phrase.category}
- User's progress: ${phraseData.userProgress?.correctCount || 0} correct, ${phraseData.userProgress?.incorrectCount || 0} incorrect
`;
      }
    }
    const completionTime = calculateCompletionTime(context);
    const systemPrompt = `You are an expert German B1 language tutor and learning coach. You have complete access to the student's learning data:

STUDENT'S LEARNING PROGRESS:
- Phrases learned: ${context.stats.totalLearned} / 4000 (${Math.round(context.stats.totalLearned / 4e3 * 100)}%)
- Total phrases reviewed: ${context.stats.totalReviewed}
- Correct answers: ${context.stats.totalCorrect}
- Incorrect answers: ${context.stats.totalIncorrect}
- Overall accuracy: ${context.stats.avgAccuracy}%
- Mastered phrases (5+ reviews): ${context.masteredCount}
- Estimated completion time: ${completionTime}

LEARNING PACE:
- Average phrases per day: ${context.analytics?.avgPhrasesPerDay || 0}
- Learning pace: ${context.analytics?.learningPace || "normal"}
- Study streak: ${context.recentSessions.length} recent sessions

COMMON MISTAKES:
${context.commonMistakes.map((m) => `- ${m.mistakeType}: ${m.count} times`).join("\n")}

STRUGGLING PHRASES (top 5):
${context.strugglingPhrases.map((p) => `- "${p.phrase.german}" (${p.progress.incorrectCount} mistakes)`).join("\n")}

${phraseContext}

Your role:
1. Explain German phrases word-by-word with grammar
2. Provide personalized learning recommendations
3. Predict completion time based on current pace
4. Explain grammar concepts relevant to phrases being studied
5. Motivate and encourage the student
6. Answer any B1 German language questions
7. Suggest strategies to improve weak areas
8. Celebrate progress and milestones

Be encouraging, specific, and always reference the student's actual progress data. Use their learning patterns to give personalized advice.`;
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
    const textContent = response.choices[0]?.message?.content;
    if (typeof textContent === "string") {
      return textContent;
    }
    return "I'm having trouble generating a response. Please try again.";
  } catch (error) {
    console.error("[Chatbot] Error generating response:", error);
    return "I encountered an error. Please try again later.";
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
          content: `You are a German grammar expert. Explain the grammar in German phrases for B1 level students. Be concise but thorough.`
        },
        {
          role: "user",
          content: `Explain the grammar in this German phrase word-by-word:
          
German: ${phrase.german}
English: ${phrase.english}

Break it down:
1. Word-by-word translation
2. Grammar concepts used (cases, tenses, etc.)
3. Why it's structured this way
4. Similar phrases with the same grammar pattern`
        }
      ]
    });
    const textContent = response.choices[0]?.message?.content;
    if (typeof textContent === "string") {
      return textContent;
    }
    return "Unable to generate explanation";
  } catch (error) {
    console.error("[Chatbot] Error getting grammar explanation:", error);
    return "Error fetching grammar explanation";
  }
}

// server/routers.ts
var appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true };
    })
  }),
  // AI Chatbot
  chatbot: router({
    // Get AI response
    ask: protectedProcedure.input(
      z2.object({
        message: z2.string(),
        phraseId: z2.string().optional()
      })
    ).mutation(async ({ ctx, input }) => {
      return await generateChatbotResponse(
        ctx.user.id,
        input.message,
        input.phraseId
      );
    }),
    // Get grammar explanation
    explainGrammar: protectedProcedure.input(z2.object({ phraseId: z2.string() })).query(async ({ input }) => {
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
      z2.object({
        taskId: z2.string(),
        phraseId: z2.string(),
        isCorrect: z2.boolean(),
        timeSpentSeconds: z2.number()
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
    initializeTasks: protectedProcedure.input(z2.object({ dailyLoad: z2.number().optional() })).mutation(async ({ ctx, input }) => {
      await initializeDailyTasks(ctx.user.id, input.dailyLoad || 20);
      return { success: true };
    }),
    // Record study session
    recordSession: protectedProcedure.input(
      z2.object({
        phrasesStudied: z2.number(),
        correctAnswers: z2.number(),
        incorrectAnswers: z2.number()
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
        const duePhrase = await db.select({ phrase: phrases }).from(userProgress).innerJoin(phrases, eq4(userProgress.phraseId, phrases.id)).where(
          and4(
            eq4(userProgress.userId, userId),
            lt(userProgress.nextReviewAt, now)
          )
        ).orderBy(desc3(userProgress.nextReviewAt)).limit(1);
        if (duePhrase.length > 0) {
          return duePhrase[0].phrase;
        }
        const newPhrase = await db.select().from(phrases).orderBy(sql4`RAND()`).limit(1);
        return newPhrase.length > 0 ? newPhrase[0] : null;
      } catch (error) {
        console.error("Error getting next phrase:", error);
        return null;
      }
    }),
    // Record answer and update progress
    recordAnswer: protectedProcedure.input(
      z2.object({
        phraseId: z2.string(),
        isCorrect: z2.boolean()
      })
    ).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { success: false };
      try {
        const userId = ctx.user.id;
        const { phraseId, isCorrect } = input;
        const now = /* @__PURE__ */ new Date();
        const existing = await db.select().from(userProgress).where(
          and4(
            eq4(userProgress.userId, userId),
            eq4(userProgress.phraseId, phraseId)
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
          }).where(eq4(userProgress.id, p.id));
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
        const todaysPhrases = await db.select({ phrase: phrases }).from(userProgress).innerJoin(phrases, eq4(userProgress.phraseId, phrases.id)).where(
          and4(
            eq4(userProgress.userId, userId),
            sql4`${userProgress.nextReviewAt} >= ${today} AND ${userProgress.nextReviewAt} < ${tomorrow}`
          )
        ).orderBy(desc3(userProgress.nextReviewAt));
        if (todaysPhrases.length < 20) {
          const newPhrases = await db.select().from(phrases).orderBy(sql4`RAND()`).limit(20 - todaysPhrases.length);
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
          db.select({ count: sql4`COUNT(*)` }).from(userProgress).where(
            and4(
              eq4(userProgress.userId, userId),
              sql4`${userProgress.correctCount} > 0`
            )
          ),
          db.select({ count: sql4`COUNT(*)` }).from(userProgress).where(eq4(userProgress.userId, userId)),
          db.select({
            correct: sql4`SUM(${userProgress.correctCount})`,
            total: sql4`SUM(${userProgress.correctCount} + ${userProgress.incorrectCount})`
          }).from(userProgress).where(eq4(userProgress.userId, userId))
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
  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    user = null;
  }
  return {
    req: opts.req,
    res: opts.res,
    user
  };
}

// server/_core/vite.ts
import express from "express";
import fs from "fs";
import { nanoid } from "nanoid";
import path2 from "path";
import { createServer as createViteServer } from "vite";

// vite.config.ts
import { jsxLocPlugin } from "@builder.io/vite-plugin-jsx-loc";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";
import { vitePluginManusRuntime } from "vite-plugin-manus-runtime";
var plugins = [react(), tailwindcss(), jsxLocPlugin(), vitePluginManusRuntime()];
var vite_config_default = defineConfig({
  plugins,
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets")
    }
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  publicDir: path.resolve(import.meta.dirname, "client", "public"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true
  },
  server: {
    host: true,
    allowedHosts: [
      ".manuspre.computer",
      ".manus.computer",
      ".manus-asia.computer",
      ".manuscomputer.ai",
      ".manusvm.computer",
      "localhost",
      "127.0.0.1"
    ],
    fs: {
      strict: true,
      deny: ["**/.*"]
    }
  }
});

// server/_core/vite.ts
async function setupVite(app, server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true
  };
  const vite = await createViteServer({
    ...vite_config_default,
    configFile: false,
    server: serverOptions,
    appType: "custom"
  });
  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;
    try {
      const clientTemplate = path2.resolve(
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
  const distPath = process.env.NODE_ENV === "development" ? path2.resolve(import.meta.dirname, "../..", "dist", "public") : path2.resolve(import.meta.dirname, "public");
  if (!fs.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }
  app.use(express.static(distPath));
  app.use("*", (_req, res) => {
    res.sendFile(path2.resolve(distPath, "index.html"));
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
  registerOAuthRoutes(app);
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
