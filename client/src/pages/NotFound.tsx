import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { useLocation } from "wouter";

export default function NotFound() {
  const [, setLocation] = useLocation();
  return <main className="grid min-h-screen place-items-center bg-background p-6 paper-grid"><section className="max-w-md border border-foreground/20 bg-card p-8 text-center"><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">Careline</p><h1 className="mt-4 font-editorial text-5xl">This page is not in your care path.</h1><p className="mt-4 text-sm leading-6 text-muted-foreground">The requested page does not exist or may no longer be available.</p><Button onClick={() => setLocation("/")} className="mt-7 rounded-none"><ArrowLeft className="mr-2 size-4" />Return home</Button></section></main>;
}
