import crypto from "crypto";
import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { users } from "../drizzle/schema";

/**
 * Authentication Service
 * Handles user registration, login, password hashing, and session management
 */

// Constants
const SALT_LENGTH = 32; // bytes
const HASH_ITERATIONS = 100000; // PBKDF2 iterations
const HASH_ALGORITHM = "sha256";
const HASH_KEY_LENGTH = 64; // bytes

/**
 * Generate a cryptographically secure random salt
 */
function generateSalt(): string {
  return crypto.randomBytes(SALT_LENGTH).toString("hex");
}

/**
 * Hash a password using PBKDF2 with a given salt
 */
function hashPassword(password: string, salt: string): string {
  return crypto
    .pbkdf2Sync(password, salt, HASH_ITERATIONS, HASH_KEY_LENGTH, HASH_ALGORITHM)
    .toString("hex");
}

/**
 * Verify a password against a stored hash
 */
function verifyPassword(password: string, salt: string, hash: string): boolean {
  const newHash = hashPassword(password, salt);
  return newHash === hash;
}

/**
 * Generate a unique user ID
 */
function generateUserId(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Register a new user
 */
export async function registerUser(
  email: string,
  password: string,
  name?: string
): Promise<{ userId: string; email: string }> {
  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new Error("Invalid email format");
  }

  // Validate password strength
  if (password.length < 8) {
    throw new Error("Password must be at least 8 characters long");
  }

  const db = await getDb();
  if (!db) {
    throw new Error("Database connection not available");
  }

  // Check if user already exists
  const existingUser = await db
    .select()
    .from(users)
    .where(eq(users.email, email));

  if (existingUser.length > 0) {
    throw new Error("User with this email already exists");
  }

  // Generate salt and hash password
  const salt = generateSalt();
  const passwordHash = hashPassword(password, salt);

  // Create user
  const userId = generateUserId();
  await db.insert(users).values({
    id: userId,
    email,
    name: name || email.split("@")[0], // Use part of email as default name
    passwordHash,
    salt,
    loginMethod: "email/password",
    role: "user",
  });

  return {
    userId,
    email,
  };
}

/**
 * Authenticate user and return user details if credentials are valid
 */
export async function loginUser(
  email: string,
  password: string
): Promise<{ userId: string; email: string; name: string | null }> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database connection not available");
  }

  // Find user by email
  const userResult = await db
    .select()
    .from(users)
    .where(eq(users.email, email));

  if (userResult.length === 0) {
    throw new Error("Invalid email or password");
  }

  const user = userResult[0];

  // Verify password
  if (!user.passwordHash || !user.salt) {
    throw new Error("Invalid email or password");
  }

  const isPasswordValid = verifyPassword(password, user.salt, user.passwordHash);

  if (!isPasswordValid) {
    throw new Error("Invalid email or password");
  }

  // Update last signed in timestamp
  await db
    .update(users)
    .set({ lastSignedIn: new Date() })
    .where(eq(users.id, user.id));

  return {
    userId: user.id,
    email: user.email || "",
    name: user.name,
  };
}

/**
 * Get user by ID
 */
export async function getUserById(userId: string) {
  const db = await getDb();
  if (!db) {
    return null;
  }

  const userResult = await db
    .select()
    .from(users)
    .where(eq(users.id, userId));

  if (userResult.length === 0) {
    return null;
  }

  const user = userResult[0];
  return {
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  };
}

/**
 * Update user password
 */
export async function updatePassword(
  userId: string,
  newPassword: string
): Promise<void> {
  // Validate password strength
  if (newPassword.length < 8) {
    throw new Error("Password must be at least 8 characters long");
  }

  const db = await getDb();
  if (!db) {
    throw new Error("Database connection not available");
  }

  // Generate new salt and hash
  const salt = generateSalt();
  const passwordHash = hashPassword(newPassword, salt);

  // Update user
  await db
    .update(users)
    .set({ passwordHash, salt })
    .where(eq(users.id, userId));
}

/**
 * Delete user account
 */
export async function deleteUser(userId: string): Promise<void> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database connection not available");
  }

  await db.delete(users).where(eq(users.id, userId));
}

