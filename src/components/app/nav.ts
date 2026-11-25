import {
  LayoutDashboard, Users, UserPlus, Building2, Handshake, KanbanSquare, CheckSquare, CalendarDays,
  Bot, Megaphone, PhoneCall, Radio, FileText, Disc3, Brain, Workflow, Zap, ListChecks, Clock,
  Mail, MessageCircle, MessageSquare, History, BarChart3, LineChart, PieChart, Trophy, FileBarChart,
  Plug, UsersRound, Settings, FolderKanban, ReceiptText, Wallet, IdCard, RefreshCw, FileSpreadsheet, type LucideIcon,
} from "lucide-react";

export type NavItem = { label: string; icon: LucideIcon; to?: string };
export type NavGroup = { label?: string; items: NavItem[] };

export const NAV: NavGroup[] = [
  { items: [{ label: "Overview", icon: LayoutDashboard, to: "/dashboard" }] },
  {
    label: "CRM",
    items: [
      { label: "Projects", icon: FolderKanban, to: "/projects" },
      { label: "Contacts", icon: Users, to: "/contacts" },
      { label: "Leads", icon: UserPlus, to: "/leads" },
      { label: "Companies", icon: Building2, to: "/companies" },
      { label: "Deals", icon: Handshake, to: "/deals" },
      { label: "Sales Pipeline", icon: KanbanSquare, to: "/pipeline" },
      { label: "Tasks", icon: CheckSquare, to: "/tasks" },
      { label: "Meetings", icon: CalendarDays, to: "/meetings" },
    ],
  },
  {
    label: "Sales",
    items: [
      { label: "Sales Orders", icon: ReceiptText, to: "/sales-orders" },
      { label: "Payments", icon: Wallet, to: "/payments" },
      { label: "Client KYC", icon: IdCard, to: "/kyc" },
      { label: "Renewals", icon: RefreshCw, to: "/renewals" },
    ],
  },
  {
    label: "AI Voice",
    items: [
      { label: "Voice Agents", icon: Bot, to: "/voice-agents" }, { label: "Call Campaigns", icon: Megaphone, to: "/call-campaigns" },
      { label: "Call History", icon: PhoneCall, to: "/call-history" }, { label: "Live Calls", icon: Radio, to: "/live-calls" },
      { label: "Transcripts", icon: FileText, to: "/transcripts" }, { label: "Call Recordings", icon: Disc3, to: "/call-recordings" },
      { label: "Call Intelligence", icon: Brain, to: "/call-intelligence" },
    ],
  },
  {
    label: "Automation",
    items: [{ label: "Workflows", icon: Workflow, to: "/workflows" }, { label: "Triggers", icon: Zap, to: "/triggers" }, { label: "Rules", icon: ListChecks, to: "/rules" }, { label: "Scheduled Actions", icon: Clock, to: "/scheduled-actions" }],
  },
  {
    label: "Communication",
    items: [{ label: "Email", icon: Mail, to: "/email" }, { label: "WhatsApp", icon: MessageCircle, to: "/whatsapp" }, { label: "SMS", icon: MessageSquare, to: "/sms" }, { label: "Activity Timeline", icon: History, to: "/activity-timeline" }],
  },
  {
    label: "Analytics",
    items: [
      { label: "Sales Analytics", icon: BarChart3, to: "/sales-analytics" }, { label: "Call Analytics", icon: LineChart, to: "/call-analytics" },
      { label: "Campaign Analytics", icon: PieChart, to: "/campaign-analytics" }, { label: "Team Performance", icon: Trophy, to: "/team-performance" },
      { label: "Reports", icon: FileSpreadsheet, to: "/reports" },
      { label: "Custom Reports", icon: FileBarChart, to: "/custom-reports" },
    ],
  },
  {
    label: "Workspace",
    items: [
      { label: "Integrations", icon: Plug, to: "/integrations" },
      { label: "Team Management", icon: UsersRound, to: "/team" },
      { label: "Settings", icon: Settings, to: "/settings" },
    ],
  },
];
