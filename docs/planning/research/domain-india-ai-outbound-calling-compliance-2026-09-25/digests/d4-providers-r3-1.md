# Digest d4-providers-r3-1 — Voice DLT mechanics, Exotel role/voicebot transfer, Sarvam DPA (round 3)

Accessed: 2026-09-25 for every source. Tool calls used: 18 of 18. Distinct sources consulted: 11.

Source key:

- S1 = TRAI, "Telecom Commercial Communications Customer Preference (Second Amendment) Regulations, 2025" (Gazette text + explanatory memorandum), https://trai.gov.in/sites/default/files/2025-02/Regulation_12022025.pdf, file path dated 2025-02 (regulation of 12 Feb 2025). Primary regulator. Full text extracted locally from the PDF.
- S2 = Tata Teleservices, "FAQ (TTSL DLT Portal)", https://www.tatatelebusiness.com/pdf/dlt/FAQ.pdf, PDF created 2023-06-06 (per metadata; predates the 2025 amendment and the 1600-series allocation). Primary operator (access provider DLT registrar). Full text extracted locally.
- S3 = S.S. Rana & Associates via Chambers and Partners, "TRAI's Crackdown on Spam Calls and AI-Driven Telemarketing", https://chambers.com/articles/trai-s-crackdown-on-spam-calls-and-ai-driven-telemarketing, 2026-03-16. Law firm (secondary).
- S4 = Exotel blog, "Decoding New Calling Regulations of 140 & 160 Calling" (Vivek Jathanna), https://exotel.com/blog/decoding-new-calling-regulations-of-140-160-calling/, 2024-11-19. Provider blog (marketing register).
- S5 = Exotel support, "Working with the Stream and Voicebot Applet", https://support.exotel.com/support/solutions/articles/3000108630, modified 2025-09-16. Provider docs.
- S6 = Exotel support, "Updated Extension Guide: Working with the Stream and Voicebot Applet (Beta)", https://support.exotel.com/support/solutions/articles/3000132302, modified 2025-07-21. Provider docs.
- S7 = Sarvam AI Terms of Service, https://www.sarvam.ai/terms-of-service, seen only as search-result snippet this run (prior round dated it 2026-07-29).
- S8 = https://www.sarvam.ai/dpa — HTTP 404.
- Search-result-only (aggregators/vendors, not relied on): frejun.com (2026 blog), artintele.ai, c-zentrix.com, go2market.in, securiti.ai, sigmachambers.in, saikrishnaassociates.com.

## Claims

### A. Voice DLT mechanics (TRAI TCCCPR as amended 2025)

1. Access providers must ensure that any commercial communication on their network uses only registered headers or number resources allotted to Senders from the special series assigned for commercial communication (reg. 3(1) as substituted). — S1, TRAI, 2025-02-12. Confidence: high. Class: regulatory (primary). Two-source: CONFIRMED (S3 says commercial communications must use "designated headers or specific number series"; S2 lists 140XX for promotional voice).

2. No Sender that is not registered with an Access Provider may make any commercial communication, and an unregistered Sender's telecom resources may be suspended or disconnected (reg. 3(2) as substituted). — S1, TRAI, 2025-02-12. Confidence: high. Class: regulatory (primary). Two-source: CONFIRMED (S2: "all Principal Entities and Telemarketers need to register on the DLT platform to facilitate commercial communication").

3. Every Sender must notify its Originating Access Provider in writing, in advance, about its use of auto-dialers or robo-calls and the intended objective of those calls (reg. 4 as substituted). — S1, TRAI, 2025-02-12. Confidence: high. Class: regulatory (primary). Two-source: STILL SINGLE among primary sources this run (vendor blog frejun.com repeats it in search snippets; not independent-quality).

4. TRAI's explanatory memorandum says promotional auto-dialer/robo-calls should be permitted through 140-series numbers only, and service and transactional auto-dialer/robo-calls through 1600 or another series allotted for that purpose, with no separate robo-call regulation beyond pre-declaration. — S1 (Explanatory Memorandum, sections E and B), TRAI, 2025-02-12. Confidence: high (memorandum states the rationale; binding text is reg. 3 + reg. 4). Class: regulatory (primary, explanatory). Two-source: STILL SINGLE for the robo-call routing point; the 140/1600 split itself is CONFIRMED by S3 and by provider/vendor pages in search results.

5. The access-provider agreement with a Sender must state that it is the Sender's sole responsibility to use only registered headers, or numbers allotted to that Sender from the special series for service and transactional calls, and not to mix promotional content into them. — S1 (reg. 22(i)(i)(A) as substituted), TRAI, 2025-02-12. Confidence: high. Class: regulatory (primary). Two-source: STILL SINGLE.

6. Access providers must keep traceability and ensure there are no more than two Telemarketers in the chain: one with an Aggregator Function and one with a Delivery Function, or as TRAI directs. RTMs must use digital platforms that record the trace. — S1 (reg. 22(1)(e) as substituted), TRAI, 2025-02-12. Confidence: high. Class: regulatory (primary). Two-source: CONFIRMED on the TM-AF / TM-DF role split (S2 defines both roles); the "max two" limit itself is STILL SINGLE (S1 only).

