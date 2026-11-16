import {
  LayoutDashboard, Users, UserPlus, Building2, Handshake, KanbanSquare, CheckSquare, CalendarDays,
  Bot, Megaphone, PhoneCall, Radio, FileText, Disc3, Brain, Workflow, Zap, ListChecks, Clock,
  Mail, MessageCircle, MessageSquare, History, BarChart3, LineChart, PieChart, Trophy, FileBarChart,
  Plug, UsersRound, Settings, type LucideIcon,
} from "lucide-react";

export type NavItem = { label: string; icon: LucideIcon; to?: string };
export type NavGroup = { label?: string; items: NavItem[] };

export const NAV: NavGroup[] = [
  { items: [{ label: "Overview", icon: LayoutDashboard, to: "/dashboard" }] },
  {
    label: "CRM",
    items: [
      { label: "Contacts", icon: Users, to: "/contacts" },
      { label: "Leads", icon: UserPlus, to: "/leads" },
      { label: "Companies", icon: Building2, to: "/companies" },
      { label: "Deals", icon: Handshake, to: "/deals" },
      { label: "Sales Pipeline", icon: KanbanSquare, to: "/pipeline" },
      { label: "Tasks", icon: CheckSquare, to: "/tasks" },
      { label: "Meetings", icon: CalendarDays },
    ],
  },
  {
    label: "AI Voice",
    items: [
      { label: "Voice Agents", icon: Bot }, { label: "Call Campaigns", icon: Megaphone },
      { label: "Call History", icon: PhoneCall }, { label: "Live Calls", icon: Radio },
      { label: "Transcripts", icon: FileText }, { label: "Call Recordings", icon: Disc3 },
      { label: "Call Intelligence", icon: Brain },
    ],
  },
  {
    label: "Automation",
    items: [{ label: "Workflows", icon: Workflow }, { label: "Triggers", icon: Zap }, { label: "Rules", icon: ListChecks }, { label: "Scheduled Actions", icon: Clock }],
  },
  {
    label: "Communication",
    items: [{ label: "Email", icon: Mail }, { label: "WhatsApp", icon: MessageCircle }, { label: "SMS", icon: MessageSquare }, { label: "Activity Timeline", icon: History }],
  },
  {
    label: "Analytics",
    items: [
      { label: "Sales Analytics", icon: BarChart3 }, { label: "Call Analytics", icon: LineChart },
      { label: "Campaign Analytics", icon: PieChart }, { label: "Team Performance", icon: Trophy },
      { label: "Custom Reports", icon: FileBarChart },
    ],
  },
  {
    label: "Workspace",
    items: [
      { label: "Integrations", icon: Plug },
      { label: "Team Management", icon: UsersRound, to: "/team" },
      { label: "Settings", icon: Settings, to: "/settings" },
    ],
  },
];
