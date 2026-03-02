export type { UserRole, UserTier } from "@/generated/prisma/client";

export interface UserProfile {
  id: string;
  email: string | null;
  role: "admin" | "client";
  tier: "free" | "premium";
  createdAt: string;
  updatedAt: string;
}
