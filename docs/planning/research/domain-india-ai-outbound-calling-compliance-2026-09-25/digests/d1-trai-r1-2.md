# Digest D1 (part 2): TRAI telemarketing rules (DND/NCPR, hours, complaints, penalties, enforcement)

Run date: 2026-09-25. Researcher: subagent D1-r1-2. Tool calls used: 17 (over the 15 soft budget, under the 20 hard cap). Sources read in full: 3 (all TRAI). Two more were seen only as search-result summaries and are marked that way.

Sources read:

- S1: TRAI, _Telecom Commercial Communications Customer Preference (Second Amendment) Regulations, 2025_ (1 of 2025), notified 2025-02-12. https://trai.gov.in/sites/default/files/2025-02/Regulation_12022025.pdf (full text and explanatory memorandum read via pdftotext)
- S2: TRAI Press Release No. 11/2025, 2025-02-12, "TRAI Strengthens Consumer Protection with Amendments to TCCCPR, 2018". https://trai.gov.in/sites/default/files/2025-02/PR_No.11of2025.pdf (full text read)
- S3: TRAI, Consultation on _Draft TCCCPR (Third Amendment) Regulations, 2026_, No. RG-25/(25)/2023-QoS, 2026-03-13, with explanatory note and a consolidated draft of TCCCPR 2018 (Annexure-II). https://www.trai.gov.in/sites/default/files/2026-03/Draft_CP_13032026_0.pdf (key sections read)
- S4 (search-result summary only, page not opened): WebSearch summary of TRAI/PIB material on enforcement numbers (PIB PRID=2112743, https://www.pib.gov.in/PressReleasePage.aspx?PRID=2112743).
- S5 (search-result summary only, pages not opened): WebSearch summary citing the Telecommunications Act, 2023 (egazette https://egazette.gov.in/WriteReadData/2023/250880.pdf; indiacode; Trilegal; Business Standard).

**Two-source caveat:** S1, S2 and S3 are all published by TRAI. Where they agree, a claim is marked "TRAI-only (S1+S2)". The regulation text and TRAI's own press note back each other up, but they are not independent publishers, so under the brief's rule these claims are **single-publisher**. No law-firm or other independent source was read this round.

## Claims

1. On 2025-02-12 TRAI notified the TCCCPR (Second Amendment) Regulations, 2025 (1 of 2025), amending TCCCPR 2018 (6 of 2018) under s.36 read with s.11(1)(b)(v) and (c) of the TRAI Act 1997. Most provisions came into force 30 days after gazette publication. Regulation 8, regulation 17, reg 20(a)-(b) and reg 21(b) came into force after 60 days.
   - source: S1 (cl.1); S2 para 1 | publisher: TRAI | pub_date: 2025-02-12 | accessed 2026-09-25 | confidence: high | class: regulatory | two-source: TRAI-only (S1+S2), single-publisher

2. UCC is redefined (reg 2(bw)) as "any commercial communication that is neither as per the consent nor the registered preferences of the Recipient". It excludes transactional calls/messages, service calls/messages, and Government/TRAI-directed communications. Any commercial communication from a Sender **not registered with an Access Provider** is UCC by definition, and so is any call "to deceive the recipient or to attempt to deceive".
   - source: S1 cl.2(i); S2 para 4(iii)(b) | publisher: TRAI | pub_date: 2025-02-12 | accessed 2026-09-25 | confidence: high | class: definition | two-source: TRAI-only (S1+S2)

3. Registration is a hard gate (reg 3). "No Sender, who is not registered with any Access Provider for the purpose of sending commercial communications ... shall make any commercial communication". Access Providers must ensure commercial communication uses only registered headers or number resources "from special series assigned for the purpose of commercial communication".
   - source: S1 cl.3 | publisher: TRAI | pub_date: 2025-02-12 | accessed 2026-09-25 | confidence: high | class: regulatory | two-source: TRAI-only (S2 para 4(iii)(c) corroborates)

4. Senders may not telemarket from ordinary 10-digit numbers. **140-series** is for promotional calls. The **1600-series** is for transactional and service calls.
   - source: S2 para 4(iii)(c); S1 explanatory memo para 18 | publisher: TRAI | pub_date: 2025-02-12 | accessed 2026-09-25 | confidence: high | class: regulatory | two-source: TRAI-only (S1+S2)

5. **Promotional Voice Call** (reg 2(av)) is any voice commercial communication "containing promotional material or advertisement". A call that mixes promotional content with any other type of commercial call "shall be treated as a Promotional Voice Call". Such calls may be delivered only to subscribers who have not blocked the applicable category in the Preference Register, or who have consented in the Consent Register. Calls with "explicit digital consent" are delivered "irrespective of their preferences registered".
   - source: S1 cl.2(e) | publisher: TRAI | pub_date: 2025-02-12 | accessed 2026-09-25 | confidence: high | class: regulatory | two-source: single-source (S1 text; S2 is consistent)

6. **Service Voice Call** (reg 2(bh)) covers two cases. (i) Calls to an existing customer about a product or service they use (warranty, recall, delivery, etc.), with no explicit consent needed. (ii) Calls to a recipient "to facilitate or complete a commercial transaction involving the ongoing purchase" after explicit consent. Consent under (ii) is valid for **seven days** only.
   - source: S1 cl.2(f); S2 para 4(ii)(e) | publisher: TRAI | pub_date: 2025-02-12 | accessed 2026-09-25 | confidence: high | class: regulatory | two-source: TRAI-only (S1+S2)

7. **Transactional Voice Call** (reg 2(bt)) is limited to calls "in response to Customer initiated transaction within thirty minutes of the transaction" (OTPs, transaction alerts, refunds, etc.). It must not be promotional.
   - source: S1 cl.2(g) | publisher: TRAI | pub_date: 2025-02-12 | accessed 2026-09-25 | confidence: high | class: definition | two-source: single-source

8. **Inferred consent** (for transactional and service communications) "shall not extend beyond duration / discharge of the contract between the Sender and the Recipient". After that, service calls need explicit consent.
   - source: S1 cl.2(c); S2 para 4(ii)(f) | publisher: TRAI | pub_date: 2025-02-12 | accessed 2026-09-25 | confidence: high | class: regulatory | two-source: TRAI-only (S1+S2)

9. **Opt-out cooling period:** a Sender may re-seek consent from a customer who revoked or opted out only "after ninety (90) days". The customer may opt back in at any time. Consent-seeking messages must go via short code **127xxx**.
   - source: S1 cl.17 (Schedule amendments, entries (g),(h)); S2 para 4(ii)(d) | publisher: TRAI | pub_date: 2025-02-12 | accessed 2026-09-25 | confidence: high | class: regulatory | two-source: TRAI-only (S1+S2)

10. **Preference register (NCPR) categories** (Schedule-II item 1, as substituted). "FULLY BLOCK" (1909 option 0, USSD *1909*0#) blocks all promotional communications and service communications that need explicit consent. It does not block inferred-consent transactional/service communications or Government communications. "BLOCK PROMO" (option 50, *1909*50#) blocks only promotional communications, across all categories, modes, time bands and day types. There are 8 content categories that can be blocked individually: 1 Banking/Insurance/Financial products/credit cards; 2 Real Estate; 3 Education; 4 Health; 5 Consumer goods and automobiles; 6 Communication/Broadcasting/Entertainment/IT; 7 Tourism and Leisure; 8 Food and Beverages. Registration is via call/SMS to 1909 or USSD.

- source: S1 cl.18(a) | publisher: TRAI | pub_date: 2025-02-12 | accessed 2026-09-25 | confidence: high | class: regulatory | two-source: single-source (S3 consolidated draft reproduces the same schedule; same publisher)

11. "Fully blocked" (reg 2(z), as substituted) means "stoppage of all types of commercial communication requiring explicit consent except commercial communication sent under inferred consent and Government Message or Government Voice Call". Government calls/messages sent via DLT need no consent, and the preference register has no option to block them.

- source: S1 cl.2(a),(b) | publisher: TRAI | pub_date: 2025-02-12 | accessed 2026-09-25 | confidence: high | class: definition | two-source: single-source

12. **Time bands / calling hours.** TRAI does not set a statutory calling-hours window. Instead, customer time-band preferences run in nine bands: 00-06, 06-08, 08-10, 10-12, 12-14, 14-16, 16-18, 18-21, 21-24 Hrs (option 20 = block all bands). Note-1 says bands (i) 00:00-06:00, (ii) 06:00-08:00, (iii) 08:00-10:00 and (ix) 21:00-24:00 "shall be default OFF for all customers irrespective of the status of registration". **Promotional commercial communications therefore default to 10:00-21:00 only**, unless a customer opts into other bands. Note-4 says "transactional type and service type of commercial communications may not be blocked during any time band". Customers can also set day-type preferences.

- source: S3 Annexure-II (consolidated TCCCPR 2018 incl. proposed changes), Schedule-II item 3 | publisher: TRAI | pub_date: 2026-03-13 | accessed 2026-09-25 | confidence: medium (read from a _consolidated draft_, not the gazetted 2018 principal text; the time-band schedule does not appear to be a proposed change, but this was not verified against the 2018 original) | class: regulatory | two-source: single-source

13. **Frequency/volume.** There is no per-recipient call-attempt cap. "Bulk" is defined as communications on the same or similar subject "more than 20 during a twenty-four hours period; or more than 100 during a seven days period; or more than 300 during a thirty days period". This is a volume threshold, not a per-recipient attempt limit.

- source: S3 Annexure-II (consolidated definitions) | publisher: TRAI | pub_date: 2026-03-13 | accessed 2026-09-25 | confidence: medium | class: definition | two-source: single-source

14. **Auto-dialers / robocalls** (reg 4 substituted, 2025): "Every Sender shall notify the Originating Access Provider, in advance, about the use of Auto Dialer or Robo-Calls as well as the intended objective of such calls in writing." TRAI's explanatory memo says promotional auto-dialer/robo calls are allowed only via 140-series, using DCA-registered consent. Service/transactional robocalls go via 1600-series and "should not be subject to any restrictions".

- source: S1 cl.4 and explanatory memo para 18; S2 para 4(ii)(g) | publisher: TRAI | pub_date: 2025-02-12 | accessed 2026-09-25 | confidence: high | class: regulatory | two-source: TRAI-only (S1+S2)

15. **Complaint window:** complaints must be made "within seven days of receipt" of the communication (previously 3 days). The Terminating Access Provider rejects complaints filed after 7 days.

- source: S1 (amended reg 23/24 text, "seven days of receipt"); S2 para 4(i)(c) | publisher: TRAI | pub_date: 2025-02-12 | accessed 2026-09-25 | confidence: high | class: regulatory | two-source: TRAI-only (S1+S2)

16. **Complaint minimum data and channels.** A complaint is valid if it contains complainant number, sender number, date and a brief description. Complaints against unregistered senders no longer require the complainant to have registered a preference first. Access-provider apps must show complaint options prominently, can auto-capture call logs/SMS with permission, and accept screenshots. Complaints can be filed via 1909 (per the schedule of the regulations).

- source: S2 para 4(i)(a),(b),(d); S1 Schedule | publisher: TRAI | pub_date: 2025-02-12 | accessed 2026-09-25 | confidence: high | class: regulatory | two-source: TRAI-only (S1+S2)

17. **Action threshold and timelines.** Action is triggered when complaints come from "five or more than five unique Recipients during the last ten days" (previously 10 complaints in 7 days). The Originating Access Provider (OAP) checks for similar complaints within "two business hours", suspends outgoing services of all the sender's resources, issues notice, and investigates within "five business days" of the sender's representation. The time for action against unregistered senders was cut from 30 days to 5 days.

- source: S1 (amended reg 25(5)(d),(6)); S2 para 4(i)(e),(f) | publisher: TRAI | pub_date: 2025-02-12 | accessed 2026-09-25 | confidence: high | class: regulatory | two-source: TRAI-only (S1+S2)

18. **Graded sanctions on Senders.** First violation: "outgoing services of all telecom resources allotted to the Sender including PRI/SIP trunks, SIMs etc. shall be barred by all the Access Providers for a period of fifteen days". Second and later violations: all telecom resources "disconnected by all the Access Providers for one year", Sender "under the blacklist category" with no new resources, and "all the devices used for making UCC shall also be blocked ... for one year". The Sender may keep one telephone number. Sanctions apply "irrespective of whether those telecom resources were actually used".

- source: S1 (amended reg 25(6)); S2 para 4(iii)(a) | publisher: TRAI | pub_date: 2025-02-12 | accessed 2026-09-25 | confidence: high | class: regulatory | two-source: TRAI-only (S1+S2)

19. **Principal entity liability for its telemarketer.** The OAP acts "against such Sender" when it concludes "the Sender or its TM was engaged in sending" UCC. The Sender/principal entity therefore bears resource-level sanctions for its telemarketer's conduct. Access Providers may also impose financial disincentives on registered Senders and Telemarketers, forfeit their security deposits, and suspend or blacklist them (reg 22(1)(g)). Access Providers must sign legally binding agreements with all registered Senders/TMs. Intermediaries between PE and TM are limited, and PE-TM traceability is mandatory.

- source: S1 (reg 25(6), reg 22(1)(f),(g)); S2 para 4(iv)(b), 4(v)(c),(e) | publisher: TRAI | pub_date: 2025-02-12 | accessed 2026-09-25 | confidence: high | class: regulatory | two-source: TRAI-only (S1+S2)

20. **Header/template misuse.** When a header is blacklisted, traffic is suspended until the registrar reviews it or for 7 days, whichever is earlier. "Repeat violations shall result in blacklisting of the Sender across all the Access Providers for a minimum period of one year." Suspension or blacklisting must be propagated across providers within 24 hours, and re-registration is barred during that period.

- source: S1 (reg 22 substituted; Schedule amendments) | publisher: TRAI | pub_date: 2025-02-12 | accessed 2026-09-25 | confidence: high | class: regulatory | two-source: single-source

21. **Financial disincentives on Access Providers (telcos) for misreporting UCC counts:** Rs 2 lakh (first instance), Rs 5 lakh (second), Rs 10 lakh per instance thereafter, charged separately for registered and unregistered senders. This is on top of existing FDs for invalid complaint closure and header/template failures (e.g., Rs 1,000 or Rs 10,000 per instance, Rs 2 lakh tiers in reg text).

- source: S2 para 4(iv)(a); S1 (FD clauses) | publisher: TRAI | pub_date: 2025-02-12 | accessed 2026-09-25 | confidence: high | class: regulatory | two-source: TRAI-only (S1+S2)

22. Access providers must detect spam through traffic analytics: high call volumes, short durations, low incoming-to-outgoing ratios. They must also deploy honeypots. Senders/TMs must undergo physical verification, biometric authentication and mobile-number linking at registration.

- source: S2 para 4(v)(a),(b),(d) | publisher: TRAI | pub_date: 2025-02-12 | accessed 2026-09-25 | confidence: high | class: regulatory | two-source: single-source (TRAI PR; S1 has matching Schedule text, same publisher)

23. **Enforcement numbers.** After TRAI's August 2024 directions to disconnect all resources of unregistered senders/UTMs, complaints against UTMs fell from 1,89,419 (Aug 2024) to 1,34,821 (Jan 2025). "More than 1150 entities blacklisted and more than 18.8 lakh telecom resources disconnected."

- source: S4 (WebSearch summary attributed to TRAI/PIB, 2025-02; not found in the S2 PDF text I extracted, so the page it came from was not read) | publisher: TRAI/PIB (unverified) | pub_date: 2025-02 | accessed 2026-09-25 | confidence: low | class: enforcement | two-source: single-source, unverified

24. **Pending: draft Third Amendment (2026).** On 2026-03-13 TRAI consulted on draft TCCCPR (Third Amendment) Regulations, 2026. Comments were due 2026-04-12 and counter-comments 2026-04-27. It proposes to define an "A2P (Application-to-Person) call" as a voice call "initiated by an application, software system, or automated platform without direct human dialling ... including using autodialling, robo-calls and/ or prerecorded/ **artificial voice** technologies". Bulk callers must pre-declare A2P calling to the OAP. If they do not, "all such calls shall be treated as UCC". **AI-voiced outbound calls fall squarely inside this definition.**

- source: S3 (draft reg 2(ea); explanatory note para 3.5) | publisher: TRAI | pub_date: 2026-03-13 | accessed 2026-09-25 | confidence: high (that it was proposed) / unknown (whether it has been notified as of 2026-09-25) | class: regulatory (pending) | two-source: single-source

25. **Pending (draft 2026), other proposals.** (a) A revised "Explicit Consent" definition that would accept legacy consents "obtained by the sender through any verifiable means prior to or outside the Consent Registration Function framework and subsequently registered in the Consent Register". (b) A narrower "Relationship": prior business relationship, or an application by the recipient "within the three months immediately preceding"; the social-relationship limb is removed. (c) Using access providers' AI-based "UCC_Detect" flags to lower action thresholds. (d) Access-provider duty to act against auto-dialer senders "failing to maintain silent calls or abandoned calls within the prescribed limits". "Abandoned Call" means an answered call not connected to a live agent.

- source: S3 (draft cl.2(b),(e); explanatory note paras 2.2, 4; consolidated Annexure-II) | publisher: TRAI | pub_date: 2026-03-13 | accessed 2026-09-25 | confidence: medium (draft text; status not verified) | class: regulatory (pending) | two-source: single-source

26. **Telecommunications Act, 2023, s.28** defines "specified message" as "any message offering, advertising or promoting goods, services, interest in property, business opportunity, employment opportunity or investment opportunity". It empowers the Central Government to make rules requiring prior consent for specified messages and a Do-Not-Disturb register. Search summaries say a penalty of up to Rs 2 lakh and possible service bar applies to senders of commercial messages without consent.

- source: S5 (search summary of egazette Act text, Trilegal, ANM Global; not opened) | publisher: mixed (not read) | pub_date: 2023-12-24 (Act) | accessed 2026-09-25 | confidence: low (definition wording) / very low (penalty) | class: regulatory | two-source: single-source, unverified

27. The draft 2026 amendment replaces references to the Indian Telegraph Act, 1885 with "The Telecommunications Act, 2023 (44 of 2023)". This means TRAI is re-basing TCCCPR on the 2023 Act, but TCCCPR is still made under the TRAI Act 1997.

- source: S3 (draft cl.2(c); explanatory note) | publisher: TRAI | pub_date: 2026-03-13 | accessed 2026-09-25 | confidence: high | class: regulatory | two-source: single-source

## Glossary

- **TCCCPR 2018**: Telecom Commercial Communications Customer Preference Regulations, 2018 (6 of 2018). TRAI's anti-UCC framework. (S1, S3)
- **UCC**: Unsolicited Commercial Communication. Commercial communication not matching the recipient's consent or registered preferences, plus anything from an unregistered sender or sent to deceive. (S1 reg 2(bw))
- **NCPR / Preference Register**: register of customer block/opt-out choices by content category, mode, time band and day type, set via 1909. (S1 Schedule-II)
- **Consent Register / DCA (Digital Consent Acquisition)**: DLT-based record of explicit consents. Consent-seeking goes via short code 127xxx. (S1; S1 memo para 18)
- **DLT**: Distributed Ledger Technology platform run by access providers for registering senders, headers, templates, consents, and for scrubbing. (S3 consolidated reg 13)
- **Sender / Principal Entity (PE)**: the business on whose behalf commercial communication is sent. It is sanctioned for its TM's UCC. (S1, S2)
- **Telemarketer (TM / RTM)**: registered entity delivering commercial communications for a PE. (S1, S2)
- **OAP / TAP**: Originating / Terminating Access Provider. The TAP takes complaints and the OAP investigates and acts. (S1)
- **UTM**: Unregistered Telemarketer. (S2, S4)
- **Explicit consent**: consent verified directly from the recipient and recorded by the Consent Registrar. The 2026 draft would also admit registered legacy consents. (S3)
- **Inferred consent**: implied consent for transactional/service communications, limited to the contract duration. (S1 reg 2(ah) proviso)
- **140-series / 1600-series**: number series for promotional and for service/transactional commercial calls, respectively. (S2)
- **A2P call** (draft): automated, non-human-dialled call including artificial voice. (S3)
- **Bulk**: >20/24h, >100/7d, or >300/30d on the same or similar subject. (S3 consolidated)
- **Abandoned call / Silent call**: answered call not connected to a live agent / very short call meant to induce a call-back. (S3 consolidated)
- **Specified message**: Telecom Act 2023 s.28 term for promotional messages. (S5, unverified)

## Leads

Contradictions / tensions first:

1. **Time bands vs "hours".** No fixed statutory calling window was found. The default-OFF bands effectively restrict promotional calls to 10:00-21:00 unless the customer opts in. Note-4 says transactional/service calls "may not be blocked during any time band", which could be read as either "cannot be blocked" or "must not be blocked". Need the gazetted 2018 Schedule-II item 3 text to confirm this is current in-force law and not only the consolidated draft.
2. **Robocall freedom vs draft A2P regime.** The 2025 memo says service/transactional robocalls "should not be subject to any restrictions". The 2026 draft says undeclared A2P calls are all UCC, and proposes silent/abandoned-call limits. Need to know whether the Third Amendment was notified between April and September 2026, and what abandoned-call limits were prescribed.
3. **Enforcement numbers (claim 23)** came from a search summary, not the S2 PDF. Verify against the PIB page (PRID 2112743) and later TRAI press releases (e.g., PR 48/2025, https://www.trai.gov.in/sites/default/files/2025-06/PR_No.48of2025.pdf).

Open threads: 4. Status of Telecommunications Act 2023 s.28 notification and any "specified messages" / consumer-protection rules by DoT. Sources to check: Trilegal July 2024 update, egazette, dot.gov.in. 5. TRAI 2024 directions (Aug 2024) on disconnecting UTMs using SIP/PRI, and on URL/APK whitelisting. These are directions, not regulations, and are enforcement-relevant. 6. Whether a B2B AI-calling platform is a "Telemarketer" requiring its own DLT/TM registration, or the business customer is the "Sender" (PE). Also what the "limit on intermediaries between PE and TM" is numerically. 7. 2025-2026 TRAI press releases on disconnection/blacklisting counts, to find what is actually punished. 8. Independent (non-TRAI) law-firm analyses of the 2025 amendment, to satisfy the two-source rule.

## Looked for, not found

- A fixed statutory calling-hours rule (e.g., "9am-9pm") in the 2025 amendment text: none found. Only customer time-band preferences with default-OFF bands (claim 12).
- A per-recipient call-attempt or retry limit: none found. Only the "Bulk" volume definition and proposed abandoned-call limits (draft).
- Explicit AI/synthetic-voice disclosure requirement in force: none found. The 2025 rule only requires notifying the OAP of auto-dialer/robo-call use. The 2026 draft names "artificial voice" in the A2P definition.
- Whether the Third Amendment 2026 has been notified: not checked (budget).
- Independent second-publisher confirmation for TRAI claims: not obtained this round.
- Primary text of Telecom Act s.28 and any rules under it: not read (budget).
