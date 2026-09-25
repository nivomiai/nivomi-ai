# D2 digest — AI / robocall rules and call recording (India), run r1-1

Researcher: D2 subagent · accessed 2026-09-25 · 14 tool calls, 5 sources read in full or in part
(TRAI regulation PDF, Khaitan & Co analysis, Indian Kanoon judgment text, plus search-result
snippets from PIB/TRAI index pages, Lexology/Chambers/IFF result listings, and law-blog listings).
Budget ran out before DPDP, the Telecommunications Act 2023 interception provisions and CCPA dark-pattern
guidance could be checked. Those gaps are listed under "Looked for, not found".

## Claims

1. TRAI notified the Telecom Commercial Communications Customer Preference (Second Amendment) Regulations, 2025 (1 of 2025) on 12 Feb 2025, amending TCCCPR 2018. Most clauses take effect 30 days after gazette publication; some (regs 8, 17, 20(a)(b), 21(b)) take effect after 60 days.
   - source: https://trai.gov.in/sites/default/files/2025-02/Regulation_12022025.pdf · publisher: TRAI · pub_date: 2025-02-12 · confidence: high · class: regulatory
   - two-source: confirmed by #? only partly. Search snippets (Securiti, PIB PRID=2102413 title "TRAI Strengthens Consumer Protection with Amendments to TCCCPR, 2018") corroborate the amendment and its date, but I did not read them in full → **single-source (primary)** for the clause detail.

2. The substituted Regulation 4 of TCCCPR says: "Every Sender shall notify the Originating Access Provider, in advance, about the use of Auto Dialer or Robo-Calls as well as the intended objective of such calls in writing."
   - source: TRAI Regulation_12022025.pdf (reg. 4 of the amendment) · publisher: TRAI · pub_date: 2025-02-12 · confidence: high · class: regulatory
   - two-source: corroborated by the frejun.com search snippet ("must disclose the use and intended purpose of auto dialer or robo-calls"). That is a vendor blog, so treat it as weak corroboration → **effectively single-source (primary)**.

