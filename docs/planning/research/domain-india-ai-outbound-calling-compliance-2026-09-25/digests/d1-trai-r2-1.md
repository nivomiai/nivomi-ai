# Digest d1-trai-r2-1 — TRAI TCCCPR status, A2P/robo-call definitions, calling hours, enforcement thresholds (round 2)

Run date / accessed: 2026-09-25 for all sources. Tool calls used: 19 of 20 (includes 2 local text extractions of downloaded TRAI PDFs).

## Sources

- S1: TRAI press release "TRAI Strengthens Framework for Curbing Unsolicited Commercial Communications through Technology-Driven Enforcement and Enhanced Consumer Protection", PR No. 119 of 2026, dated 18 Sep 2026. https://www.trai.gov.in/sites/default/files/2026-09/PR_No119of2026.pdf (publisher: TRAI; primary; text extracted from the PDF, OCR noise such as "AIJML" and "DLI" is in the original scan)
- S2: TRAI, "Consultation on Draft Telecom Commercial Communications Customer Preference (Third Amendment) Regulations, 2026", No. RG-25/(25)/2023-QoS, dated 13 Mar 2026, with Annexure-I (draft amendments and explanatory note) and Annexure-II (draft consolidated TCCCPR 2018). https://www.trai.gov.in/sites/default/files/2026-03/Draft_CP_13032026_0.pdf (publisher: TRAI; primary; this is a draft, and Annexure-II mixes existing text with proposed edits)
- S3: MediaNama, "TRAI Restricts Apps Like Truecaller From Blocking 1600 Calls", Sep 2026. https://www.medianama.com/2026/09/223-trai-truecaller-140-1600-calls-spam-rules/ (independent specialist tech-policy press)
- S4: Khaitan & Co, "Efforts to Curb Spam Continue: TRAI Releases Second Amendment to the TCCCPR 2018", 02 Apr 2025. https://www.khaitanco.com/thought-leadership/Efforts-to-Curb-Spam-Continue-TRAI-Releases-Second-Amendment-to-the-TCCCPR-2018 (top-tier Indian law firm)
- S5: PIB, "Extension of last date for submission of comments/counter comments on the consultation Draft TCCCPR (Third Amendment) Regulations, 2026". https://www.pib.gov.in/PressReleasePage.aspx?PRID=2250788 (government press bureau. Only the search snippet was seen: comments deadline 19 Apr 2026, counter-comments 4 May 2026)
- S6: Search-result headlines and snippets only, not fetched: Business Standard (18 Sep 2026, fetch returned 403), ETV Bharat, Daily Pioneer, indianmasterminds, officenewz ("new norms for AI, automated and robocalls"). These are listed as leads, not as evidence.

## Claims

1. **Third Amendment finalised.** TRAI "introduced" the Telecom Commercial Communication Customer Preference (Third Amendment) Regulations, 2026 on 18 Sep 2026. The draft was issued 13 Mar 2026, comments closed 19 Apr 2026, counter-comments closed 4 May 2026, and the Open House Discussion was held 3 Jun 2026.
   Sources: S1 (TRAI, 2026-09-18) and S3 (MediaNama, 2026-09). Timeline dates also in S5 (PIB). Accessed 2026-09-25. Confidence: high. Class: regulatory. Two-source: YES (TRAI + MediaNama).
   Round-1 hypothesis "Third Amendment was only a draft or consultation in Mar 2026": OVERTURNED as of 2026-09-25. It has been finalised.

2. **Gazette notification and effective dates are unclear.** S3 says the regulations "have not yet been notified" and describes enforcement timelines of 30, 60 and 90 days after notification, with the A2P charge applying after 60 days. The draft's commencement clause said the amendment would "come into force after thirty days from the date of their publication in the Official Gazette". The final commencement clause was not retrieved.
   Sources: S3 (MediaNama); S2 (TRAI draft, 2026-03-13). Confidence: medium. Class: regulatory. Two-source: NO. Effective dates are single-source (S3). Gazette status is unresolved.

