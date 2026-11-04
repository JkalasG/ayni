import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import { config } from "./config";
import { db } from "./db";
import type { User } from "@prisma/client";

export interface AuthedRequest extends Request {
  user: User;
}

export function issueToken(userId: string): string {
  return jwt.sign({ sub: userId }, config.jwtSecret, { expiresIn: "30d" });
}

/** Short-lived signed state for OAuth / checkout round trips (prevents tampering). */
export function signState(data: Record<string, string>): string {
  return jwt.sign(data, config.jwtSecret, { expiresIn: "30m" });
}

export function readState(state: string): Record<string, string> {
  return jwt.verify(state, config.jwtSecret) as Record<string, string>;
}

/**
 * Only redirect back to our own app: the custom scheme, the web build,
 * or Expo Go during development. Prevents open redirects.
 */
export function isAllowedRedirect(url: string): boolean {
  if (url.startsWith(`${config.appScheme}://`)) return true;
  if (url.startsWith(config.appWebUrl)) return true;
  if (config.allowExpoGoRedirects && (url.startsWith("exp://") || url.startsWith("http://localhost"))) return true;
  return false;
}

export function appendQuery(url: string, params: Record<string, string>): string {
  const sep = url.includes("?") ? "&" : "?";
  return url + sep + new URLSearchParams(params).toString();
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  try {
    const { sub } = jwt.verify(token, config.jwtSecret) as { sub: string };
    const user = await db.user.findUnique({ where: { id: sub } });
    if (!user) return res.status(401).json({ error: "unauthorized" });
    (req as AuthedRequest).user = user;
    next();
  } catch {
    res.status(401).json({ error: "unauthorized" });
  }
}
