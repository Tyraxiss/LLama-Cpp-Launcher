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
    name: "Programming",
    description: "Low variance for code and fixes",
    badge: "Stable",
    tone: "cyan",
    icon: <Code2 size={20} />,
    settings: { ctxSize: 16384, temp: 0.15, topP: 0.9, topK: 40, minP: 0.05, repeatPenalty: 1.03, presencePenalty: 0.0, threads: 0, batchSize: 512, ngl: 99, mainGpu: null, tensorSplit: null, noMmap: false, noWebui: false },
  },
  general: {
    name: "General Chat",
    description: "Close to llama.cpp defaults",
    badge: "Balanced",
    tone: "teal",
    icon: <MessageSquare size={20} />,
    settings: { ctxSize: 8192, temp: 0.8, topP: 0.95, topK: 40, minP: 0.05, repeatPenalty: 1.05, presencePenalty: 0.0, threads: 0, batchSize: 512, ngl: 99, mainGpu: null, tensorSplit: null, noMmap: false, noWebui: false },
  },
  creative: {
    name: "Creative Writing",
    description: "More variety without drifting hard",
    badge: "Expressive",
    tone: "rose",
    icon: <Feather size={20} />,
    settings: { ctxSize: 12288, temp: 0.95, topP: 0.97, topK: 80, minP: 0.05, repeatPenalty: 1.08, presencePenalty: 0.0, threads: 0, batchSize: 512, ngl: 99, mainGpu: null, tensorSplit: null, noMmap: false, noWebui: false },
  },
  gemma4Code: {
    name: "Gemma 4 Code",
    description: "Google card sampling for coding",
    badge: "Gemma",
    tone: "blue",
    icon: <Bot size={20} />,
    settings: { ctxSize: 32768, temp: 1.0, topP: 0.95, topK: 64, minP: 0.05, repeatPenalty: 1.0, presencePenalty: 0.0, threads: 0, batchSize: 512, ngl: 99, mainGpu: null, tensorSplit: null, noMmap: false, noWebui: false },
  },
  gemma4Creative: {
    name: "Gemma 4 Creative",
    description: "Google card sampling for prose",
    badge: "Gemma",
    tone: "violet",
    icon: <Sparkles size={20} />,
    settings: { ctxSize: 32768, temp: 1.0, topP: 0.95, topK: 64, minP: 0.05, repeatPenalty: 1.0, presencePenalty: 0.0, threads: 0, batchSize: 512, ngl: 99, mainGpu: null, tensorSplit: null, noMmap: false, noWebui: false },
  },
  qwen36Code: {
    name: "Qwen3.6 Code",
    description: "Official precise coding params",
    badge: "Qwen",
    tone: "indigo",
    icon: <Brain size={20} />,
    settings: { ctxSize: 32768, temp: 0.6, topP: 0.95, topK: 20, minP: 0.0, repeatPenalty: 1.0, presencePenalty: 0.0, threads: 0, batchSize: 512, ngl: 99, mainGpu: null, tensorSplit: null, noMmap: false, noWebui: false },
  },
  qwen36Creative: {
    name: "Qwen3.6 Creative",
    description: "35B-A3B general/creative params",
    badge: "Qwen",
    tone: "amber",
    icon: <PenTool size={20} />,
    settings: { ctxSize: 32768, temp: 1.0, topP: 0.95, topK: 20, minP: 0.0, repeatPenalty: 1.0, presencePenalty: 1.5, threads: 0, batchSize: 512, ngl: 99, mainGpu: null, tensorSplit: null, noMmap: false, noWebui: false },
  },
  analysis: {
    name: "Deep Analysis",
    description: "Large context, stable reasoning",
    badge: "Long ctx",
    tone: "emerald",
    icon: <Search size={20} />,
    settings: { ctxSize: 24576, temp: 0.25, topP: 0.9, topK: 40, minP: 0.05, repeatPenalty: 1.03, presencePenalty: 0.0, threads: 0, batchSize: 512, ngl: 99, mainGpu: null, tensorSplit: null, noMmap: false, noWebui: false },
  },
  roleplay: {
    name: "Roleplay",
    description: "Expressive but still coherent",
    badge: "Character",
    tone: "purple",
    icon: <Sparkles size={20} />,
    settings: { ctxSize: 12288, temp: 0.85, topP: 0.95, topK: 60, minP: 0.05, repeatPenalty: 1.08, presencePenalty: 0.0, threads: 0, batchSize: 512, ngl: 99, mainGpu: null, tensorSplit: null, noMmap: false, noWebui: false },
  },
  quickcode: {
    name: "Quick Code",
    description: "Short tasks, crisp output",
    badge: "Fast",
    tone: "lime",
    icon: <Gauge size={20} />,
    settings: { ctxSize: 4096, temp: 0.1, topP: 0.85, topK: 30, minP: 0.05, repeatPenalty: 1.02, presencePenalty: 0.0, threads: 0, batchSize: 512, ngl: 99, mainGpu: null, tensorSplit: null, noMmap: false, noWebui: false },
  },
};