3. **Final A2P definition.** The final amendment defines A2P calls as "voice calls initiated by an application, software system or automated platform without direct human dialing, including using autodialing, robo-calls and pre-recorded/artificial voice technologies".
   Source: S1 (TRAI PR). The draft text of new clause 2(ea) in S2 is nearly identical and adds "and delivered to an individual telecom subscriber". Confidence: high. Class: definition. Two-source: NO. The wording has only a TRAI source (S1 and S2 are both TRAI). S6 headlines, not fetched, report that AI and robocalls are covered.
   Round-1 hypothesis "A2P defined to include artificial voice": CONFIRMED (TRAI primary). Independent confirmation of the wording is STILL SINGLE-SOURCE.

4. **Declaration duty.** "Every entity using A2P calls must pre-declare such use to its TSP along with the details of CLIs to be used for making such calls". The draft replaced regulation 4 with "Intimation regarding use of A2P calls": every Sender declares A2P use to the Originating Access Provider (OAP) in advance.
   Sources: S1 (TRAI) and S2 (draft reg. 4). S3 independently reports "Senders must pre-declare A2P usage to their operator". Confidence: high. Class: regulatory. Two-source: YES.

5. **Undeclared A2P calls are spam.** "A2P calls made without the required prior declaration will be treated as UCC [unsolicited commercial communication]." The draft proviso to reg. 4 adds that the OAP "shall take action against such sender as per the provisions of these regulations". The draft explanatory note gives the reason: networks cannot tell a live human voice from "a pre-recorded or artificially generated human voice".
   Sources: S1 and S2 (both TRAI). Confidence: high. Class: regulatory. Two-source: NO. The "undeclared = UCC" consequence appears only in TRAI text; S3 does not state it.
   Round-1 hypothesis "undeclared automated calls treated as spam": CONFIRMED on TRAI text only, so STILL SINGLE-SOURCE.

6. **A2P termination charge.** A termination charge of up to ₹0.05 per minute on A2P calls is levied by the Terminating Access Provider on the Originating Access Provider. A2P calls from TRAI-designated regulated series (140xx, 1600xx, 1601xx) and Authority-authorised calls are exempt. The draft also exempted government and constitutional-body calls.
   Sources: S1 (TRAI) and S3 ("up to 5 paise a minute", effective after 60 days). Confidence: high. Class: regulatory. Two-source: YES.
   This is a carrier-to-carrier charge, not a charge on the sender. The platform may still see it passed through in its per-minute cost.

7. **No numeric abandoned-call limit.** The 18 Sep 2026 press release lists no abandoned-call or silent-call limit among the salient features. The draft consolidated text has two relevant items. First, a definition: "Abandoned Call" means an outgoing call where "the sender does not connect the call to a live agent after the call is established and is answered by the recipient". Second, a Code of Practice duty on Access Providers to act against registered auto-dialer senders "failing to maintain silent calls or abandoned calls within the prescribed limits". No numeric limit was found in the retrieved text.
   Sources: S1 and S2 (TRAI). Confidence: medium. Class: definition/regulatory. Two-source: NO.
   Round-1 hypothesis "Third Amendment adds abandoned-call limits": OVERTURNED. The definitions and the "prescribed limits" duty already sit in the consolidated TCCCPR text; the final amendment's salient features do not add a limit. Any numeric limit would be in operator Codes of Practice, which were not retrieved.

