import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout, { type DashboardNavigationItem } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { Activity, Bell, CalendarDays, ClipboardList, LayoutDashboard, Loader2, Plus, ShieldCheck, Stethoscope, Users } from "lucide-react";
import { FormEvent, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

const navByRole: Record<string, DashboardNavigationItem[]> = {
  patient: [{ icon: LayoutDashboard, label: "Care overview", path: "/app" }, { icon: CalendarDays, label: "Book appointment", path: "/book" }],
  doctor: [{ icon: LayoutDashboard, label: "Clinical overview", path: "/app" }, { icon: ClipboardList, label: "Prescriptions", path: "/clinical" }],
  admin: [{ icon: LayoutDashboard, label: "System overview", path: "/app" }],
};

export default function Dashboard() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  if (!user) return <DashboardLayout><div /></DashboardLayout>;
  return <DashboardLayout navigation={navByRole[user.role] ?? []} brand="Careline">
    <div className="mx-auto max-w-7xl">
      <button onClick={() => setLocation("/")} className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground hover:text-primary">Careline / {user.role}</button>
      {user.role === "patient" ? <PatientWorkspace /> : user.role === "doctor" ? <DoctorWorkspace /> : <AdminWorkspace />}
    </div>
  </DashboardLayout>;
}

function PageHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  return <header className="mt-8 grid gap-5 border-b border-foreground/20 pb-8 md:grid-cols-[1fr_auto]">
    <div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">{eyebrow}</p><h1 className="mt-3 font-editorial text-5xl tracking-[-0.05em] md:text-6xl">{title}</h1><p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">{description}</p></div>
    {action && <div className="self-end">{action}</div>}
  </header>;
}

