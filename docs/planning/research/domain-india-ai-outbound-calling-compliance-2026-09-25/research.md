---
title: 'domain research: India compliance for AI outbound sales calling'
type: 'domain'
topic: 'India compliance for AI outbound sales calling'
decision: 'Contents of the India rule set for the ComplianceEngine (ADR-014) and the compliance constraints the PRD must carry'
source: 'native run (web)'
status: complete
preset: 'deep'
validation: 'high'
created: '2026-09-25'
updated: '2026-09-26'
claims_verified: 22
claims_unverified: 8
claims_disputed: 3
---

# Domain research: India compliance for AI outbound sales calling

**Decision this research serves:** Contents of the India rule set for the ComplianceEngine (ADR-014) and the compliance constraints the PRD must carry

> Research, not legal advice. Every conclusion below should be confirmed by Indian telecom and
> data-protection counsel before launch. Confidence is marked per claim: **high** = verified by
> two independent publishers (or primary text + independent analysis) and fresh; **medium** =
> one credible source; **low** = weak, stale or disputed source. Compound labels (for example
> medium-high) sit between two levels; qualifiers such as "as text", "as draft text" or "TRAI
> text only" say what the rating covers; "absence" means nothing was found after a search; and
> inferences are labelled as such. Abbreviations are defined in the [Glossary](#5-glossary).

## Executive summary

**What the evidence says to do:** build the India rule set around the Telecom Regulatory Authority
of India's (TRAI) commercial-communication regulations (TCCCPR 2018 as amended in February 2025
and, once gazetted, September 2026), design the data layer now for the Digital Personal Data
Protection (DPDP) Act and Rules that bind from **about 13 May 2027**, and ship the AI-voice
disclosure and recording notice by default even though no binding rule requires them yet.

The findings that drive this:

1. **Nivomi's MVP calls are promotional commercial calls, and they are heavily regulated.** A
   sales or lead-qualification call — including a callback to a prospect who inquired but has not
   bought — is a _Promotional Voice Call_; any promotional content makes the whole call
   promotional [1][6]. Promotional calls may only originate from **140xx** numbers of a
   **sender registered on the operators' distributed-ledger (DLT) platform**, and reach a subscriber only if they have not blocked promotions or
   have given registered explicit consent [1][2][5]. Ordinary 10-digit numbers are not allowed for
   promotional calls (high).
2. **An AI voice agent makes automated application-to-person (A2P) or robo calls.** TRAI's final Third Amendment (adopted
   18 Sep 2026, not yet in the Gazette) defines A2P calls to include "pre-recorded/artificial voice"
   and treats every undeclared A2P call as unsolicited commercial communication (UCC) [2][3][16];
   the "undeclared = UCC" consequence rests on TRAI's text alone. A written advance declaration of
   auto-dialer/robo-call use has been required since early 2025 (notified 12 Feb 2025) [1][6].
3. **Enforcement is fast and binary.** Five complaints from different people within 10
   days — or three when an operator's AI/ML system has also flagged one of the sender's numbers —
   trigger suspension. Repeated AI flags alone start know-your-customer (KYC) re-verification. A
   first violation bars **all** of the sender's telecom resources for 15 days; a repeat means one-year disconnection
   and blacklisting across all operators [1][2][7]. Over 1,150 senders had been blacklisted by March
   2025 [10][11]. A tenant's campaign can therefore take down that tenant's entire telephony.
4. **Consent has two independent legal regimes.** Telecom consent (TRAI's registered consent,
   7-day inquiry window, 90-day re-consent wait) and DPDP consent (notice + proof of consent for the
   purpose) are separate. TRAI's 2026 memorandum says revoking telecom consent does not revoke DPDP
   consent [2] (the reverse direction is not addressed). DPDP has no "legitimate interest" ground:
   cold calling purchased lists needs DPDP consent, while following up a person's own inquiry can
   arguably rely on s.7(a), which covers data the person provided voluntarily [29][36] (medium,
   inference).
5. **No binding AI-disclosure duty exists today, but a draft is coming.** A Central Consumer Protection Authority (CCPA) draft (September
   2026, working-draft status) would require an audible "this is AI" disclosure at the start of the
   call [18][19][20]. No authoritative source settles call-recording legality; recording is
   personal-data processing under DPDP [29].
6. **Several providers keep data outside India.** HubSpot has no India hosting [61]; Clerk is
   US-only [63]; Claude has no India-only inference on Bedrock [54][56]; Sarvam's own policies
   contradict each other on training on customer audio [52][53]. DPDP currently permits transfers
   (no restricted-country list) [28][32], but sector rules may not permit them for banking, financial services and insurance
   (BFSI) tenants [42].

