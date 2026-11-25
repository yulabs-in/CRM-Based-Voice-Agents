import { useState, useEffect, useCallback } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Bell, Check, CheckCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useOrg } from "@/lib/org";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  formatRelativeTime,
  getNotificationMeta,
  parseNotificationLink,
  type NotificationItem,
} from "@/lib/notifications-ui";

export type { NotificationItem };

export function NotificationBell() {
  const { org } = useOrg();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  const fetchNotifications = useCallback(
    async (uid: string, showSpinner = false) => {
      if (showSpinner) setLoading(true);
      const [{ data, error }, { count, error: countErr }] = await Promise.all([
        supabase
          .from("notifications")
          .select("*")
          .eq("organization_id", org.id)
          .eq("user_id", uid)
          .order("created_at", { ascending: false })
          .limit(20),
        supabase
          .from("notifications")
          .select("*", { count: "exact", head: true })
          .eq("organization_id", org.id)
          .eq("user_id", uid)
          .is("read_at", null),
      ]);

      if (!error && data) {
        setNotifications(data as unknown as NotificationItem[]);
      }
      if (!countErr && count !== null) {
        setUnreadCount(count);
      }
      setLoading(false);
    },
    [org.id]
  );

  useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let activeUserId: string | null = null;

    async function init() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled || !user) return;

      activeUserId = user.id;
      setUserId(user.id);
      await fetchNotifications(user.id, true);
      if (cancelled) return;

      channel = supabase
        .channel(`notifications:${user.id}:${org.id}`)
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

            setNotifications((prev) =>
              [newItem, ...prev.filter((n) => n.id !== newItem.id)].slice(0, 20)
            );
            if (!newItem.read_at) {
              setUnreadCount((c) => c + 1);
            }

            const action = newItem.link
              ? {
                  label: "View",
                  onClick: () => navigate(parseNotificationLink(newItem.link!) as never),
                }
              : undefined;

            if (newItem.priority === "high") {
              toast.error(newItem.title, {
                description: newItem.body ?? undefined,
                action,
              });
            } else if (newItem.type === "lead.interested") {
              toast(newItem.title, {
                description: newItem.body ?? undefined,
                action,
              });
            }
          }
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            const updated = payload.new as unknown as NotificationItem;
            if (updated.organization_id !== org.id) return;
            void fetchNotifications(user.id, false);
          }
        )
        .subscribe();
    }

    const onFocus = () => {
      if (activeUserId) void fetchNotifications(activeUserId, false);
    };
    window.addEventListener("focus", onFocus);

    void init();

    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      if (channel) {
        void supabase.removeChannel(channel);
      }
    };
  }, [org.id, fetchNotifications, navigate]);

  async function markItemReadOnly(item: NotificationItem) {
    if (item.read_at) return;
    const now = new Date().toISOString();
    setNotifications((prev) =>
      prev.map((n) => (n.id === item.id ? { ...n, read_at: now } : n))
    );
    setUnreadCount((c) => Math.max(0, c - 1));

    const { error } = await supabase
      .from("notifications")
      .update({ read_at: now } as never)
      .eq("id", item.id);

    if (error && userId) {
      void fetchNotifications(userId, false);
    }
  }

  async function handleRowClick(item: NotificationItem) {
    await markItemReadOnly(item);
    setOpen(false);
    if (item.link) {
      navigate(parseNotificationLink(item.link) as never);
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
      void fetchNotifications(userId, false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
        >
          <Bell className="size-5" />
          {unreadCount > 0 && (
            <span
              aria-hidden="true"
              className={cn(
                "absolute -right-0.5 -top-0.5 flex items-center justify-center rounded-full bg-destructive px-1.5 py-0.5 text-xs font-bold leading-none text-destructive-foreground",
                unreadCount > 9 ? "h-4 min-w-5" : "size-4"
              )}
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-96 max-w-[calc(100vw-1.5rem)] p-0 rounded-2xl shadow-xl">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <h4 className="font-semibold text-sm">Notifications</h4>
            {unreadCount > 0 && (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                {unreadCount} new
              </span>
            )}
          </div>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={markAllAsRead}
              className="flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors"
            >
              <CheckCheck className="size-3.5" />
              Mark all read
            </button>
          )}
        </div>

        <ScrollArea className="max-h-[380px]">
          {loading ? (
            <div className="divide-y">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-start gap-3 p-3.5">
                  <Skeleton className="size-4 rounded-full mt-0.5 shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : notifications.length === 0 ? (
            <div className="dot-canvas py-10 text-center text-sm text-muted-foreground">
              You're all caught up.
            </div>
          ) : (
            <div className="divide-y">
              {notifications.map((item) => {
                const isUnread = !item.read_at;
                const isHigh = item.priority === "high";
                const meta = getNotificationMeta(item.type);
                const Icon = meta.icon;

                return (
                  <div
                    key={item.id}
                    className={cn(
                      "group relative flex items-stretch transition-colors hover:bg-muted/60",
                      isUnread && "bg-muted/30",
                      isHigh && "border-l-2 border-l-destructive"
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => void handleRowClick(item)}
                      className="flex flex-1 items-start gap-3 p-3.5 text-left min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                    >
                      <Icon className={cn("size-4 shrink-0 mt-0.5", meta.iconClass)} />

                      <div className="flex-1 space-y-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p
                            className={cn(
                              "text-sm leading-snug line-clamp-2",
                              isUnread ? "font-semibold text-foreground" : "font-medium text-muted-foreground",
                              isHigh && isUnread && "text-destructive"
                            )}
                          >
                            {item.title}
                          </p>
                          <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
                            {isUnread && (
                              <span
                                aria-label="Unread"
                                className="size-2 rounded-full bg-primary"
                              />
                            )}
                            <span className="text-xs text-muted-foreground whitespace-nowrap">
                              {formatRelativeTime(item.created_at)}
                            </span>
                          </div>
                        </div>

                        {item.body && (
                          <p className="line-clamp-2 text-xs text-muted-foreground leading-relaxed">
                            {item.body}
                          </p>
                        )}
                      </div>
                    </button>

                    {isUnread && (
                      <button
                        type="button"
                        aria-label={`Mark "${item.title}" as read`}
                        title="Mark as read"
                        onClick={() => void markItemReadOnly(item)}
                        className="flex items-center px-2.5 text-muted-foreground opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-opacity"
                      >
                        <Check className="size-4" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>

        <div className="border-t p-2 text-center bg-muted/20">
          <Link
            to="/notifications"
            search={{}}
            onClick={() => setOpen(false)}
            className="block w-full rounded-lg py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors"
          >
            View all notifications
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
