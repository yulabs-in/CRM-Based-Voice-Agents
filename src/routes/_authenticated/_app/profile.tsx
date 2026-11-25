import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { Camera, KeyRound, Loader2, LogOut, Trash2, UserRound } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { ROLE_LABELS, useOrg } from "@/lib/org";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/app/PageHeader";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { PasswordStrength } from "@/components/app/PasswordStrength";
import { passwordStrength } from "@/lib/password-strength";
import { friendlyError } from "@/lib/auth-errors";
import { normalizePhoneNumber } from "@/lib/sarvam-call";
import {
  LANGUAGES,
  avatarExtension,
  initials,
  ownAvatarPath,
  profileKey,
  useProfile,
  validateAvatarFile,
} from "@/lib/profile";

export const Route = createFileRoute("/_authenticated/_app/profile")({
  head: () => ({
    meta: [
      { title: "Profile — Yulabs CRM" },
      { name: "description", content: "Your personal details and sign-in." },
    ],
  }),
  component: ProfilePage,
});

const detailsSchema = z.object({
  full_name: z
    .string()
    .trim()
    .min(2, "Enter your full name (2–80 characters).")
    .max(80, "At most 80 characters."),
  job_title: z.string().trim().max(80, "At most 80 characters."),
  phone: z.string().trim().max(30, "That phone number is too long."),
  preferred_language: z.string(),
});
type Details = z.infer<typeof detailsSchema>;

