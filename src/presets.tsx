import type React from "react";
import { Bot, Brain, Code2, Feather, Gauge, MessageSquare, PenTool, Search, Sparkles } from "lucide-react";

export interface PresetDef {
  name: string;
  description: string;
  badge: string;
  tone: string;
  icon: React.ReactNode;
  settings: {
    ctxSize: number;
    temp: number;
    topP: number;
    topK: number;
    minP: number;
    repeatPenalty: number;
    presencePenalty: number;
    threads: number;
    batchSize: number;
    ngl: number;
    mainGpu: number | null;
    tensorSplit: string | null;
    noMmap: boolean;
    noWebui: boolean;
  };
}

export const PRESETS: Record<string, PresetDef> = {
  programming: {
    name: "Code: Precise",
    description: "Debugging, patches, exact output",
    badge: "Generic",
    tone: "cyan",
    icon: <Code2 size={20} />,
    settings: { ctxSize: 16384, temp: 0.2, topP: 0.9, topK: 40, minP: 0.05, repeatPenalty: 1.03, presencePenalty: 0.0, threads: 0, batchSize: 512, ngl: 99, mainGpu: null, tensorSplit: null, noMmap: false, noWebui: false },
  },
  general: {
    name: "Chat: Balanced",
    description: "Everyday assistant use",
    badge: "Default",
    tone: "teal",
    icon: <MessageSquare size={20} />,
    settings: { ctxSize: 8192, temp: 0.8, topP: 0.95, topK: 40, minP: 0.05, repeatPenalty: 1.05, presencePenalty: 0.0, threads: 0, batchSize: 512, ngl: 99, mainGpu: null, tensorSplit: null, noMmap: false, noWebui: false },
  },
  creative: {
    name: "Writing: Story",
    description: "Fiction, scenes, brainstorming",
    badge: "Generic",
    tone: "rose",
    icon: <Feather size={20} />,
    settings: { ctxSize: 12288, temp: 0.9, topP: 0.95, topK: 60, minP: 0.05, repeatPenalty: 1.05, presencePenalty: 0.3, threads: 0, batchSize: 512, ngl: 99, mainGpu: null, tensorSplit: null, noMmap: false, noWebui: false },
  },
  gemma4Code: {
    name: "Gemma 4: Code",
    description: "Google defaults for coding",
    badge: "Gemma",
    tone: "blue",
    icon: <Bot size={20} />,
    settings: { ctxSize: 32768, temp: 1.0, topP: 0.95, topK: 64, minP: 0.0, repeatPenalty: 1.0, presencePenalty: 0.0, threads: 0, batchSize: 512, ngl: 99, mainGpu: null, tensorSplit: null, noMmap: false, noWebui: false },
  },
  gemma4Creative: {
    name: "Gemma 4: Writing",
    description: "Google defaults for prose",
    badge: "Gemma",
    tone: "violet",
    icon: <Sparkles size={20} />,
    settings: { ctxSize: 32768, temp: 1.0, topP: 0.95, topK: 64, minP: 0.0, repeatPenalty: 1.0, presencePenalty: 0.0, threads: 0, batchSize: 512, ngl: 99, mainGpu: null, tensorSplit: null, noMmap: false, noWebui: false },
  },
  qwen36Code: {
    name: "Qwen 3.6: Code",
    description: "Official thinking/WebDev params",
    badge: "Qwen",
    tone: "indigo",
    icon: <Brain size={20} />,
    settings: { ctxSize: 32768, temp: 0.6, topP: 0.95, topK: 20, minP: 0.0, repeatPenalty: 1.0, presencePenalty: 0.0, threads: 0, batchSize: 512, ngl: 99, mainGpu: null, tensorSplit: null, noMmap: false, noWebui: false },
  },
  qwen36Creative: {
    name: "Qwen 3.6: Writing",
    description: "Official thinking/general params",
    badge: "Qwen",
    tone: "amber",
    icon: <PenTool size={20} />,
    settings: { ctxSize: 32768, temp: 1.0, topP: 0.95, topK: 20, minP: 0.0, repeatPenalty: 1.0, presencePenalty: 1.5, threads: 0, batchSize: 512, ngl: 99, mainGpu: null, tensorSplit: null, noMmap: false, noWebui: false },
  },
  analysis: {
    name: "Research: Long",
    description: "Docs, compare, stable reasoning",
    badge: "Generic",
    tone: "emerald",
    icon: <Search size={20} />,
    settings: { ctxSize: 24576, temp: 0.25, topP: 0.9, topK: 40, minP: 0.05, repeatPenalty: 1.03, presencePenalty: 0.0, threads: 0, batchSize: 512, ngl: 99, mainGpu: null, tensorSplit: null, noMmap: false, noWebui: false },
  },
  roleplay: {
    name: "Character: RP",
    description: "Dialogue and persona work",
    badge: "Character",
    tone: "purple",
    icon: <Sparkles size={20} />,
    settings: { ctxSize: 12288, temp: 0.85, topP: 0.95, topK: 60, minP: 0.05, repeatPenalty: 1.08, presencePenalty: 0.0, threads: 0, batchSize: 512, ngl: 99, mainGpu: null, tensorSplit: null, noMmap: false, noWebui: false },
  },
  quickcode: {
    name: "Code: Quick",
    description: "Small edits, fastest context",
    badge: "Fast",
    tone: "lime",
    icon: <Gauge size={20} />,
    settings: { ctxSize: 4096, temp: 0.1, topP: 0.85, topK: 30, minP: 0.05, repeatPenalty: 1.02, presencePenalty: 0.0, threads: 0, batchSize: 512, ngl: 99, mainGpu: null, tensorSplit: null, noMmap: false, noWebui: false },
  },
};