7. Registration of Senders and Telemarketers by access providers must include physical verification of the entity, biometric authentication of the authorised person, and linking the entity to a unique mobile number (Schedule-I item 1(4)). — S1, TRAI, 2025-02-12. Confidence: high. Class: regulatory (primary). Two-source: CONFIRMED (search snippets from securiti.ai and frejun.com repeat it; these are secondary).

8. A Principal Entity is a legal entity that wants to communicate with its customers by SMS or voice "through a Telemarketer". A Principal Entity that wants to perform the telemarketer function itself must register separately as a telemarketer (TM-DF). — S2, Tata Teleservices, 2023-06-06. Confidence: medium-high (operator primary, but predates the 2025 amendment). Class: gatekeeper policy. Two-source: STILL SINGLE (no second operator FAQ retrieved).

9. A Telemarketer with Delivery Function has direct connectivity with telecom service providers and aggregates and delivers SMS and voice. A Telemarketer aggregator has no direct connectivity with a TSP but aggregates SMS or voice traffic from multiple enterprises. — S2, Tata Teleservices, 2023-06-06. Confidence: medium-high. Class: gatekeeper policy. Two-source: STILL SINGLE for the definitions. S1 confirms that both roles exist in the chain.

10. A telemarketer cannot file Principal Entity, header, content-template or consent-template registration for a PE. Every PE must start these registrations itself. — S2, Tata Teleservices, 2023-06-06. Confidence: medium-high. Class: gatekeeper policy. Two-source: STILL SINGLE.

11. A Principal Entity may assign more than one telemarketer for the delivery function. Each group company with a separate PAN must register as its own PE. — S2, Tata Teleservices, 2023-06-06. Confidence: medium-high. Class: gatekeeper policy. Two-source: STILL SINGLE.

12. On Tata's DLT, telemarketers must register with the originating access provider's DLT to deliver commercial communication. The RTM ID is unique across access providers, but KYC must be completed with every operator. — S2, Tata Teleservices, 2023-06-06. Confidence: medium-high. Class: gatekeeper policy. Two-source: STILL SINGLE.

13. Tata charges INR 5,000 + GST to register a TM or PE, takes a refundable INR 50,000 security deposit from a Telemarketer (Delivery) when it allocates resources, and gives TM registration 5-year validity. — S2, Tata Teleservices, 2023-06-06. Confidence: medium (operator-specific and possibly outdated). Class: gatekeeper policy / commercial. Two-source: STILL SINGLE.

14. Tata's 2023 FAQ lists "140XX" for promotional voice and "fixed line number series" for transactional/service voice. The 1600 series was allotted later, and S1's memorandum records that DoT had "recently allotted 1600 series numbers" for transactional and service calls, so the FAQ is superseded on this point. — S2 (2023-06-06) vs S1 (2025-02-12). Confidence: high that S2 is outdated here. Class: regulatory. Two-source: resolved by recency in favour of S1.

15. Inference, not stated by any source: a multi-tenant SaaS that pools calling traffic from many business customers and hands it to a CPaaS provider with direct TSP connectivity matches the TM-aggregator definition in S2. Under S1's two-telemarketer limit, it would take the aggregator slot and the CPaaS provider the delivery slot. No source says whether a SaaS platform can instead run entirely under the CPaaS provider's registration. — Derived from S1 + S2. Confidence: low-medium. Class: inference. Two-source: hypothesis STILL UNCONFIRMED. No regulator or operator text addresses SaaS voice platforms directly.

16. S3 (law firm, 2026-03-16) reports that 140-series telemarketing calls were migrated to the DLT platform in October 2024 and that DoT introduced a "160" series for service and transactional calls in 2024. S3 does not say whether platforms, CPaaS providers or AI-calling vendors must register as telemarketers. — S3, S.S. Rana & Associates via Chambers, 2026-03-16. Confidence: medium. Class: regulatory (secondary). Two-source: 140 migration to DLT is STILL SINGLE this run; the 1600 allocation is CONFIRMED with S1.

### B. Exotel

17. Exotel's November 2024 blog advises promotion-heavy customers to "adopt 140 number based calling to avoid service disruption" and to contact Exotel for use-case discussions. It does not explain how to provision 140 or 1600 numbers, what DLT registration is needed for voice, or whether Exotel acts as a telemarketer. — S4, Exotel, 2024-11-19. Confidence: medium (marketing register). Class: provider policy. Two-source: STILL SINGLE. The earlier conflict between Exotel pages ("no DLT for voice" vs "DLT mandatory for 140") stays unresolved from Exotel sources. The regulator (claims 1–2) and operator (claim 8) sources supersede the undated "no DLT for voice" page for commercial calls.

18. Exotel's Stream and Voicebot applets "might not be available by default for all accounts" and have to be enabled through hello@exotel.in or an account manager. — S5, Exotel, modified 2025-09-16. Confidence: high. Class: provider docs. Two-source: STILL SINGLE.