8. **Existing robo-call and auto-dialer definitions.** TCCCPR reg. 2(bc) (consolidated text) defines "Robo Calls" as "any call made to any customer using an artificial or prerecorded voice to interactively deliver a voice message without the involvement of human being on calling side for participating in the dialogue". "Auto Dialer Call" is a call "initiated automatically by an equipment, in accordance to a stored and/or programmable instruction(s), to a telephone number(s), already stored or a list auto generated by the software", which after answer either "plays a recorded message" or "connects the call to a live person". Reg. 2(bj) defines "Silent Call".
   Source: S2 Annexure-II (TRAI). Confidence: high that the text exists; medium that it is unchanged in the final version. Class: definition. Two-source: NO. S4 (Khaitan) confirms that the 2025 Second Amendment introduced auto-dialer and robocall provisions requiring notice to the OAP, but not the definition wording.
   Round-1 hypothesis "CP_28082024 may define robo-calls": NOT VERIFIED. The definition was found in the TCCCPR consolidated text, not in the 2024 consultation paper, which was not retrieved.

9. **Inference: a conversational AI agent falls inside both definitions.** This is an analyst inference, not a TRAI statement. An AI agent that dials from a platform and speaks with a synthetic voice fits both:
   - A2P (claim 3): "initiated by an application, software system or automated platform without direct human dialing … artificial voice technologies".
   - Robo Calls (claim 8): "artificial … voice to interactively deliver a voice message without the involvement of human being on calling side for participating in the dialogue". The word "interactively" undercuts any argument that two-way conversational AI is outside the definition.

   No TRAI guidance or law-firm commentary specifically on LLM or conversational agents was found. Class: definition. Two-source: NO (inference).

10. **Calling hours: customer time-band preferences with defaults, no general statutory ban.** The draft consolidated TCCCPR (Schedule / Code of Practice section "3. Procedure for registration or change of preference of Time band(s) for Commercial Communications") lets customers opt out of these bands: 00–06, 06–08, 08–10, 10–12, 12–14, 14–16, 16–18, 18–21 and 21–24 hrs. Note-1 says: "Time Bands (i), (ii), (iii) and (ix) [00:00–06:00, 06:00–08:00, 08:00–10:00, 21:00–24:00] shall be default OFF for all customers irrespective of the status of registration of customer … unless customer has registered its preference(s) and switched ON".
    Effect: promotional commercial communication is blocked by default outside 10:00–21:00 for every subscriber, including unregistered ones, unless the subscriber opts in.
    Source: S2 Annexure-II (TRAI). Confidence: medium, because the text comes from a draft consolidation. Class: regulatory. Two-source: NO.
    Round-1 hypotheses: "default bands block 00:00–10:00 and 21:00–24:00" is CONFIRMED on TRAI text only (STILL SINGLE-SOURCE). "The 2018 base regulation limits promotional calls to 09:00–21:00" is OVERTURNED. The retrieved text sets the default-open window at 10:00–21:00 and frames it as a default preference, not a fixed statutory window.

11. **Service and transactional calls are not time-restricted.** Note-4 to the same time-band schedule says: "transactional type and service type of commercial communications may not be blocked during any time band".
    Source: S2 Annexure-II (TRAI). Confidence: medium. Class: regulatory. Two-source: NO.

12. **7-day complaint window.** A UCC complaint "shall be made by a subscriber or recipient within seven days of receipt of the unsolicited commercial communication".
    Sources: S2 (TRAI consolidated reg. on complaint handling) and S4 (Khaitan, 2025-04-02: "The Amendment introduces a 7-day deadline for users to report UCC complaints"). Confidence: high. Class: regulatory. Two-source: YES. Round-1: CONFIRMED.

13. **Complaint threshold: 5 in 10 days, plus a new 3-in-10 AI-corroborated trigger.** The existing threshold is "5 or more unique complaints within a period of ten days". The Third Amendment adds a trigger of "3 or more unique complaints within a period of ten days" where the Sender's CLI is also flagged by the operator's AI/ML UCC detection system. Separately, new Regulation 21A starts graded action when five or more of a Sender's CLIs are AI-flagged within 10 days. Graded action means KYC re-verification, physical verification, outgoing barring, and disconnection for repeat violations.
    Sources: S1 (TRAI) and S3 (MediaNama: threshold "lowered from five to three complaints within 10 days" only if also flagged by the AI system). Confidence: high. Class: enforcement. Two-source: YES.
    Round-1 "5 complaints / 10 days": CONFIRMED, and now supplemented by the 3-in-10 AI-corroborated trigger.

