import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Bell,
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useOrg } from "@/lib/org";
import { PageHeader } from "@/components/app/PageHeader";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  formatRelativeTime,
  getNotificationMeta,
  parseNotificationLink,
  type NotificationItem,
} from "@/lib/notifications-ui";

type FilterKind = "all" | "unread";
type TypeFilter = "all" | "lead.interested" | "consultation.booked" | "call.escalated" | "contact.do_not_contact";

const TYPE_FILTERS: { value: TypeFilter; label: string }[] = [
  { value: "all", label: "All types" },
  { value: "lead.interested", label: "Leads" },
  { value: "consultation.booked", label: "Consultations" },
  { value: "call.escalated", label: "Escalations" },
  { value: "contact.do_not_contact", label: "Do not contact" },
];

const VALID_TYPES = new Set<string>(TYPE_FILTERS.map((t) => t.value));

export const Route = createFileRoute("/_authenticated/_app/notifications")({
  validateSearch: (
    s: Record<string, unknown>
  ): { filter?: FilterKind; type?: TypeFilter; page?: number } => {
    const filter = s.filter === "unread" ? "unread" : undefined;
    const type = typeof s.type === "string" && VALID_TYPES.has(s.type) && s.type !== "all"
      ? (s.type as TypeFilter)
      : undefined;
    const rawPage = Number(s.page);
    const page = Number.isInteger(rawPage) && rawPage > 1 ? rawPage : undefined;
    return { filter, type, page };
  },
  head: () => ({
    meta: [
      { title: "Notifications — Yulabs CRM" },
      { name: "description", content: "View all team alerts, leads, and escalations." },
    ],
  }),
  component: NotificationsPage,
});

const PAGE_SIZE = 20;

function dayBucket(dateStr: string): "Today" | "Yesterday" | "Earlier" {
  const date = new Date(dateStr);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 86400000;
  const ts = date.getTime();
  if (ts >= startOfToday) return "Today";
  if (ts >= startOfYesterday) return "Yesterday";
  return "Earlier";
}

