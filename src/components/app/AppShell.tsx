import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { Bell, ChevronsLeft, ChevronsRight, HelpCircle, LogOut, Menu, Plus, Search, Check, Building } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { ROLE_LABELS, useOrg } from "@/lib/org";
import { Logo } from "./Logo";
import { NAV } from "./nav";
import { RecordingAutoFetch } from "./RecordingAutoFetch";
import { RealtimeSync } from "./RealtimeSync";
import { NotificationBell } from "./NotificationBell";

function SidebarNav({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="flex flex-col gap-5 px-3 pb-6">
      {NAV.map((g, i) => (
        <div key={i}>
          {g.label && !collapsed && <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{g.label}</p>}
          <ul className="space-y-0.5">
            {g.items.map((it) => {
              const active = it.to && path.startsWith(it.to);
              const inner = (
                <span className={cn(
                  "flex h-9 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors",
                  active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  !it.to && "cursor-default opacity-60 hover:bg-transparent hover:text-muted-foreground",
                  collapsed && "justify-center px-0",
                )}>
                  <it.icon className="size-[18px] shrink-0" />
                  {!collapsed && <span className="flex-1 truncate">{it.label}</span>}
                  {!collapsed && !it.to && <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold">Soon</span>}
                </span>
              );
              const node = it.to ? <Link to={it.to} onClick={onNavigate}>{inner}</Link> : inner;
              return (
                <li key={it.label}>
                  {collapsed ? (
                    <Tooltip><TooltipTrigger asChild><div>{node}</div></TooltipTrigger><TooltipContent side="right">{it.label}{!it.to && " · coming soon"}</TooltipContent></Tooltip>
                  ) : node}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [search, setSearch] = useState(false);
  const { org, role, memberships, switchOrg, email } = useOrg();
  const navigate = useNavigate();
  const qc = useQueryClient();

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "k" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); setSearch((v) => !v); } };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const pages = NAV.flatMap((g) => g.items).filter((i) => i.to);

  return (
    <TooltipProvider delayDuration={150}>
      <div className="min-h-screen bg-secondary">
        <aside className={cn("fixed inset-y-0 left-0 z-30 hidden flex-col border-r bg-sidebar transition-[width] duration-200 lg:flex", collapsed ? "w-[72px]" : "w-64")}>
          <div className={cn("flex h-16 items-center px-5", collapsed && "justify-center px-0")}><Link to="/dashboard"><Logo showText={!collapsed} /></Link></div>
          <div className="flex-1 overflow-y-auto"><SidebarNav collapsed={collapsed} /></div>
          <button onClick={() => setCollapsed(!collapsed)} className="flex h-12 items-center justify-center gap-2 border-t text-xs font-medium text-muted-foreground hover:text-foreground">
            {collapsed ? <ChevronsRight className="size-4" /> : <><ChevronsLeft className="size-4" /> Collapse</>}
          </button>
        </aside>

        <Sheet open={mobile} onOpenChange={setMobile}>
          <SheetContent side="left" className="w-72 overflow-y-auto p-0">
            <SheetTitle className="flex h-16 items-center px-5"><Logo /></SheetTitle>
            <SidebarNav collapsed={false} onNavigate={() => setMobile(false)} />
          </SheetContent>
        </Sheet>

        <div className={cn("transition-[padding] duration-200", collapsed ? "lg:pl-[72px]" : "lg:pl-64")}>
          <div className="dot-canvas min-h-screen">
            <header className="sticky top-0 z-20 px-3 pt-3 md:px-6">
              <div className="glass flex h-14 items-center gap-2 rounded-[20px] px-2.5 md:px-3">
                <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobile(true)} aria-label="Open menu"><Menu /></Button>
                <DropdownMenu>
                  <DropdownMenuTrigger className="flex items-center gap-2 rounded-xl px-2 py-1.5 text-sm font-semibold hover:bg-muted">
                    <span className="grid size-7 place-items-center rounded-lg bg-accent text-xs font-bold text-accent-foreground">{org.name.slice(0, 1).toUpperCase()}</span>
                    <span className="hidden max-w-40 truncate sm:inline">{org.name}</span>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-60">
                    <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
                    {memberships.map((m) => (
                      <DropdownMenuItem key={m.organization.id} onClick={() => switchOrg(m.organization.id)}>
                        <Building /> <span className="flex-1 truncate">{m.organization.name}</span>
                        {m.organization.id === org.id && <Check />}
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => navigate({ to: "/onboarding" })}><Plus /> New organization</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <button onClick={() => setSearch(true)} className="ml-1 flex h-9 flex-1 items-center gap-2 rounded-xl border bg-background/70 px-3 text-sm text-muted-foreground transition hover:border-primary/40 md:max-w-sm">
                  <Search className="size-4" /> <span className="truncate">Search pages…</span>
                  <kbd className="ml-auto hidden rounded-md border bg-muted px-1.5 font-mono text-[10px] md:inline">⌘K</kbd>
                </button>
                <div className="ml-auto flex items-center gap-1">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild><Button variant="hero" size="sm" className="gap-1"><Plus /> <span className="hidden sm:inline">New</span></Button></DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {(["/contacts", "/leads", "/companies", "/deals", "/tasks"] as const).map((to) => (
                        <DropdownMenuItem key={to} onClick={() => navigate({ to, search: { new: true } })}>
                          New {to.slice(1, -1).replace("companie", "company")}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <NotificationBell />
                  <Popover>
                    <PopoverTrigger asChild><Button variant="ghost" size="icon" className="hidden sm:inline-flex" aria-label="Help"><HelpCircle /></Button></PopoverTrigger>
                    <PopoverContent align="end" className="w-72 rounded-2xl text-sm">
                      <p className="font-semibold">Help centre</p>
                      <p className="mt-1 text-muted-foreground">Press ⌘K to jump anywhere. Use “New” to quickly add records.</p>
                    </PopoverContent>
                  </Popover>
                  <DropdownMenu>
                    <DropdownMenuTrigger className="ml-1 grid size-9 place-items-center rounded-full bg-gradient-primary text-sm font-bold text-primary-foreground">{email.slice(0, 1).toUpperCase()}</DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-60">
                      <DropdownMenuLabel className="font-normal"><p className="truncate font-semibold">{email}</p><p className="text-xs text-muted-foreground">{ROLE_LABELS[role]}</p></DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => navigate({ to: "/settings" })}>Settings</DropdownMenuItem>
                      <DropdownMenuItem onClick={signOut} className="text-destructive"><LogOut /> Sign out</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </header>
            <main className="px-3 py-6 md:px-6">{children}<RecordingAutoFetch /><RealtimeSync /></main>
          </div>
        </div>

        <CommandDialog open={search} onOpenChange={setSearch}>
          <CommandInput placeholder="Jump to…" />
          <CommandList>
            <CommandEmpty>No results.</CommandEmpty>
            <CommandGroup heading="Pages">
              {pages.map((p) => (
                <CommandItem key={p.to} onSelect={() => { setSearch(false); navigate({ to: p.to! }); }}><p.icon /> {p.label}</CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </CommandDialog>
      </div>
    </TooltipProvider>
  );
}