**Biggest caveat:** several operational facts cannot be settled from public sources — whether
Nivomi must register as a telemarketer (aggregator), what Exotel does for voice DLT and 140xx/1601xx
numbers, the Third Amendment's Gazette date, and whether the 7-day inquiry window overrides DND.
These need written answers from Exotel and Indian counsel before the rule set is final (see
[Open questions](#9-open-questions)).

**What to do with it:** the findings translate into the ADR-014 rule table (R1), PRD constraints
(R2), architecture constraints (R3) and pre-build actions (R4); see
[Recommendations](#8-recommendations). The two conclusions that most shape the product are that
consent needs two separate ledgers, and that fast follow-up of inbound leads is the lawful MVP
journey.

---

## 1. Telecom commercial-communication rules (TRAI)

Nivomi's sales calls are promotional, automated commercial calls: they need a registered sender,
140xx numbers, a declared automated-calling setup and a consent or preference basis, and
complaints can shut a sender down within days.

### 1.1 Instruments and their status

| Instrument                                         | Status on 2026-09-25                                                                        | Confidence                                                             |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| TCCCPR 2018 (TRAI)                                 | Operative regime for commercial calls and SMS                                               | high [1][6]                                                            |
| Second Amendment (1 of 2025), notified 12 Feb 2025 | In force (most clauses from 30 days after notification, some from 60)                       | high [1][6]                                                            |
| Third Amendment (05 of 2026), adopted 18 Sep 2026  | Final text published by TRAI, **headed "to be published in the Gazette"; not yet notified** | high on content [2][3][5]; medium on gazette status [5]                |
| Telecommunications Act 2023, s.28 (consent, DND)   | Section in force since 26 Jun 2024 as an enabling power; no rules under it found            | high on commencement [25][26]; medium on "no rules" (2024 source) [25] |

Third Amendment commencement runs from Gazette publication: **+30 days** for most provisions
(including the new 7-day inquiry "Relationship" and the legacy-consent rule), **+60 days** for the
A2P declaration, VNO interface, header/template misuse regime and the A2P termination charge, and
**+90 days** for the Annexure items (consumer appeal, AI-flag corroboration) [2][5]. MediaNama
places the inquiry window at +60 days; the regulation's own commencement clause says +30 [2][5] —
the regulation governs.

### 1.2 Call categories and number series

- **Promotional Voice Call** — any voice commercial communication with promotional content; if
  promotional content is mixed into any commercial call, the call is promotional [1][6] (high).
- **Prospects are promotional recipients.** TRAI's explanatory memorandum says communications to
  people "who have shown interest in a product or service but have not yet made a purchase" belong
  under promotional [1] (high as TRAI's stated position; single primary source).
- **Service Voice Call** — (i) to the sender's existing customer about a product or service
  already procured, no explicit consent needed; (ii) to facilitate an _ongoing purchase_, made
  with explicit consent that is valid for **7 days** and that the customer can renew 7 days at a time
  (renewal added in 2026) [1][2][7] (7-day validity high; renewal medium).
- **Transactional Voice Call** — in response to a customer-initiated transaction within 30 minutes
  [1] (medium, single primary).
- **Number series:** promotional calls **only from 140xx**; service/transactional from **1600xx**
  for BFSI and government, **1601xx** for other sectors [2][5] (140xx/1600xx high; 1601xx split
  medium, TRAI text only). BFSI entities regulated by RBI, SEBI and PFRDA had phased 1600 mandates
  between 1 Jan and 15 Mar 2026 [8][9] (Direction high; dates medium-high, SEBI/PFRDA dates from
  [9] only); insurers reportedly by 15 Feb 2026 (low — press snippets only, not in the appendix).
  Commercial calls may use only registered headers or special series (reg 3(1)) [1][13], so no
  ordinary 10-digit numbers for promotional calls (high); see [Contrary evidence](#7-contrary-evidence)
  for the argument about non-promotional calls.
- Caller-ID/spam apps may not blanket-block or spam-tag 140xx, 1600xx or 1601xx numbers
  (reg 34A) [2][5] (high).

### 1.3 Registration, DLT and the telemarketer chain

- An **unregistered sender must not make any commercial communication**; its resources may be
  suspended or disconnected (reg 3(2)) [1][12] (high).
- Registration requires physical verification of the entity, biometric authentication of the
  authorised person, and a linked mobile number [1] (medium-high). Senders self-certify their
  registration, headers, content templates and consent templates every year or face automatic
  suspension [1] (medium).
- **Chain limit:** at most one _Telemarketer with Aggregator Function_ and one _Telemarketer with
  Delivery Function_ between sender and operator (reg 22(1)(e)) [1] (medium, single primary). An
  aggregator pools traffic from multiple enterprises without direct operator connectivity; a
  delivery telemarketer has that connectivity [12] (medium, 2023 operator FAQ).
- The principal entity (the business) must file its own entity, header, content-template and
  consent-template registrations; a telemarketer cannot file them for it [12] (medium, 2023).
- **Inference, unconfirmed:** a multi-tenant platform that pools many businesses' traffic and hands
  it to a CPaaS provider (Exotel) matches the aggregator role, so Nivomi may need registered
  telemarketer (aggregator) status. No regulator or operator text addresses SaaS voice platforms
  (low-medium).

### 1.4 Automated and AI calls

- Since early 2025 (Second Amendment notified 12 Feb 2025), every sender must notify its
  originating operator **in writing and in advance** of auto-dialer or robo-call use and the calls' objective (reg 4) [1][6] (high).
- **Robo Call** (TCCCPR 2(bc)): a call "using an artificial or prerecorded voice to interactively
  deliver a voice message without the involvement of human being on calling side" [4] (medium; read
  from TRAI's consolidated draft text).
- **A2P call** (Third Amendment 2(ea)): "initiated by an application, software system, or automated
  platform without direct human dialling … including using autodialling, robo-calls and/or
  pre-recorded/artificial voice technologies" [2][16] (high). The sender must declare A2P use and
  the **calling-number (CLI) ranges** to its operator, which records them on DLT [2][5][16] (declaration duty high; DLT
  recording TRAI text only). Undeclared A2P calls are treated as unsolicited commercial
  communication [2] (medium — TRAI text only). TRAI's memorandum applies the declaration duty to
  **all** A2P calls, including service calls [2] (medium).
- **Inference:** a fully automated conversational AI agent falls within both definitions ("artificial
  voice", "interactively … without … human being on calling side") (medium). No TRAI guidance names
  LLM or conversational agents. See [Contrary evidence](#7-contrary-evidence).
- Operators may charge up to **₹0.05/min** between themselves for A2P calls, except on 140xx, 1600xx
  and 1601xx [2][3][5][16] (charge high; series exemption TRAI text only [2][3]). This is another reason to stay on the
  designated series.
- **Abandoned and silent calls** are defined, and operators must act against auto-dialer senders
  exceeding "prescribed limits"; no numeric limit was found [4] (medium).

### 1.5 Consent, preferences and calling windows

- **Preference register (NCPR / DND)**, set through the 1909 short code. Subscribers can choose
  _FULLY BLOCK_, which stops promotional and explicit-consent service communications (not
  inferred-consent, transactional or government); _BLOCK PROMO_, which stops promotional only; or
  blocks on any of 8 content categories (1 banking/insurance/
  financial, 2 real estate, 3 education, 4 health, 5 consumer goods and automobiles,
  6 communication/broadcasting/entertainment/IT, 7 tourism and leisure, 8 food and beverages) [1]
  (medium, single primary).
- **Registered explicit consent** (Digital Consent Acquisition via the operators; consent requests
  from short code 127xxx naming brand and scope) lets promotional calls reach subscribers despite
  their preferences [1] (high as TRAI text). From the Third Amendment, **consent obtained outside
  that framework counts only if verifiable and registered** in the Consent Register [2][5][16] (high).
- **Inquiry window (Third Amendment 2(bb)(ii)):** a written or digital inquiry creates a
  "Relationship" for **7 days**; it must be kept "in a verifiable form" and need not be registered.
  A product **application** extends this to **3 months** [2][16][5] (7 days high; 3 months medium).
  The text frames this as _inferred consent_ but does not say which category or series applies or
  whether it overrides a DND block (medium).
- **90-day wait:** after an opt-out or revocation the sender may not seek consent again for 90 days
  unless the customer opts back in [1][7] (high).
- Consents registered against a number are revoked when the number is surrendered [1] (medium).
- **Telecom consent is not DPDP consent:** the Third Amendment's definition of consent covers the
  channel only, and the Third Amendment states that nothing in TCCCPR exempts a sender from the
  DPDP Act [2] (medium).
- **Calling windows:** no fixed statutory window was found. Customer time bands 00–06, 06–08,
  08–10 and 21–24 are **closed to promotional calls by default (default OFF) for every subscriber**, so promotional calls effectively run
  **10:00–21:00** unless the subscriber opts in; service and transactional calls cannot be blocked
  by time band [4] (medium — from TRAI's consolidated draft text). Exotel's FAQ states 09:00–21:00
  but is framed on the 2018 text [45] (low). A vendor source reports a fixed 08:00–19:00 window for
  RBI-regulated debt collection [17] (low). See [Contrary evidence](#7-contrary-evidence).

### 1.6 Complaints, detection and sanctions

- Recipients complain within **7 days** of the call [1][6] (high).
- **Suspension triggers:** at least 5 complaints from unique recipients in 10 days, or at least 3
  only when one of the
  sender's numbers is also flagged by the operator's AI/ML spam detection [2][5] (high).
- **Operator AI/ML flagging (reg 21A):** suspected-UCC numbers are shared within 2 hours; five or
  more flagged numbers in 10 days escalates to KYC re-verification, then physical verification,
  and a 15-day bar only on mismatch or misuse. Designated series are never flagged [2][5] (flagging
  and 2-hour sharing high; escalation detail medium, TRAI text only). Detection signals in TRAI's
  2025 text include calls to many distinct numbers, short average call duration and a low
  incoming-to-outgoing ratio [1] (medium).
- **Sanctions:** a first violation leads to outgoing services of **all** the sender's resources
  (SIMs, PRI/SIP trunks) being barred for **15 days** by all operators; a subsequent violation
  leads to **one-year
  disconnection, blacklisting and device blocking** [1][2][7] (high). Restoration costs ₹5,000 per
  resource, capped at ₹5 lakh [2] (medium). A telemarketer that misuses headers or templates is
  disconnected and blacklisted for a year [2][16] (high).
- **Scale:** 1,150 entities blacklisted and over 18.8 lakh telecom resources disconnected as of
  19 Mar 2025 [10][11] (medium-high; both outlets report the same PIB release).

## 2. AI disclosure and call recording

### 2.1 AI disclosure

- **No binding AI-disclosure duty found for phone calls.** TRAI's 2025 and 2026 texts mention AI
  only as an operator spam-detection tool and in the A2P definition [1][2] (high, absence finding;
  the red-team search found none either).
- **IT Rules amendment 2026** (G.S.R. 120(E), notified 10 Feb 2026, in force 20 Feb 2026) requires
  labelling of synthetically generated audio, including a prefixed audio disclosure, but binds
  _intermediaries_; the analysis reviewed for this report never mentions telephony [21][22] (high on dates; medium on
  scope). Whether an AI-voice SaaS counts as an intermediary enabling synthetic content is open.
- **CCPA draft "Pesky, Promotional and Unsolicited Commercial Communications Guidelines, 2026"**
  (Consumer Protection Act s.18(2)) [18][19][20]:
  - The text retrieved is a committee working draft (open options, "(need to revise)" notes, no date
    or comment deadline) hosted by MediaNama; no DoCA/PIB notice was found [18] (high on content;
    official status unconfirmed).
  - It would make it a violation to use an AI-generated voice "without clearly and audibly/visibly
    disclosing to the recipient, at the outset of the communication, that it is AI-generated"; the
    sender **and** the beneficiary brand would be liable [18][19][20] (high as draft text).
  - It would require explicit consent per brand and product (for telecom voice, only via the
    operators' Digital Consent Acquisition), a free opt-out with confirmation, a cooling-off period of
    45, 60 or 90 days (options the draft leaves open), identification of the caller and purpose, no persistent follow-ups after a single
    inquiry, complaint acknowledgement within 24 hours and resolution within 7 days, and records of
    consent, opt-outs and sender identity for 180 or 365 days (also left open) [18][19] (high as draft text).
  - **Scope caveat:** its scope clause targets calls from normal 10-digit numbers not registered
    under TCCCPR and app/platform channels, and it excludes communication under subsisting explicit
    consent [18] (medium). Whether it would bind a registered 140xx sender with consent is unclear.
  - It takes effect on publication with no transition period, and yields to TCCCPR/DPDP on conflict
    [18]. An earlier June 2024 draft exists [27]; no evidence was found that it was finalised (low-medium).

### 2.2 Call recording

- No top-tier legal analysis was found on whether a business may record its own calls without
  consent. Blog claims that one-party recording is illegal were rejected as low quality.
- **Supreme Court:** _Vibhor Garg v. Neha_ (14 Jul 2025) held secretly recorded spousal calls
  admissible as evidence in matrimonial proceedings, without ruling on lawfulness [23][24] (high on
  holding; its reach to business calls is untested).
- **Telecommunications Act:** the s.20 interception power is a State power over network messages
  [25] (medium).
- **DPDP:** "processing" includes recording, so recordings and transcripts carry DPDP notice and
  consent duties once those commence [29] (high on definition).
- **CCPA draft:** imposes no recording duty [18].

## 3. Data protection: DPDP Act 2023, DPDP Rules 2025, CERT-In

DPDP's business obligations start about 13 May 2027 and CERT-In's incident and log rules apply now;
the product should be built to both from the start.

### 3.1 Timeline

| Date                                         | What commences                                                                                                                           | Confidence        |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| 13 Nov 2025 (G.S.R. 846(E); PIB says 14 Nov) | Definitions, Data Protection Board rules                                                                                                 | high [28][30][31] |
| ~13/14 Nov 2026                              | Consent Manager registration (Rule 4)                                                                                                    | high [28][31]     |
| **~13/14 May 2027**                          | Notice, consent, security safeguards, breach notification, retention, children, rights, cross-border, SDF duties (Rules 3, 5–16, 22, 23) | high [28][30][31] |

- **No amendment or date change found.** A January 2026 MeitY proposal to cut the 18-month
  compliance period to 12 months targeted Significant Data Fiduciaries and remained a consultation [32] (medium); a December 2025
  corrigendum made minor corrections only [41] (medium). The Supreme Court issued notice in
  challenges and refused an interim stay of the Act's RTI amendment [40] (medium-high); no order
  pauses the DPDP dates. The Board had no chair or members
  as of 1 Aug 2026 and no enforcement actions [33] (medium). Use **13 May 2027** as the conservative
  date (see [Contrary evidence](#7-contrary-evidence)).

### 3.2 Roles

- A **fiduciary** determines purpose and means, alone or with others; a **processor** processes on
  its behalf [29]. The fiduciary stays responsible for its processors and must use a valid contract
  with security clauses [28][29] (high).
- **Inference:** each business customer is the fiduciary for its lead data and Nivomi is its
  processor — **only while Nivomi uses that data solely for the customer's purposes**. Reusing
  recordings or transcripts for Nivomi's own purposes (model improvement, cross-tenant analytics)
  makes Nivomi a fiduciary for that use; AZB argues significant vendor autonomy over the means can
  make a vendor a fiduciary or joint fiduciary anyway [38] (medium; see
  [Contrary evidence](#7-contrary-evidence)).

### 3.3 Obligations that shape the product (from about May 2027)

- **Notice (s.5, Rule 3):** stand-alone, plain language, itemised personal data and specific
  purposes, with a link and means to withdraw consent, exercise rights and complain to the Board;
  available in English or any Eighth Schedule language [28][29][30] (high). Nivomi's launch
  languages are believed to be Eighth Schedule languages (not verified this run).
- **Consent (s.6):** free, specific, informed, unconditional, unambiguous, clear affirmative action;
  withdrawal as easy as giving; **the fiduciary must prove notice and consent** (s.6(10)) [29][37]
  (high). No guidance was found on whether verbal or IVR consent on a call suffices [37] (absence).
- **Legitimate uses (s.7):** none is a general marketing ground. s.7(a) covers data the person
  voluntarily provided for a specified purpose — arguably a follow-up to their own inquiry [29]
  (medium, inference). Calling **purchased or third-party lists needs consent** — an
  inference from s.7 [29], consistent with [36], which holds that consent to process a number is not
  consent to marketing calls and that outsourcing does not shift responsibility (medium; no source
  states the purchased-list conclusion directly).
- **Publicly available data** is excluded only if the person made it public themselves or it was
  published under a legal duty [29][35] (high); whether self-published professional profiles
  qualify is contested [39] (medium).
- **Retention:** erase when the purpose is served unless law requires retention (s.8(7)) [29]; but
  **every** fiduciary must keep personal data, traffic data and processing logs for at least one
  year from processing, including at its processors (Rule 8(3)) [28][31] (high on text; medium that
  it applies to all fiduciaries).
- **Security (Rule 6):** encryption/masking, access control, access logging and monitoring,
  backups, one-year log retention, security clauses in processor contracts [28][31] (high).
- **Breach (Rule 7):** tell affected people without delay; tell the Board without delay and send a
  detailed report within **72 hours**; no materiality threshold in the text [28][30] (high; threshold
  point is inference).
- **Rights (ss.11–14, Rule 14):** access, correction, erasure, grievance first to the fiduciary;
  fiduciaries must publish a response period of at most **90 days** [28][30][31] (high).
- **Children:** anyone under 18 needs verifiable parental consent; no tracking or targeted
  advertising [29][30] (high).
- **Penalties:** up to ₹250 crore (security), ₹200 crore (breach notification, children), ₹50 crore
  (other) [30][33] (high).

### 3.4 Cross-border transfer

- Rule 15 permits transfers outside India subject only to government orders about access by foreign
  states; no restricted-country list or order has been notified [28][32][41] (high on text; medium
  on "none notified"). See [Contrary evidence](#7-contrary-evidence).
- For Significant Data Fiduciaries, Rule 13(4) lets the government require specified data and its
  traffic data to stay in India; no SDF has been designated [28][32] (medium).
- **Sector rules still apply** (s.16(2)): SEBI's 2023 cloud framework may require regulated
  entities' data to stay in India [42] (medium). IRDAI record-keeping rules may do the same for
  insurers, and SEBI's later position is reportedly in flux (low — snippet sources not in the
  appendix).

### 3.5 CERT-In Directions (in force now)

Report listed cyber incidents, including data breaches and leaks, to CERT-In **within 6 hours**; keep
ICT system logs for a rolling **180 days within India**; sync clocks to NIC/NPL NTP; name a point of
contact [34] (high). Whether a SaaS company is a "cloud service provider" subject to the 5-year
subscriber-record duty is unsettled [34] (low).

## 4. Providers: who does what, and where data lives

Several providers keep or process data outside India, and Exotel's and Sarvam's public documents
leave compliance responsibilities and data terms open.

### 4.1 Exotel (telephony)

- **KYC** by business type; IP-PSTN numbers usable only in the KYC region [43] (medium).
- **Voice DLT and numbering are not settled by Exotel's public pages.** An undated FAQ says DLT is
  "only required for SMS" [44], which conflicts with TRAI's registration rule for all commercial
  communication [1] — the regulator governs. Exotel's TCCCPR FAQ puts registration, consent
  records, opt-outs and "enable DND filtering" on the customer [45]. No Exotel page explains 140xx
  or 1601xx provisioning, its telemarketer role, or A2P declarations (absence). Its 2024 blog saying
  city numbers remain usable predates the 2025 amendment [51] (stale).
- **DND filtering** exists (real-time NDNC checks) but may need enabling [45][46] (medium-low) —
  do not assume it is on.
- **Data:** stored only in the region chosen at signup (Mumbai or Singapore); recordings kept 90
  days by default, call records 1 year; deletion via support, purged in about 30 days; DPA on request
  for enterprise customers; no public subprocessor list [47] (medium, undated page).
- **Streaming (Voicebot applet):** two-way WebSocket, 16-bit mono PCM at 8 kHz by default (16 and 24
  kHz supported); server `clear` event flushes queued audio (barge-in); sessions up to 60 minutes
  [48][49][50] (medium-high). The applets may not be enabled by default and are switched on through Exotel [49].
- **Human handoff** is documented only **after** the bot closes the stream: the flow moves on to a
  Passthru applet, then Connect or SIP; transfer during a live stream is not documented, ringing
  audio leaks into the stream (known issue), and outbound use is not documented [49][50] (medium;
  Beta guide).

### 4.2 Sarvam (STT/TTS)

- The Privacy Policy (29 Jul 2026) says customer content trains Sarvam's models **unless the
  customer opts out**, default retention is 30 days, and data may go to the US or EU [52] (high on
  text). The Terms (same date) say training is "(where required) subject to your consent", Sarvam
  acts as processor under a DPA, data is processed and stored in India and may be transferred
  abroad [53] (medium). **The two documents conflict; the DPA is not public** (`/dpa` returns 404).
- The Terms prohibit TCCCPR-violating calls, recording without required notice/consent, and voice
  cloning without consent; liability is capped at 12 months' fees [53] (high on text).

### 4.3 LLM inference residency

| Option                                   | India-only inference?                                                                                                     | Evidence             |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| Claude on AWS Bedrock (Mumbai/Hyderabad) | **No** — Global endpoint only                                                                                             | high [54][56]        |
| Anthropic API                            | **No** — `inference_geo` is "us" or "global"                                                                              | medium [64]          |
| OpenAI GPT-5.6 Terra/Luna on Bedrock     | **Yes** — `in.` profile routes Mumbai↔Hyderabad only                                                                      | medium [55]          |
| OpenAI API                               | India data residency, available only through sales                                                                        | medium [65]          |
| Azure (South India)                      | Regional only for gpt-4o, gpt-4.1-mini, embeddings, whisper; realtime models Global only; APAC Data Zone is multi-country | medium-high [58][59] |
| Google Vertex AI (asia-south1)           | Listed for Gemini 2.0/2.5-generation models only                                                                          | low [60]             |

Bedrock stores no prompts or outputs by default and model providers cannot see them [55][57]
(high); Azure states prompts are not used to train foundation models [59] (medium).

### 4.4 Other processors

| Provider | Personal-data location    | India option      | Notes                                                 | Evidence        |
| -------- | ------------------------- | ----------------- | ----------------------------------------------------- | --------------- |
| HubSpot  | US, EU, Canada, Australia | **No**            | Each organization's own HubSpot account               | medium [61]     |
| Clerk    | US only                   | **No**            | DPA covers GDPR/California CCPA etc.; no DPDP mention | medium [63]     |
| Razorpay | India implied             | Per product annex | Describes itself as DPDP processor                    | low-medium [62] |

## 5. Glossary

| Term                                       | Meaning                                                                                                                                          |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| TCCCPR                                     | TRAI's Telecom Commercial Communications Customer Preference Regulations, 2018 (as amended) [1]                                                  |
| UCC                                        | Unsolicited commercial communication — commercial calls or SMS not matching the recipient's consent or preferences [1]                           |
| Sender / Principal Entity (PE)             | The business on whose behalf commercial communication is made; must register on DLT [1][12]                                                      |
| Telemarketer (RTM) — aggregator / delivery | Registered intermediary; aggregator pools many businesses' traffic, delivery has operator connectivity; max one of each per chain [1][12]        |
| DLT                                        | Operators' distributed-ledger platform recording senders, telemarketers, headers, templates, consents and (from 2026) A2P calling numbers [1][2] |
| DCA / Consent Register                     | Operators' Digital Consent Acquisition facility; consent requests from short code 127xxx [1]                                                     |
| NCPR / DND                                 | National Customer Preference Register; subscriber blocking choices set via 1909 [1]                                                              |
| 140xx / 1600xx / 1601xx                    | Promotional series / service-transactional for BFSI and government / service-transactional for other sectors [2]                                 |
| BFSI                                       | Banking, financial services and insurance — the sectors with the tightest numbering mandates [8]                                                 |
| CCPA                                       | Central Consumer Protection Authority (India), under the Consumer Protection Act 2019 [18]                                                       |
| CLI                                        | Calling line identity — the calling number; A2P CLI ranges must be declared [2]                                                                  |
| A2P call                                   | Call initiated by an application or automated platform without direct human dialling, incl. artificial voice [2]                                 |
| Robo call                                  | Artificial or prerecorded voice interactively delivering a message with no human on the calling side [4]                                         |
| Relationship (inquiry / application)       | Basis for inferred consent: 7 days after a written/digital inquiry, 3 months after an application [2]                                            |
| Data Fiduciary / Processor                 | DPDP roles: decides purpose and means / processes on the fiduciary's behalf [29]                                                                 |
| SDF                                        | Significant Data Fiduciary, designated by government; extra audit, DPIA and possible localisation duties [28]                                    |
| Eighth Schedule languages                  | Constitutionally scheduled languages in which DPDP notices must be offered on request [29]                                                       |

## 6. Cross-dimension insights

1. **The ComplianceEngine needs two consent ledgers, not one.** Telecom consent (registered on the
   operator's Consent Register, channel-level, 90-day re-consent block) and DPDP consent (notice +
   purpose + proof, revocable independently) have different sources, lifetimes and revocation paths
   [2][29]. A single "consented" flag would be wrong under both.
2. **Fast follow-up of inbound leads is the lawful sweet spot for the MVP.** TRAI's 7-day inquiry window [2]
   and DPDP s.7(a) for voluntarily provided data [29] both favour calling people who just asked to be
   contacted. Purchased lists need registered telecom consent _and_ DPDP consent, which is costly to
   obtain. This fits the target persona (SMB sales teams following up leads) and argues for
   "speed-to-lead within 7 days, with evidence stored" as the core MVP journey.
3. **Campaign pacing is a compliance control, not just UX.** Operators' AI/ML spam flags key on call
   volume, short calls and low inbound ratios [1][2], abandoned/silent calls are regulated [4], and 3–5
   complaints in 10 days suspend the sender [2]. An AI agent that is slow to speak once the call is answered, hangs up
   fast or dials aggressively can get a tenant's entire telephony barred for 15 days. The engine needs per-tenant
   rate limits, answer-to-speech latency targets and a complaint-rate circuit breaker.
4. **Liability concentrates on the tenant; exposure concentrates on Nivomi.** Sanctions fall on the
   registered sender (the tenant) [1], and the CCPA draft adds liability for engagers and brands [18],
   but a platform-level aggregator registration [1][12] would expose Nivomi's shared resources to
   every tenant's behaviour. Tenant isolation must extend to telecom identities: separate sender
   registrations, CLI ranges and declarations per tenant.
5. **Data residency is a per-tenant policy, not a platform constant.** DPDP allows transfers today
   [28], but HubSpot, Clerk and Claude process outside India [54][61][63], while BFSI tenants — the
   segment TRAI regulates most tightly [8][9] — may be bound by sector localisation [42]. The
   LLMRouter and provider selection should honour a tenant-level "India-only" policy, which today
   points to OpenAI via Bedrock's `in.` profile or Azure regional deployments [55][58].
6. **Retention requirements converge on "at least a year, then delete".** Together, DPDP Rule 8(3)
   (at least 1 year of data and logs) [28], CERT-In (180 days of ICT logs in India) [34], the CCPA
   draft (180 or 365 days of consent and opt-out records) [18] and Exotel's defaults (recordings 90
   days, call records 1 year) [47] call for one retention matrix per data class.

## 7. Contrary evidence

The red-team pass (fresh-context skeptics, no supporting evidence given) tested the main conclusions.

- **"All AI follow-up calls are promotional" — weakened.** A call with no promotional content that
  only facilitates an ongoing purchase, made with 7-day explicit consent, is a Service Voice Call and
  outside UCC [1]. MyOperator argued to TRAI that treating follow-ups to customer inquiries as UCC
  creates a "regulatory paradox" [14]. _Weighed:_ the mixed-content rule makes any real sales pitch
  promotional [1][6], and TRAI kept the inquiry basis only as a 7-day inferred-consent window [2].
  The conclusion stands for sales and qualification calls; appointment confirmation for an ongoing
  purchase can be a service call.
- **"10-digit numbers are barred for all commercial calls" — weakened for non-promotional calls.**
  TRAI's 2025 memorandum says no special series had earlier been mandated for service calls, and
  1600 is mandated only for BFSI and government [9][15]. _Weighed:_ reg 3(1) requires registered
  headers or special series for commercial communication [1], and the 2026 memorandum names 1601xx
  for other sectors [2]. Treat 10-digit numbers as not permitted; confirm with counsel.
- **"AI agents are A2P/robo calls" — survives, with an edge case.** The definitions hinge on
  "without direct human dialling" and no human "on calling side participating in the dialogue"
  [2][4]; the sender of a human-dialled or human-supervised call could argue that it falls outside.
  MyOperator asked TRAI to exclude consented service-type AI calls from bulk-A2P treatment [14]; the
  outcome is unknown. _Weighed:_ fully automated outbound campaigns are squarely inside.
- **"No fixed calling window" — true for TRAI only.** A vendor source reports RBI's fixed
  08:00–19:00 window for debt collection [17] (low). _Weighed:_ sector overlays are needed.
- **"No AI-disclosure duty" — survives, with a forward risk.** _Weighed:_ nothing binding was found,
  but sector identity-disclosure duties and consumer-protection misrepresentation rules could still reach an
  AI that implies it is human [17] (low).
- **"Nivomi is a processor" — weakened.** Actual control, not the contract label, decides the role
  [38]. _Weighed:_ secondary use of call data makes Nivomi a fiduciary for that use.
- **"Cross-border transfer is permitted" — weakened.** _Weighed:_ sector localisation (SEBI [42];
  IRDAI, low confidence) survives DPDP, and Rule 13(4)/Rule 15 orders can add restrictions [28][32].
- **"DPDP binds from May 2027" — survives.** No acceleration was notified [32][41]. _Weighed:_ MeitY has
  shown intent to compress timelines, so treat May 2027 as a planning date, not a guarantee.

## 8. Recommendations

Each recommendation names the artifact that consumes it.

**R1 — ADR-014 / India rule set v1 (ComplianceEngine).** Encode these as versioned rule data with
effective dates (Third Amendment dates computed from the Gazette date once known):

| Rule                | Behaviour                                                                                                                                                                                                    | Basis / confidence                                                    |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| Call category       | Classify every campaign as promotional, service or transactional; any sales content → promotional                                                                                                            | [1][6] high                                                           |
| Number series       | Promotional → 140xx only; service/transactional → 1601xx (1600xx for BFSI tenants); block ordinary numbers for promotional calls, and treat them as not permitted for other commercial calls pending counsel | [1][2][8] high for promotional / medium otherwise                     |
| Sender registration | Block calling until the tenant's DLT sender registration and annual self-certification are recorded                                                                                                          | [1] high                                                              |
| A2P declaration     | Block calling from any number not in the tenant's declared A2P CLI ranges                                                                                                                                    | [1][2] high                                                           |
| Preferences         | Check NCPR status, category blocks and time bands; default promotional window 10:00–21:00 recipient-local                                                                                                    | [1][4] medium                                                         |
| Consent basis       | Allow promotional calls to blocked numbers only with registered explicit consent; treat the 7-day inquiry window as inferred consent that does **not** override DND until counsel confirms                   | [2] medium                                                            |
| Inquiry evidence    | Store timestamp, source, payload and number for every inquiry; expire eligibility at 7 days (3 months for applications)                                                                                      | [2] 7 days high; 3 months medium; evidence fields are a design choice |
| Opt-out             | In-call opt-out → immediate DNC for the tenant, TRAI revocation path, 90-day re-consent block                                                                                                                | [1][7] high                                                           |
| Complaint breaker   | Pause a tenant's campaign well before it reaches 3 complaints in 10 days, and immediately on any AI flag on its numbers                                                                                      | [2][5] high                                                           |
| AI disclosure       | Audible AI disclosure at call start, on by default; tenants may strengthen but not remove it                                                                                                                 | [18][19] draft                                                        |
| Recording notice    | Announce recording at call start; record only when the tenant has approved the notice wording and the legal basis                                                                                            | [29] medium                                                           |
| Sector overlays     | BFSI series and calling-hour overlays per tenant sector (RBI collections window to be verified)                                                                                                              | [8][17] low-medium                                                    |
| Fail closed         | Unknown category, series, registration, consent basis or jurisdiction → BLOCKED or REQUIRES_REVIEW                                                                                                           | ADR-014                                                               |

**R2 — PRD constraints.**

- Make the MVP journey **inbound-lead follow-up**: leads carry a consent basis (inquiry, application,
  registered consent, existing customer) with evidence; imports without a basis are not callable.
  (Insight 2; [2][29][36], medium.)
- Tenant onboarding captures DLT sender ID, telemarketer binding, 140xx/1601xx numbers and the A2P
  declaration before any call ([1][2], high).
- Notices in English plus the five launch languages; data-subject request handling within 90 days;
  breach workflow covering CERT-In 6 hours and DPDP 72 hours ([28][29][34], high).
- Human handoff designed around Exotel's end-of-stream Passthru → Connect pattern until Exotel
  confirms mid-stream transfer ([50], medium).

**R3 — Architecture constraints.**

- Two consent ledgers (telecom, DPDP) with independent revocation; append-only evidence store
  (Insight 1).
- Per-tenant telecom identity (sender registration, CLI ranges, declarations) — tenant isolation
  extends to numbers (Insight 4).
- Tenant residency policy consumed by LLMRouter and provider selection; "India-only" routes to
  in-country options [55][58] (Insight 5).
- Retention matrix per data class (≥1 year data and logs, CERT-In ICT logs 180 days in India,
  recordings per tenant policy) [28][34]; NTP sync to NIC/NPL [34] (Insight 6).
- No training or cross-tenant reuse of call data by Nivomi or its processors by default [38][52].

**R4 — Business and legal actions before building the telephony epic.**

- Written answers from **Exotel**: its DLT role (delivery telemarketer?), whether Nivomi must
  register as aggregator, 140xx/1601xx provisioning, A2P declaration handling, DND filtering
  default, outbound Voicebot support, mid-stream transfer, DPA for non-enterprise accounts.
- Signed **Sarvam** DPA with no-training and retention terms, and India-only processing if available.
- Indian telecom and privacy counsel to confirm: telemarketer registration, inquiry window vs DND,
  AI-call classification, recording basis, and the Nivomi processor/fiduciary position.
- Watch the re-check triggers listed under the [Staleness map](#11-staleness-map).

## 9. Open questions

| Question                                                                                            | What would answer it                                         |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Must Nivomi register as a telemarketer (aggregator), or can it operate under Exotel's registration? | Exotel written answer; operator DLT FAQ post-2025; counsel   |
| Gazette date of the Third Amendment (sets +30/+60/+90 day effective dates)                          | eGazette search; TRAI notification                           |
| Does the 7-day inquiry "Relationship" allow promotional calls to DND-registered numbers?            | TRAI 2(ah) inferred-consent text / Code of Practice; counsel |
| Is 1601xx mandatory for non-BFSI service calls, and how is it provisioned?                          | TRAI PR 113/2026 (not fetched); DoT allotment order; Exotel  |
| Numeric abandoned/silent-call limits                                                                | Operator Codes of Practice on TRAI's site                    |
| Is the CCPA draft official, and will it bind registered 140xx senders?                              | DoCA/CCPA notice; final guidelines                           |
| Is participant call recording lawful without consent, and what notice suffices?                     | Top-tier firm opinion; counsel                               |
| Does verbal or IVR consent satisfy DPDP s.6(1) and Rule 3?                                          | MeitY FAQ; Board guidance; counsel                           |
| Sarvam training default and DPA terms                                                               | Sarvam DPA; written confirmation                             |
| Current Gemini residency, and Azure Central India availability (not established)                    | Provider docs re-check                                       |
| RBI/IRDAI calling windows and recording disclosure rules for BFSI tenants                           | Primary RBI/IRDAI texts                                      |

## 10. Source appendix

| [n]  | Supports                                                                                                        | Publisher                                                                                                                                                                                                | Pub date   | Accessed   | Confidence         |
| ---- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ---------- | ------------------ |
| [1]  | TCCCPR Second Amendment text and memorandum: categories, reg 3/4/22/25, NCPR, consent, sanctions                | [TRAI](https://trai.gov.in/sites/default/files/2025-02/Regulation_12022025.pdf)                                                                                                                          | 2025-02-12 | 2026-09-25 | high               |
| [2]  | Third Amendment (05 of 2026): A2P, declaration, inquiry window, legacy consent, series, sanctions, commencement | [TRAI](https://www.trai.gov.in/sites/default/files/2026-09/Regulation_18092026.pdf)                                                                                                                      | 2026-09-18 | 2026-09-25 | high               |
| [3]  | Third Amendment adopted; A2P definition                                                                         | [TRAI press release 119/2026](https://www.trai.gov.in/sites/default/files/2026-09/PR_No119of2026.pdf)                                                                                                    | 2026-09-18 | 2026-09-25 | high               |
| [4]  | Draft Third Amendment and consolidated TCCCPR: robo-call definition, time bands, abandoned calls                | [TRAI consultation](https://www.trai.gov.in/sites/default/files/2026-03/Draft_CP_13032026_0.pdf)                                                                                                         | 2026-03-13 | 2026-09-25 | medium             |
| [5]  | Third Amendment coverage: not yet notified, timelines, series protection, thresholds                            | [MediaNama](https://www.medianama.com/2026/09/223-trai-truecaller-140-1600-calls-spam-rules/)                                                                                                            | 2026-09-19 | 2026-09-25 | high               |
| [6]  | Second Amendment analysis: 140/1600, mixed content, 7-day complaints, robo-call notice                          | [Khaitan & Co](https://www.khaitanco.com/thought-leadership/Efforts-to-Curb-Spam-Continue-TRAI-Releases-Second-Amendment-to-the-TCCCPR-2018)                                                             | 2025-04-02 | 2026-09-25 | high               |
| [7]  | Sanctions, 90-day re-consent, 7-day service consent                                                             | [Sigma Chambers](https://www.sigmachambers.in/post/2025-tcccpr-amendments-a-renewed-push-by-trai-for-order-in-commercial-communications-1)                                                               | 2025-04-03 | 2026-09-25 | medium             |
| [8]  | 1600-series mandate for RBI/SEBI/PFRDA entities                                                                 | [TRAI press release 135/2025](https://trai.gov.in/notifications/press-release/trai-issues-direction-mandating-phase-wise-adoption-1600-series-bfsi)                                                      | 2025-11-19 | 2026-09-25 | high               |
| [9]  | 1600-series phased dates                                                                                        | [Legitpro Law via Mondaq](https://www.mondaq.com/india/telecoms-mobile-cable-communications/1764274/trais-1600-series-mandate-for-bfsi-regulatory-data-protection-and-customer-communication-risks)      | 2026-03-25 | 2026-09-25 | medium             |
| [10] | 1,150 blacklisted, 18.8 lakh resources disconnected                                                             | [IANS](https://ianslive.in/telcos-blacklist-1150-entities-disconnect-over-188-lakh-resources-centre--20250319155404)                                                                                     | 2025-03-19 | 2026-09-25 | medium             |
| [11] | Same enforcement figures                                                                                        | [MediaNama](https://www.medianama.com/2025/03/223-1150-entities-blacklisted-18-8-lakh-numbers-disconnected-after-spam-regulation-amendments/)                                                            | 2025-03    | 2026-09-25 | medium             |
| [12] | Principal entity and telemarketer roles, registration duties                                                    | [Tata Teleservices DLT FAQ](https://www.tatatelebusiness.com/pdf/dlt/FAQ.pdf)                                                                                                                            | 2023-06-06 | 2026-09-25 | medium             |
| [13] | Commercial calls must use designated headers or series                                                          | [S.S. Rana via Chambers](https://chambers.com/articles/trai-s-crackdown-on-spam-calls-and-ai-driven-telemarketing)                                                                                       | 2026-03-16 | 2026-09-25 | medium             |
| [14] | Industry pushback on inquiry removal and AI-call A2P treatment                                                  | [MyOperator submission to TRAI](https://www.trai.gov.in/sites/default/files/2026-04/MyOperator_Response_TCCCPR_3rd_Amendment_2026_v2.pdf)                                                                | 2026-04-19 | 2026-09-25 | high (as position) |
| [15] | TRAI clarification on designated number series                                                                  | [MediaNama](https://www.medianama.com/2026/07/223-trai-releases-clarification-designated-promotional-transactional-number-series/)                                                                       | 2026-07-13 | 2026-09-25 | medium             |
| [16] | Third Amendment coverage: A2P, declaration, inquiry window, legacy consent, charge                              | [tele.net](https://tele.net.in/national-news/trai-amends-telecom-commercial-communications-customer-preference-regulations-2018-12557685)                                                                | 2026-09-21 | 2026-09-25 | medium             |
| [17] | RBI collection-call window; sector identity disclosure                                                          | [Caller Digital](https://www.caller.digital/blog/voice-ai-india-regulatory-map-2026)                                                                                                                     | 2026-06-04 | 2026-09-25 | low                |
| [18] | CCPA 2026 draft full text                                                                                       | [CCPA draft via MediaNama](https://www.medianama.com/wp-content/uploads/2026/09/Draft-of-Guidelines-for-Prevention-and-Regulaation-of-Pesky-Promotional-and-Unsolicited-Commercial-Communications-1.pdf) | 2026-09    | 2026-09-25 | medium             |
| [19] | CCPA draft coverage: AI disclosure, consent, cooling-off, enforcement                                           | [MediaNama](https://www.medianama.com/2026/09/223-ccpa-draft-guidelines-spam-ai-promotions/)                                                                                                             | 2026-09-24 | 2026-09-25 | high               |
| [20] | CCPA draft coverage                                                                                             | [Adgully](https://www.adgully.com/post/20560/ccpa-drafts-strict-rules-to-curb-pesky-calls-ott-ads-and-ai-marketing)                                                                                      | 2026-09    | 2026-09-25 | medium             |
| [21] | IT Rules 2026: synthetic content definition and audio disclosure for intermediaries                             | [Khaitan & Co](https://www.khaitanco.com/thought-leadership/MeitY-notifies-the-IT-Amendment-Rules-2026)                                                                                                  | 2026-02-16 | 2026-09-25 | medium-high        |
| [22] | IT Rules 2026 gazette date (G.S.R. 120(E))                                                                      | [Gazette Tracker](https://gazettetracker.com/g/CG-DL-E-10022026-269993)                                                                                                                                  | 2026-02-10 | 2026-09-25 | high               |
| [23] | Vibhor Garg v. Neha judgment                                                                                    | [Indian Kanoon](https://indiankanoon.org/doc/5779829/)                                                                                                                                                   | 2025-07-14 | 2026-09-25 | high               |
| [24] | Vibhor Garg holding (admissibility)                                                                             | [Supreme Court Observer](https://www.scobserver.in/supreme-court-observer-law-reports-scolr/evidentiary-value-of-secretly-recorded-phone-calls-between-spouses-in-marital-disputes-vibhor-garg-v-neha/)  | 2025       | 2026-09-25 | medium             |
| [25] | Telecom Act 2023 commencement; s.20 and s.28 content                                                            | [AZB & Partners](https://www.azbpartners.com/wp-content/uploads/2024/06/Update-Staggered-Enforcement-of-Telecommunications-Act-2023.pdf)                                                                 | 2024-06-25 | 2026-09-25 | high               |
| [26] | Telecom Act 2023 commencement                                                                                   | [Trilegal](https://trilegal.com/knowledge_repository/trilegal-update-government-notifies-sections-of-the-telecommunications-act-2023/)                                                                   | 2024-07-26 | 2026-09-25 | medium             |
| [27] | 2024 draft guidelines on unsolicited business communication                                                     | [News On Air](https://www.newsonair.gov.in/government-invites-public-feedback-on-draft-guidelines-for-prevention-and-regulation-of-unsolicited-and-unwarranted-business-communication-2024)              | 2024-06-20 | 2026-09-25 | medium             |
| [28] | DPDP Rules 2025: commencement, notice, security, breach, retention, SDF, transfer                               | [MeitY / Gazette of India](https://www.meity.gov.in/static/uploads/2025/11/53450e6e5dc0bfa85ebd78686cadad39.pdf)                                                                                         | 2025-11-13 | 2026-09-25 | high               |
| [29] | DPDP Act 2023: roles, notice, consent, legitimate uses, exclusions, erasure, children                           | [MeitY / Gazette of India](https://www.meity.gov.in/static/uploads/2024/06/2bf1f0e9f04e6fb4f8fef35e82c42aa5.pdf)                                                                                         | 2023-08-11 | 2026-09-25 | high               |
| [30] | DPDP Rules backgrounder: phasing, notice, breach, penalties                                                     | [PIB](https://static.pib.gov.in/WriteReadData/specificdocs/documents/2025/nov/doc20251117695301.pdf)                                                                                                     | 2025-11-17 | 2026-09-25 | high               |
| [31] | DPDP commencement dates, retention, security analysis                                                           | [Shardul Amarchand Mangaldas](https://www.amsshardul.com/insight/enforcement-of-the-dpdp-act-and-notification-of-the-dpdp-rules/)                                                                        | 2025-11-21 | 2026-09-25 | medium-high        |
| [32] | January 2026 acceleration proposal; no SDF or transfer orders                                                   | [S.S. Rana & Co.](https://ssrana.in/articles/meity-plans-to-cut-short-dpdp-compliance-timeline-and-notify-cross-border-restrictions-for-sdfs/)                                                           | 2026-02-13 | 2026-09-25 | medium             |
| [33] | Data Protection Board unstaffed; penalties                                                                      | [LiveLaw](https://www.livelaw.in/articles/india-data-protection-board-established-law-543751)                                                                                                            | 2026-08-01 | 2026-09-25 | medium             |
| [34] | CERT-In Directions: 6-hour reporting, 180-day logs in India, NTP                                                | [CERT-In](https://www.cert-in.org.in/PDF/CERT-In_Directions_70B_28.04.2022.pdf)                                                                                                                          | 2022-04-28 | 2026-09-25 | high               |
| [35] | Publicly-available-data exclusion scope                                                                         | [IAPP](https://iapp.org/news/a/scraping-public-data-in-india-innovation-enabler-or-privacy-threat-)                                                                                                      | 2025-10-30 | 2026-09-25 | medium-high        |
| [36] | Telemarketing consent under DPDP; outsourced-caller liability                                                   | [AMLEGALS](https://amlegals.com/telemarketing-consent-in-india-what-the-dpdp-act-means-for-businesses/)                                                                                                  | 2026-08-12 | 2026-09-25 | medium             |
| [37] | Burden of proof and consent records; no guidance on voice consent                                               | [King Stubb & Kasiva](https://ksandk.com/data-protection-and-data-privacy/dpdp-act-consent-rules/)                                                                                                       | 2026-07-27 | 2026-09-25 | medium             |
| [38] | Vendor autonomy can make a processor a fiduciary                                                                | [AZB & Partners](https://www.azbpartners.com/bank/data-fiduciary-versus-data-processor-an-identity-crisis/)                                                                                              | 2023-12-05 | 2026-09-25 | medium             |
| [39] | Self-published professional data may fall outside DPDP                                                          | [India Briefing](https://www.india-briefing.com/news/india-dpdp-act-publicly-available-personal-data-46899.html)                                                                                         | 2026-09-10 | 2026-09-25 | medium             |
| [40] | Supreme Court notice on DPDP challenges; no stay                                                                | [Supreme Court Observer](https://www.scobserver.in/reports/challenge-to-dpdp-amendment-of-rti-bench-refuses-to-stay-amendment-issues-notice/)                                                            | 2026-02    | 2026-09-25 | medium-high        |
| [41] | DPDP implementation tracker: corrigendum only, no transfer list                                                 | [Recording Law](https://www.recordinglaw.com/world-laws/world-data-privacy-laws/india-data-privacy-laws/dpdp-act-implementation-status/)                                                                 | 2026-07-23 | 2026-09-25 | medium             |
| [42] | SEBI localisation for regulated entities                                                                        | [MediaNama](https://www.medianama.com/2023/03/223-sebi-mandates-data-loclisation-regulated-entities/)                                                                                                    | 2023-03    | 2026-09-25 | medium             |
| [43] | Exotel KYC documents and region restriction                                                                     | [Exotel docs](https://docs.exotel.com/business-phone-system/kyc-verification)                                                                                                                            | 2026-07-29 | 2026-09-25 | medium             |
| [44] | Exotel: DLT only for SMS (undated, conflicts with TRAI)                                                         | [Exotel developer FAQ](https://developer.exotel.com/docs/faqs/dlt-compliance)                                                                                                                            | undated    | 2026-09-25 | low                |
| [45] | Exotel TCCCPR responsibilities; 9–21 window (2018 framing)                                                      | [Exotel developer FAQ](https://developer.exotel.com/docs/faqs/tcccpr-2018)                                                                                                                               | undated    | 2026-09-25 | low-medium         |
| [46] | Exotel NDNC/DND filtering                                                                                       | [Exotel developer FAQ](https://developer.exotel.com/docs/faqs/ndnc-dnd)                                                                                                                                  | undated    | 2026-09-25 | medium-low         |
| [47] | Exotel data region, retention, deletion, DPA                                                                    | [Exotel developer FAQ](https://developer.exotel.com/docs/faqs/data-privacy)                                                                                                                              | undated    | 2026-09-25 | medium             |
| [48] | Exotel AgentStream WebSocket protocol                                                                           | [Exotel developer docs](https://developer.exotel.com/docs/agentstream/websocket-protocol)                                                                                                                | undated    | 2026-09-25 | medium-high        |
| [49] | Voicebot applet enablement, known issues, 60-minute cap                                                         | [Exotel support](https://support.exotel.com/support/solutions/articles/3000108630)                                                                                                                       | 2025-09-16 | 2026-09-25 | medium-high        |
| [50] | Voicebot end-of-stream handoff via Passthru                                                                     | [Exotel support (Beta)](https://support.exotel.com/support/solutions/articles/3000132302)                                                                                                                | 2025-07-21 | 2026-09-25 | medium             |
| [51] | Exotel 140/160 guidance (pre-2025 amendment)                                                                    | [Exotel blog](https://exotel.com/blog/decoding-new-calling-regulations-of-140-160-calling/)                                                                                                              | 2024-11-19 | 2026-09-25 | low                |
| [52] | Sarvam training opt-out default, retention, transfers                                                           | [Sarvam privacy policy](https://www.sarvam.ai/privacy-policy)                                                                                                                                            | 2026-07-29 | 2026-09-25 | high (as text)     |
| [53] | Sarvam processor role, consent-based training, prohibited uses, liability                                       | [Sarvam terms of service](https://www.sarvam.ai/terms-of-service)                                                                                                                                        | 2026-07-29 | 2026-09-25 | medium             |
| [54] | Claude on Bedrock India: Global endpoint only                                                                   | [Anthropic docs](https://platform.claude.com/docs/en/build-with-claude/claude-in-amazon-bedrock)                                                                                                         | 2026-09    | 2026-09-25 | high               |
| [55] | OpenAI GPT-5.6 India geo profile; Bedrock zero retention                                                        | [AWS ML blog](https://aws.amazon.com/blogs/machine-learning/introducing-openai-models-on-amazon-bedrock-for-in-country-inferencing-in-india/)                                                            | 2026-08-27 | 2026-09-25 | medium             |
| [56] | Claude in India via Global cross-region inference                                                               | [AWS ML blog](https://aws.amazon.com/blogs/machine-learning/access-anthropic-claude-models-in-india-on-amazon-bedrock-with-global-cross-region-inference/)                                               | 2026-03-09 | 2026-09-25 | medium             |
| [57] | Bedrock: providers have no access to prompts                                                                    | [AWS docs](https://docs.aws.amazon.com/bedrock/latest/userguide/data-protection.html)                                                                                                                    | undated    | 2026-09-25 | high               |
| [58] | Azure South India model availability by deployment type                                                         | [Microsoft Learn](https://learn.microsoft.com/en-us/azure/foundry/foundry-models/concepts/models-sold-directly-by-azure-region-availability)                                                             | 2026-09-03 | 2026-09-25 | medium-high        |
| [59] | Azure data privacy: no training, data at rest in geography                                                      | [Microsoft Learn](https://learn.microsoft.com/en-us/azure/foundry/responsible-ai/openai/data-privacy)                                                                                                    | 2026-06-05 | 2026-09-25 | medium-high        |
| [60] | Vertex AI asia-south1 model list                                                                                | [Google Cloud docs](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/learn/data-residency)                                                                                                     | undated    | 2026-09-25 | low                |
| [61] | HubSpot data centres (no India)                                                                                 | [HubSpot](https://www.hubspot.com/data-centers)                                                                                                                                                          | undated    | 2026-09-25 | medium             |
| [62] | Razorpay DPDP processor framing                                                                                 | [Razorpay privacy policy](https://razorpay.com/privacy-policy/agent-studio-slash/)                                                                                                                       | undated    | 2026-09-25 | low-medium         |
| [63] | Clerk US-only hosting and DPA                                                                                   | [Clerk DPA](https://clerk.com/legal/dpa)                                                                                                                                                                 | undated    | 2026-09-25 | medium             |
| [64] | Anthropic API inference geography                                                                               | [Anthropic docs](https://platform.claude.com/docs/en/manage-claude/data-residency)                                                                                                                       | undated    | 2026-09-25 | medium             |
| [65] | OpenAI API India data residency                                                                                 | [OpenAI help centre](https://help.openai.com/en/articles/10503543-data-residency-for-the-openai-api)                                                                                                     | undated    | 2026-09-25 | medium             |

## 11. Staleness map

Computed with `recon_kit.py staleness` (windows in months: regulatory 3, gatekeeper-policy 6,
enforcement 12, quantitative 12, case-law 24), measured from each source's publication date.

Reading this table: the regulatory claims marked "yes" rest on instruments older than the
3-month window, but their **current status was re-verified in this run (2026-09-25)**. Treat
2026-12-25 as the latest date for a full Refresh, and re-check sooner on any of these events:

- TRAI Third Amendment published in the Gazette (sets its +30/+60/+90-day effective dates).
- CCPA publishes final unsolicited-communication guidelines.
- DPDP Consent Manager phase (~13 Nov 2026) or any DPDP Rules amendment or SDF notification.
- Written answers from Exotel or Sarvam (resolve the disputed provider claims).

| Re-check by | Past window? | Class             | Claim                                                                                                                                                                                 | Source |
| ----------- | ------------ | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 2022-07-01  | yes          | regulatory        | CERT-In: 6-hour incident reporting; 180-day ICT logs retained in India; NTP sync                                                                                                      | [34]   |
| 2023-09-01  | yes          | regulatory        | A multi-tenant calling platform may need registered telemarketer (aggregator) status (inference)                                                                                      | [12]   |
| 2023-11-01  | yes          | regulatory        | Calling purchased/third-party lists needs DPDP consent; follow-up of own inquiry may rely on s.7(a) (inference)                                                                       | [29]   |
| 2024-03-01  | yes          | regulatory        | Nivomi is a processor for tenant lead data only absent own-purpose reuse; vendor autonomy may make it (joint) fiduciary                                                               | [38]   |
| 2025-05-01  | yes          | regulatory        | AI sales/lead-qualification calls, incl. prospects who inquired but have not bought, are Promotional Voice Calls; mixed content makes a call promotional; promotional only from 140xx | [1]    |
| 2025-07-01  | yes          | regulatory        | 7-day complaint window; written advance notice of auto-dialer/robo-call use required since early 2025                                                                                 | [6]    |
| 2026-01-01  | yes          | gatekeeper-policy | Exotel voicebot human handoff documented only after stream ends (Passthru -> Connect)                                                                                                 | [50]   |
| 2026-02-01  | yes          | regulatory        | 1600-series mandatory for RBI/SEBI/PFRDA-regulated entities, phased Jan-Mar 2026                                                                                                      | [8]    |
| 2026-02-01  | yes          | regulatory        | DPDP Rules core obligations commence ~13/14 May 2027; Consent Managers ~Nov 2026                                                                                                      | [28]   |
| 2026-03-01  | yes          | quantitative      | 1,150 senders blacklisted and 18.8 lakh resources disconnected by 19 Mar 2025                                                                                                         | [10]   |
| 2026-04-01  | yes          | enforcement       | First violation bars all sender resources 15 days; repeat -> 1-year disconnection and blacklisting                                                                                    | [7]    |
| 2026-05-01  | yes          | regulatory        | IT Rules 2026 synthetic-audio disclosure binds intermediaries; no telephony application found                                                                                         | [21]   |
| 2026-05-01  | yes          | regulatory        | Jan 2026 acceleration proposal targeted SDFs and remained a consultation; no amendment notified                                                                                       | [32]   |
| 2026-06-01  | yes          | regulatory        | No statutory calling window; time bands 21:00-10:00 default OFF for promotional; service/transactional not time-blockable                                                             | [4]    |
| 2026-12-01  | no           | regulatory        | Third Amendment (05 of 2026) defines A2P incl. artificial voice; A2P CLI ranges must be declared and recorded on DLT; undeclared A2P = UCC; adopted 18 Sep 2026, not yet gazetted     | [2]    |
| 2026-12-01  | no           | regulatory        | Written/digital inquiry creates a 7-day Relationship (inferred consent), kept verifiable; DND override not stated                                                                     | [16]   |
| 2026-12-01  | no           | regulatory        | CCPA 2026 working draft would require audible AI disclosure at call outset; official status and scope over registered 140xx senders unconfirmed                                       | [19]   |
| 2027-01-01  | no           | gatekeeper-policy | Sarvam trains on customer content unless opted out (privacy policy) vs consent-based (terms)                                                                                          | [52]   |
| 2027-02-01  | no           | gatekeeper-policy | India geo inference profile on Bedrock exists for OpenAI GPT-5.6 Terra/Luna                                                                                                           | [55]   |
| 2027-03-01  | no           | gatekeeper-policy | No India-only inference for Claude on Bedrock (Global endpoint only in ap-south-1/2)                                                                                                  | [54]   |
| 2027-03-01  | no           | gatekeeper-policy | HubSpot hosts data in US/EU/CA/AU only; no India option                                                                                                                               | [61]   |
| 2027-03-01  | no           | gatekeeper-policy | Exotel: voice needs no DLT (undated FAQ) vs TRAI registration rule for all commercial calls                                                                                           | [44]   |
| 2027-03-01  | no           | gatekeeper-policy | Exotel data stays in signup region (Mumbai/Singapore); recordings 90 days default; DPA enterprise-only                                                                                | [47]   |
| 2027-07-01  | no           | case-law          | Vibhor Garg v. Neha: secretly recorded calls admissible; lawfulness of participant recording not decided                                                                              | [23]   |
| 2027-09-01  | no           | enforcement       | Sender suspension at >=5 unique complaints in 10 days, or >=3 with an operator AI/ML flag                                                                                             | [5]    |

**Earliest re-check date: 2022-07-01** (14 of 25 claims are past their window by publication date).
