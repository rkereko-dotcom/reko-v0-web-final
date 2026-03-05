"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSiteName } from "@/components/providers/site-settings-provider";

const navLinks = [
  "Product",
  "Teams",
  "Resources",
  "Community",
  "Support",
  "Enterprise",
  "Pricing",
];

const heroTiles = [
  { src: "/framer/0DoFvQInPiH34TWUk6DzVA9JQ.avif", title: "Milo", meta: "Template" },
  { src: "/framer/0DqWFfs9zfVYPO7PZd8O8bsRtE.avif", title: "Notion", meta: "Plugin" },
  { src: "/framer/3RGrfrckophlAobhfZlqf1MDPd0.avif", title: "Hover Zoom", meta: "Component" },
  { src: "/framer/6SXUv7jMAEkw8PabtmC6TXNIiM.avif", title: "Archer", meta: "Template" },
  { src: "/framer/8VfS5zuMmDchIpaCf767I8rX7Y.avif", title: "Workshop", meta: "Plugin" },
  { src: "/framer/cx71XZYYWfIozOc1rn55Bw.avif", title: "Image Slider", meta: "Component" },
  { src: "/framer/gmhdX4XPuJvQqId9jDmFHb7cFE.avif", title: "Baseform", meta: "Template" },
  { src: "/framer/HnQI4uTAjbgziEmMMInd3R6o9c.avif", title: "Digital Rotary Radio", meta: "Component" },
  { src: "/framer/hZ3ztUHQQ9Tn50mg184gLvKcy4E.avif", title: "Apex Films", meta: "Template" },
  { src: "/framer/iR48olgey2UZQ9FFhsWFne27Ag.avif", title: "Flip Card", meta: "Component" },
  { src: "/framer/irsyTM7kM1DWjcg6fJkQQ1O04s.avif", title: "Animated Gradients", meta: "Component" },
  { src: "/framer/JUWRJbfPWXb05lTNw0q4p1jewc.avif", title: "JSON", meta: "Plugin" },
  { src: "/framer/KCk7nP2M4mP1QclNxHPIrT1FvcA.avif", title: "Town", meta: "Template" },
  { src: "/framer/PruQlxKuftAZHgOh7hJT3jaUbs.avif", title: "Miro", meta: "Plugin" },
  { src: "/framer/Tkq5qQlGiu0yhgjP3SrSQz7eog.avif", title: "Perplexity", meta: "Plugin" },
];