function NotificationsPage() {
  const { org } = useOrg();
  const search = Route.useSearch();
  const navigate = useNavigate();

  const filter: FilterKind = search.filter ?? "all";
  const typeFilter: TypeFilter = search.type ?? "all";
  const page = (search.page ?? 1) - 1;

  const [items, setItems] = useState<NotificationItem[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [userId, setUserId] = useState<string | null>(null);

  const setSearchParams = useCallback(
    (next: { filter?: FilterKind; type?: TypeFilter; page?: number }) => {
      const mergedFilter = next.filter !== undefined ? next.filter : filter;
      const mergedType = next.type !== undefined ? next.type : typeFilter;
      const mergedPage = next.page !== undefined ? next.page : page + 1;
      void navigate({
        to: "/notifications",
        search: {
          filter: mergedFilter === "unread" ? "unread" : undefined,
          type: mergedType !== "all" ? mergedType : undefined,
          page: mergedPage > 1 ? mergedPage : undefined,
        },
      });
    },
    [filter, typeFilter, page, navigate]
  );

  const fetchPage = useCallback(
    async (uid: string, f: FilterKind, tf: TypeFilter, p: number) => {
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
      if (tf !== "all") {
        query = query.eq("type", tf);
      }

      const [{ data, count, error }, { count: unread }] = await Promise.all([
        query,
        supabase
          .from("notifications")
          .select("*", { count: "exact", head: true })
          .eq("organization_id", org.id)
          .eq("user_id", uid)
          .is("read_at", null),
      ]);

      if (!error && data) {
        setItems(data as unknown as NotificationItem[]);
        setTotalCount(count ?? 0);
      }
      setUnreadCount(unread ?? 0);
      setLoading(false);
    },
    [org.id]
  );

  useEffect(() => {
    let cancelled = false;
    async function init() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled || !user) return;
      setUserId(user.id);
      void fetchPage(user.id, filter, typeFilter, page);
    }
    void init();
    return () => {
      cancelled = true;
    };
  }, [org.id, filter, typeFilter, page, fetchPage]);

  async function toggleRead(item: NotificationItem) {
    const nextReadAt = item.read_at ? null : new Date().toISOString();
    setItems((prev) =>
      prev.map((n) => (n.id === item.id ? { ...n, read_at: nextReadAt } : n))
    );
    setUnreadCount((c) => Math.max(0, c + (nextReadAt ? -1 : 1)));

    const { error } = await supabase
      .from("notifications")
      .update({ read_at: nextReadAt } as never)
      .eq("id", item.id);

    if (error && userId) {
      toast.error("Could not update notification");
      void fetchPage(userId, filter, typeFilter, page);
    }
  }

  async function handleRowNavigate(item: NotificationItem) {
    if (!item.read_at) {
      await toggleRead(item);
    }
    if (item.link) {
      void navigate(parseNotificationLink(item.link) as never);
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
      void fetchPage(userId, filter, typeFilter, page);
    }
  }

  const grouped = useMemo(() => {
    const buckets: Record<"Today" | "Yesterday" | "Earlier", NotificationItem[]> = {
      Today: [],
      Yesterday: [],
      Earlier: [],
    };
    for (const item of items) {
      buckets[dayBucket(item.created_at)].push(item);
    }
    return (["Today", "Yesterday", "Earlier"] as const)
      .map((label) => ({ label, rows: buckets[label] }))
      .filter((g) => g.rows.length > 0);
  }, [items]);

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
            Mark all read
          </Button>
        )}
      </PageHeader>

      <div className="flex flex-col gap-3 border-b pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Tabs
            value={filter}
            onValueChange={(v) => setSearchParams({ filter: v as FilterKind, page: 1 })}
          >
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
                aria-label="Previous page"
                onClick={() => setSearchParams({ page: Math.max(1, page) })}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="size-7"
                disabled={page >= totalPages - 1}
                aria-label="Next page"
                onClick={() => setSearchParams({ page: page + 2 })}
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by notification type">
          {TYPE_FILTERS.map((tf) => {
            const active = typeFilter === tf.value;
            return (
              <button
                key={tf.value}
                type="button"
                onClick={() => setSearchParams({ type: tf.value, page: 1 })}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-card text-muted-foreground hover:text-foreground"
                )}
              >
                {tf.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-6">
        {loading ? (
          <div className="divide-y rounded-2xl border bg-card overflow-hidden">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-start gap-3 p-4">
                <Skeleton className="size-5 rounded-full mt-0.5 shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="dot-canvas rounded-2xl border py-16 text-center text-sm text-muted-foreground">
            <Bell className="mx-auto size-8 text-muted-foreground/50 mb-2" />
            No {filter === "unread" ? "unread " : ""}notifications found.
          </div>
        ) : (
          grouped.map((group) => (
            <section key={group.label} className="space-y-2">
              <h2 className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {group.label}
              </h2>
              <div className="divide-y rounded-2xl border bg-card overflow-hidden">
                {group.rows.map((item) => {
                  const isUnread = !item.read_at;
                  const isHigh = item.priority === "high";
                  const meta = getNotificationMeta(item.type);
                  const Icon = meta.icon;

                  return (
                    <div
                      key={item.id}
                      className={cn(
                        "group flex items-stretch transition-colors hover:bg-muted/50",
                        isUnread && "bg-muted/20",
                        isHigh && "border-l-2 border-l-destructive"
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => void handleRowNavigate(item)}
                        className="flex flex-1 items-start gap-3 p-4 text-left min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                      >
                        <Icon className={cn("size-4 shrink-0 mt-1", meta.iconClass)} />

                        <div className="flex-1 space-y-1.5 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <span
                              className={cn(
                                "text-sm leading-snug",
                                isUnread ? "font-semibold text-foreground" : "font-medium text-muted-foreground",
                                isHigh && isUnread && "text-destructive"
                              )}
                            >
                              {item.title}
                            </span>
                            {isUnread && (
                              <span
                                aria-label="Unread"
                                className="mt-1.5 size-2 shrink-0 rounded-full bg-primary"
                              />
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="rounded bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                              {meta.label}
                            </span>
                            {isHigh && (
                              <span className="rounded bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive">
                                High priority
                              </span>
                            )}
                          </div>

                          {item.body && (
                            <p className="text-xs text-muted-foreground leading-relaxed">
                              {item.body}
                            </p>
                          )}

                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>{formatRelativeTime(item.created_at)}</span>
                            {item.link && (
                              <span className="inline-flex items-center gap-1 text-primary/80">
                                <ExternalLink className="size-3" />
                                Open
                              </span>
                            )}
                          </div>
                        </div>
                      </button>

                      <div className="flex items-center pr-3">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => void toggleRead(item)}
                          aria-label={isUnread ? "Mark as read" : "Mark as unread"}
                          title={isUnread ? "Mark as read" : "Mark as unread"}
                          className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground gap-1"
                        >
                          {isUnread ? (
                            <>
                              <Check className="size-3.5" />
                              <span className="hidden sm:inline">Mark read</span>
                            </>
                          ) : (
                            <>
                              <RotateCcw className="size-3.5" />
                              <span className="hidden sm:inline">Mark unread</span>
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
