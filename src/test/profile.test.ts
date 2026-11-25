import { describe, expect, it } from "vitest";
import {
  AVATAR_ERROR,
  MAX_AVATAR_BYTES,
  avatarExtension,
  initials,
  ownAvatarPath,
  validateAvatarFile,
} from "@/lib/profile";
import { passwordStrength } from "@/lib/password-strength";

const image = (type: string, size: number) => new File([new Uint8Array(size)], "photo", { type });

describe("validateAvatarFile", () => {
  it("accepts PNG, JPG and WebP up to 2 MB", () => {
    for (const type of ["image/png", "image/jpeg", "image/webp"]) {
      expect(validateAvatarFile(image(type, MAX_AVATAR_BYTES)), type).toBeNull();
    }
    expect(avatarExtension(image("image/png", 4))).toBe("png");
    expect(avatarExtension(image("image/jpeg", 4))).toBe("jpg");
    expect(avatarExtension(image("image/webp", 4))).toBe("webp");
  });

  it("rejects other formats and files over 2 MB", () => {
    for (const type of ["image/gif", "image/svg+xml", "application/pdf", ""]) {
      expect(validateAvatarFile(image(type, 100)), type).toBe(AVATAR_ERROR);
    }
    expect(validateAvatarFile(image("image/png", MAX_AVATAR_BYTES + 1))).toBe(AVATAR_ERROR);
  });
});

describe("initials", () => {
  it("uses the first and last name", () => {
    expect(initials("Kammar Shashank")).toBe("KS");
    expect(initials("  Kammar   Shashank  ")).toBe("KS");
  });

  it("handles single names and missing names", () => {
    expect(initials("Kammar")).toBe("K");
    expect(initials("", "a@b.com")).toBe("A");
    expect(initials(null, null)).toBe("?");
  });
});

describe("ownAvatarPath", () => {
  const id = "user-a";

  it("only returns paths inside the given user's folder", () => {
    const url = "https://example.supabase.co/storage/v1/object/public/avatars/user-a/avatar-1.png";
    expect(ownAvatarPath(url, id)).toBe("user-a/avatar-1.png");
    expect(ownAvatarPath(url, "user-b")).toBeNull();
    expect(ownAvatarPath("https://example.com/other.png", id)).toBeNull();
    expect(ownAvatarPath(null, id)).toBeNull();
  });
});

describe("passwordStrength", () => {
  it("scores length, case, digits and symbols", () => {
    expect(passwordStrength("")).toBe(0);
    expect(passwordStrength("short")).toBe(0);
    expect(passwordStrength("longenough")).toBeGreaterThanOrEqual(1);
    expect(passwordStrength("LongEnough1!")).toBe(4);
  });
});
