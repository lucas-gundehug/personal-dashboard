import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import {
  Briefcase,
  Copy,
  Download,
  GraduationCap,
  Languages as LanguagesIcon,
  Mail,
  MapPin,
  Phone,
  Printer,
} from "lucide-react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { education, experience, languages, profile, skills } from "@/data/cv";
import { site } from "@/site.config";

// lucide-react dropped brand/logo icons (e.g. Linkedin) in v1 — inline the glyph instead.
function LinkedinIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M20.45 20.45h-3.55v-5.57c0-1.33-.02-3.04-1.85-3.04-1.86 0-2.15 1.45-2.15 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.38-1.85 3.61 0 4.28 2.38 4.28 5.47zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zM7.12 20.45H3.56V9h3.56z" />
    </svg>
  );
}

// Not a real map — a small illustrated stand-in (street-like lines + a pin)
// so the location has a visual anchor without depending on a map API/key.
function LocationCard() {
  return (
    <div
      aria-hidden="true"
      className="no-print hairline surface-tint-strong relative h-12 w-16 shrink-0 overflow-hidden rounded-lg border"
    >
      <svg
        viewBox="0 0 64 48"
        className="absolute inset-0 h-full w-full text-muted-foreground/30"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
      >
        <path d="M-4 16 Q20 6 34 18 T70 12" />
        <path d="M-4 36 Q22 28 36 38 T70 32" />
        <path d="M14 -4 Q10 20 16 36 T10 54" />
        <path d="M46 -4 Q42 22 48 36 T44 54" />
      </svg>
      <MapPin
        className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 text-primary"
        fill="currentColor"
      />
    </div>
  );
}

const CV_URL = `${site.siteUrl}/cv`;

function buildVCard() {
  const [firstName, ...rest] = profile.name.split(" ");
  const lastName = rest.join(" ");
  return [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `N:${lastName};${firstName};;;`,
    `FN:${profile.name}`,
    `TEL;TYPE=CELL:${profile.phone}`,
    `EMAIL:${profile.email}`,
    `URL:${profile.linkedin}`,
    `ADR:;;;${profile.location};;;`,
    "END:VCARD",
  ].join("\r\n");
}

const vCardHref = `data:text/vcard;charset=utf-8,${encodeURIComponent(buildVCard())}`;

export const Route = createFileRoute("/cv")({
  head: () => ({
    meta: [
      { title: `${profile.name} — CV` },
      { name: "description", content: profile.tagline },
      { property: "og:title", content: `${profile.name} — CV` },
      { property: "og:description", content: profile.tagline },
      { property: "og:type", content: "profile" },
      { property: "og:url", content: CV_URL },
      { property: "og:image", content: `${site.siteUrl}/cv-og.jpg` },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: `${profile.name} — CV` },
      { name: "twitter:description", content: profile.tagline },
      { name: "twitter:image", content: `${site.siteUrl}/cv-og.jpg` },
      {
        "script:ld+json": {
          "@context": "https://schema.org",
          "@type": "Person",
          name: profile.name,
          url: CV_URL,
          email: profile.email,
          telephone: profile.phone,
          address: { "@type": "PostalAddress", addressLocality: profile.location },
          sameAs: [profile.linkedin],
          knowsAbout: skills,
          knowsLanguage: languages.map((l) => l.name),
          jobTitle: experience[0]?.title,
          worksFor: experience[0]
            ? { "@type": "Organization", name: experience[0].company }
            : undefined,
        },
      },
    ],
    links: [{ rel: "manifest", href: "/manifest.json" }],
  }),
  component: CvPage,
});

function CvPage() {
  // No weather here — just the plain clock-driven day/night theme so the
  // page still matches the rest of the site's look.
  useEffect(() => {
    function update() {
      const h = new Date().getHours();
      document.documentElement.classList.toggle("day", h >= 5 && h < 19);
    }
    update();
    const t = setInterval(update, 60_000);
    return () => clearInterval(t);
  }, []);

  async function copyEmail() {
    try {
      await navigator.clipboard.writeText(profile.email);
      toast.success("E-mail kopieret");
    } catch {
      toast.error("Kunne ikke kopiere e-mail");
    }
  }

  return (
    <div className="cv-page min-h-screen">
      <Toaster position="bottom-center" />
      <div className="mx-auto max-w-3xl px-6 py-12 md:py-20">
        <header className="mb-12">
          <h1 className="font-display text-4xl font-bold tracking-tight md:text-5xl">
            {profile.name}
          </h1>
          <div className="mt-2 flex items-center gap-3">
            <p className="text-sm uppercase tracking-[0.18em] text-muted-foreground">
              {profile.location}
            </p>
            <LocationCard />
          </div>
          <p className="mt-4 max-w-xl text-foreground/90">{profile.tagline}</p>

          <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
            <a
              href={`mailto:${profile.email}`}
              className="flex items-center gap-1.5 hover:text-foreground"
            >
              <Mail className="h-4 w-4" /> {profile.email}
            </a>
            <button
              type="button"
              onClick={copyEmail}
              className="no-print flex items-center gap-1.5 hover:text-foreground"
            >
              <Copy className="h-4 w-4" /> Kopiér
            </button>
            <a
              href={`tel:${profile.phone}`}
              className="flex items-center gap-1.5 hover:text-foreground"
            >
              <Phone className="h-4 w-4" /> {profile.phone}
            </a>
            <a
              href={profile.linkedin}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 hover:text-foreground"
            >
              <LinkedinIcon className="h-4 w-4" /> LinkedIn
            </a>
            <a
              href={vCardHref}
              download={`${profile.name.replace(/\s+/g, "-")}.vcf`}
              className="no-print flex items-center gap-1.5 hover:text-foreground"
            >
              <Download className="h-4 w-4" /> Gem som kontakt
            </a>
            <button
              type="button"
              onClick={() => window.print()}
              className="no-print flex items-center gap-1.5 hover:text-foreground"
            >
              <Printer className="h-4 w-4" /> Download som PDF
            </button>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {skills.map((skill) => (
              <span
                key={skill}
                className="hairline surface-tint-strong rounded-full border px-3 py-1 text-xs text-muted-foreground"
              >
                {skill}
              </span>
            ))}
          </div>

          <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
            <LanguagesIcon className="h-3.5 w-3.5" />
            {languages.map((l) => `${l.name} (${l.level})`).join(" · ")}
          </div>
        </header>

        <section>
          <h2 className="mb-6 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            <Briefcase className="h-3.5 w-3.5" /> Erfaring
          </h2>
          <ol className="flex flex-col gap-4">
            {experience.map((job, i) => (
              <li key={i} className="glass animate-card-in rounded-2xl p-6">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <h3 className="font-display text-xl">{job.title}</h3>
                  <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                    {job.period}
                  </span>
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {[job.company, job.employmentType, job.location].filter(Boolean).join(" · ")}
                </div>
                {job.description && (
                  <p className="mt-3 text-sm text-foreground/90">{job.description}</p>
                )}
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-10">
          <h2 className="mb-6 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            <GraduationCap className="h-3.5 w-3.5" /> Uddannelse
          </h2>
          <ol className="flex flex-col gap-4">
            {education.map((edu, i) => (
              <li key={i} className="glass animate-card-in rounded-2xl p-6">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <h3 className="font-display text-xl">{edu.school}</h3>
                  <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                    {edu.period}
                  </span>
                </div>
                <div className="mt-1 text-sm text-muted-foreground">{edu.degree}</div>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}
