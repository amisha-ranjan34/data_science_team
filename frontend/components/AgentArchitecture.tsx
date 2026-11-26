"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Brain,
  Check,
  Database,
  FileCheck,
  ListChecks,
  LoaderCircle,
  MessageSquare,
  Search,
  ShieldCheck,
  Siren,
  SlidersHorizontal,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { motion, useReducedMotion, useSpring, useTransform } from "framer-motion";
import type { Run, Step } from "@/lib/types";

type Props = {
  run: Run;
  steps: Step[];
  status: Run["status"];
  onFinal: () => void;
  onFocusChange: (focused: boolean) => void;
};

type AgentName =
  | "Profiler"
  | "Planner"
  | "Cleaner"
  | "Modeler"
  | "Tuner"
  | "Reviewer"
  | "Red team"
  | "Advisor";
type NodeName = "Dataset" | AgentName | "Output";
type NodeStatus = "queued" | "running" | "done";

const AGENT_ORDER: AgentName[] = [
  "Profiler",
  "Planner",
  "Cleaner",
  "Modeler",
  "Tuner",
  "Reviewer",
  "Red team",
  "Advisor",
];

const NODES: { name: NodeName; icon: LucideIcon; agent: boolean }[] = [
  { name: "Dataset", icon: Database, agent: false },
  { name: "Profiler", icon: Search, agent: true },
  { name: "Planner", icon: ListChecks, agent: true },
  { name: "Cleaner", icon: Sparkles, agent: true },
  { name: "Modeler", icon: Brain, agent: true },
  { name: "Tuner", icon: SlidersHorizontal, agent: true },
  { name: "Reviewer", icon: ShieldCheck, agent: true },
  { name: "Red team", icon: Siren, agent: true },
  { name: "Advisor", icon: MessageSquare, agent: true },
  { name: "Output", icon: FileCheck, agent: false },
];

const EDGES = [
  ["Dataset", "Profiler"],
  ["Profiler", "Planner"],
  ["Planner", "Cleaner"],
  ["Cleaner", "Modeler"],
  ["Modeler", "Tuner"],
  ["Tuner", "Reviewer"],
  ["Reviewer", "Red team"],
  ["Red team", "Advisor"],
  ["Advisor", "Output"],
] as const;

const INTRO_MS = 2500;
const FOCUS_MIN_MS = 1500;
const GAP_MS = 2000;