14. **Graded penalties: 15-day barring, then 1-year disconnection and blacklisting.** The draft consolidated TCCCPR text says:
    - First instance: the Sender's outgoing services are barred "by all the Access Providers for a period of fifteen days".
    - Subsequent instance: all of the Sender's telecom resources are disconnected "by all the Access Providers for one year", and the "OAP shall put the Sender under the blacklist category" with no new resources for one year.

    Source: S2 (TRAI). Confidence: medium-high. Class: enforcement. Two-source: NO. A web-search summary attributed this to 2025 law-firm and commentary pages (JSA, Saikrishna, Securiti, Sigma Chambers were listed), but the Khaitan article fetched did not state it. No independent page was fetched that states it.
    Round-1: STILL SINGLE-SOURCE.

15. **90-day wait to re-seek consent.** "The Sender shall be allowed to re-acquire consent of such customer only after ninety (90) days from the date of revoking consent or opting-out". The customer may opt in again at their own initiative at any time.
    Source: S2 (TRAI consolidated Code of Practice text). Confidence: medium-high. Class: regulatory. Two-source: NO. A search snippet echoed this but no independent source was fetched.
    Round-1: STILL SINGLE-SOURCE.

16. **Consent for transaction-facilitation calls lasts seven days.** Under reg. 2(bh)(ii), a service call "to facilitate or complete a commercial transaction" requires Explicit Consent, "Provided that such Explicit Consent shall be for seven days or as directed by the Authority from time to time".
    Source: S2 (TRAI). Confidence: medium-high. Class: regulatory. Two-source: NO. A search snippet echoed this; no independent source was fetched.
    Round-1: STILL SINGLE-SOURCE.

17. **New 7-day inquiry-based window.** Commercial communications may be sent on the basis of a customer's inquiry "only for a period of seven days from the date of such inquiry". The inquiry must be "made in writing or through digital means" and kept in "verifiable form by the Sender".
    Source: S1 (TRAI). Confidence: high. Class: regulatory. Two-source: NO.

18. **Legacy consents and consumer appeals.** Legacy consents count only if obtained through verifiable means and registered on the operators' Digital Platform. A new consumer appeal can be filed within 15 days of a UCC complaint's resolution.
    Sources: S1 (TRAI). S3 confirms the 15-day appeal window. Confidence: high. Class: regulatory. Two-source: YES for the appeal; NO for legacy consent.

19. **Relationship-based communication window (draft).** The draft redefines "Relationship" to include an application for products or services made by the recipient "within the three months immediately preceding" the communication.
    Source: S2 (TRAI draft). Confidence: low, because it is unknown whether this survived into the final text. Class: definition. Two-source: NO.

20. **Protected commercial number series.** Call management apps (for example Truecaller) are barred from blanket blocking or spam-tagging the 140xx, 1600xx and 1601xx series. Promotional voice calls are expected on 140xx; service and transactional calls on 1600xx/1601xx.
    Sources: S1 (TRAI) and S3 (MediaNama). Confidence: high. Class: regulatory. Two-source: YES.

## Glossary

