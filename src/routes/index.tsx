import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, AudioLines, BarChart3, KanbanSquare, ShieldCheck, Users, Workflow } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/app/Logo";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Yulabs CRM — AI voice agents meet your sales pipeline" },
      { name: "description", content: "Manage contacts, leads, deals and AI voice campaigns in one secure, multi-tenant CRM." },
      { property: "og:title", content: "Yulabs CRM — AI voice agents meet your sales pipeline" },
      { property: "og:description", content: "Manage contacts, leads, deals and AI voice campaigns in one secure, multi-tenant CRM." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const features = [
  { icon: Users, title: "Contacts & leads", text: "One clean record for every customer, lead and company." },
  { icon: KanbanSquare, title: "Sales pipeline", text: "Drag deals across stages and forecast revenue." },
  { icon: AudioLines, title: "Sarvam voice agents", text: "Run AI calling campaigns and review every transcript." },
  { icon: Workflow, title: "Automation", text: "Trigger follow-ups and tasks without lifting a finger." },
  { icon: BarChart3, title: "Analytics", text: "Track conversion, calls and team performance live." },
  { icon: ShieldCheck, title: "Tenant isolation", text: "Every organisation's data is locked to its own team." },
];

function Landing() {
  return (
    <div className="dot-canvas min-h-screen">
      <header className="mx-auto max-w-6xl px-4 pt-5">
        <nav className="glass flex items-center justify-between rounded-[20px] px-4 py-2.5">
          <Logo />
          <div className="flex items-center gap-2">
            <Button variant="ghost" asChild><Link to="/auth">Sign in</Link></Button>
            <Button variant="hero" asChild><Link to="/auth" search={{ mode: "signup" }}>Get started</Link></Button>
          </div>
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4">
        <section className="animate-rise py-16 text-center md:py-28">
          <span className="inline-flex items-center gap-2 rounded-full border bg-background px-3 py-1 text-xs font-medium text-muted-foreground shadow-soft">
            <span className="size-1.5 rounded-full bg-success" /> AI calling, built into your CRM
          </span>
          <h1 className="mx-auto mt-6 max-w-3xl text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl md:text-6xl">
            Every customer, call and deal — <span className="bg-gradient-primary bg-clip-text text-transparent">in one place.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base text-muted-foreground sm:text-lg">
            Yulabs CRM combines pipelines, voice agents and analytics so your sales team closes faster.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button variant="hero" size="lg" asChild>
              <Link to="/auth" search={{ mode: "signup" }}>Create your workspace <ArrowRight /></Link>
            </Button>
            <Button variant="outline" size="lg" asChild><Link to="/auth">Sign in</Link></Button>
          </div>
        </section>
        <section className="animate-rise grid gap-4 pb-24 sm:grid-cols-2 lg:grid-cols-3 md:gap-6">
          {features.map((f) => (
            <div key={f.title} className="rounded-2xl border bg-card p-6 shadow-soft transition hover:-translate-y-0.5 hover:shadow-float">
              <span className="grid size-10 place-items-center rounded-xl bg-accent text-accent-foreground"><f.icon className="size-5" /></span>
              <h3 className="mt-4 font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.text}</p>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
