// Nutrition estimates with Claude, called straight from the browser with the user's own
// Anthropic API key (saved on this device only, never committed or synced). Loaded on
// demand by app.js, so the app works without it when offline or when no key is set.
import Anthropic from 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@1.1.0/+esm';

// Models the user can pick in Settings (per device). Haiku is the default: nutrition
// estimates are a small task, and it costs a fraction of a cent per recipe.
export const MODELS = [
  { id: 'claude-haiku-5-5', name: 'Claude Haiku 5.5', cost: 'about 0.1¢ per calculation' },
  { id: 'claude-sonnet-5-5', name: 'Claude Sonnet 5.5', cost: 'about 1–2¢ per calculation' },
  { id: 'claude-opus-5-5', name: 'Claude Opus 5.5', cost: 'about 5–7¢ per calculation' },
];
export const DEFAULT_MODEL = 'claude-haiku-5-5';
// Server-side refusal fallback isn't available for Haiku.
const FALLBACK_MODELS = new Set(['claude-sonnet-5-5', 'claude-opus-5-5']);

const SCHEMA = {
  type: 'object',
  properties: {
    per: { type: 'string', description: 'What one set of numbers covers, e.g. "serving", "bite", "pint (entire recipe)".' },
    calories: { type: 'number' },
    protein_g: { type: 'number' },
    carbs_g: { type: 'number' },
    fat_g: { type: 'number' },
    fiber_g: { type: 'number' },
    note: { type: 'string', description: 'One short sentence on the main assumptions.' },
  },
  required: ['per', 'calories', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'note'],
  additionalProperties: false,
};

const SYSTEM = `You estimate nutrition facts for home-cooked recipes.

Work from standard nutrition data (USDA-style values) for the ingredients exactly as written. When an amount is missing or vague ("a pinch", "chicken sausage"), assume a typical home-cooking amount and mention it in the note. Leave out ingredients marked optional or "for topping"/"for serving" and say so in the note. Ignore ingredients that are only used for greasing.

Decide what one set of numbers covers ("per") from the servings:
- A number of servings ("6", "2–4"): per = "serving". Use the middle of a range.
- A count of pieces ("10 to 12 bites", "~20 bites"): per = the piece name, singular ("bite"), using the middle of the range.
- A single item with no servings count ("1 pint"): per = that item followed by " (entire recipe)", e.g. "pint (entire recipe)".
If the recipe's current "per" still fits these rules, keep it.

Round calories to the nearest 5 and grams to the nearest 0.5. Keep the note to one short sentence a home cook would find useful.`;

function recipePrompt(r) {
  const lines = [`Recipe: ${r.title || 'Untitled'}`, `Servings: ${r.servings || 'not given'}`];
  if (r.per) lines.push(`Current "per": ${r.per}`);
  lines.push('', 'Ingredients:');
  for (const i of r.ingredients) lines.push(`- ${i.group ? `[${i.group}] ` : ''}${i.text}`);
  if (r.instructions?.length) {
    lines.push('', 'Instructions:');
    r.instructions.forEach((s, n) => lines.push(`${n + 1}. ${s}`));
  }
  return lines.join('\n');
}

export async function estimateNutrition(apiKey, recipe, model = DEFAULT_MODEL) {
  // The SDK refuses to run in a browser unless told to; this app is personal and the key is the user's own.
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 1 });
  if (!MODELS.some((m) => m.id === model)) model = DEFAULT_MODEL;
  const fallback = FALLBACK_MODELS.has(model) ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' } : {};
  const response = await client.beta.messages.create({
    model,
    max_tokens: 16000,
    ...fallback,
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
    system: SYSTEM,
    messages: [{ role: 'user', content: recipePrompt(recipe) }],
  });
  if (response.stop_reason === 'refusal') throw new Error('Claude declined to estimate this recipe.');
  if (response.stop_reason === 'max_tokens') throw new Error("Claude's answer was cut off. Try again.");
  const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  try { return JSON.parse(text); } catch { throw new Error("Claude's answer couldn't be read. Try again."); }
}

export function errorMessage(err) {
  if (err instanceof Anthropic.AuthenticationError) return "Claude didn't accept the API key. Check it in Settings.";
  if (err instanceof Anthropic.PermissionDeniedError) return "This API key isn't allowed to use Claude. Check it in the Anthropic Console.";
  if (err instanceof Anthropic.RateLimitError) return 'Too many requests right now. Wait a minute and try again.';
  if (err instanceof Anthropic.APIConnectionError) return "Couldn't reach Claude. Check your connection and try again.";
  if (err instanceof Anthropic.APIError) {
    const detail = err.error?.error?.message;
    return detail ? `Claude error: ${detail}` : `Claude returned an error (${err.status ?? 'unknown'}). Try again.`;
  }
  return err?.message || 'Something went wrong. Try again.';
}