export default function LandingPage() {
  const siteName = useSiteName();
  const [shuffledTiles, setShuffledTiles] = useState(heroTiles);

  useEffect(() => {
    const next = [...heroTiles];
    for (let i = next.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [next[i], next[j]] = [next[j], next[i]];
    }
    setShuffledTiles(next);
  }, []);
  const [compareValue, setCompareValue] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const [showDock, setShowDock] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const sliderRef = useRef<HTMLDivElement | null>(null);
  const processSectionRef = useRef<HTMLDivElement | null>(null);
  const processPreviewViewportRef = useRef<HTMLDivElement | null>(null);
  const processPreviewTrackRef = useRef<HTMLDivElement | null>(null);

  const topTiles = shuffledTiles.slice(0, 8);
  const bottomTiles = shuffledTiles.slice(8, 16);
  const beforeImage = heroTiles[0];
  const afterImage = heroTiles[1] ?? heroTiles[0];
  const resetCompare = () => setCompareValue(50);
  const stepVisuals = heroTiles.slice(2, 5);
  const steps = [
    { title: "Upload", body: "Drop your poster or ad creative in seconds." },
    { title: "Analyze", body: "Get a clear critique with scores and fixes." },
    { title: "Export", body: "Download launch-ready variations instantly." },
  ];

  const updateCompareFromClientX = (clientX: number) => {
    if (!sliderRef.current) return;
    const rect = sliderRef.current.getBoundingClientRect();
    const next = ((clientX - rect.left) / rect.width) * 100;
    setCompareValue(Math.max(0, Math.min(100, next)));
  };

  useEffect(() => {
    if (!isDragging) return;
    const handleMove = (event: PointerEvent) => updateCompareFromClientX(event.clientX);
    const handleUp = () => setIsDragging(false);
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [isDragging]);

  useEffect(() => {
    const handleScroll = () => {
      setShowDock(window.scrollY > 420);
    };
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const section = processSectionRef.current;
    const viewportEl = processPreviewViewportRef.current;
    const trackEl = processPreviewTrackRef.current;
    if (!section || !viewportEl || !trackEl) return;

    const update = () => {
      const viewport = window.innerHeight || 1;
      const rect = section.getBoundingClientRect();
      const total = Math.max(1, rect.height - viewport);
      const scrolled = Math.min(total, Math.max(0, -rect.top));
      const clamped = scrolled / total;

      const viewHeight = viewportEl.getBoundingClientRect().height || 1;
      const maxTranslate = Math.max(0, viewHeight * stepVisuals.length - viewHeight);
      const translateY = -clamped * maxTranslate;
      trackEl.style.transform = `translate3d(0, ${translateY.toFixed(2)}px, 0)`;

      const stepIndex = Math.min(steps.length - 1, Math.floor(clamped * steps.length + 0.0001));
      setActiveStep(stepIndex);
    };

    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [stepVisuals.length, steps.length]);

  useEffect(() => {
    const elements = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
    if (!elements.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("in");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1, rootMargin: "0px 0px -10% 0px" }
    );
    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const elements = Array.from(document.querySelectorAll<HTMLElement>("[data-speed]"));
    if (!elements.length) return;

    const items = elements.map((el) => ({
      el,
      speed: Number.parseFloat(el.dataset.speed ?? "1") || 1,
      current: 0,
    }));

    let rafId = 0;
    const update = () => {
      rafId = 0;
      const viewport = window.innerHeight;
      items.forEach((item) => {
        const rect = item.el.getBoundingClientRect();
        const center = rect.top + rect.height / 2;
        const offset = center - viewport / 2;
        const target = -offset * (item.speed - 1);
        item.current += (target - item.current) * 0.08;
        item.el.style.setProperty("--parallax-y", `${item.current.toFixed(2)}px`);
      });
    };

    const requestUpdate = () => {
      if (rafId) return;
      rafId = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", requestUpdate);
    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      window.removeEventListener("scroll", requestUpdate);
      window.removeEventListener("resize", requestUpdate);
    };
  }, []);

  
  return (
    <div className="relative min-h-screen bg-black text-white">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          data-speed="0.8"
          className="absolute -top-52 left-1/2 h-[680px] w-[680px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.16),transparent_60%)] blur-3xl"
        />
        <div
          data-speed="1.15"
          className="absolute top-40 right-10 h-72 w-72 rounded-full bg-[radial-gradient(circle_at_center,rgba(59,130,246,0.2),transparent_70%)] blur-3xl"
        />
        <div
          data-speed="1.3"
          className="absolute bottom-0 left-10 h-80 w-80 rounded-full bg-[radial-gradient(circle_at_center,rgba(16,185,129,0.2),transparent_70%)] blur-3xl"
        />
      </div>

      <header className="relative z-10 px-6 py-6">
        <div className="mx-auto flex max-w-[1280px] items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-white text-black">
              <span className="text-xs font-semibold">{siteName[0]}</span>
            </div>
            <span className="text-sm font-semibold tracking-tight text-white">{siteName}</span>
          </div>
          <nav className="hidden items-center gap-6 text-[12px] font-medium text-white/60 lg:flex">
            {navLinks.map((label) => (
              <a key={label} href="#" className="transition hover:text-white">
                {label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-semibold text-white/90 shadow-[0_0_0_1px_rgba(255,255,255,0.02),0_8px_24px_-16px_rgba(0,0,0,0.9)] transition hover:border-white/40 hover:bg-white/15"
            >
              Dashboard
            </Link>
          </div>
        </div>
      </header>

      <main className="relative z-10 px-6">
        <section className="mx-auto flex max-w-[1280px] flex-col items-center pt-20 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-1 text-[10px] font-semibold uppercase tracking-[0.3em] text-white/70 shadow-[0_8px_30px_-20px_rgba(255,255,255,0.15)]">
            Framer Awards 25 Submissions open
          </div>
          <h1 className="mt-8 max-w-[840px] font-[var(--font-display)] text-[44px] font-semibold leading-[0.92] tracking-[-0.03em] text-white sm:text-[62px] lg:text-[80px]">
            Pro-level poster improvement <br className="hidden sm:block" />
            in 40 seconds.
          </h1>
          <p className="mt-5 max-w-[560px] text-[15px] leading-relaxed text-white/60 sm:text-[17px]">
            Upload, get a professional critique, and generate launch-ready variations, fast. Built for paid teams
            who need results now.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/billing"
              className="rounded-full bg-white px-6 py-2.5 text-sm font-semibold text-black shadow-[0_16px_40px_-24px_rgba(0,0,0,0.7)] transition hover:bg-white/90"
            >
              Start Pro
            </Link>
            <Link
              href="/studio?sample=1"
              className="rounded-full border border-white/20 bg-white/10 px-6 py-2.5 text-sm font-semibold text-white shadow-[0_16px_40px_-24px_rgba(0,0,0,0.7)] transition hover:border-white/40 hover:bg-white/15"
            >
              See it in action
            </Link>
          </div>

          <div className="relative mt-14 w-full space-y-10">
            <div className="marquee">
              <div className="marquee-track">
                {[...topTiles, ...topTiles].map((tile, index) => (
                  <div key={`${tile.src}-${index}`} className="flex w-[360px] flex-col gap-3">
                    <div className="overflow-hidden rounded-[14px] border border-white/10 bg-black shadow-[0_30px_80px_-60px_rgba(0,0,0,0.95)]">
                      <img
                        src={tile.src}
                        alt={tile.title}
                        className="aspect-[5/4] w-full object-cover"
                        loading="lazy"
                      />
                    </div>
                    <div className="min-h-[36px] text-left">
                      <p className="text-sm font-semibold text-white">{tile.title}</p>
                      <p className="text-xs text-white/60">{tile.meta}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="marquee">
              <div className="marquee-track reverse">
                {[...bottomTiles, ...bottomTiles].map((tile, index) => (
                  <div key={`${tile.src}-rev-${index}`} className="flex w-[360px] flex-col gap-3">
                    <div className="overflow-hidden rounded-[14px] border border-white/10 bg-black shadow-[0_30px_80px_-60px_rgba(0,0,0,0.95)]">
                      <img
                        src={tile.src}
                        alt={tile.title}
                        className="aspect-[5/4] w-full object-cover"
                        loading="lazy"
                      />
                    </div>
                    <div className="min-h-[36px] text-left">
                      <p className="text-sm font-semibold text-white">{tile.title}</p>
                      <p className="text-xs text-white/60">{tile.meta}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black via-black/80 to-transparent" />
          </div>


          <div className="mt-[300px] w-full">
            <div className="mx-auto mb-6 flex max-w-[720px] flex-col items-center gap-3 px-4 text-center text-white/60">
              <span className="font-[var(--font-display)] text-[11px] uppercase tracking-[0.12em] text-white/50">
                Simply Powerful.
              </span>
              <h3 className="text-[32px] font-semibold leading-[1.05] text-white sm:text-[40px]">
                Drag. Refine.
              </h3>
              <p className="text-[17px] text-white/60">
                Slide to reveal the transformation. Small moves, dramatic improvements.
              </p>
            </div>

            <div className="mx-auto max-w-[1100px] rounded-[16px] border border-white/10 bg-black/70 px-0 py-0 shadow-[0_35px_90px_-70px_rgba(0,0,0,0.9)]">
              <div className="mx-4 mt-4 mb-3 flex items-center justify-between">
                <span className="font-[var(--font-funnel)] text-sm font-semibold tracking-[0.02em] text-white/70">
                  Simple · Fast · Beautiful
                </span>
                <button
                  type="button"
                  onClick={resetCompare}
                  aria-label="Reset slider"
                  className="flex h-8 w-8 items-center justify-center rounded-[8px] border border-white/15 bg-white/5 text-white/70 transition hover:border-white/40 hover:bg-white/15"
                >
                  <svg
                    className="h-4.5 w-4.5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M20 12a8 8 0 1 1-2.34-5.66" />
                    <path d="M20 4v6h-6" />
                  </svg>
                </button>
              </div>
              <div
                ref={sliderRef}
                className="relative aspect-[16/9] w-full cursor-ew-resize select-none overflow-hidden rounded-[12px] border border-white/10 bg-black touch-none"
                onPointerDown={(event) => {
                  setIsDragging(true);
                  updateCompareFromClientX(event.clientX);
                }}
                onPointerMove={(event) => {
                  if (!isDragging) {
                    updateCompareFromClientX(event.clientX);
                  }
                }}
                onPointerLeave={() => setIsDragging(false)}
              >
                <img src={beforeImage.src} alt="Before" className="absolute inset-0 h-full w-full object-cover" />
                <div
                  className="absolute inset-0 overflow-hidden transition-[clip-path] duration-150 ease-out"
                  style={{ clipPath: `inset(0 ${100 - compareValue}% 0 0)` }}
                >
                  <img src={afterImage.src} alt="After" className="absolute inset-0 h-full w-full object-cover" />
                </div>
                <div
                  className="absolute top-0 h-full w-[1px] -translate-x-1/2 bg-white/60 transition-[left] duration-150 ease-out"
                  style={{ left: `${compareValue}%` }}
                />
                <div
                  className="absolute top-1/2 flex h-8 w-14 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize items-center justify-center rounded-md border border-white/20 bg-white/20 text-white transition-[left] duration-150 ease-out"
                  style={{ left: `${compareValue}%` }}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    setIsDragging(true);
                    updateCompareFromClientX(event.clientX);
                  }}
                >
                  <svg
                    className="h-5 w-5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M9 6l-6 6 6 6" transform="translate(-3 0)" />
                    <path d="M15 6l6 6-6 6" transform="translate(3 0)" />
                  </svg>
                </div>
                <span className="absolute left-3 top-3 rounded bg-black/60 px-2.5 py-1 text-xs font-semibold uppercase text-white">
                  Before
                </span>
                <span className="absolute right-3 top-3 rounded bg-gradient-to-r from-amber-300 via-orange-400 to-rose-500 px-2.5 py-1 text-xs font-semibold uppercase text-black">
                  After
                </span>
              </div>
            </div>
          </div>
        </section>

        <section
            ref={processSectionRef}
            className="mt-[200px] w-full"
            style={{ height: `calc(100vh * ${steps.length + 1})` }}
          >
            <div className="sticky top-[100px] flex h-[calc(100vh-100px)] items-center">
              <div className="mx-auto grid h-full max-w-[1100px] gap-12 lg:grid-cols-[1fr_1.1fr]">
                <div className="relative flex h-full flex-col justify-start pt-6">
                  <h3 className="text-[34px] font-semibold leading-[1.02] text-white sm:text-[44px]">
                    {"Upload \u2192 Analyze \u2192 Export"}
                  </h3>
                  <p className="mt-5 max-w-[360px] text-sm text-white/60">
                    Three steps. Pro results. Built for marketers and small teams who need speed.
                  </p>
                  <div className="mt-10 space-y-6">
                    {steps.map((step, index) => (
                      <div
                        key={step.title}
                        className={`border-t border-white/10 pt-6 transition-colors ${
                          activeStep === index ? "text-white" : "text-white/40"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-semibold uppercase tracking-[0.22em] text-white/40">
                            0{index + 1}
                          </span>
                          <p
                            className={`text-xs font-semibold uppercase tracking-[0.2em] ${
                              activeStep === index ? "text-white" : "text-white/60"
                            }`}
                          >
                            {step.title}
                          </p>
                        </div>
                        <p
                          className={`mt-3 text-sm text-white/60 transition-all duration-500 ${
                            activeStep === index
                              ? "max-h-24 opacity-100"
                              : "max-h-0 opacity-0 overflow-hidden"
                          }`}
                        >
                          {step.body}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="relative flex h-full items-start pt-6">
                  <div className="w-full rounded-[22px] border border-white/10 bg-black/70 p-4 shadow-[0_35px_90px_-70px_rgba(0,0,0,0.9)]">
                    <div className="flex items-center justify-between text-xs text-white/60">
                      <span>{steps[activeStep]?.title}</span>
                      <span>Preview</span>
                    </div>
                    <div
                      ref={processPreviewViewportRef}
                      className="mt-4 h-[60vh] min-h-[360px] overflow-hidden rounded-[14px] border border-white/10 bg-black/60"
                    >
                      <div ref={processPreviewTrackRef} className="will-change-transform">
                        {stepVisuals.map((item, index) => (
                          <div key={item.src} className="flex h-[60vh] min-h-[360px] items-center justify-center">
                            <img
                              src={item.src}
                              alt={steps[index]?.title}
                              className="h-full w-full object-cover"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="mt-5 rounded-[14px] border border-white/10 bg-black/60 p-4 text-xs text-white/60">
                      30-40s end-to-end - Pro-level polish
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="mt-24 w-full">
            <div className="mx-auto grid max-w-[1100px] gap-8 rounded-[18px] border border-white/10 bg-black/70 p-8 shadow-[0_30px_80px_-60px_rgba(0,0,0,0.85)] lg:grid-cols-[1.2fr_1fr]">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-white/50">Pricing</p>
                <h3 className="mt-3 text-[30px] font-semibold text-white">Pro</h3>
                <p className="mt-2 text-white/60">For marketers and small businesses.</p>
                <div className="mt-4 text-4xl font-semibold text-white">
                  $39 <span className="text-sm font-medium text-white/50">/ month</span>
                </div>
                <Link
                  href="/billing"
                  className="mt-6 inline-flex rounded-full bg-white px-6 py-2.5 text-sm font-semibold text-black shadow-[0_16px_40px_-24px_rgba(0,0,0,0.7)] transition hover:bg-white/90"
                >
                  Get start
                </Link>
              </div>
              <div className="grid gap-3 text-sm text-white/70">
                {[
                  "Unlimited analyses",
                  "High-fidelity redesigns",
                  "Before/After compare",
                  "Export in HD",
                  "Commercial use",
                ].map((item) => (
                  <div key={item} className="rounded-[12px] border border-white/10 bg-white/5 px-4 py-3">
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="mt-20 w-full">
            <div className="mx-auto max-w-[1100px]">
              <p className="text-xs uppercase tracking-[0.3em] text-white/50">FAQ</p>
              <div className="mt-6 grid gap-4">
                {[
                  {
                    q: "Does it keep my original text?",
                    a: "Yes. We preserve text and hierarchy while improving layout and styling.",
                  },
                  {
                    q: "How fast is it?",
                    a: "Most posters finish in 30-40 seconds end-to-end.",
                  },
                  {
                    q: "What do I get?",
                    a: "Multiple professional variations ready for launch.",
                  },
                ].map((item) => (
                  <div key={item.q} className="rounded-[12px] border border-white/10 bg-black/60 p-5">
                    <p className="text-sm font-semibold text-white">{item.q}</p>
                    <p className="mt-2 text-sm text-white/60">{item.a}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
      </main>

      <div
        className={`fixed bottom-6 left-1/2 z-20 -translate-x-1/2 transition-all duration-300 ${
          showDock ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0 pointer-events-none"
        }`}
      >
        <div className="flex items-center gap-2 rounded-[14px] border border-white/10 bg-[#1b1b1b]/95 p-2 shadow-[0_20px_40px_-30px_rgba(0,0,0,0.8)] backdrop-blur">
          <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-black text-white">
            <span className="text-sm font-semibold">W.</span>
          </div>
          <div className="hidden items-center gap-2 md:flex">
            {navLinks.slice(0, 5).map((label) => (
              <button
                key={label}
                type="button"
                className="rounded-[10px] border border-white/10 px-3 py-2 text-[12px] font-medium text-white/70 transition hover:border-white/30 hover:text-white"
              >
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="rounded-[10px] border border-white/20 bg-white px-3 py-2 text-[12px] font-semibold text-black"
          >
            Visit
          </button>
        </div>
      </div>
    </div>
  );
}