function ProfilePage() {
  const { userId, email, org, role, memberships, switchOrg } = useOrg();
  const { data: profile } = useProfile(userId);
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [pw, setPw] = useState({ password: "", confirm: "" });
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwBusy, setPwBusy] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<Details>({
    resolver: zodResolver(detailsSchema),
    defaultValues: { full_name: "", job_title: "", phone: "", preferred_language: "en-IN" },
  });

  useEffect(() => {
    if (!profile) return;
    reset({
      full_name: profile.full_name ?? "",
      job_title: profile.job_title ?? "",
      phone: profile.phone ?? "",
      preferred_language: profile.preferred_language ?? "en-IN",
    });
  }, [profile, reset]);

  async function onAvatarChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file || !userId) return;
    const problem = validateAvatarFile(file);
    if (problem) {
      toast.error(problem);
      return;
    }

    setUploading(true);
    const path = `${userId}/avatar-${Date.now()}.${avatarExtension(file)}`;
    try {
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from("avatars").getPublicUrl(path);
      const { error: dbError } = await supabase
        .from("profiles")
        .update({ avatar_url: publicUrl })
        .eq("id", userId);
      if (dbError) {
        await supabase.storage.from("avatars").remove([path]);
        throw dbError;
      }

      const oldPath = ownAvatarPath(profile?.avatar_url, userId);
      if (oldPath && oldPath !== path) await supabase.storage.from("avatars").remove([oldPath]);
      await qc.invalidateQueries({ queryKey: profileKey(userId) });
      toast.success("Profile photo updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not upload that photo.");
    } finally {
      setUploading(false);
    }
  }

  async function removeAvatar() {
    if (!userId) return;
    const oldPath = ownAvatarPath(profile?.avatar_url, userId);
    if (oldPath) {
      const { error } = await supabase.storage.from("avatars").remove([oldPath]);
      if (error) {
        toast.error(error.message);
        return;
      }
    }
    const { error } = await supabase.from("profiles").update({ avatar_url: null }).eq("id", userId);
    if (error) {
      toast.error(error.message);
      return;
    }
    await qc.invalidateQueries({ queryKey: profileKey(userId) });
    toast.success("Profile photo removed");
  }

  async function saveDetails(values: Details) {
    const phone = values.phone ? normalizePhoneNumber(values.phone) : null;
    if (values.phone && !phone) {
      setError("phone", { type: "validate", message: "Enter a valid phone number." });
      return;
    }
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: values.full_name,
        job_title: values.job_title || null,
        phone, // null, never "" when empty
        preferred_language: values.preferred_language || null,
      })
      .eq("id", userId);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Profile saved");
    await qc.invalidateQueries({ queryKey: profileKey(userId) });
  }

  async function changePassword(e: FormEvent) {
    e.preventDefault();
    setPwError(null);
    if (passwordStrength(pw.password) < 2) {
      setPwError("Choose a password of at least 'Fair' strength.");
      return;
    }
    if (pw.password !== pw.confirm) {
      setPwError("The two passwords don't match.");
      return;
    }
    setPwBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw.password });
    setPwBusy(false);
    if (error) {
      setPwError(friendlyError(error.message).text);
      return;
    }
    setPw({ password: "", confirm: "" });
    toast.success("Password updated");
  }

  async function signOutOthers() {
    setSigningOut(true);
    const { error } = await supabase.auth.signOut({ scope: "others" });
    setSigningOut(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Signed out everywhere else");
  }

  const displayName = profile?.full_name || email || "Your profile";

  return (
    <div className="animate-rise space-y-6">
      <PageHeader title="Profile" description="Your personal details and sign-in." />

      <section className="rounded-2xl border bg-card p-6 shadow-soft">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <div className="flex flex-col items-center gap-2 sm:items-start">
            <div className="grid size-24 shrink-0 place-items-center overflow-hidden rounded-full bg-gradient-primary text-2xl font-bold text-primary-foreground">
              {profile?.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt={`${displayName}'s profile photo`}
                  className="size-full object-cover"
                />
              ) : (
                <span aria-hidden="true">{initials(profile?.full_name, email)}</span>
              )}
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? <Loader2 className="animate-spin" /> : <Camera />}
                {profile?.avatar_url ? "Replace" : "Upload photo"}
              </Button>
              {profile?.avatar_url && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={removeAvatar}
                  disabled={uploading}
                  className="text-destructive"
                >
                  <Trash2 /> Remove
                </Button>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={onAvatarChange}
              aria-label="Upload profile photo"
            />
            <p className="text-[11px] text-muted-foreground">PNG, JPG or WebP · up to 2 MB</p>
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-xl font-semibold">{displayName}</h2>
            <p className="truncate text-sm text-muted-foreground">{email}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-semibold text-accent-foreground">
                {ROLE_LABELS[role]}
              </span>
              <span className="text-xs text-muted-foreground">
                Member since{" "}
                {profile?.created_at ? format(new Date(profile.created_at), "MMM yyyy") : "—"}
              </span>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border bg-card p-6 shadow-soft">
          <h3 className="text-lg font-semibold">Personal details</h3>
          <p className="mt-1 text-sm text-muted-foreground">How you appear across the CRM.</p>
          <form onSubmit={handleSubmit(saveDetails)} className="mt-5 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="full_name">Full name</Label>
              <Input
                id="full_name"
                {...register("full_name")}
                className="rounded-xl"
                aria-invalid={!!errors.full_name}
              />
              {errors.full_name && (
                <p className="text-xs text-destructive">{errors.full_name.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="job_title">Job title</Label>
              <Input
                id="job_title"
                placeholder="e.g. Sales Manager"
                {...register("job_title")}
                className="rounded-xl"
                aria-invalid={!!errors.job_title}
              />
              {errors.job_title && (
                <p className="text-xs text-destructive">{errors.job_title.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                type="tel"
                placeholder="+91 90000 00000"
                {...register("phone")}
                className="rounded-xl"
                aria-invalid={!!errors.phone}
              />
              {errors.phone && <p className="text-xs text-destructive">{errors.phone.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="preferred_language">Preferred language</Label>
              <select
                id="preferred_language"
                {...register("preferred_language")}
                className="h-10 w-full rounded-xl border bg-background px-3 text-sm"
              >
                {LANGUAGES.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" variant="hero" disabled={!isDirty || isSubmitting}>
              {isSubmitting && <Loader2 className="animate-spin" />} Save changes
            </Button>
          </form>
        </section>

        <div className="space-y-6">
          <section className="rounded-2xl border bg-card p-6 shadow-soft">
            <h3 className="flex items-center gap-2 text-lg font-semibold">
              <KeyRound className="size-5" /> Security
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">Keep your account yours.</p>
            <form onSubmit={changePassword} className="mt-5 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="new-password">New password</Label>
                <Input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  value={pw.password}
                  onChange={(e) => {
                    setPw({ ...pw, password: e.target.value });
                    setPwError(null);
                  }}
                  className="rounded-xl"
                />
                {pw.password && <PasswordStrength value={pw.password} />}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirm-password">Confirm password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  value={pw.confirm}
                  onChange={(e) => {
                    setPw({ ...pw, confirm: e.target.value });
                    setPwError(null);
                  }}
                  className="rounded-xl"
                />
              </div>
              {pwError && (
                <p className="text-xs text-destructive" role="alert">
                  {pwError}
                </p>
              )}
              <Button type="submit" variant="hero" disabled={pwBusy || !pw.password || !pw.confirm}>
                {pwBusy && <Loader2 className="animate-spin" />} Change password
              </Button>
            </form>
            <div className="mt-6 border-t pt-5">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    <LogOut /> Sign out of other devices
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Sign out everywhere else?</AlertDialogTitle>
                    <AlertDialogDescription>
                      All other browsers and devices signed in to this account will be signed out.
                      This device stays signed in.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={signOutOthers} disabled={signingOut}>
                      Sign out others
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </section>

          <section className="rounded-2xl border bg-card p-6 shadow-soft">
            <h3 className="flex items-center gap-2 text-lg font-semibold">
              <UserRound className="size-5" /> Workspaces
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">Your memberships and roles.</p>
            <ul className="mt-5 space-y-3">
              {memberships.length === 0 && (
                <li className="text-sm text-muted-foreground">No workspaces yet</li>
              )}
              {memberships.map((m) => {
                const current = m.organization.id === org.id;
                return (
                  <li key={m.organization.id} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {m.organization.name}
                    </span>
                    {current && (
                      <span className="rounded-full bg-success-soft px-2 py-0.5 text-xs font-semibold text-success">
                        Current
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">{ROLE_LABELS[m.role]}</span>
                    {!current && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => switchOrg(m.organization.id)}
                      >
                        Switch
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
