# Red-team digest — telecom conclusions C1–C3 (round 3, skeptic 1)

Run date: 2026-09-25. Role: skeptic only, looking for evidence that C1–C3 are wrong. All claims below come from sources retrieved in this run. TRAI PDFs were downloaded and converted to text locally (pdftotext); quotes are from that text. Budget used: about 19 tool calls and 7 sources.

Sources used:

- S1: TRAI, _TCCCPR (Second Amendment) Regulations, 2025_, notification dated 12 Feb 2025. https://trai.gov.in/sites/default/files/2025-02/Regulation_12022025.pdf. Primary source, high reliability.
- S2: TRAI, _Consultation on Draft TCCCPR (Third Amendment) Regulations, 2026_, 13 Mar 2026. https://www.trai.gov.in/sites/default/files/2026-03/Draft_CP_13032026_0.pdf. Primary source, but a draft.
- S3: MyOperator (a CPaaS provider), comments to TRAI on the draft Third Amendment, 19 Apr 2026. https://www.trai.gov.in/sites/default/files/2026-04/MyOperator_Response_TCCCPR_3rd_Amendment_2026_v2.pdf. Industry position, hosted on TRAI's site.
- S4: MediaNama, "TRAI releases clarification on designated promotional and transactional number series", 13 Jul 2026. https://www.medianama.com/2026/07/223-trai-releases-clarification-designated-promotional-transactional-number-series/. Summarises TRAI Press Release No. 91 of 2026.
- S5: Orissa Diary, "TRAI Strengthens Framework for Curbing Unsolicited Commercial Communications…", Sep 2026 (exact day not stated). https://orissadiary.com/trai-strengthens-framework-for-curbing-unsolicited-commercial-communications-through-technology-driven-enforcement-and-enhanced-consumer-protection/. Secondary reproduction of the TRAI/PIB release on the final Third Amendment.
- S6: Caller Digital (a voice-AI vendor blog), "Voice AI India Regulatory Map 2026", 4 Jun 2026. https://www.caller.digital/blog/voice-ai-india-regulatory-map-2026. Low reliability.
- S7: WebSearch result snippets (Careerindia, qcall.ai and others), Sep 2026. Low reliability, used only to generate leads.

---

### C1

**Verdict: WEAKENED.** The core holds for calls with sales content. Three sub-claims are overstated:

- **"Callbacks to enquirers are promotional."** The rules have a non-promotional route for follow-ups based on consent or an enquiry.
- **"Ordinary 10-digit numbers are not permitted."** The rules only clearly bar them for promotional calls, not for all commercial calls.
- **"Only with explicit, registered digital consent."** The inquiry-based "Relationship" and inferred-consent route also has to be dealt with.

**Strongest disconfirming evidence:**

1. **Service Voice Call, 2(bh)(ii).** The Feb 2025 amendment defines a "Service Voice Call" to include a call to _a Recipient_ (not only a customer) "to facilitate or complete a commercial transaction involving the ongoing purchase … after obtaining Explicit Consent … and such Messages are not promotional in nature", with 7-day consent validity. Such calls are excluded from "UCC" by clause (bw)(ii). So a follow-up call to an enquirer with no promotional content is _not_ a Promotional Voice Call.
   - S1, TRAI, 2025-02-12, accessed 2026-09-25. Confidence: high.
2. **Inquiry-based "Relationship", 2(bb).** Under the principal regulations, "Relationship", which is the basis for _inferred consent_, covers an "inquiry or application regarding products or services made by or submitted by recipient to sender within the three months immediately preceding". TRAI's March 2026 draft _proposed removing_ the "inquiry" basis, which confirms it was still in force at least until the Third Amendment. The Feb 2025 text also defines "Fully blocked" as blocking explicit-consent communications "except commercial communication sent under inferred consent".
   - S2, TRAI, 2026-03-13, accessed 2026-09-25. Confidence: high that the provision existed. **Unverified whether the final Third Amendment (Sep 2026) actually removed it.**