19. In a bidirectional Voicebot session, the bot ends its part by closing the WebSocket, since there is no explicit stop message from bot to platform. Exotel then emits a Stop event internally and moves to the next applet in the flow. A session can last up to 60 minutes, depending on plan. — S6, Exotel, modified 2025-07-21 (Beta); S5 (2025-09-16) also says "the call flow proceeds to the next applet configured". Confidence: high. Class: provider docs. Two-source: CONFIRMED (two Exotel pages; same publisher, so not independent).

20. Handing a voicebot call to a human is documented only after the voicebot ends. A Passthru applet makes a GET request to the customer's endpoint, and the response (e.g. escalate=true) decides routing, for example to a Connect applet (Exotel agent) or SIP Connect over a vSIP trunk (enterprise contact centre). No transfer while the stream is still running is documented. — S6, Exotel, 2025-07-21. Confidence: medium-high (Beta doc). Class: provider docs. Two-source: STILL SINGLE for the Passthru pattern. The next-applet mechanism is CONFIRMED by S5.

21. Known limitation: if a Connect applet follows the stream applet, the audio stream is still relayed while Exotel dials agents (ringing). The client must filter the irrelevant audio, and Exotel says it will fix this "in future releases". — S5, Exotel, 2025-09-16. Confidence: high. Class: provider docs. Two-source: STILL SINGLE.

22. Up to 3 custom parameters can be passed, with a total query length of 256 characters or less. — S6, Exotel, 2025-07-21. Confidence: medium-high. Class: provider docs. Two-source: STILL SINGLE.

23. Neither Exotel voicebot guide covers outbound-call use of the Voicebot applet or India DLT / TCCCPR requirements. — S5, S6. Confidence: high (absence). Class: provider docs.

### C. Sarvam AI

24. Search snippets from Sarvam's legal pages say the Terms, EULA, Data Processing Addendum (DPA) and product-specific terms together form the agreement. Where customers use Sarvam to process personal data on their behalf, the DPA applies with the customer as controller and Sarvam as processor, and personal data is processed under the Privacy Policy and the DPDP Act 2023. — S7 (search snippet only), Sarvam AI, prior round dated 2026-07-29. Confidence: medium (snippet, not full text). Class: provider legal. Two-source: STILL SINGLE; the prior-round finding is repeated, not independently confirmed.

25. The DPA text was not retrievable, and https://www.sarvam.ai/dpa returns HTTP 404. Processing location, sub-processor list, training opt-out mechanics, retention periods and deletion terms under the DPA therefore remain unverified. — S8. Confidence: high (absence). Class: provider legal. The prior-round conflict (Terms say training on customer content is "subject to your consent", while the Privacy Policy describes training unless the customer opts out) is STILL UNRESOLVED.

## Leads

- Airtel, Jio (TrueConnect) and Vi DLT voice FAQs, to confirm or update S2's PE/TM-AF/TM-DF definitions after the 2025 amendment and to see how 1600 numbers are allotted (eligibility: RBI/SEBI/IRDAI/PFRDA-regulated entities, per vendor snippets from c-zentrix and caller.digital, not verified).
- TRAI directions issued under reg. 22 / Schedule-I after Feb 2025 (e.g. the manner of Sender/TM registration, and the auto-dialer declaration format), plus DoT's 1600-series allotment order and its phases.
- Ask Exotel in writing: (a) whether Exotel is registered as TM-DF on each operator's DLT; (b) whether a SaaS platform reselling to multiple enterprises must register as TM-AF; (c) how Exotel provisions 140 and 1600 numbers and which PE registration it expects; (d) whether Voicebot works on outbound calls.
- Law-firm analyses seen only in search results: Saikrishna & Associates, Sigma Chambers, Securiti (Feb 2025 amendment), possible second sources for claims 3, 6 and 7.
- Ask Sarvam for the DPA and sub-processor list directly, or look for a trust centre / DPA link on its Terms page (e.g. a docs.sarvam.ai data-usage page).
- Exotel Passthru applet documentation, for the escalate/response format used in the human handoff.

## Looked for, not found

- A TRAI or operator statement on whether a SaaS/CPaaS customer platform must register as a telemarketer or can operate under its CPaaS provider's registration. Not found in S1, S2 or S3.
- Direction RG-25/(18)/2023-QoS text: not retrieved (budget).
- Any Exotel page from 2025–2026 on TCCCPR 2025 compliance, voice DLT steps, 140/1600 provisioning, or Exotel's role (TM-DF / aggregator) in the chain.
- Human transfer while an Exotel voicebot stream is still running: not documented. Only transfer after the stream ends, through Passthru and Connect, is documented.
- The Sarvam DPA text, sub-processor list, processing location, retention periods, deletion terms and training opt-out procedure (/dpa returns 404).
- A post-2025 operator DLT FAQ covering voice. S2 is from 2023 and predates the 1600 series.
