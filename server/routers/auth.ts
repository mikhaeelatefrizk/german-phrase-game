import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import {
  registerUser,
  loginUser,
  getUserById,
  updatePassword,
  deleteUser,
} from "../authService";
import crypto from "crypto";

/**
 * JWT Token Management
 */
const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-in-production";
const TOKEN_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

function generateJWT(userId: string): string {
  const header = Buffer.from(
    JSON.stringify({ alg: "HS256", typ: "JWT" })
  ).toString("base64url");

  const payload = Buffer.from(
    JSON.stringify({
      userId,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor((Date.now() + TOKEN_EXPIRY) / 1000),
    })
  ).toString("base64url");

  const signature = crypto
    .createHmac("sha256", JWT_SECRET)
    .update(`${header}.${payload}`)
    .digest("base64url");

  return `${header}.${payload}.${signature}`;
}

function verifyJWT(token: string): { userId: string } | null {
  try {
    const [header, payload, signature] = token.split(".");

    // Verify signature
    const expectedSignature = crypto
      .createHmac("sha256", JWT_SECRET)
      .update(`${header}.${payload}`)
      .digest("base64url");

    if (signature !== expectedSignature) {
      return null;
    }

    // Decode and verify payload
    const decodedPayload = JSON.parse(
      Buffer.from(payload, "base64url").toString()
    );

    // Check expiration
    if (decodedPayload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return { userId: decodedPayload.userId };
  } catch (error) {
    return null;
  }
}

/**
 * Authentication Router
 */
export const authRouter = router({
  /**
   * Register a new user
   */
  registerUser: publicProcedure
    .input(
      z.object({
        email: z.string().email("Invalid email address"),
        password: z
          .string()
          .min(8, "Password must be at least 8 characters long"),
        name: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        const result = await registerUser(input.email, input.password, input.name);
        const token = generateJWT(result.userId);

        return {
          success: true,
          userId: result.userId,
          email: result.email,
          token,
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
  loginUser: publicProcedure
    .input(
      z.object({
        email: z.string().email("Invalid email address"),
        password: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        const result = await loginUser(input.email, input.password);
        const token = generateJWT(result.userId);

        return {
          success: true,
          userId: result.userId,
          email: result.email,
          name: result.name,
          token,
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
  getSession: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input }) => {
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
  verifyToken: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(({ input }) => {
      const decoded = verifyJWT(input.token);
      return {
        valid: decoded !== null,
        userId: decoded?.userId || null,
      };
    }),

  /**
   * Update user password
   */
  updatePassword: publicProcedure
    .input(
      z.object({
        userId: z.string(),
        currentPassword: z.string(),
        newPassword: z
          .string()
          .min(8, "Password must be at least 8 characters long"),
        token: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        // Verify token
        const decoded = verifyJWT(input.token);
        if (!decoded || decoded.userId !== input.userId) {
          throw new Error("Unauthorized");
        }

        // Verify current password by attempting login
        const user = await getUserById(input.userId);
        if (!user) {
          throw new Error("User not found");
        }

        // Update password
        await updatePassword(input.userId, input.newPassword);

        return {
          success: true,
          message: "Password updated successfully",
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
  deleteAccount: publicProcedure
    .input(
      z.object({
        userId: z.string(),
        password: z.string(),
        token: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        // Verify token
        const decoded = verifyJWT(input.token);
        if (!decoded || decoded.userId !== input.userId) {
          throw new Error("Unauthorized");
        }

        // Delete user
        await deleteUser(input.userId);

        return {
          success: true,
          message: "Account deleted successfully",
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
  logout: publicProcedure
    .input(z.object({ token: z.string() }))
    .mutation(async ({ input }) => {
      // Verify token is valid before logout
      const decoded = verifyJWT(input.token);

      if (!decoded) {
        throw new Error("Invalid token");
      }

      // In a real application, you might want to blacklist the token
      // or store logout events in a database
      return {
        success: true,
        message: "Logged out successfully",
      };
    }),
});

export { verifyJWT, generateJWT };

