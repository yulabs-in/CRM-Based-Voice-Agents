import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
export const AVATAR_ERROR = "Use a PNG, JPG or WebP image up to 2 MB.";

const ALLOWED_TYPES = new Map([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"],
]);

/** Client-side check only — the storage bucket policy is the real guard. */
export function validateAvatarFile(file: File): string | null {
  if (!ALLOWED_TYPES.has(file.type) || file.size > MAX_AVATAR_BYTES) return AVATAR_ERROR;
  return null;
}

export function avatarExtension(file: File): string {
  return ALLOWED_TYPES.get(file.type) ?? "png";
}

/** "Kammar Shashank" -> KS, "" + "a@b.com" -> A. */
export function initials(name?: string | null, email?: string | null): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (email ?? "").trim()[0]?.toUpperCase() ?? "?";
}

/** Only delete a previous avatar if it really lives in this user's folder. */
export function ownAvatarPath(url: string | null | undefined, userId: string): string | null {
  if (!url) return null;
  const match = url.split("/avatars/")[1];
  if (!match) return null;
  const path = decodeURIComponent(match.split("?")[0]);
  return path.startsWith(`${userId}/`) ? path : null;
}

export const LANGUAGES = [
  { value: "en-IN", label: "English" },
  { value: "hi-IN", label: "Hindi" },
  { value: "te-IN", label: "Telugu" },
  { value: "ta-IN", label: "Tamil" },
  { value: "kn-IN", label: "Kannada" },
  { value: "ml-IN", label: "Malayalam" },
  { value: "mr-IN", label: "Marathi" },
  { value: "bn-IN", label: "Bengali" },
  { value: "gu-IN", label: "Gujarati" },
] as const;

export const profileKey = (userId: string) => ["profile", userId] as const;

/** Shared by the profile page and AppShell, so one invalidation updates both. */
export function useProfile(userId: string) {
  return useQuery({
    queryKey: profileKey(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select(
          "id, full_name, email, avatar_url, job_title, phone, preferred_language, created_at",
        )
        .eq("id", userId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });
}
