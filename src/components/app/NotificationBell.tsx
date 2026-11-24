import { useState, useEffect, useCallback } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Bell, CheckCheck, ExternalLink, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useOrg } from "@/lib/org";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

export interface NotificationItem {
  id: string;
  organization_id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  priority: "normal" | "high";
  dedupe_key: string | null;
  read_at: string | null;
  created_at: string;
}

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export function NotificationBell() {
  const { org } = useOrg();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  const fetchNotifications = useCallback(async (uid: string) => {
    // 1. Fetch latest 20 notifications for current user in current org
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("organization_id", org.id)
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .limit(20);

    if (!error && data) {
      setNotifications(data as unknown as NotificationItem[]);
    }

    // 2. Fetch exact unread count
    const { count, error: countErr } = await supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", org.id)
      .eq("user_id", uid)
      .is("read_at", null);

    if (!countErr && count !== null) {
      setUnreadCount(count);
    }
  }, [org.id]);

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;

    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);
      await fetchNotifications(user.id);

      channel = supabase
        .channel(`notifications:${user.id}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            const newItem = payload.new as unknown as NotificationItem;
            if (newItem.organization_id !== org.id) return;

            setNotifications((prev) => [newItem, ...prev.filter((n) => n.id !== newItem.id)].slice(0, 20));
            setUnreadCount((c) => c + 1);

            if (newItem.priority === "high") {
              toast.error(newItem.title, {
                description: newItem.body ?? undefined,
                action: newItem.link
                  ? {
                      label: "View",
                      onClick: () => navigate({ to: newItem.link! }),
                    }
                  : undefined,
              });
            }
          }
        )
        .subscribe();
    }

    void init();

    return () => {
      if (channel) {
        void supabase.removeChannel(channel);
      }
    };
  }, [org.id, fetchNotifications, navigate]);

  async function markAsRead(item: NotificationItem) {
    if (!item.read_at) {
      const now = new Date().toISOString();
      setNotifications((prev) =>
        prev.map((n) => (n.id === item.id ? { ...n, read_at: now } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));

      await supabase
        .from("notifications")
        .update({ read_at: now } as never)
        .eq("id", item.id);
    }

    setOpen(false);
    if (item.link) {
      navigate({ to: item.link });
    }
  }

  async function markAllAsRead() {
    if (!userId || unreadCount === 0) return;

    const now = new Date().toISOString();
    setNotifications((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? now })));
    setUnreadCount(0);

    const { error } = await supabase
      .from("notifications")
      .update({ read_at: now } as never)
      .eq("organization_id", org.id)
      .eq("user_id", userId)
      .is("read_at", null);

    if (error) {
      toast.error("Failed to mark all as read");
      void fetchNotifications(userId);
    } else {
      toast.success("All notifications marked as read");
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label="Notifications"
        >
          <Bell className="size-5" />
          {unreadCount > 0 && (
            <span
              className={cn(
                "absolute -right-0.5 -top-0.5 flex items-center justify-center rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-bold leading-none text-destructive-foreground",
                unreadCount > 9 ? "h-4 min-w-5" : "size-4"
              )}
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-88 p-0 rounded-2xl shadow-xl">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <h4 className="font-semibold text-sm">Notifications</h4>
            {unreadCount > 0 && (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                {unreadCount} new
              </span>
            )}
          </div>
          {unreadCount > 0 && (
            <button
              onClick={markAllAsRead}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <CheckCheck className="size-3.5" />
              Mark all read
            </button>
          )}
        </div>

        <ScrollArea className="max-h-[380px] divide-y">
          {notifications.length === 0 ? (
            <div className="dot-canvas py-10 text-center text-sm text-muted-foreground">
              You're all caught up.
            </div>
          ) : (
            notifications.map((item) => {
              const isUnread = !item.read_at;
              const isHigh = item.priority === "high";

              return (
                <div
                  key={item.id}
                  onClick={() => markAsRead(item)}
                  className={cn(
                    "group relative flex cursor-pointer gap-3 p-3.5 text-left transition-colors hover:bg-muted/60",
                    isUnread && "bg-muted/30"
                  )}
                >
                  <div className="mt-1 flex shrink-0">
                    {isHigh ? (
                      <span className="flex size-2 rounded-full bg-destructive ring-4 ring-destructive/20" />
                    ) : isUnread ? (
                      <span className="flex size-2 rounded-full bg-primary ring-4 ring-primary/20" />
                    ) : (
                      <span className="size-2 rounded-full bg-transparent" />
                    )}
                  </div>

                  <div className="flex-1 space-y-1 overflow-hidden">
                    <div className="flex items-baseline justify-between gap-2">
                      <p
                        className={cn(
                          "truncate text-xs",
                          isUnread ? "font-semibold text-foreground" : "font-medium text-muted-foreground",
                          isHigh && "text-destructive"
                        )}
                      >
                        {item.title}
                      </p>
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        {formatRelativeTime(item.created_at)}
                      </span>
                    </div>

                    {item.body && (
                      <p className="line-clamp-2 text-[11px] text-muted-foreground leading-relaxed">
                        {item.body}
                      </p>
                    )}
                  </div>

                  {item.link && (
                    <ExternalLink className="size-3 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  )}
                </div>
              );
            })
          )}
        </ScrollArea>

        <div className="border-t p-2 text-center bg-muted/20">
          <Link
            to="/notifications"
            onClick={() => setOpen(false)}
            className="block w-full py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            View all notifications
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
