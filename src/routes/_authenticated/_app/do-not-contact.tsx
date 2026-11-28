import { useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  Download,
  FileSpreadsheet,
  Loader2,
  Lock,
  PhoneCall,
  PhoneOff,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/PageHeader";
import { KpiGrid } from "@/components/app/charts";
import { CallDetailSheet } from "@/components/app/CallDetailSheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { canWrite, isAdmin, useOrg } from "@/lib/org";
import { pageHead } from "@/lib/seo";
import { toCsv } from "@/lib/csv";
import { chunk } from "@/lib/campaign-vars";
import { cn } from "@/lib/utils";
import {
  COMPLIANCE_EVENTS,
  COMPLIANCE_EVENT_LABELS,
  DNC_SOURCE_LABELS,
  DND_IMPORT_BATCH_SIZE,
  MIN_REACTIVATION_REASON_LENGTH,
  parseDndCsvNumbers,
  toE164,
  validateReactivationReason,
  type ComplianceEvent,
  type DncSource,
} from "@/lib/dnc";
import {
  addDncNumber,
  exportComplianceLogCsv,
  importDncNumbersBatch,
  listComplianceLog,
  listDncRegistry,
  reactivateDncNumber,
  type DncRegistryItem,
} from "@/lib/dnc.functions";

type TabValue = "registry" | "log";

export const Route = createFileRoute("/_authenticated/_app/do-not-contact")({
  validateSearch: (s: Record<string, unknown>): { tab?: TabValue } => ({
    tab: s.tab === "log" ? "log" : undefined,
  }),
  head: () =>
    pageHead(
      "Do Not Contact",
      "Phone-level do-not-contact registry and append-only compliance audit log.",
    ),
  component: DoNotContactPage,
});

const SOURCE_TONES: Record<DncSource, string> = {
  call: "bg-danger-soft text-destructive",
  manual: "bg-warning-soft text-warning",
  import: "bg-accent text-accent-foreground",
};

const EVENT_TONES: Record<ComplianceEvent, string> = {
  consent_given: "bg-success-soft text-success",
  opt_out: "bg-danger-soft text-destructive",
  blocked: "bg-danger-soft text-destructive",
  reactivated: "bg-accent text-accent-foreground",
  blocked_attempt: "bg-warning-soft text-warning",
};

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function downloadExcelCsv(filename: string, rows: Array<Record<string, unknown>>) {
  // Prefix UTF-8 BOM so Microsoft Excel opens UTF-8 characters and E.164 numbers cleanly.
  const csv = "\uFEFF" + toCsv(rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function DoNotContactPage() {
  const { org, role } = useOrg();
  const searchParams = Route.useSearch();
  const navigate = Route.useNavigate();
  const qc = useQueryClient();

  const fetchRegistry = useServerFn(listDncRegistry);
  const addNumberFn = useServerFn(addDncNumber);
  const reactivateFn = useServerFn(reactivateDncNumber);
  const importBatchFn = useServerFn(importDncNumbersBatch);
  const fetchLog = useServerFn(listComplianceLog);
  const exportLogFn = useServerFn(exportComplianceLogCsv);

  const tab: TabValue = searchParams.tab ?? "registry";
  const adminRole = isAdmin(role);
  const writerRole = canWrite(role);

  // Registry filters & dialogs
  const [registrySearch, setRegistrySearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<"all" | DncSource>("all");
  const [addOpen, setAddOpen] = useState(false);
  const [newPhone, setNewPhone] = useState("");
  const [newReason, setNewReason] = useState("");
  const [addPhoneError, setAddPhoneError] = useState<string | null>(null);

  const [reactivateTarget, setReactivateTarget] = useState<DncRegistryItem | null>(null);
  const [reactivateReason, setReactivateReason] = useState("");
  const [reactivateError, setReactivateError] = useState<string | null>(null);

  // DND CSV import dialog state
  const [importOpen, setImportOpen] = useState(false);
  const [importFileName, setImportFileName] = useState<string | null>(null);
  const [parsedDnd, setParsedDnd] = useState<{
    valid: string[];
    invalidCount: number;
    duplicateCount: number;
  } | null>(null);
  const [importReason, setImportReason] = useState("National DND registry import");
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ processed: number; total: number } | null>(
    null,
  );
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Compliance log filters
  const [logSearch, setLogSearch] = useState("");
  const [eventFilter, setEventFilter] = useState<"all" | ComplianceEvent>("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [openCallId, setOpenCallId] = useState<string | null>(null);

  const registryQuery = useQuery({
    queryKey: ["dnc", "registry", org.id, registrySearch.trim(), sourceFilter],
    queryFn: () =>
      fetchRegistry({
        data: {
          organizationId: org.id,
          search: registrySearch.trim() || undefined,
          source: sourceFilter,
        },
      }),
  });

  const logQuery = useQuery({
    queryKey: ["dnc", "log", org.id, eventFilter, fromDate, toDate, logSearch.trim()],
    queryFn: () =>
      fetchLog({
        data: {
          organizationId: org.id,
          event: eventFilter,
          fromDate: fromDate || undefined,
          toDate: toDate || undefined,
          search: logSearch.trim() || undefined,
          limit: 250,
        },
      }),
  });

  const refreshAll = () => {
    void qc.invalidateQueries({ queryKey: ["dnc"] });
    void qc.invalidateQueries({ queryKey: ["contacts"] });
  };

  const addMutation = useMutation({
    mutationFn: async () => {
      const normalized = toE164(newPhone);
      if (!normalized) {
        setAddPhoneError("Enter a valid phone number (e.g. +91 98480 12345 or 9848012345).");
        throw new Error("Invalid phone number");
      }
      setAddPhoneError(null);
      return addNumberFn({
        data: {
          organizationId: org.id,
          phone: normalized,
          reason: newReason.trim() || "Added manually to do-not-contact list",
        },
      });
    },
    onSuccess: (res) => {
      toast.success(
        res.alreadyBlocked
          ? `${res.phoneE164} was already blocked (updated reason)`
          : `${res.phoneE164} added to do-not-contact list`,
      );
      setAddOpen(false);
      setNewPhone("");
      setNewReason("");
      setAddPhoneError(null);
      refreshAll();
    },
    onError: (err) => {
      if (err.message !== "Invalid phone number") toast.error(err.message);
    },
  });

  const reactivateMutation = useMutation({
    mutationFn: async () => {
      if (!reactivateTarget) throw new Error("No number selected");
      const validationErr = validateReactivationReason(reactivateReason);
      if (validationErr) {
        setReactivateError(validationErr);
        throw new Error(validationErr);
      }
      setReactivateError(null);
      return reactivateFn({
        data: {
          organizationId: org.id,
          dncId: reactivateTarget.id,
          reason: reactivateReason.trim(),
        },
      });
    },
    onSuccess: (res) => {
      toast.success(
        `Reactivated ${res.phoneE164}${res.reactivatedContacts ? ` (${res.reactivatedContacts} contact restored)` : ""}`,
      );
      setReactivateTarget(null);
      setReactivateReason("");
      setReactivateError(null);
      refreshAll();
    },
    onError: (err) => {
      if (!validateReactivationReason(reactivateReason)) {
        toast.error(err.message);
      }
    },
  });

  const exportMutation = useMutation({
    mutationFn: () =>
      exportLogFn({
        data: {
          organizationId: org.id,
          event: eventFilter,
          fromDate: fromDate || undefined,
          toDate: toDate || undefined,
          search: logSearch.trim() || undefined,
        },
      }),
    onSuccess: ({ rows }) => {
      if (!rows.length) {
        toast.info("No compliance log events match the current filters.");
        return;
      }
      const dateStamp = new Date().toISOString().slice(0, 10);
      downloadExcelCsv(
        `compliance-log-${dateStamp}.csv`,
        rows as unknown as Array<Record<string, unknown>>,
      );
      toast.success(`Exported ${rows.length.toLocaleString()} compliance log events`);
    },
    onError: (err) => toast.error(err.message),
  });

  async function handleDndFileSelect(file: File | null) {
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) {
      toast.error("Choose a CSV file up to 15 MB.");
      return;
    }
    const text = await file.text();
    const parsed = parseDndCsvNumbers(text);
    setImportFileName(file.name);
    setParsedDnd(parsed);
  }

  async function runDndImport() {
    if (!parsedDnd?.valid.length) return;
    setImporting(true);
    const batches = chunk(parsedDnd.valid, DND_IMPORT_BATCH_SIZE);
    let processed = 0;
    let totalAdded = 0;
    let totalExisting = 0;

    try {
      setImportProgress({ processed: 0, total: parsedDnd.valid.length });
      for (const batch of batches) {
        const res = await importBatchFn({
          data: {
            organizationId: org.id,
            phones: batch,
            reason: importReason.trim() || "Imported from DND list",
          },
        });
        processed += batch.length;
        totalAdded += res.added;
        totalExisting += res.alreadyBlocked;
        setImportProgress({ processed, total: parsedDnd.valid.length });
      }
      toast.success(
        `Imported ${totalAdded.toLocaleString()} blocked numbers${totalExisting ? ` (${totalExisting.toLocaleString()} already blocked)` : ""}`,
      );
      setImportOpen(false);
      setImportFileName(null);
      setParsedDnd(null);
      setImportProgress(null);
      refreshAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "DND import failed");
    } finally {
      setImporting(false);
    }
  }

  const stats = registryQuery.data?.stats ?? {
    totalActive: 0,
    fromCalls: 0,
    fromManual: 0,
    fromImport: 0,
    blockedAttempts: 0,
  };
  const registryItems = registryQuery.data?.items ?? [];
  const logItems = logQuery.data?.items ?? [];

  return (
    <div className="animate-rise space-y-5">
      <PageHeader
        title="Do Not Contact"
        description="Phone-level opt-out registry and append-only compliance audit trail across campaigns, one-off calls, and APIs."
      >
        {adminRole && (
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="size-4" /> Import DND list
          </Button>
        )}
        {writerRole && (
          <Button variant="hero" onClick={() => setAddOpen(true)}>
            <Plus className="size-4" /> Add number
          </Button>
        )}
      </PageHeader>

      <KpiGrid
        columns={4}
        loading={registryQuery.isLoading}
        items={[
          {
            label: "Blocked numbers",
            value: stats.totalActive.toLocaleString(),
            hint: "Active phone-level blocks",
          },
          {
            label: "Call opt-outs",
            value: stats.fromCalls.toLocaleString(),
            hint: "Caller asked not to be called",
          },
          {
            label: "Manual & imported",
            value: (stats.fromManual + stats.fromImport).toLocaleString(),
            hint: `${stats.fromManual.toLocaleString()} manual · ${stats.fromImport.toLocaleString()} imported`,
          },
          {
            label: "Calls prevented",
            value: stats.blockedAttempts.toLocaleString(),
            hint: "Blocked in calls, campaigns & API",
          },
        ]}
      />

      <Tabs
        value={tab}
        onValueChange={(val) =>
          void navigate({
            to: "/do-not-contact",
            search: { tab: val === "log" ? "log" : undefined },
          })
        }
        className="space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList className="rounded-xl">
            <TabsTrigger value="registry" className="gap-1.5 rounded-lg">
              <PhoneOff className="size-4" /> Blocked numbers
            </TabsTrigger>
            <TabsTrigger value="log" className="gap-1.5 rounded-lg">
              <ShieldCheck className="size-4" /> Compliance log
            </TabsTrigger>
          </TabsList>

          {!adminRole && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
              <Lock className="size-3.5" /> Numbers masked to last 4 digits for non-admins
            </span>
          )}
        </div>

        {/* ---- TAB 1: REGISTRY ---- */}
        <TabsContent value="registry" className="m-0">
          <div className="rounded-2xl border bg-card shadow-soft">
            <div className="flex flex-wrap items-center gap-3 border-b p-3">
              <div className="relative w-full sm:max-w-xs">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={registrySearch}
                  onChange={(e) => setRegistrySearch(e.target.value)}
                  placeholder="Search number or contact name…"
                  aria-label="Search blocked numbers"
                  className="h-9 rounded-xl pl-9"
                />
              </div>
              <Select
                value={sourceFilter}
                onValueChange={(v) => setSourceFilter(v as "all" | DncSource)}
              >
                <SelectTrigger
                  className="h-9 w-full rounded-xl sm:w-44"
                  aria-label="Filter by block source"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All sources</SelectItem>
                  <SelectItem value="call">Call opt-out</SelectItem>
                  <SelectItem value="manual">Manual</SelectItem>
                  <SelectItem value="import">DND import</SelectItem>
                </SelectContent>
              </Select>
              <span className="ml-auto text-xs text-muted-foreground">
                {registryItems.length.toLocaleString()}{" "}
                {registryItems.length === 1 ? "number" : "numbers"}
              </span>
            </div>

            {registryQuery.isLoading ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 5 }, (_, i) => (
                  <Skeleton key={i} className="h-11 rounded-xl" />
                ))}
              </div>
            ) : registryQuery.isError ? (
              <div className="p-10 text-center text-sm text-destructive">
                Could not load the do-not-contact registry.{" "}
                <button
                  type="button"
                  onClick={() => void registryQuery.refetch()}
                  className="font-semibold underline"
                >
                  Retry
                </button>
              </div>
            ) : registryItems.length === 0 ? (
              <div className="px-4 py-14 text-center">
                <div className="mx-auto mb-3 grid size-11 place-items-center rounded-2xl bg-muted text-muted-foreground">
                  <PhoneOff className="size-5" />
                </div>
                <p className="font-semibold">
                  {registrySearch || sourceFilter !== "all"
                    ? "No blocked numbers match your search"
                    : "No blocked phone numbers yet"}
                </p>
                <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                  {registrySearch || sourceFilter !== "all"
                    ? "Try clearing your search or switching the source filter."
                    : "Numbers opted out on AI calls or added manually appear here and are blocked across campaigns, test calls, and API calls."}
                </p>
                {writerRole && !registrySearch && sourceFilter === "all" && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4"
                    onClick={() => setAddOpen(true)}
                  >
                    <Plus className="size-4" /> Add a number
                  </Button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-2.5">Number</th>
                      <th className="px-4 py-2.5">Contact</th>
                      <th className="px-4 py-2.5">Source</th>
                      <th className="px-4 py-2.5">Reason</th>
                      <th className="px-4 py-2.5">Blocked at</th>
                      <th className="px-4 py-2.5">Blocked by / Call</th>
                      {adminRole && <th className="px-4 py-2.5 text-right">Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {registryItems.map((item) => (
                      <tr key={item.id} className="border-b last:border-0 hover:bg-muted/50">
                        <td className="whitespace-nowrap px-4 py-3 font-mono text-xs font-semibold tabular-nums sm:text-sm">
                          {item.phoneDisplay}
                        </td>
                        <td className="px-4 py-3">
                          {item.contactId && item.contactName ? (
                            <Link
                              to="/contacts"
                              search={{ id: item.contactId }}
                              className="font-medium text-primary hover:underline"
                            >
                              {item.contactName}
                            </Link>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <span
                            className={cn(
                              "inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold",
                              SOURCE_TONES[item.source],
                            )}
                          >
                            {DNC_SOURCE_LABELS[item.source]}
                          </span>
                        </td>
                        <td className="max-w-xs px-4 py-3 text-muted-foreground">
                          <span className="line-clamp-2">{item.reason || "—"}</span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground tabular-nums">
                          {formatDateTime(item.createdAt)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs text-muted-foreground">
                              {item.createdByName ??
                                (item.source === "call" ? "Caller opt-out" : "System")}
                            </span>
                            {item.callId && (
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="h-7 gap-1 px-2 text-xs"
                                onClick={() => setOpenCallId(item.callId)}
                              >
                                <PhoneCall className="size-3.5" /> View call
                              </Button>
                            )}
                          </div>
                        </td>
                        {adminRole && (
                          <td className="whitespace-nowrap px-4 py-3 text-right">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-8 gap-1.5"
                              onClick={() => {
                                setReactivateTarget(item);
                                setReactivateReason("");
                                setReactivateError(null);
                              }}
                            >
                              <RotateCcw className="size-3.5" /> Reactivate
                            </Button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </TabsContent>

        {/* ---- TAB 2: COMPLIANCE LOG ---- */}
        <TabsContent value="log" className="m-0">
          <div className="rounded-2xl border bg-card shadow-soft">
            <div className="flex flex-wrap items-center gap-2.5 border-b p-3">
              <div className="relative w-full sm:max-w-xs">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={logSearch}
                  onChange={(e) => setLogSearch(e.target.value)}
                  placeholder="Search number, actor, details…"
                  aria-label="Search compliance log"
                  className="h-9 rounded-xl pl-9"
                />
              </div>

              <Select
                value={eventFilter}
                onValueChange={(v) => setEventFilter(v as "all" | ComplianceEvent)}
              >
                <SelectTrigger
                  className="h-9 w-full rounded-xl sm:w-44"
                  aria-label="Filter by compliance event"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All events</SelectItem>
                  {COMPLIANCE_EVENTS.map((ev) => (
                    <SelectItem key={ev} value={ev}>
                      {COMPLIANCE_EVENT_LABELS[ev]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="flex items-center gap-1.5">
                <Input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  aria-label="From date"
                  className="h-9 w-36 rounded-xl text-xs"
                />
                <span className="text-xs text-muted-foreground">to</span>
                <Input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  aria-label="To date"
                  className="h-9 w-36 rounded-xl text-xs"
                />
                {(fromDate || toDate || eventFilter !== "all" || logSearch) && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-9"
                    aria-label="Clear compliance filters"
                    onClick={() => {
                      setFromDate("");
                      setToDate("");
                      setEventFilter("all");
                      setLogSearch("");
                    }}
                  >
                    <X className="size-4" />
                  </Button>
                )}
              </div>

              <div className="ml-auto flex items-center gap-2">
                <span className="hidden text-xs text-muted-foreground md:inline">
                  {(logQuery.data?.total ?? 0).toLocaleString()} events
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={exportMutation.isPending || logItems.length === 0}
                  onClick={() => exportMutation.mutate()}
                >
                  {exportMutation.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Download className="size-4" />
                  )}
                  Export CSV
                </Button>
              </div>
            </div>

            {logQuery.isLoading ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 6 }, (_, i) => (
                  <Skeleton key={i} className="h-11 rounded-xl" />
                ))}
              </div>
            ) : logQuery.isError ? (
              <div className="p-10 text-center text-sm text-destructive">
                Could not load compliance log.{" "}
                <button
                  type="button"
                  onClick={() => void logQuery.refetch()}
                  className="font-semibold underline"
                >
                  Retry
                </button>
              </div>
            ) : logItems.length === 0 ? (
              <div className="px-4 py-14 text-center">
                <div className="mx-auto mb-3 grid size-11 place-items-center rounded-2xl bg-muted text-muted-foreground">
                  <ShieldCheck className="size-5" />
                </div>
                <p className="font-semibold">No compliance events found</p>
                <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                  Every consent given on a call, opt-out, manual block, reactivation, and refused
                  call attempt is permanently recorded here.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-2.5">When</th>
                      <th className="px-4 py-2.5">Event</th>
                      <th className="px-4 py-2.5">Number</th>
                      <th className="px-4 py-2.5">Contact</th>
                      <th className="px-4 py-2.5">Actor</th>
                      <th className="px-4 py-2.5">Call</th>
                      <th className="px-4 py-2.5">Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logItems.map((entry) => (
                      <tr key={entry.id} className="border-b last:border-0 hover:bg-muted/50">
                        <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground tabular-nums">
                          {formatDateTime(entry.createdAt)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <span
                            className={cn(
                              "inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold",
                              EVENT_TONES[entry.event],
                            )}
                          >
                            {COMPLIANCE_EVENT_LABELS[entry.event]}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 font-mono text-xs font-semibold tabular-nums sm:text-sm">
                          {entry.phoneDisplay}
                        </td>
                        <td className="px-4 py-3">
                          {entry.contactId && entry.contactName ? (
                            <Link
                              to="/contacts"
                              search={{ id: entry.contactId }}
                              className="font-medium text-primary hover:underline"
                            >
                              {entry.contactName}
                            </Link>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-xs font-medium">
                          {entry.actorName}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          {entry.callId ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-7 gap-1 px-2 text-xs"
                              onClick={() => setOpenCallId(entry.callId)}
                            >
                              <PhoneCall className="size-3.5" /> View call
                            </Button>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="max-w-md px-4 py-3 text-xs text-muted-foreground">
                          <span className="line-clamp-2">{entry.detailsText || "—"}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* ---- ADD NUMBER DIALOG ---- */}
      <Dialog
        open={addOpen}
        onOpenChange={(open) => {
          setAddOpen(open);
          if (!open) setAddPhoneError(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add number to Do Not Contact</DialogTitle>
            <DialogDescription>
              Blocks all future outbound campaigns, test calls, widget callbacks, and API calls to
              this phone number, even if re-imported as a new contact.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              addMutation.mutate();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="dnc-phone">Phone number</Label>
              <Input
                id="dnc-phone"
                value={newPhone}
                onChange={(e) => {
                  setNewPhone(e.target.value);
                  if (addPhoneError) setAddPhoneError(null);
                }}
                placeholder="+91 90000 00001"
                autoFocus
                required
              />
              {addPhoneError ? (
                <p className="text-xs text-destructive">{addPhoneError}</p>
              ) : (
                newPhone.trim() &&
                toE164(newPhone) && (
                  <p className="text-xs text-muted-foreground">
                    Stored in E.164 as <span className="font-mono">{toE164(newPhone)}</span>
                  </p>
                )
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="dnc-reason">Reason</Label>
              <Textarea
                id="dnc-reason"
                rows={3}
                value={newReason}
                onChange={(e) => setNewReason(e.target.value)}
                placeholder="e.g. Customer emailed asking to opt out of marketing calls"
                required
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={addMutation.isPending || !newPhone.trim() || !newReason.trim()}
              >
                {addMutation.isPending && <Loader2 className="size-4 animate-spin" />}
                Block number
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ---- REACTIVATE NUMBER DIALOG ---- */}
      <Dialog
        open={Boolean(reactivateTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setReactivateTarget(null);
            setReactivateReason("");
            setReactivateError(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reactivate {reactivateTarget?.phoneDisplay}</DialogTitle>
            <DialogDescription>
              {reactivateTarget?.contactName
                ? `Contact: ${reactivateTarget.contactName}`
                : "Removes the active phone block and records an audit entry with your name."}
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-start gap-2.5 rounded-xl bg-warning-soft p-3 text-sm text-warning">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <p className="font-medium">Only reactivate if the person has asked to be contacted.</p>
          </div>

          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              reactivateMutation.mutate();
            }}
          >
            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between">
                <Label htmlFor="reactivate-reason">Reason for reactivation (required)</Label>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {reactivateReason.trim().length}/{MIN_REACTIVATION_REASON_LENGTH} min
                </span>
              </div>
              <Textarea
                id="reactivate-reason"
                rows={3}
                value={reactivateReason}
                onChange={(e) => {
                  setReactivateReason(e.target.value);
                  if (reactivateError) setReactivateError(null);
                }}
                placeholder="e.g. Customer submitted a fresh callback request on 28 Nov 2026"
                autoFocus
                required
              />
              {reactivateError && <p className="text-xs text-destructive">{reactivateError}</p>}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setReactivateTarget(null)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  reactivateMutation.isPending ||
                  reactivateReason.trim().length < MIN_REACTIVATION_REASON_LENGTH
                }
              >
                {reactivateMutation.isPending && <Loader2 className="size-4 animate-spin" />}
                Confirm reactivation
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ---- IMPORT DND LIST DIALOG ---- */}
      <Dialog
        open={importOpen}
        onOpenChange={(open) => {
          if (importing) return;
          setImportOpen(open);
          if (!open) {
            setImportFileName(null);
            setParsedDnd(null);
            setImportProgress(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Import DND list (CSV)</DialogTitle>
            <DialogDescription>
              Upload a CSV with one phone number per line (or a{" "}
              <code className="font-mono">phone</code> column). Numbers are normalised to E.164 and
              streamed in batches of {DND_IMPORT_BATCH_SIZE}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv,text/plain"
              className="hidden"
              onChange={(e) => void handleDndFileSelect(e.target.files?.[0] ?? null)}
            />

            <button
              type="button"
              disabled={importing}
              onClick={() => fileInputRef.current?.click()}
              className="flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed bg-muted/30 px-4 py-6 text-center transition hover:border-primary/50 hover:bg-muted/60 disabled:opacity-60"
            >
              <FileSpreadsheet className="size-7 text-muted-foreground" />
              <span className="text-sm font-medium">{importFileName ?? "Choose a CSV file"}</span>
              <span className="text-xs text-muted-foreground">
                Accepts +91…, 0…, or 10-digit numbers · up to 15 MB
              </span>
            </button>

            {parsedDnd && (
              <div className="rounded-xl border bg-muted/40 p-3 text-xs space-y-1">
                <p className="font-semibold text-foreground">
                  {parsedDnd.valid.length.toLocaleString()} valid unique numbers ready to block
                </p>
                {(parsedDnd.duplicateCount > 0 || parsedDnd.invalidCount > 0) && (
                  <p className="text-muted-foreground">
                    {parsedDnd.duplicateCount.toLocaleString()} duplicates skipped ·{" "}
                    {parsedDnd.invalidCount.toLocaleString()} invalid rows ignored
                  </p>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="dnd-import-reason">Reason label</Label>
              <Input
                id="dnd-import-reason"
                value={importReason}
                disabled={importing}
                onChange={(e) => setImportReason(e.target.value)}
                placeholder="National DND registry import"
              />
            </div>

            {importProgress && (
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
                  <span>Importing in batches of {DND_IMPORT_BATCH_SIZE}…</span>
                  <span>
                    {importProgress.processed.toLocaleString()} /{" "}
                    {importProgress.total.toLocaleString()}
                  </span>
                </div>
                <Progress
                  value={
                    importProgress.total
                      ? Math.round((importProgress.processed / importProgress.total) * 100)
                      : 0
                  }
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={importing}
              onClick={() => setImportOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={importing || !parsedDnd?.valid.length}
              onClick={() => void runDndImport()}
            >
              {importing && <Loader2 className="size-4 animate-spin" />}
              Import {parsedDnd?.valid.length ? parsedDnd.valid.length.toLocaleString() : ""}{" "}
              numbers
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CallDetailSheet callId={openCallId} onClose={() => setOpenCallId(null)} />
    </div>
  );
}
