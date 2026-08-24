import { Button } from "@/components/ui/button";
import { startLogin } from "@/const";
import { ArrowDownRight, ArrowRight, CalendarCheck2, HeartPulse, ShieldCheck, Sparkles } from "lucide-react";
import { useLocation } from "wouter";

const principles = [
  ["01", "Reserved with care", "A protected five-minute hold gives patients time to share what matters without losing their selected time."],
  ["02", "Designed for the clinical room", "Symptoms, urgency context, notes and prescriptions travel with the appointment—not across disconnected systems."],
  ["03", "Reliable by design", "Booking, calendar and notifications are deliberately separated so an external delay never compromises care."],
];

export default function Home() {
  const [, setLocation] = useLocation();
  return <div className="min-h-screen overflow-hidden paper-grid">
    <header className="mx-auto flex max-w-7xl items-center justify-between px-5 py-6 md:px-10">
      <button onClick={() => setLocation("/")} className="font-editorial text-2xl font-semibold tracking-tight">Careline<span className="text-primary">.</span></button>
      <div className="hidden items-center gap-8 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground md:flex"><a href="#approach">Approach</a><a href="#care-path">Care path</a><a href="#platform">Platform</a></div>
      <Button onClick={() => startLogin()} className="rounded-none bg-primary px-5 text-[11px] font-semibold uppercase tracking-[0.16em]">Sign in <ArrowRight className="ml-2 size-3" /></Button>
    </header>
    <main>
      <section className="relative mx-auto grid max-w-7xl grid-cols-1 gap-10 px-5 pb-20 pt-12 md:px-10 lg:grid-cols-12 lg:pb-28 lg:pt-20">
        <div className="reveal lg:col-span-8">
          <p className="mb-7 flex items-center gap-3 text-[10px] font-bold uppercase tracking-[0.24em] text-primary"><span className="inline-block size-2 rounded-full bg-primary" /> Considered appointment care</p>
          <h1 className="font-editorial max-w-4xl text-[clamp(4rem,10vw,9.4rem)] font-medium leading-[0.84] tracking-[-0.065em] text-foreground">Care that<br /><em className="font-normal text-primary">holds</em> its place.</h1>
          <div className="mt-10 grid max-w-xl grid-cols-[1fr_auto] gap-5 border-t border-foreground/30 pt-5"><p className="font-editorial text-xl leading-snug text-foreground/80 md:text-2xl">A calmer path from the first appointment through thoughtful follow-up.</p><ArrowDownRight className="mt-1 size-7 text-primary" /></div>
        </div>
        <aside className="reveal-delay self-end border-l border-foreground/25 pl-5 lg:col-span-4 lg:mb-5"><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">A care operating system</p><p className="mt-4 max-w-xs text-sm leading-6 text-muted-foreground">For clinics that value precision, clinical context and a more human patient experience.</p><Button variant="link" onClick={() => setLocation("/book")} className="mt-3 h-auto p-0 text-xs font-bold uppercase tracking-[0.14em] text-primary">Find your doctor <ArrowRight className="ml-2 size-3" /></Button></aside>
        <div className="absolute -bottom-6 right-[12%] hidden size-40 rounded-full border border-primary/35 lg:block" />
      </section>
      <section id="care-path" className="border-y border-foreground/20 bg-card/70 px-5 py-8 md:px-10"><div className="mx-auto grid max-w-7xl grid-cols-1 gap-5 md:grid-cols-3"><Metric icon={CalendarCheck2} label="Booking" value="Five-minute" detail="protected holds" /><Metric icon={Sparkles} label="Context" value="Structured" detail="pre-visit insight" /><Metric icon={ShieldCheck} label="Reliability" value="Separated" detail="care & delivery" /></div></section>
      <section id="approach" className="mx-auto grid max-w-7xl gap-10 px-5 py-24 md:px-10 lg:grid-cols-12"><div className="lg:col-span-4"><p className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary">The difference is in the system</p><h2 className="mt-5 font-editorial text-5xl leading-[0.93] tracking-[-0.045em]">A measured design for every moment of care.</h2></div><div className="divide-y divide-foreground/20 lg:col-span-8">{principles.map(([number, title, text]) => <article key={number} className="grid grid-cols-[52px_1fr] gap-5 py-7"><span className="text-[10px] font-bold tracking-[0.18em] text-primary">{number}</span><div><h3 className="font-editorial text-2xl">{title}</h3><p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">{text}</p></div></article>)}</div></section>
      <section id="platform" className="mx-5 mb-5 bg-primary px-6 py-14 text-primary-foreground md:mx-10 md:px-12 lg:mx-auto lg:max-w-7xl"><div className="grid gap-8 lg:grid-cols-[1.4fr_1fr]"><div><HeartPulse className="size-6" /><h2 className="mt-12 font-editorial text-5xl leading-[0.9] tracking-[-0.05em] md:text-7xl">Everything essential.<br />Nothing incidental.</h2></div><div className="flex flex-col justify-end"><p className="max-w-sm text-sm leading-6 text-primary-foreground/75">Secure role-based workflows give patients, clinicians and administrators a shared operating picture while maintaining the boundaries that privacy demands.</p><Button onClick={() => setLocation("/book")} variant="secondary" className="mt-7 w-fit rounded-none bg-background px-5 text-[11px] font-bold uppercase tracking-[0.16em] text-foreground">Begin booking <ArrowRight className="ml-2 size-3" /></Button></div></div></section>
    </main>
    <footer className="mx-auto flex max-w-7xl flex-col justify-between gap-4 px-5 py-8 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground md:flex-row md:px-10"><span>Careline · Appointment & Follow-up</span><span>UTC-aware · Role-secure · Clinically considered</span></footer>
  </div>;
}

function Metric({ icon: Icon, label, value, detail }: { icon: typeof CalendarCheck2; label: string; value: string; detail: string }) { return <div className="flex items-center gap-4"><div className="grid size-11 place-items-center rounded-full border border-primary/30"><Icon className="size-4 text-primary" /></div><div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">{label}</p><p className="font-editorial text-xl">{value} <span className="font-sans text-xs text-muted-foreground">{detail}</span></p></div></div>; }
