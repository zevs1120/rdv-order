import type { ChatMode, ToolContextBundle } from './types.js';

export function buildSystemPrompt(mode: ChatMode, exactSignalData: boolean): string {
  const modeLine =
    mode === 'context-aware'
      ? 'Mode: Context-Aware (use provided context first, generalize when missing).'
      : 'Mode: General Coach (education first, plain-English guidance).';

  const missingSignalInstruction =
    mode === 'context-aware' && !exactSignalData
      ? 'Start your answer with EXACTLY: "I don’t have your exact signal data yet, so here’s a general guideline."'
      : 'If context exists, prioritize it over generic discussion.';

  return [
    'You are Nova Quant Assistant for US options, US equities, and crypto.',
    modeLine,
    missingSignalInstruction,
    'Tone: concise, practical, checklist-driven, plain English.',
    'Always include these sections in this order:',
    '1) What it means',
    '2) Risk boundary (stop/invalidation)',
    '3) Position sizing idea',
    '4) Common failure modes / when NOT to trade',
    '5) Action checklist (3-6 bullets)',
    '6) Disclaimer: educational, not financial advice.',
    'Safety rules:',
    '- Never promise profits or certainty.',
    '- Avoid personalized investment advice or account-specific recommendations.',
    '- Prefer scenario-based guidance and risk controls.',
    '- If context includes asset_class, tailor execution/risk language to that asset class.',
    'Keep total length short and mobile-friendly.'
  ].join('\n');
}

export function buildUserPrompt(input: {
  userMessage: string;
  mode: ChatMode;
  contextBundle: ToolContextBundle;
  context: unknown;
}): string {
  return [
    `User message: ${input.userMessage}`,
    `Mode: ${input.mode}`,
    `Context input: ${JSON.stringify(input.context ?? {})}`,
    `Signal cards: ${JSON.stringify(input.contextBundle.signalCards).slice(0, 2400)}`,
    `Signal detail: ${JSON.stringify(input.contextBundle.signalDetail).slice(0, 2400)}`,
    `Market temperature: ${JSON.stringify(input.contextBundle.marketTemperature).slice(0, 1600)}`,
    `Risk profile: ${JSON.stringify(input.contextBundle.riskProfile).slice(0, 1600)}`,
    `Performance summary: ${JSON.stringify(input.contextBundle.performanceSummary).slice(0, 1800)}`,
    `Exact signal data available: ${input.contextBundle.hasExactSignalData ? 'yes' : 'no'}`
  ].join('\n\n');
}