3. **Industry pushback on removing the inquiry basis.** MyOperator asked TRAI to keep it, narrowed to 7 days. It argued that treating a follow-up to a customer-initiated enquiry as UCC "creates a regulatory paradox". The final outcome is not confirmed.
   - S3, MyOperator, 2026-04-19, accessed 2026-09-25. Confidence: high that this position was taken.
4. **No 10-digit ban outside promotional calls.** TRAI's own explanatory memorandum says that for transactional and service calls "earlier no special series numbers have been mandated". The 1600 series is allotted _only_ to service and transactional calls by RBI-, SEBI-, IRDAI- and PFRDA-regulated entities and to government. The July 2026 clarification repeats this and says nothing about 10-digit numbers. So non-BFSI service or transactional calls from a _registered_ sender on 10-digit numbers are not clearly prohibited; only promotional calls are confined to 140.
   - S1, TRAI, 2025-02-12 (memorandum, paras 18 and 50), accessed 2026-09-25. Confidence: medium-high.
   - S4, MediaNama, 2026-07-13, accessed 2026-09-25. Confidence: medium-high.
5. **Mixing rule cuts the other way.** Clause (av) says that if promotional content is mixed into any commercial voice call, the call "shall be treated as a Promotional Voice Call". A real sales or lead-qualification script almost certainly makes the call promotional. This limits how far items 1–4 go.
   - S1. Confidence: high.

**Strongest good-faith argument that C1 is wrong:** C1 treats every lead-qualification or callback call as promotional. The text does not. A call that only facilitates a transaction the prospect has started, after 7-day explicit consent and with no promotional content, is a Service Voice Call. It is outside UCC, is not confined to the 140 series, and for non-BFSI senders is not clearly barred from 10-digit numbers. Until the final Third Amendment text is checked, an enquiry within the last 3 months may also still support inferred consent. The practical exposure is smaller, though: once the AI agent pitches, qualifies interest in buying, or upsells, the mixing proviso makes the call promotional.

**Searched for but not found:**

- The final gazetted Third Amendment text, showing whether the "inquiry" limb of 2(bb) was removed.
- Any B2B or business-number exemption in the TCCCPR text.
- Any writ petition or court challenge to the Feb 2025 amendment.
- Any operator practice notes on whether non-BFSI 10-digit service calls are allowed.
- Any official TRAI FAQ.

---

### C2

**Verdict: SURVIVES (slightly WEAKENED at the edges).** Two things narrow it:

- The pre-declaration duty is not new in Sep 2026: regulation 4 has required it since Feb 2025.
- The A2P definition has a "without direct human dialling" hinge. AI-assisted calls that a human dials could arguably fall outside it.

**Strongest disconfirming or qualifying evidence:**

1. **Regulation 4, Feb 2025.** It already required every Sender to "notify the Originating Access Provider, in advance, about the use of Auto Dialer or Robo-Calls as well as the intended objective of such calls in writing". The duty predates the Third Amendment, and the Feb 2025 memorandum says service and transactional robocalls "should not be subject to any restrictions" beyond series and pre-declaration.
   - S1, TRAI, 2025-02-12, accessed 2026-09-25. Confidence: high.
2. **A2P definition.** The draft, and per a secondary report the final, defines an A2P call as one "initiated by an application, software system, or automated platform _without direct human dialling_ … including … prerecorded/artificial voice technologies". Undeclared A2P calls are "treated as UCC", which is not literally "spam".
   - A conversational AI agent that a human dials one call at a time, for example click-to-call, is arguably outside the definition. MyOperator lobbied for exactly that proviso; the outcome is unknown.
   - S2, TRAI, 2026-03-13, accessed 2026-09-25. Confidence: high for the draft wording.
   - S5, Orissa Diary, Sep 2026, accessed 2026-09-25. Confidence: medium for the final wording (secondary source).
3. **"Robo Calls" definition in the principal regulations.** It covers calls using "an artificial or prerecorded voice to interactively deliver a voice message without the involvement of human being on calling side for participating in the dialogue". A model where a human on the calling side takes part (live monitoring or barge-in) is a textual argument for falling outside it.
   - S2 (reproducing the principal definitions). Confidence: medium.