3. In the explanatory memorandum, TRAI states its position that promotional auto-dialer/robo-calls should go through 140-series numbers only, and service/transactional ones through the 1600 series (allotted by DoT) or any other series allotted for that purpose. TRAI also concluded that "there does not seem to be a need presently for any separate regulation for the Auto-dialers or Robo-calls", apart from the pre-declaration duty in #2.
   - source: TRAI Regulation_12022025.pdf, Explanatory Memorandum paras 18, 50–52 · publisher: TRAI · pub_date: 2025-02-12 · confidence: high (that this is TRAI's stated position); medium (whether it is binding, because it sits in the explanatory memorandum and not in the operative clauses) · class: regulatory
   - two-source: the frejun.com snippet repeats "140 series for promotional calls and 1600 series for transactional and service calls" → single primary + weak secondary.

4. TCCCPR (as amended in 2025) defines a "Promotional Voice Call" as any voice commercial communication containing promotional material or advertisement of a product or service. Any commercial call that mixes in promotional content is treated as promotional. Such a call may be delivered only to subscribers who have not blocked that category in the Preference Register, or who have given consent in the Consent Register. Explicit digital consent overrides a registered block.
   - source: TRAI Regulation_12022025.pdf, amended cl. 2(av) · publisher: TRAI · pub_date: 2025-02-12 · confidence: high · class: definition
   - two-source: **single-source (primary)**.

5. The 2025 amendment defines a "Service Voice Call". It covers a call to the sender's existing customer about a product or service (no explicit consent needed), or a call made with explicit consent to facilitate or complete an ongoing transaction. That consent lasts seven days unless TRAI directs otherwise. A "Transactional Voice Call" must respond to a customer-initiated transaction within 30 minutes. Neither type may be promotional.
   - source: TRAI Regulation_12022025.pdf, amended cl. 2(bh), 2(bt) · publisher: TRAI · pub_date: 2025-02-12 · confidence: high · class: definition
   - two-source: **single-source (primary)**.

6. Under the 2025 amendment, a Sender not registered with an Access Provider "shall [not] make any commercial communication". If it does, all its telecom resources may be suspended or disconnected.
   - source: TRAI Regulation_12022025.pdf, amended reg. 3(2) · publisher: TRAI · pub_date: 2025-02-12 · confidence: high · class: regulatory
   - two-source: consistent with #7 (August 2024 direction on unregistered telemarketers) → confirmed in substance by #7.

7. On 13 Aug 2024, TRAI directed all Access Service Providers to stop promotional voice calls from unregistered senders/telemarketers using SIP/PRI or other telecom resources, and to migrate them to the DLT platform within one month. TRAI later reported more than 1,150 entities blacklisted and more than 18.8 lakh resources disconnected.
   - source: https://pib.gov.in/PressReleaseIframePage.aspx?PRID=2044818 (PIB, 2024-08-13) + https://www.pib.gov.in/PressReleseDetailm.aspx?PRID=2112743 · publisher: PIB/TRAI · confidence: medium. **Both PIB pages returned HTTP 403, so this claim rests only on search-engine snippets of these primary URLs.** Newsonair (AIR) carries a 2024-08-14 headline that corroborates it · class: enforcement
   - two-source: PIB snippet + newsonair.gov.in snippet → confirmed, but neither was read in full.

8. The 2025 amendment escalates penalties against a Sender found to have sent UCC after complaints from five or more unique recipients within 10 days. First violation: all the Sender's telecom resources, including PRI/SIP trunks, are barred for 15 days across all operators. Second and later violations: all resources are disconnected for one year, the Sender is blacklisted, and its devices are blocked for one year.
   - source: TRAI Regulation_12022025.pdf, amended reg. 25(5) (text around p.7) · publisher: TRAI · pub_date: 2025-02-12 · confidence: high · class: enforcement
   - two-source: **single-source (primary)**.

9. The only AI references in the TRAI 2025 amendment concern Access Providers using AI/ML to detect spam, robotic calls, auto-dialer calls and pre-recorded announcements (building on a TRAI direction of 13 Jun 2023). The text has no definition or rule specific to AI-generated or conversational AI voice calls. Whether a conversational AI agent is a "Robo-Call" is therefore not expressly settled. The instrument does not define "Robo-Call" either.
   - source: TRAI Regulation_12022025.pdf (full-text search for "artificial", "intelligence", "robo", "auto dialer") · publisher: TRAI · pub_date: 2025-02-12 · confidence: medium (absence finding within one instrument) · class: regulatory
   - two-source: **single-source**. The frejun.com snippet gives a definition ("Robo calls are made using an artificial or prerecorded voice … without human involvement on the calling side"), but I could not trace it to a primary TRAI definition this run. **Unverified belief:** an AI voice agent with no human on the calling side would fall within that description.

10. MeitY notified the Information Technology (Intermediary Guidelines and Digital Media Ethics Code) Amendment Rules, 2026 in February 2026, in force from 20 Feb 2026. They bring "synthetically generated information" (SGI) into intermediary due-diligence obligations.
    - source: https://www.khaitanco.com/thought-leadership/MeitY-notifies-the-IT-Amendment-Rules-2026 · publisher: Khaitan & Co · pub_date: 2026-02 · confidence: high (existence and effective date) · class: regulatory
    - two-source: confirmed by search listings from Lexology, Chambers, IFF and Chandhiok & Mahajan (all state 20 Feb 2026 effective). **Notification date conflicts** — see Leads.

11. The rules define SGI as audio, visual or audio-visual information created or altered artificially or algorithmically so that it appears real and indistinguishable from a natural person or real-world event. Text-only content, routine editing and accessibility tools are excluded.
    - source: Khaitan & Co (as #10) · confidence: medium (paraphrase from a secondary source; gazette text not read) · class: definition
    - two-source: **single-source** (secondary).

12. Under the 2026 IT Rules amendment, audio SGI must carry a "prominently prefixed audio disclosure". The obligation falls on intermediaries, with stricter duties for SSMIs and for intermediaries that enable creation or dissemination of SGI. The rule does not expressly cover non-intermediary businesses or live telephony calls.
    - source: Khaitan & Co (as #10) · confidence: medium · class: regulatory
    - two-source: the "platforms must label AI-generated content" point is corroborated by search snippets (Lexology, kankrishme). The **audio-prefix detail and the telephony scope are single-source**. Whether a SaaS voice-agent platform is itself an "intermediary" that enables SGI creation is **open** and not answered by any source read.

13. In Vibhor Garg v. Neha (2025 INSC 829, decided 14 Jul 2025, Nagarathna and S.C. Sharma JJ.), the Supreme Court held that a spouse's secretly recorded phone conversations are admissible in matrimonial proceedings. It applied R.M. Malkani's test (relevance, voice identification, accuracy) and said the right to privacy "cannot be absolute". The Court did not rule on whether a party may lawfully record a call, and the judgment does not discuss the Telegraph Act.
    - source: https://indiankanoon.org/doc/5779829/ · publisher: Indian Kanoon (SC judgment text) · pub_date: 2025-07-14 · confidence: high · class: case-law
    - two-source: confirmed by search listings from SC Observer, Verdictum and Lexology (same holding and date).

14. The judgment text includes the statement that "the constitutional right to privacy under Article 21 is limited to the relationship between the citizen and the State" (para 11.2, citing Puttaswamy). This points to Article 21 privacy not directly binding a private party who records its own call. This extraction was done by a summarising fetch tool, so the attribution (Court's holding vs. an argument recorded) needs a manual check.
    - source: Indian Kanoon (as #13) · confidence: low–medium · class: case-law
    - two-source: **single-source**.

15. Several secondary web sources claim that recording calls without consent is "illegal" in India under Article 21 and IT Act ss. 66/72. They cite PUCL v. Union of India and Sanjay Pandey v. ED (Delhi HC, 2023). These sources are low-quality blogs or answer engines. PUCL concerned state telephone tapping, and IT Act s.72 applies to persons holding powers under the Act. The claim conflicts with #13–14 and is **not accepted** as a finding.
    - source: search listing (ksandk.com, lawrato.com, restthecase.com, medium.com) · confidence: low · class: case-law (disputed)
    - two-source: multiple low-grade sources recycling one narrative → **downgraded**.

## Glossary

- **TCCCPR 2018** — Telecom Commercial Communications Customer Preference Regulations, 2018 (6 of 2018). TRAI's UCC framework, amended 12 Feb 2025. (TRAI Regulation_12022025.pdf)
- **Sender** — the entity (principal) on whose behalf commercial communication is made. It must register with an Access Provider. (TRAI Regulation_12022025.pdf, reg. 3(2))
- **OAP** — Originating Access Provider, the telecom operator whose network the call starts from. It is the one the Sender must tell about auto-dialer/robo-call use. (ibid., reg. 4)
- **Promotional Voice Call** — voice commercial communication containing promotional material or an advertisement. Mixing in promotional content makes the whole call promotional. (ibid., cl. 2(av))
- **Service / Transactional Voice Call** — non-promotional calls to existing customers, or calls linked to a transaction within 30 minutes / under seven-day explicit consent. (ibid., cl. 2(bh), 2(bt))
- **UCC** — Unsolicited Commercial Communication: commercial communication that matches neither the recipient's consent nor their registered preferences. (ibid., cl. 2(bw))
- **140 / 1600 series** — number series for promotional calls and for service/transactional calls respectively. (ibid., Explanatory Memorandum paras 18, 50)
- **DLT** — distributed-ledger platform on which senders, telemarketers, headers and consent are registered. (PIB snippet PRID=2044818)
- **DCA** — Digital Consent Acquisition platform for explicit digital consent. (ibid., EM para 140)
- **SGI** — synthetically generated information under the IT Rules as amended in 2026. (Khaitan & Co)

## Leads

**Contradictions**

- C1. **IT Amendment Rules 2026 notification date:** Khaitan & Co says 16 Feb 2026; the search-engine synthesis (from Lexology/Chambers listings) says 10 Feb 2026. Both say it came into force on 20 Feb 2026. Resolve from the egazette.gov.in notification.
- C2. **Legality of party recording:** low-grade blogs say recording without consent is "illegal" (#15). The Supreme Court in Vibhor Garg treats such recordings as admissible and describes Article 21 privacy as a right against the State (#13–14). No source read decides whether a party's recording is _lawful_ (as opposed to admissible). Also missing: DPDP Act 2023 notice/consent for recording as processing of personal data — not researched this run, and likely the decisive rule for a business.
- C3. **Binding force of number-series rule:** the 140/1600 mandate for robo-calls appears in TRAI's explanatory memorandum (#3). I did not find it in the operative clauses that were read. Check the operative regulation text or the DoT allotment orders.

**New threads (priority order)**

1. DPDP Act 2023 + DPDP Rules 2025: does recording, transcribing and summarising a call need notice and consent? Is the business customer the Data Fiduciary and the platform a Processor? What are the phased commencement dates (verify current status as of 2026-09)?
2. Is a conversational AI voice agent a "Robo-Call"? Look for a TRAI definition in the principal 2018 regulation or TRAI FAQs/consultations (for example CP_28082024.pdf, a TRAI consultation paper dated 28 Aug 2024 that appeared in results). Also check whether TRAI or DoT issued anything on AI or synthetic-voice calls in 2025–2026.
3. Telecommunications Act 2023, s.20 (interception) and Telegraph Act s.5(2): confirm these reach only interception by third parties / the government, not a participant's own recording. Also check the IT Act 2000 s.72 scope.
4. IT Rules 2026: gazette text for the audio-prefix rule, and whether a voice-AI SaaS counts as an "intermediary" that enables SGI creation.
5. CCPA Guidelines for Prevention and Regulation of Dark Patterns, 2023; Consumer Protection Act 2019 unfair trade practice; BNS 2023 impersonation/cheating-by-personation provisions for voice-cloning risk.
6. Sectoral: RBI, IRDAI and SEBI rules on telemarketing, call recording and AI in customer communication (for BFSI tenants).

## Looked for, not found

- **TRAI rule specific to AI-generated or conversational-AI voice calls:** full-text search of the 12 Feb 2025 TCCCPR amendment for "artificial", "intelligence", "robo" and "auto dialer" found AI mentioned only as a detection tool for operators. No AI-call rule. No separate TRAI or DoT instrument on AI calls surfaced in searches (queries: "TRAI robocalls auto-dialer directions 2024"; "TRAI direction 13 August 2024 unregistered telemarketers SIP PRI"). Other instruments were not exhaustively checked.
- **Indian legal requirement to tell a telephone call recipient they are talking to an AI:** none found. The only AI-disclosure rule found (IT Rules 2026 audio-SGI prefix) targets intermediaries and online content, not telephony (#12). Not verified against the gazette text.
- **A primary TRAI definition of "Robo-Call" / "Auto Dialer":** not in the 2025 amendment text. The 2018 principal regulation was not read.
- **Mandatory "this call may be recorded" rule:** not found in any source read. Not searched specifically (budget).
- **Not researched (budget exhausted):** DPDP Act/Rules; Telecommunications Act 2023 interception provisions; CCPA dark-patterns guidelines; RBI/SEBI/IRDAI guidance; voice-cloning/impersonation law; DoT advisories; MeitY 2024 AI advisories.