function Status({ value }: { value: string }) {
  const color = value.includes("failed") || value.includes("cancelled") || value.includes("High") ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary";
  return <span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-[0.13em] ${color}`}>{value.replaceAll("_", " ")}</span>;
}
function fmt(date: Date) { return new Date(date).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); }
function LoadingPage() { return <div className="grid min-h-[60vh] place-items-center"><Loader2 className="size-6 animate-spin text-primary" /></div>; }
function Empty({ text }: { text: string }) { return <div className="border border-dashed border-foreground/25 p-5 text-sm leading-6 text-muted-foreground">{text}</div>; }

function PatientWorkspace() {
  const [, setLocation] = useLocation();
  const data = trpc.care.patientDashboard.useQuery();
  const generate = trpc.care.preVisitSummary.useMutation({ onSuccess: () => { data.refetch(); toast.success("Pre-visit summary generated."); }, onError: error => toast.error(error.message) });
  const cancel = trpc.appointments.cancel.useMutation({ onSuccess: () => { data.refetch(); toast.success("Appointment cancelled."); }, onError: error => toast.error(error.message) });
  if (data.isLoading) return <LoadingPage />;
  const rows = data.data?.appointments ?? [];
  const next = rows.find(row => row.appointment.status === "confirmed" && new Date(row.appointment.startsAt) > new Date());
  return <>
    <PageHeader eyebrow="Patient workspace" title="Your care, in view." description="Appointments, pre-visit context and delivery updates are gathered here—without unnecessary noise." action={<Button onClick={() => setLocation("/book")} className="rounded-none text-[11px] font-bold uppercase tracking-[0.14em]"><Plus className="mr-2 size-3" />Book appointment</Button>} />
    <section className="grid gap-5 py-8 lg:grid-cols-3">
      <article className="border border-primary/30 bg-primary p-6 text-primary-foreground lg:col-span-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary-foreground/70">Next appointment</p>
        {next ? <><h2 className="mt-10 font-editorial text-4xl">{next.doctor.displayName}</h2><p className="mt-2 text-sm text-primary-foreground/75">{next.doctor.specialization} · {fmt(next.appointment.startsAt)}</p><div className="mt-7 flex flex-wrap gap-3"><Status value={next.appointment.status} />{next.preVisit ? <Status value={next.preVisit.status} /> : <Button onClick={() => generate.mutate({ appointmentId: next.appointment.id })} disabled={generate.isPending} size="sm" className="h-7 rounded-none bg-background text-[10px] font-bold uppercase tracking-[0.12em] text-foreground">Generate symptom summary</Button>}</div></> : <><h2 className="mt-7 font-editorial text-3xl">Your next chapter of care begins when you are ready.</h2><Button onClick={() => setLocation("/book")} variant="secondary" className="mt-7 rounded-none bg-background text-foreground">Find a doctor</Button></>}
      </article>
      <article className="border border-foreground/20 bg-card p-6"><Bell className="size-5 text-primary" /><p className="mt-7 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Notification history</p><p className="mt-2 font-editorial text-4xl">{data.data?.notifications.length ?? 0}</p><p className="mt-2 text-sm text-muted-foreground">Delivery attempts are retained—even where sending needs a retry.</p></article>
    </section>
    <section className="grid gap-8 pb-10 lg:grid-cols-[1.4fr_0.6fr]">
      <div><div className="flex items-end justify-between"><h2 className="font-editorial text-3xl">Appointments</h2><span className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">All times shown locally</span></div><div className="mt-4 divide-y divide-foreground/15 border-y border-foreground/15">{rows.length ? rows.map(row => <article key={row.appointment.id} className="grid gap-3 py-5 md:grid-cols-[1.4fr_1fr_auto]"><div><p className="font-editorial text-xl">{row.doctor.displayName}</p><p className="mt-1 text-sm text-muted-foreground">{row.doctor.specialization} · {fmt(row.appointment.startsAt)}</p></div><div className="flex flex-wrap content-center gap-2"><Status value={row.appointment.status} />{Boolean(row.preVisit?.content) && <Status value={row.preVisit?.isDevelopmentFallback ? "local fallback" : "AI ready"} />}</div>{row.appointment.status === "confirmed" ? <Button onClick={() => cancel.mutate({ appointmentId: row.appointment.id })} variant="outline" size="sm" className="self-center rounded-none text-[10px] font-bold uppercase tracking-[0.12em]">Cancel</Button> : <span />}</article>) : <Empty text="No appointments are on your record yet." />}</div></div>
      <aside><h2 className="font-editorial text-3xl">Medication reminders</h2><div className="mt-4 space-y-3">{data.data?.reminders.length ? data.data.reminders.slice(0, 4).map(reminder => <div key={reminder.id} className="border border-foreground/15 bg-card p-4"><p className="text-sm">Reminder due {fmt(reminder.scheduledAt)}</p><p className="mt-1 text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">{reminder.state}</p></div>) : <Empty text="Medication schedules appear here after a clinician adds a prescription." />}</div></aside>
    </section>
  </>;
}

function DoctorWorkspace() {
  const data = trpc.care.doctorDashboard.useQuery();
  const [selectedId, setSelectedId] = useState<string>(); const [assessment, setAssessment] = useState(""); const [plan, setPlan] = useState("");
  const note = trpc.care.clinicalNote.useMutation({ onSuccess: () => toast.success("Clinical note saved."), onError: error => toast.error(error.message) });
  const post = trpc.care.postVisitSummary.useMutation({ onSuccess: () => toast.success("Patient-friendly summary generated."), onError: error => toast.error(error.message) });
  if (data.isLoading) return <LoadingPage />;
  const rows = data.data?.appointments ?? []; const selected = rows.find(row => row.appointment.id === selectedId) ?? rows[0];
  return <><PageHeader eyebrow="Clinical workspace" title="A quieter clinical day." description="Today’s queue foregrounds urgency context and gives each visit a clear, contained documentation workflow." /><section className="grid gap-8 py-8 lg:grid-cols-[0.85fr_1.15fr]"><div><div className="mb-4 flex items-center justify-between"><h2 className="font-editorial text-3xl">Patient queue</h2><Status value={`${rows.length} visits`} /></div><div className="space-y-3">{rows.length ? rows.map(row => { const content = row.preVisit?.content as { urgency?: string; chiefComplaint?: string } | null; return <button onClick={() => setSelectedId(row.appointment.id)} key={row.appointment.id} className={`w-full border p-4 text-left ${selected?.appointment.id === row.appointment.id ? "border-primary bg-primary/5" : "border-foreground/15 bg-card"}`}><div className="flex justify-between gap-3"><p className="font-editorial text-xl">{fmt(row.appointment.startsAt)}</p>{content?.urgency && <Status value={`${content.urgency} urgency`} />}</div><p className="mt-2 text-sm text-muted-foreground">{content?.chiefComplaint || row.symptom?.symptoms?.slice(0, 95) || "Awaiting symptom intake"}</p></button>; }) : <Empty text="No appointments have been assigned to this doctor profile." />}</div></div><section className="border border-foreground/20 bg-card p-6">{selected ? <><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Appointment detail</p><h2 className="mt-2 font-editorial text-4xl">{fmt(selected.appointment.startsAt)}</h2><div className="mt-6 border-l-2 border-primary pl-4"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Patient symptom intake</p><p className="mt-2 text-sm leading-6">{selected.symptom?.symptoms || "No symptoms submitted."}</p></div><div className="mt-7 grid gap-4"><div><Label className="text-[10px] font-bold uppercase tracking-[0.16em]">Assessment</Label><Textarea value={assessment} onChange={event => setAssessment(event.target.value)} className="mt-2 min-h-24 bg-background" placeholder="Clinical assessment" /></div><div><Label className="text-[10px] font-bold uppercase tracking-[0.16em]">Care plan</Label><Textarea value={plan} onChange={event => setPlan(event.target.value)} className="mt-2 min-h-24 bg-background" placeholder="Plan, medication and follow-up" /></div><div className="flex flex-wrap gap-3"><Button disabled={!assessment || !plan || note.isPending} onClick={() => note.mutate({ appointmentId: selected.appointment.id, assessment, plan })} className="rounded-none">{note.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}Save clinical note</Button><Button disabled={post.isPending} onClick={() => post.mutate({ appointmentId: selected.appointment.id })} variant="outline" className="rounded-none">Generate patient summary</Button></div></div></> : <Empty text="Select a visit from the queue to begin its clinical workflow." />}</section></section></>;
}

function AdminWorkspace() {
  const stats = trpc.admin.dashboard.useQuery(); const createDoctor = trpc.admin.createDoctor.useMutation({ onSuccess: () => { stats.refetch(); toast.success("Doctor profile created. Assign a verified user before clinical access."); }, onError: error => toast.error(error.message) }); const [showForm, setShowForm] = useState(false);
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const data = new FormData(event.currentTarget); createDoctor.mutate({ displayName: String(data.get("name")), specialization: String(data.get("specialization")), licenseNumber: String(data.get("license")), email: String(data.get("email")) || undefined, biography: String(data.get("bio")) || undefined, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, slotDurationMinutes: Number(data.get("duration")) || 30 }); };
  if (stats.isLoading) return <LoadingPage />;
  const cards = [["Patients", stats.data?.patients ?? 0, Users], ["Active doctors", stats.data?.doctors ?? 0, Stethoscope], ["Today", stats.data?.today ?? 0, CalendarDays], ["Delivery failures", stats.data?.notificationFailures ?? 0, Bell]] as const;
  return <><PageHeader eyebrow="Clinic administration" title="Care, coherently managed." description="A single operational view for clinical capacity, leave decisions and delivery integrity." action={<Button onClick={() => setShowForm(value => !value)} className="rounded-none text-[11px] font-bold uppercase tracking-[0.14em]"><Plus className="mr-2 size-3" />Create doctor</Button>} />{showForm && <form onSubmit={submit} className="mt-7 grid gap-4 border border-primary/30 bg-card p-5 md:grid-cols-2"><div><Label>Doctor name</Label><Input required name="name" className="mt-1 bg-background" /></div><div><Label>Specialization</Label><Input required name="specialization" className="mt-1 bg-background" placeholder="e.g. Family medicine" /></div><div><Label>License number</Label><Input required name="license" className="mt-1 bg-background" /></div><div><Label>Work email</Label><Input name="email" type="email" className="mt-1 bg-background" /></div><div><Label>Slot duration (minutes)</Label><Input name="duration" type="number" min="10" max="120" defaultValue="30" className="mt-1 bg-background" /></div><div className="md:col-span-2"><Label>Biography</Label><Textarea name="bio" className="mt-1 min-h-20 bg-background" /></div><Button disabled={createDoctor.isPending} className="w-fit rounded-none">Create & prepare assignment</Button></form>}<section className="grid gap-4 py-8 sm:grid-cols-2 xl:grid-cols-4">{cards.map(([label, value, Icon]) => <article key={label} className="border border-foreground/15 bg-card p-5"><Icon className="size-5 text-primary" /><p className="mt-8 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">{label}</p><p className="mt-1 font-editorial text-5xl">{value}</p></article>)}</section><section className="grid gap-5 pb-10 lg:grid-cols-2"><article className="border border-foreground/20 bg-card p-6"><ShieldCheck className="size-5 text-primary" /><h2 className="mt-8 font-editorial text-3xl">Appointment integrity</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">Database-backed slot locks make concurrent requests deterministic. A request that loses the unique slot race receives a clear conflict rather than a silent failure.</p></article><article className="border border-foreground/20 bg-card p-6"><Activity className="size-5 text-primary" /><h2 className="mt-8 font-editorial text-3xl">Leave decisions</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">Leave must be previewed before confirmation. Confirming it changes affected appointments to a traceable doctor-leave cancellation state and queues patient notices.</p></article></section></>;
}