function wait(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

function AnimatedValue({ value, suffix = "" }: { value: number; suffix?: string }) {
  const spring = useSpring(value, { stiffness: 90, damping: 22 });
  const text = useTransform(spring, (current) => `${Math.round(current)}${suffix}`);

  useEffect(() => {
    spring.set(value);
  }, [spring, value]);

  return <motion.span>{text}</motion.span>;
}

function stepIsTerminal(step: Step) {
  return step.status === "done" || step.status === "skipped" || step.status === "error";
}

export default function AgentArchitecture({
  run,
  steps,
  status,
  onFinal,
  onFocusChange,
}: Props) {
  const reduceMotion = useReducedMotion();
  const [phase, setPhase] = useState<"intro" | "running" | "final">("intro");
  const [activeIndex, setActiveIndex] = useState(-1);
  const [elapsed, setElapsed] = useState(0);
  const [finishedAgents, setFinishedAgents] = useState<Set<AgentName>>(() => new Set());
  const [nodePositions, setNodePositions] = useState<Record<string, { x: number; y: number }>>({});
  const gridRef = useRef<HTMLDivElement>(null);
  const latestRef = useRef({ steps, status, onFinal });
  const focusCallbackRef = useRef(onFocusChange);
  latestRef.current = { steps, status, onFinal };
  focusCallbackRef.current = onFocusChange;

  const activeAgent = AGENT_ORDER[activeIndex] ?? null;
  const sequenceProgress = Math.min(100, Math.round((finishedAgents.size / AGENT_ORDER.length) * 100));
  const displayedProgress = phase === "intro" ? 0 : sequenceProgress;

  useEffect(() => {
    const startedAt = Date.now();
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [run.id]);

  useEffect(() => {
    const measure = () => {
      const grid = gridRef.current;
      if (!grid) return;
      const bounds = grid.getBoundingClientRect();
      const next: Record<string, { x: number; y: number }> = {};
      NODES.forEach(({ name }) => {
        const element = grid.querySelector<HTMLElement>(`[data-node="${name}"]`);
        if (!element) return;
        const rect = element.getBoundingClientRect();
        next[name] = {
          x: rect.left - bounds.left + rect.width / 2,
          y: rect.top - bounds.top + rect.height / 2,
        };
      });
      setNodePositions(next);
    };

    measure();
    const observer = new ResizeObserver(measure);
    if (gridRef.current) observer.observe(gridRef.current);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const runSequence = async () => {
      if (!reduceMotion) await wait(INTRO_MS);
      if (cancelled) return;
      setPhase("running");

      for (let index = 0; index < AGENT_ORDER.length; index += 1) {
        if (cancelled) return;
        const agent = AGENT_ORDER[index];
        setActiveIndex(index);
        const startedAt = Date.now();

        while (!cancelled) {
          const current = latestRef.current;
          const matches = current.steps.filter((step) =>
            step.agent.toLowerCase().includes(agent.toLowerCase()),
          );
          const terminal = matches.length > 0 && matches.every(stepIsTerminal);
          const runEnded = current.status === "done" || current.status === "error";
          if (Date.now() - startedAt >= (reduceMotion ? 0 : FOCUS_MIN_MS) && (terminal || runEnded)) break;
          await wait(100);
        }

        if (cancelled) return;
        setFinishedAgents((previous) => new Set(previous).add(agent));
        setActiveIndex(-1);

        if (index < AGENT_ORDER.length - 1 && !reduceMotion) await wait(GAP_MS);
      }

      if (cancelled) return;
      while (!cancelled && latestRef.current.status === "running") await wait(100);
      if (cancelled) return;
      setPhase("final");
      if (latestRef.current.status === "done") {
        await wait(reduceMotion ? 0 : 650);
        if (!cancelled) latestRef.current.onFinal();
      }
    };

    void runSequence();
    return () => {
      cancelled = true;
    };
  }, [reduceMotion, run.id]);

  useEffect(() => {
    focusCallbackRef.current(phase === "running" && activeAgent !== null);
    return () => focusCallbackRef.current(false);
  }, [activeAgent, phase]);

  const nodeStatus = (name: NodeName): NodeStatus => {
    if (name === "Dataset") return "done";
    if (name === "Output") return phase === "final" ? "done" : "queued";
    if (finishedAgents.has(name)) return "done";
    if (activeAgent === name) return "running";
    return "queued";
  };

  const edgePaths = useMemo(() => EDGES.map(([from, to]) => {
    const start = nodePositions[from];
    const end = nodePositions[to];
    if (!start || !end) return null;
    const horizontal = Math.abs(end.x - start.x) > Math.abs(end.y - start.y);
    const bend = horizontal ? Math.max(28, Math.abs(end.x - start.x) * 0.35) : Math.max(24, Math.abs(end.y - start.y) * 0.32);
    const c1 = horizontal ? { x: start.x + Math.sign(end.x - start.x) * bend, y: start.y } : { x: start.x, y: start.y + Math.sign(end.y - start.y) * bend };
    const c2 = horizontal ? { x: end.x - Math.sign(end.x - start.x) * bend, y: end.y } : { x: end.x, y: end.y - Math.sign(end.y - start.y) * bend };
    return {
      from,
      to,
      d: `M ${start.x} ${start.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${end.x} ${end.y}`,
      completed: from === "Dataset" ? finishedAgents.has("Profiler") : finishedAgents.has(from as AgentName),
      running: to === activeAgent,
    };
  }), [activeAgent, finishedAgents, nodePositions]);

  return (
    <section className={`orchestration ${phase === "final" ? "orchestration--final" : ""}`}>
      <div className="orchestration-topline">
        <div>
          <p className="orchestration-kicker">
            <span className={`orchestration-live-dot ${phase === "running" ? "is-live" : ""}`} />
            {phase === "intro" ? "Mapping the team..." : phase === "final" ? "Run complete" : activeAgent ? `${activeAgent} in focus` : "Team in motion"}
          </p>
          <h2 className="orchestration-title">{run.filename || "Your dataset"} <span>×</span> autonomous team</h2>
        </div>
        <div className="orchestration-stats">
          <div className="orchestration-progress">
            <div className="orchestration-progress-label"><span>Run progress</span><strong><AnimatedValue value={displayedProgress} suffix="%" /></strong></div>
            <div className="orchestration-progress-track"><motion.span animate={{ width: `${displayedProgress}%` }} transition={{ duration: reduceMotion ? 0 : 0.45, ease: "easeOut" }} /></div>
          </div>
          <div className="orchestration-agent-count">
            <strong><AnimatedValue value={finishedAgents.size + (activeAgent ? 1 : 0)} /> <span>/ 8</span></strong>
            <span>agents</span>
          </div>
        </div>
      </div>

      <div className={`orchestration-canvas ${activeAgent ? "has-focus" : ""}`} ref={gridRef}>
        <svg className="orchestration-connectors" aria-hidden="true">
          {edgePaths.map((edge, index) => edge && (
            <g key={`${edge.from}-${edge.to}`}>
              <motion.path d={edge.d} className="connector-track" initial={false} animate={{ opacity: 1 }} />
              <motion.path
                d={edge.d}
                pathLength={1}
                className={`connector-line ${edge.completed ? "is-complete" : ""} ${edge.running ? "is-running" : ""}`}
                initial={{ strokeDashoffset: 1, opacity: 0.3 }}
                animate={{ strokeDashoffset: 0, opacity: edge.completed ? 1 : edge.running ? 0.8 : 0.3 }}
                transition={{ duration: reduceMotion ? 0 : 0.75, delay: phase === "intro" && !reduceMotion ? index * 0.08 : 0, ease: "easeInOut" }}
              />
              {edge.running && (
                <motion.circle r="3.5" className="connector-pulse" initial={{ offsetDistance: "0%" }} animate={{ offsetDistance: "100%" }} transition={{ duration: reduceMotion ? 0 : 1.4, repeat: Infinity, ease: "linear" }}>
                  <animateMotion dur="1.4s" repeatCount="indefinite" path={edge.d} />
                </motion.circle>
              )}
            </g>
          ))}
        </svg>

        <div className="orchestration-grid">
          {NODES.map(({ name, icon: Icon, agent }, index) => {
            const state = nodeStatus(name);
            const focused = state === "running";
            return (
              <motion.article
                key={name}
                data-node={name}
                className={`orchestration-node ${state === "done" ? "is-done" : ""} ${focused ? "is-running" : ""} ${focused ? "is-focused" : ""}`}
                initial={reduceMotion ? false : { opacity: 0, scale: 0.82, y: 12 }}
                animate={{ opacity: focused ? 1 : activeAgent ? 0.4 : 1, scale: focused ? 1.15 : 1, y: 0, filter: activeAgent && !focused ? "blur(6px)" : "blur(0px)" }}
                transition={{ duration: reduceMotion ? 0 : 0.4, delay: phase === "intro" && !reduceMotion ? index * 0.05 : 0, type: focused && !reduceMotion ? "spring" : "tween", stiffness: 220, damping: 18 }}
                whileHover={!reduceMotion && !activeAgent ? { y: -4, borderColor: "rgba(217,255,63,.48)" } : undefined}
                style={{ zIndex: focused ? 5 : 1 }}
              >
                <div className="orchestration-node-icon">
                  {focused ? <LoaderCircle className="node-loader" size={23} strokeWidth={1.8} /> : state === "done" && agent ? <Check className="node-check" size={23} strokeWidth={2.2} /> : <Icon size={23} strokeWidth={1.65} />}
                </div>
                <h3>{name}</h3>
                <span className={`orchestration-status status-${state}`}>
                  <i />
                  {state === "queued" ? "Queued" : state === "running" ? "Running" : "Done"}
                </span>
              </motion.article>
            );
          })}
        </div>
      </div>

      <div className="orchestration-footer">
        <span className="orchestration-timer"><span className="timer-pulse" />Elapsed {String(Math.floor(elapsed / 60)).padStart(2, "0")}:{String(elapsed % 60).padStart(2, "0")}</span>
        <span>{status === "error" ? "Run needs attention" : "One agent at a time"}</span>
      </div>
    </section>
  );
}
