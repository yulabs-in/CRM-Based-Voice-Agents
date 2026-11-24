import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import { Bell, CheckCheck, ExternalLink, Filter, ChevronLeft, ChevronRight, Check } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useOrg } from "@/lib/org";
import { PageHeader } from "@/components/app/PageHeader";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { NotificationItem } from "@/components/app/NotificationBell";

export const Route = createFileRoute("/_authenticated/_app/notifications")({
  head: () => ({
    meta: [
      { title: "Notifications — Yulabs CRM" },
      { name: "description", content: "View all team alerts, leads, and escalations." },
    ],
  }),
  component: NotificationsPage,
});

const PAGE_SIZE = 20;

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

function NotificationsPage() {
  const { org } = useOrg();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [page, setPage] = useState<number>(0);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [userId, setUserId] = useState<string | null>(null);

  const fetchPage = useCallback(async (uid: string, f: "all" | "unread", p: number) => {
    setLoading(true);

    let query = supabase
      .from("notifications")
      .select("*", { count: "exact" })
      .eq("organization_id", org.id)
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .range(p * PAGE_SIZE, (p + 1) * PAGE_SIZE - 1);

    if (f === "unread") {
      query = query.is("read_at", null);
    }

    const { data, count, error } = await query;
    if (!error && data) {
      setItems(data as unknown as NotificationItem[]);
      setTotalCount(count ?? 0);
    }

    const { count: unread } = await supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", org.id)
      .eq("user_id", uid)
      .is("read_at", null);

    setUnreadCount(unread ?? 0);
    setLoading(false);
  }, [org.id]);

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);
      void fetchPage(user.id, filter, page);
    }
    void init();
  }, [org.id, filter, page, fetchPage]);

  async function markAsRead(item: NotificationItem) {
    if (!item.read_at) {
      const now = new Date().toISOString();
      setItems((prev) => prev.map((n) => (n.id === item.id ? { ...n, read_at: now } : n)));
      setUnreadCount((c) => Math.max(0, c - 1));

      await supabase
        .from("notifications")
        .update({ read_at: now } as never)
        .eq("id", item.id);
    }

    if (item.link) {
      navigate({ to: item.link });
    }
  }

  async function markAllAsRead() {
    if (!userId || unreadCount === 0) return;

    const now = new Date().toISOString();
    setItems((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? now })));
    setUnreadCount(0);

    const { error } = await supabase
      .from("notifications")
      .update({ read_at: now } as never)
      .eq("organization_id", org.id)
      .eq("user_id", userId)
      .is("read_at", null);

    if (error) {
      toast.error("Failed to mark all as read");
      if (userId) void fetchPage(userId, filter, page);
    } else {
      toast.success("All notifications marked as read");
    }
  }

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <div className="animate-rise space-y-6">
      <PageHeader
        title="Notifications"
        description="Stay up to date with interested leads, escalations, consultations, and team alerts."
      >
        {unreadCount > 0 && (
          <Button variant="outline" size="sm" onClick={markAllAsRead} className="gap-1.5">
            <CheckCheck className="size-4" />
            Mark all as read
          </Button>
        )}
      </PageHeader>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
        <Tabs value={filter} onValueChange={(v) => { setFilter(v as "all" | "unread"); setPage(0); }}>
          <TabsList>
            <TabsTrigger value="all">
              All
              {totalCount > 0 && filter === "all" && (
                <span className="ml-1.5 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  {totalCount}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="unread">
              Unread
              {unreadCount > 0 && (
                <span className="ml-1.5 rounded-full bg-primary/20 px-2 py-0.5 text-xs font-semibold text-primary">
                  {unreadCount}
                </span>
              )}
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {totalPages > 1 && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>
              Page {page + 1} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="size-7"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="size-7"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        )}
      </div>

      <div className="space-y-2">
        {loading ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            Loading notifications…
          </div>
        ) : items.length === 0 ? (
          <div className="dot-canvas rounded-2xl border py-16 text-center text-sm text-muted-foreground">
            <Bell className="mx-auto size-8 text-muted-foreground/50 mb-2" />
            No {filter === "unread" ? "unread " : ""}notifications found.
          </div>
        ) : (
          <div className="divide-y rounded-2xl border bg-card overflow-hidden">
            {items.map((item) => {
              const isUnread = !item.read_at;
              const isHigh = item.priority === "high";

              return (
                <div
                  key={item.id}
                  onClick={() => markAsRead(item)}
                  className={cn(
                    "group flex cursor-pointer items-start justify-between gap-4 p-4 transition-colors hover:bg-muted/50",
                    isUnread && "bg-muted/20"
                  )}
                >
                  <div className="flex items-start gap-3 flex-1 overflow-hidden">
                    <div className="mt-1 flex shrink-0">
                      {isHigh ? (
                        <span className="flex size-2.5 rounded-full bg-destructive ring-4 ring-destructive/20" />
                      ) : isUnread ? (
                        <span className="flex size-2.5 rounded-full bg-primary ring-4 ring-primary/20" />
                      ) : (
                        <span className="size-2.5 rounded-full bg-muted-foreground/30" />
                      )}
                    </div>

                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "text-sm",
                            isUnread ? "font-semibold text-foreground" : "font-medium text-muted-foreground",
                            isHigh && "text-destructive font-semibold"
                          )}
                        >
                          {item.title}
                        </span>
                        {isHigh && (
                          <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">
                            High Priority
                          </span>
                        )}
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                          {item.type}
                        </span>
                      </div>

                      {item.body && (
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {item.body}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-xs text-muted-foreground">
                      {formatRelativeTime(item.created_at)}
                    </span>
                    {item.link && (
                      <ExternalLink className="size-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
