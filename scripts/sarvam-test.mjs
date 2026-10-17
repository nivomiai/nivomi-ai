// Throwaway sandbox: verifies one Sarvam chat-completions call works.
// Not wired into any app. Run with: node --env-file=.env scripts/sarvam-test.mjs
import { SarvamAIClient } from "sarvamai";

const apiKey = process.env.SARVAM_API_KEY;
if (!apiKey) {
  console.error("SARVAM_API_KEY is not set. Add it to .env and re-run.");
  process.exit(1);
}

const client = new SarvamAIClient({ apiSubscriptionKey: apiKey });

const response = await client.chat.completions({
  model: "sarvam-105b-conversations",
  messages: [
    { role: "user", content: "Say hello in one short sentence." },
  ],
});

const reply = response?.choices?.[0]?.message?.content ?? JSON.stringify(response, null, 2);
console.log(reply);
