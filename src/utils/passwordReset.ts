import crypto from "crypto";
import { prisma } from "../lib/prisma";
import logger from "../lib/logger";

const TOKEN_EXPIRY_MINUTES = 30;
const TOKEN_BYTES = 32;

/**
 * Generate a secure password reset token
 * Returns the plain token (to send via email) and stores the hash in the database
 */
export async function generatePasswordResetToken(
  userId: string
): Promise<string> {
  // Generate cryptographically secure random token
  const token = crypto.randomBytes(TOKEN_BYTES).toString("hex");

  // Hash token for storage (never store plain tokens)
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  // Calculate expiry
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_MINUTES * 60 * 1000);

  // Invalidate any existing tokens for this user
  await prisma.passwordResetToken.updateMany({
    where: { userId, usedAt: null },
    data: { usedAt: new Date() }, // Mark as used
  });

  // Create new token record
  await prisma.passwordResetToken.create({
    data: {
      userId,
      tokenHash,
      expiresAt,
    },
  });

  logger.info("Password reset token generated", { userId, expiresAt });

  return token;
}

/**
 * Verify a password reset token
 * Returns user ID if valid, null otherwise
 */
export async function verifyPasswordResetToken(
  token: string
): Promise<string | null> {
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  const resetToken = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!resetToken) {
    logger.debug("Password reset token not found");
    return null;
  }

  if (resetToken.usedAt) {
    logger.debug("Password reset token already used", {
      tokenId: resetToken.id,
    });
    return null;
  }

  if (resetToken.expiresAt < new Date()) {
    logger.debug("Password reset token expired", { tokenId: resetToken.id });
    return null;
  }

  return resetToken.userId;
}

/**
 * Mark token as used (call after successful password reset)
 */
export async function invalidatePasswordResetToken(
  token: string
): Promise<void> {
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  try {
    await prisma.passwordResetToken.update({
      where: { tokenHash },
      data: { usedAt: new Date() },
    });
    logger.info("Password reset token invalidated", {
      tokenHash: tokenHash.substring(0, 8) + "...",
    });
  } catch (error) {
    logger.error("Failed to invalidate password reset token", error);
  }
}

/**
 * Clean up expired tokens (can be called periodically)
 */
export async function cleanupExpiredTokens(): Promise<number> {
  const result = await prisma.passwordResetToken.deleteMany({
    where: {
      OR: [{ expiresAt: { lt: new Date() } }, { usedAt: { not: null } }],
    },
  });

  if (result.count > 0) {
    logger.info(`Cleaned up ${result.count} expired password reset tokens`);
  }

  return result.count;
}
