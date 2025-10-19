import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import * as db from "../db";
import { verifyJWT } from "../routers/auth";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  userId: string | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;
  let userId: string | null = null;

  try {
    // Try to get JWT token from Authorization header
    const authHeader = opts.req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      const decoded = verifyJWT(token);
      
      if (decoded && decoded.userId) {
        userId = decoded.userId;
        user = await db.getUser(decoded.userId);
      }
    }
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
    userId = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
    userId,
  };
}