4. **Industry position for consent-based AI calls.** MyOperator proposed that outbound AI-agent calls made in performance of a service or transactional interaction _with explicit consent_ should not be "escalated to the bulk-A2P category solely on account of the use of AI voice technology". It also conceded that AI calls made without consent belong under A2P. TRAI's response is unknown.
   - S3, MyOperator, 2026-04-19. Confidence: high that this position was taken.

**Strongest good-faith argument that C2 is wrong:** The A2P definition depends on who _initiates or dials_ the call, not on how the voice is produced. A platform where a human agent dials each call, or where a human takes part in the dialogue on the calling side, could argue it makes neither an A2P call nor a Robo Call. For fully automated outbound AI campaigns, as the platform describes itself, C2 holds: the text expressly names "artificial voice technologies".

**Searched for but not found:**

- The final gazetted Third Amendment text, showing whether the human-dialling proviso was added.
- Any TRAI clarification naming "conversational AI" or "AI agents".
- Any operator guidance on what counts as A2P.

---

### C3

**Verdict: SURVIVES on AI disclosure; WEAKENED on calling hours.** The disclosure part holds. The hours part is right for TRAI but overbroad as a statement about Indian law, because at least one sector regulator sets a fixed calling window.

**Strongest disconfirming evidence:**

1. **RBI collection-call window.** A vendor regulatory map reports a fixed 8:00am–7:00pm IST window for collection calls by RBI-regulated lenders, with "no exceptions, including borrower preference".
   - This is a binding fixed window in one sector. It covers debt collection, not sales, and the primary RBI instrument was not retrieved this run.
   - S6, Caller Digital, 2026-06-04, accessed 2026-09-25. Confidence: low-medium (vendor source; primary not checked).
2. **TRAI time bands are preferences, not a statutory window.** TRAI's schedule sets time bands 00–06, 06–08, 08–10 and 21–24 as "default OFF for all customers irrespective of the status of registration". It also says "transactional type and service type of commercial communications may not be blocked during any time band". This _supports_ C3's description. It also means the default 21:00–10:00 block applies only to promotional traffic.
   - S2, TRAI, 2026-03-13 (schedule text), accessed 2026-09-25. Confidence: medium-high. The quote comes from the draft's rendering of the schedule, not the gazetted consolidated text.
3. **AI disclosure: nothing binding found.**
   - The vendor map finds RBI and IRDAI identity or capacity disclosure duties on callers ("who you are, what entity, what purpose"), but no AI-specific disclosure mandate.
   - Search snippets claim a "2026 draft amendment requires explicit disclosure at the start of every AI voice call" and also that "TRAI does not currently mandate disclosure as of June 2026".
   - S6, 2026-06-04. Confidence: low-medium.
   - S7, Sep 2026. Confidence: low; the instrument behind the draft claim is unidentified.
4. **Sector identity-disclosure duties.** If an AI agent calls for an RBI- or IRDAI-regulated client, identity disclosure duties apply. A regulator could read an AI agent that implies it is a human employee as misrepresentation.
   - S6. Confidence: low.

**Strongest good-faith argument that C3 is wrong:**

- **Calling hours.** "No fixed statutory window" is false as a statement about Indian law generally. RBI (collections) and possibly IRDAI (insurance telemarketing) set fixed windows that operate regardless of TRAI preferences. C3 should be scoped to "under TCCCPR", with sector overlays depending on the business customer's vertical.
- **AI disclosure.** Existing binding duties could reach undisclosed AI callers even without an AI-specific rule: identity disclosure in sector regulation, and misleading-practice rules under the Consumer Protection Act.

**Searched for but not found (or not searched because of budget):**

- The primary RBI or IRDAI text on calling windows (IRDAI distance-marketing hours were not checked).
- The draft CCPA 2026 guideline itself.
- Whether the MeitY IT Rules amendment on labelling synthetically generated content (2026) reaches telephony. Not searched; this is an open risk.
- Any court order requiring AI disclosure.

---

**Cross-cutting gap:** the final gazetted Third Amendment (18 Sep 2026) was not retrieved. Two points rest on the draft (S2) and a secondary press write-up (S5): whether the "inquiry" limb of Relationship was removed, and whether a human-dialling or AI-agent carve-out was added.
