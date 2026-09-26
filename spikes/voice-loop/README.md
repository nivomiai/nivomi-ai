# Spike: voice loop (Exotel + Sarvam + LLM)

**Throwaway.** This is not product code and never merges into `apps/` or `packages/`. It answers
the questions the voice architecture depends on, with real phone calls:

| Question                                              | PRD reference      |
| ----------------------------------------------------- | ------------------ |
| Turn latency per stage (STT, LLM, TTS) and end to end | NFR-1, NFR-2, A-56 |
| Time from answer to first speech                      | NFR-3, FR-54       |
| Barge-in: does the bot stop quickly when interrupted? | NFR-4, FR-56       |
| Transfer: Voicebot applet → Connect to a human        | FR-75, VQ-2        |
| STT and TTS quality on 8 kHz lines, incl. code-mixing | NFR-5, VQ-9        |
| Outbound AI streaming works on our Exotel account     | VQ-1               |

## How it works

```
npm run call ──► Exotel Calls/connect ──► phone A rings and is answered
                                   │
      Exotel media WebSocket ◄─────┘ (8 kHz 16-bit PCM, through your tunnel)
            │
            ▼
   spike server ──► Sarvam realtime STT (saaras) ──► transcript.final
            ▲                                             │
            │                                             ▼
   Exotel media ◄── Sarvam streaming TTS (bulbul) ◄── LLM stream (sentence by sentence)
```

- **Barge-in.** When Sarvam detects speech while the bot is talking, the spike:
  1. sends Exotel `clear`;
  2. aborts the LLM;
  3. replaces the TTS socket.
- **Transfer (flow mode).** When the LLM starts its reply with `[TRANSFER]`:
  1. the spike speaks the reply;
  2. it waits for Exotel's playback `mark`;
  3. it closes the stream, so the Exotel flow continues to its **Connect** applet (phone B).

  A provider failure in flow mode also closes the stream, so it falls back to the human.

- **Logs.** Every event is logged with timestamps to `runs/*.jsonl`. This folder is ignored by git
  because it contains test transcripts. `npm run report` turns the logs into p50 and p90 tables.

## Safety

- Only `SPIKE_TEST_PHONE_A` and `SPIKE_TEST_PHONE_B` can be called: team members' own phones, with
  their consent. **Never** leads or customers.
- The public endpoints require `SPIKE_STREAM_TOKEN`. Stop the tunnel when you are done.
- Keys live only in `.env.local`, which git ignores. `npm run check` prints OK or FAIL, never values.
- Calls are capped by `SPIKE_MAX_CALL_SECONDS`, both on Exotel (`TimeLimit`) and in the server.

## Setup (once)

1. **Accounts:** follow Wave 1 of
   [docs/planning/provider-accounts-setup.md](../../docs/planning/provider-accounts-setup.md).
   Ask Exotel to enable **AgentStream / Voicebot** on the account.
2. **Install:** run `npm install` in this folder. It uses Node 22, the same as the repo.
3. **Configuration:** copy `.env.example` to `.env.local` and fill it in. Generate the token with:
   ```
   node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
   ```
4. **Tunnel:** Exotel must reach your machine over HTTPS/WSS. The quickest option needs no
   account:
   ```
   winget install Cloudflare.cloudflared
   cloudflared tunnel --url http://localhost:8080
   ```
   Put the printed `https://….trycloudflare.com` URL in `PUBLIC_BASE_URL`. It changes on every
   run. An ngrok static domain avoids that, which is handy for flow mode.
5. **Check:** run `npm run check`. All four lines should say OK. If the STT line fails with a
   `4000` or "beta" error, ask Sarvam to enable `saaras:v3-realtime` for the account.

## Running tests

Run the three terminals in order:

```
# terminal 1
cloudflared tunnel --url http://localhost:8080
# terminal 2
npm run server
# terminal 3
npm run call -- --to A --lang en-IN
npm run call -- --to A --lang hi-IN
npm run call -- --to A --lang ml-IN
npm run report
```

**Flow mode (transfer test):**

1. In Exotel App Bazaar, create a flow: **Voicebot** applet → **Connect** applet dialling
   `SPIKE_TEST_PHONE_B`.
2. Set the Voicebot applet URL to `https://<PUBLIC_BASE_URL host>/stream-url/<SPIKE_STREAM_TOKEN>`.
3. Put the flow's app ID in `EXOTEL_FLOW_APP_ID`.
4. Run the call:
   ```
   npm run call -- --to A --lang hi-IN --mode flow
   ```
5. On the call, ask for a human. Phone B should ring after the bot's closing sentence.

## Test script per language (about 3 minutes each)

1. Answer the call. Note roughly how long the silence lasts before the bot speaks.
2. Answer its questions normally: name, city, product interest.
3. **Barge-in:** start talking while the bot is mid-sentence. Does it stop at once?
4. **Code-mixing:** answer in mixed language, for example Hinglish or Manglish.
5. **Hard input:** say a phone number, an amount ("45 lakh"), a date ("next Saturday") and a local
   place name.
6. **Transfer** (flow mode only): "I want to talk to a person."
7. Note: naturalness, mispronunciations, misunderstood answers, anything odd.

## Recording results

Copy the `npm run report` table, plus your notes from step 7, into
`docs/planning/spikes/voice-loop-results.md`. That file is the input `bmad-architecture` uses.
`server_turn_ms` excludes Exotel playout and network time, so compare it with what you hear on
the handset.