- **A2P call**: Application-to-Person voice call. Initiated by an application, software system or automated platform without direct human dialling, including autodialling, robo-calls and pre-recorded/artificial voice (TCCCPR 2(ea), 2026).
- **Robo Call**: a call using an artificial or prerecorded voice to interactively deliver a message with no human participating on the calling side (TCCCPR 2(bc)).
- **Auto Dialer Call**: a call initiated automatically by equipment from a stored or generated number list, which plays a recorded message or connects to a live person.
- **Abandoned Call**: an answered outgoing call that the sender does not connect to a live agent.
- **Silent Call**: defined in TCCCPR 2(bj); the full text was not retrieved.
- **UCC**: Unsolicited Commercial Communication.
- **OAP / TAP**: Originating and Terminating Access Provider (the telecom operators).
- **TSP**: Telecom Service Provider.
- **CLI**: Calling Line Identity, the caller's number.
- **DLT**: the Distributed Ledger Technology platform run by operators for registering senders, headers, templates and consent.
- **Explicit Consent**: consent verified and recorded via the Consent Registrar, or, after the 2026 amendment, legacy verifiable consent registered on the Digital Platform.
- **140xx / 1600xx / 1601xx**: TRAI-designated number series. 140xx is for promotional calls; 1600xx/1601xx are for service and transactional calls.
- **Regulation 21A**: new 2026 regulation on AI/ML-based detection of suspected UCC and sharing that data between operators.
- **Time band / Day type**: a customer's preference slots for receiving promotional communication.

## Leads

- **CONTRADICTION (status):** TRAI S1 says the Authority "has introduced" the Third Amendment "today" (18 Sep 2026). MediaNama S3 says the regulations "have not yet been notified". Next steps: check egazette.gov.in for the notification and fetch the final regulation PDF on trai.gov.in under Regulations. The final commencement clause decides when the A2P declaration duty applies. S3 mentions 30, 60 and 90-day staggered timelines.
- **CONTRADICTION (hours):** Round 1's 09:00–21:00 belief conflicts with the TRAI text, which sets 10:00–21:00 as the default-open band. Next step: verify against the final consolidated TCCCPR, the 2018 Schedule, and operator Codes of Practice.
- **Final text not retrieved.** Claims 3, 5, 8, 10, 11 and 14–16 rest on the March 2026 draft consolidation or the press release. The final regulation text should be pulled and each clause number re-checked.
- **Abandoned and silent-call "prescribed limits"** are probably numeric thresholds in operator Codes of Practice (CoP-UCC detection). Next step: fetch the Jio, Airtel or Vi CoPs published on trai.gov.in.
- **Second sources for the 15-day/1-year penalties, 90-day re-consent and 7-day transaction consent:** try JSA "Consumer interest at the forefront of TRAI's amended TCCCPR", Saikrishna & Associates, and Sigma Chambers (all surfaced in search, not fetched).
- **TRAI Direction of 27 Feb 2026** on AI/ML UCC intelligence sharing. It is the predecessor to Reg. 21A.
- **TRAI Classification of Senders:** a new regulation lets TRAI set differentiated enforcement by sender category. Watch for a follow-on direction.
- **Essential agreement conditions:** TRAI may prescribe mandatory clauses in operator–sender/telemarketer agreements. These would bind the platform through its operator contracts.
- **Legacy consent:** it is valid only if verifiable and registered on the operators' Digital Platform. This matters for importing customers' existing lead-consent records.
- **PR No. 113 of 2026 (10 Aug 2026):** 1601-series rollout for service/transactional calls (utilities, courier, logistics). Not fetched.

## Looked for, not found

- The final gazetted text of the TCCCPR (Third Amendment) Regulations, 2026, and its egazette notification number.
- Any numeric limit on abandoned or silent calls (a percentage or per-period cap).
- Any fixed statutory calling-hour window for promotional voice calls that sits outside the customer time-band preference mechanism. None was found; only default-OFF bands.
- Any TRAI statement or law-firm commentary specifically on LLM-based or conversational AI voice agents, beyond the "artificial voice" wording.
- A definition of robo-call in TRAI CP of 28 Aug 2024 (CP_28082024). Not retrieved this round.
- A mandated in-call disclosure script. The duty found is declaration to the operator; a press headline says users will see before answering whether a call is automated, but no regulatory text on caller-side display was retrieved.
- An independent fetched second source for the 15-day/1-year penalties, the 90-day re-consent rule and the 7-day transaction consent.
