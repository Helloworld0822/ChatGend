import OpenAI from "openai";

type Role = "system" | "user" | "assistant";
export type Message = {
  role: Role;
  content: string;
  timestamp?: string;
  metadata?: Record<string, unknown>;
};

const apiKey = process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY;
if (!apiKey) {
  // Delay throwing until the functions are called so importing the module in tests
  // or environments without the key doesn't immediately crash.
}

function getClient() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY environment variable is required");
  return new OpenAI({ 
    apiKey: key,
    baseURL: "https://panel.tapie.kr/api/ai-api/v1"
 });
}

export async function summarizeConversation(messages: Message[], maxTokens = 300): Promise<string> {
  if (!messages || messages.length === 0) return "";
  const client = getClient();

  const systemPrompt = `You are an assistant that writes concise, structured summaries of conversations for later review. Produce a short (3-6 sentence) summary that captures: participants' main goals, any decisions made, open items, and the emotional tone if relevant. If the conversation is short, keep it to one paragraph.`;

  const chatMessages = [
    { role: "system", content: systemPrompt },
    // cast to any to satisfy the OpenAI client types
    ...(messages.map((m) => ({ role: m.role as Role, content: m.content })) as any),
    { role: "user", content: "Please provide the concise conversation summary as described above." },
  ];

  const resp = await client.chat.completions.create({
    model: "gpt-3.5-turbo",
    messages: chatMessages,
    max_tokens: maxTokens,
    temperature: 0.2,
  });

  const text = resp.choices?.[0]?.message?.content;
  return (text || "").trim();
}

export type RecommendOptions = {
  numSuggestions?: number;
  styleHints?: string; // e.g. "formal, concise"
};

export async function recommendResponses(messages: Message[], options: RecommendOptions = {}): Promise<string[]> {
  const { numSuggestions = 3, styleHints = "concise and helpful" } = options;
  if (!messages || messages.length === 0) return [];
  const client = getClient();

  const systemPrompt = `You are an assistant that recommends how to reply in an ongoing conversation. Given the conversation history, produce ${numSuggestions} distinct reply strategies and for each a 1-2 sentence example reply. Each strategy should include: (1) a short heading (tone/goal), (2) one-sentence rationale referencing the conversation, (3) an example reply. Keep answers ${styleHints}. Output as clear numbered items.`;

  const chatMessages = [
    { role: "system", content: systemPrompt },
    ...(messages.map((m) => ({ role: m.role as Role, content: m.content })) as any),
    { role: "user", content: `Give ${numSuggestions} suggestions.` },
  ];

  const resp = await client.chat.completions.create({
    model: "gpt-3.5-turbo",
    messages: chatMessages,
    max_tokens: 600,
    temperature: 0.6,
  });

  const text = (resp.choices?.[0]?.message?.content || "").trim();

  // Split into suggested items heuristically by numbered lines
  const items = text.split(/\n(?=\d+\.|^-\s|^\*)/).map((s) => s.trim()).filter(Boolean);
  // If split failed, return the whole block as a single suggestion
  if (items.length === 0) return [text];
  return items.slice(0, numSuggestions);
}

export async function generateReplySuggestion(messages: Message[], tone = "concise and friendly"): Promise<string> {
  if (!messages || messages.length === 0) return "";
  const client = getClient();

  const systemPrompt = `You are an assistant that drafts a single reply message appropriate to the conversation history. Keep the reply ${tone}. If there's an obvious next action (e.g., ask a clarifying question, propose a time, give a short answer), include it in the reply.`;

  const chatMessages = [
    { role: "system", content: systemPrompt },
    ...(messages.map((m) => ({ role: m.role as Role, content: m.content })) as any),
    { role: "user", content: "Draft the reply now." },
  ];

  const resp = await client.chat.completions.create({
    model: "gpt-3.5-turbo",
    messages: chatMessages,
    max_tokens: 300,
    temperature: 0.35,
  });

  const text = (resp.choices?.[0]?.message?.content || "").trim();
  return text;
}

export default { summarizeConversation, recommendResponses, generateReplySuggestion };