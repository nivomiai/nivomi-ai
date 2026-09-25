# Digest D3 part 2: DPDP breach, cross-border transfer, SDF, penalties, CERT-In

Research run: domain-india-ai-outbound-calling-compliance-2026-09-25. Accessed 2026-09-25.
Budget used: 6 sources read in full (S1 to S6). Everything else below comes from search-result snippets and is labelled as such.

## Sources read

| ID  | Source                                                                                                                                                                                                     | Publisher                | Pub date   | Type                                            |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | ---------- | ----------------------------------------------- |
| S1  | https://www.meity.gov.in/static/uploads/2025/11/53450e6e5dc0bfa85ebd78686cadad39.pdf (DPDP Rules, 2025, G.S.R. 846(E), Gazette of India Extraordinary, English and Hindi text)                             | MeitY / Gazette of India | 2025-11-13 | Primary (full text, extracted with pypdf)       |
| S2  | https://static.pib.gov.in/WriteReadData/specificdocs/documents/2025/nov/doc20251117695301.pdf ("DPDP Rules, 2025 Notified", explainer)                                                                     | PIB, Government of India | 2025-11-17 | Primary (government explainer)                  |
| S3  | https://www.cert-in.org.in/PDF/CERT-In_Directions_70B_28.04.2022.pdf (No. 20(3)/2022-CERT-In, Directions under s.70B(6) IT Act)                                                                            | CERT-In, MeitY           | 2022-04-28 | Primary (full text)                             |
| S4  | https://www.livelaw.in/articles/india-data-protection-board-established-law-543751 ("India's Data Protection Board: Established In Law, Absent In Fact", Dr. Raghvendra Kumar Chaudhary)                   | LiveLaw                  | 2026-08-01 | Secondary (legal commentary)                    |
| S5  | https://www.mondaq.com/india/data-protection/1773554/meity-plans-to-cut-short-dpdp-compliance-timeline-and-notify-cross-border-restrictions-for-sdfs (S.S. Rana & Co., Anuradha Gandhi and Rachita Thakur) | Mondaq / S.S. Rana & Co. | 2026-04-15 | Secondary (law firm; read through a summarizer) |
| S6  | Search-result snippets (not fetched): MediaNama (2025-11), india-briefing.com, PIB PRID 1820904 / 1837487 titles, Wikipedia "Data Protection Board of India", Storyboard18, matters.ai, dpdpa.com          | various                  | various    | Snippets, corroboration only                    |

Caution: a summarizer pass over S2 (WebFetch) reported that Rule 15 allows transfers to countries with an "adequacy determination" or "appropriate safeguards". The extracted primary text in S1 and S2 contains neither phrase. That report was a hallucination and is excluded from this digest. S5 went through the same kind of summarizer, so its claims have medium confidence at most.

## Claims

### Commencement (this decides what is in force on 2026-09-25)

1. The DPDP Rules, 2025 were published as G.S.R. 846(E) dated 13 November 2025. Under Rule 1(2), Rules 1, 2 and 17 to 21 took effect on publication. Under Rule 1(3), Rule 4 (Consent Managers) takes effect one year after publication. Under Rule 1(4), Rules 3, 5 to 16, 22 and 23 take effect eighteen months after publication. Rules 5 to 16 cover security safeguards (6), breach intimation (7), retention (8), SDF obligations (13) and cross-border transfer (15). So on 2026-09-25 none of these rules is yet in force; they take effect around 13/14 May 2027.
   - source: S1, Rule 1 | publisher: MeitY/Gazette of India | pub_date: 2025-11-13 | accessed 2026-09-25 | confidence: high | class: regulatory | two-source: confirmed by #2 (18-month phasing) and S6 snippets (india-briefing: "14 May 2027"; MediaNama/dpdpa snippet: Rule 7 is in the 18-month group). The exact end date is a contradiction; see Leads L1.
2. PIB says the Rules were notified on 14 November 2025 and "introduce an eighteen-month period for phased compliance".
   - source: S2 | publisher: PIB | pub_date: 2025-11-17 | accessed 2026-09-25 | confidence: high | class: regulatory | two-source: confirmed by #1.

### Personal data breach intimation (Rule 7; Act s.8(6))

3. Under Rule 7(1), once a Data Fiduciary becomes aware of any personal data breach, it must tell each affected Data Principal, to the best of its knowledge, "in a concise, clear and plain manner and without delay". The notice goes through her user account or any mode of communication she registered. It must cover: (a) the nature, extent and timing of the breach; (b) the likely consequences for her; (c) mitigation measures taken or in progress; (d) safety measures she can take; (e) business contact information of a person who can answer queries.
   - source: S1, Rule 7(1) | publisher: MeitY/Gazette | pub_date: 2025-11-13 | accessed 2026-09-25 | confidence: high | class: regulatory | two-source: confirmed by S2 ("inform all affected individuals without delay ... plain language ... what happened, the possible impact and the steps taken ... contact details for help").
4. Under Rule 7(2)(a), the Data Fiduciary must also tell the Data Protection Board "without delay", describing the breach's nature, extent, timing, location of occurrence and likely impact.
   - source: S1, Rule 7(2)(a) | confidence: high | class: regulatory | two-source: confirmed by S6 snippet (MediaNama/scrut: immediate intimation to the Board describing nature, extent, timing). The snippet was not fetched, so corroboration is weak.
5. Under Rule 7(2)(b), within 72 hours of becoming aware of the breach, the Data Fiduciary must send the Board: (i) updated and detailed information; (ii) the facts, circumstances and reasons that led to the breach; (iii) mitigation measures; (iv) any findings about the person who caused the breach; (v) remedial measures to prevent recurrence; (vi) a report on the intimations given to affected Data Principals. The Board may allow a longer period on a written request.
   - source: S1, Rule 7(2)(b) | confidence: high | class: regulatory/quantitative | two-source: confirmed by S6 snippets (MediaNama 2025-11 "Data Breach Reporting Timeline ..."; search-result summaries of Rule 7 giving 72 hours and the extension on written request). The snippets were not fetched.
6. Rule 7 covers "any personal data breach". The rule text contains no materiality or risk-of-harm threshold, so every breach has to be reported to both the individuals and the Board.
   - source: S1, Rule 7(1)-(2) (inference from the text's wording) | confidence: medium | class: regulatory | two-source: single-source (textual inference).

### Reasonable security safeguards (Rule 6; Act s.8(5))

7. Rule 6(1) sets a minimum set of safeguards that applies to processing done by the Data Fiduciary or by a Data Processor on its behalf:
   - (a) encryption, obfuscation, masking or virtual tokens;
   - (b) access control over computer resources;
   - (c) visibility on access through logs, monitoring and review, to detect, investigate and remediate unauthorised access;
   - (d) continuity measures such as data backups;
   - (e) retention of those logs and personal data for one year, unless another law requires otherwise;
   - (f) contract clauses requiring the Data Processor to take reasonable security safeguards;
   - (g) appropriate technical and organisational measures.
   - source: S1, Rule 6(1)(a)-(g) | confidence: high | class: regulatory | two-source: single-source for the itemised list. S2 does not list safeguards. The one-year log figure is confirmed within S1 by #8, which is not independent.
8. Rule 8(3) requires a Data Fiduciary to keep personal data, "associated traffic data and other logs of the processing" for at least one year from the date of processing, for the purposes in the Seventh Schedule, and then erase them unless another law requires longer. This covers processing done on its behalf by a Data Processor. Illustration Case 2 says a fiduciary using a cloud provider as its processor must make sure the provider also keeps data and logs for at least one year.
   - source: S1, Rule 8(3) and Illustration | confidence: high | class: regulatory/quantitative | two-source: single-source (primary text).

### Cross-border transfer (Act s.16; Rule 15; Rule 13(4))

9. Rule 15 allows personal data processed under the Act to be transferred outside India. The only restriction is that the Data Fiduciary must meet whatever requirements the Central Government specifies, by general or special order, about making the data available to a foreign State or to any person, entity or agency under a foreign State's control. The Rules contain no adequacy test, SCC or consent-for-transfer mechanism.
   - source: S1, Rule 15 | confidence: high | class: regulatory | two-source: confirmed in part by S5, which describes Rule 15 as a Central Government restriction on transfers. The absence of adequacy/SCC mechanisms rests on the primary text only.
10. As of 15 April 2026, no order under Rule 15, no Section 16 restricted-country notification and no Rule 13(4) localisation list had been notified. S5 describes these as proposals that MeitY wants to enforce "immediately". This run found no evidence of any such notification between April and September 2026 (see "Looked for, not found").
    - source: S5 | publisher: S.S. Rana & Co. via Mondaq | pub_date: 2026-04-15 | confidence: medium | class: regulatory | two-source: single-source (the Chambers copy of the same article is not independent).

### Significant Data Fiduciary (Act s.10; Rule 13)

11. Rule 13 sets these SDF obligations:
    - (1) a Data Protection Impact Assessment and an audit once every 12 months from notification as an SDF;
    - (2) the assessor or auditor furnishes the Board a report of significant observations;
    - (3) due diligence to verify that technical measures, "including algorithmic software", used to host, display, upload, modify, publish, transmit, store, update or share personal data are not likely to put Data Principals' rights at risk;
    - (4) measures to ensure that personal data specified by the Central Government, on a committee's recommendation, is processed so that "the personal data and the traffic data pertaining to its flow is not transferred outside the territory of India".
    - source: S1, Rule 13(1)-(5) | confidence: high | class: regulatory | two-source: confirmed by S2 (SDFs "must conduct independent audits and carry out impact assessments ... stricter checks while using new or sensitive technologies ... government directions on restricted categories of data, including local storage").
12. As of April 2026 no entity or class of entities had been notified as an SDF under s.10(1). MeitY proposed fast-tracking SDF notification on 23 January 2026. This run found no later SDF notification.
    - source: S5 | confidence: medium | class: regulatory | two-source: single-source.
13. The SDF criteria (volume and sensitivity of data, risk to Data Principals' rights, sovereignty, electoral democracy, security, public order) and the India-based DPO and independent data auditor requirements are in s.10 of the Act. This run did not retrieve s.10, so these points remain an unverified belief and are not concluded here.
    - class: definition | confidence: low | two-source: not evidenced this run.

### Penalties and the Data Protection Board

14. Under the Act's penalty Schedule (s.33), failing to maintain reasonable security safeguards can draw a penalty of up to INR 250 crore. Failing to notify the Board or affected individuals of a breach can draw up to INR 200 crore, and so can breaching obligations relating to children. Any other breach of the Act or Rules by a Data Fiduciary can draw up to INR 50 crore.
    - source: S2 | publisher: PIB | pub_date: 2025-11-17 | confidence: high | class: quantitative/enforcement | two-source: the INR 250 crore figure is confirmed by S4 ("penalties up to ₹250 crore (Sections 27 and 33)"). The INR 200 crore and INR 50 crore figures are single-source primary (S2), plus the matters.ai snippet title "₹200 Cr Penalty", which is an aggregator.
15. PIB states that the Rules establish a fully digital Data Protection Board of four members, with online complaint filing through a portal and app, and appeals to TDSAT.
    - source: S2 | confidence: high | class: regulatory | two-source: single-source for the four-member figure. The Board's constitution provisions sit in Rules 17 to 21, which were in force from publication (S1, Rule 1(2)).
16. As of 1 August 2026 the Board had no Chairperson and no Members. MeitY sought nominations on 6 May 2026 and issued a further notice on 6 June 2026. S4 reports no enforcement actions.
    - source: S4 | publisher: LiveLaw | pub_date: 2026-08-01 | confidence: medium | class: enforcement | two-source: confirmed in part by S6 snippets (a MeitY PDF "F. No. 2(1)/2026-Pers.I" dated May 2026 on meity.gov.in, not read; a Storyboard18 report of a Cabinet Secretary-led search-cum-selection committee). Contradicted by a Wikipedia snippet; see L2.

### Proposed 2026 amendments

17. On 23 January 2026 MeitY presented proposals to industry and sought comments by 4 February 2026. The proposals were:
    - cut the compliance period from 18 to 12 months, moving the deadline from 13 May 2027 to 13 November 2026;
    - fast-track SDF notification;
    - enforce the Rule 13(4) and Rule 15 cross-border restrictions immediately;
    - enforce the s.17(2) state-instrumentality exemptions immediately.
    - source: S5 | confidence: medium | class: regulatory | two-source: single-source (S6 india-briefing and chambers.com snippets repeat the same content). It is unclear whether the shorter timeline applies to all fiduciaries or only to SDFs; see L3. This run found no evidence that the amendment has been notified.

### CERT-In Directions, 28 April 2022 (s.70B(6) IT Act)

18. Direction (ii): service providers, intermediaries, data centres, body corporates and Government organisations must report the cyber incidents listed in Annexure I to CERT-In within 6 hours of noticing them or being told about them. Annexure I includes data breach, data leak, unauthorised access to IT systems or data, attacks affecting cloud computing systems, and attacks on AI/ML systems.
    - source: S3, direction (ii) and Annexure I | publisher: CERT-In | pub_date: 2022-04-28 | confidence: high | class: regulatory/quantitative | two-source: single-source (primary text; the PIB PRID 1820904 release was seen only as a title).
19. Direction (iv): the same entities must enable logs of all their ICT systems and keep them securely for a rolling 180 days within Indian jurisdiction, and give them to CERT-In with an incident report or on order.
    - source: S3, direction (iv) | confidence: high | class: regulatory/quantitative | two-source: confirmed by S6 (search-engine extraction of the PIB/CERT-In page giving the same 180-day, within-India wording).
20. Direction (i): all ICT system clocks must sync to the NTP servers of NIC or NPL, or to NTP servers traceable to them. Entities spanning multiple geographies may use another accurate standard time source, provided it does not deviate from NPL/NIC.
    - source: S3, direction (i) | confidence: high | class: regulatory | two-source: single-source.
21. Direction (iii) requires a Point of Contact designated to CERT-In (Annexure II format) and compliance with CERT-In information orders within the specified timeframe. Direction (v) requires data centres, VPS, cloud and VPN providers to keep validated subscriber details (names, hire period, IPs, email and IP at onboarding, purpose, address and contact numbers, ownership pattern) for 5 years. The Directions took effect 60 days after issue. PIB PRID 1837487 extended enforcement to 25 September 2022 for MSMEs and for the subscriber-validation aspects.
    - source: S3; the extension is from an S6 PIB title (PRID 1837487) | confidence: high (S3) / medium (extension) | class: regulatory | two-source: single-source each.
22. Whether a SaaS company counts as a "Cloud Service provider" under direction (v), or only as a "body corporate" under directions (i) to (iv), is not settled in S3. S3 does not define these terms. The CERT-In FAQs of 2022 (PIB PRID 1826388) address this but were not read.
    - class: definition | confidence: low | two-source: not evidenced.

## Glossary

- **Data Fiduciary**: an entity that decides, alone or with others, why and how personal data is processed. (S2)
- **Data Processor**: any entity that processes personal data on behalf of a Data Fiduciary. (S2)
- **Data Principal**: the individual the personal data relates to. For a child this includes a parent or guardian; for a person with a disability, a lawful guardian. (S2)
- **Significant Data Fiduciary (SDF)**: a Data Fiduciary, or class of them, notified by the Central Government under s.10; carries the extra duties in Rule 13. (S1, S2; the s.10 criteria were not retrieved)
- **Traffic data (Rules 8(3), 13(4))**: used but not defined in the parts of S1 read. For the SDF localisation rule it means "traffic data pertaining to [the] flow" of specified personal data. (S1)
- **Computer resource**: has the meaning in the IT Act, 2000. (S1, Rule 6(2))
- **Data Protection Board of India (DPB)**: an independent, digital-first body with four members under the Rules, which enforces the Act. Appeals go to TDSAT. (S2)
- **CERT-In Directions 70B**: directions of 28 April 2022 under s.70B(6) of the IT Act on incident reporting, logs, time sync and subscriber records. (S3)
- **Annexure I incidents**: the 20 incident types CERT-In requires to be reported within 6 hours, including data breach and data leak. (S3)

## Leads

### Contradictions

- **L1: publication date and deadline.** The Gazette is dated 13 November 2025 (S1), but PIB says it was notified on 14 November 2025 (S2). The 18-month deadline is therefore quoted as 13 May 2027 (S5) or 14 May 2027 (india-briefing snippet). The rule says "eighteen months after the date of publication in the Official Gazette", so check the e-Gazette publication date on egazette.gov.in.
- **L2: whether the DPB has a chair.** A Wikipedia snippet names a Chairperson ("Mr. Ghosal Pankaraj IMS"). S4 (LiveLaw, 1 August 2026) says there is no Chairperson or Member, and the MeitY May/June 2026 nomination notices point the same way. Treat the Wikipedia claim as unreliable until a PIB or Gazette appointment notice is found. Also check whether anyone was appointed between August and September 2026.
- **L3: scope of the shortened timeline.** S5's headline says the proposal cuts the deadline "for SDFs" only, but its body describes an 18-to-12-month change to the general deadline, and there is a separate proposal about "data retention requirements within 90 days". If notified for everyone, Rules 6, 7, 8 and 15 would bind from 13 November 2026, seven weeks from today. This needs primary confirmation (e-Gazette or a MeitY draft) as the highest priority.
- **L4: two different log rules.** Rule 6(1)(e) and Rule 8(3) require one-year retention of logs, personal data and traffic data, with no location requirement. CERT-In direction (iv) requires 180 days of ICT logs kept in India. Both apply to different scopes, so the product must satisfy the stricter of the two for each log class: at least one year, with the CERT-In-scope ICT logs held in India. There is also tension between Rule 8(3)'s minimum retention and the storage-limitation and erasure rights.

### New threads

- **Rule 7 against CERT-In's 6 hours.** A single breach can trigger both a "without delay" intimation to the DPB and principals and a 6-hour CERT-In report. The incident runbook should handle both in parallel. Check whether MeitY or CERT-In have harmonised these.
- **Processor contract clause.** Rule 6(1)(f) requires security clauses in processor contracts, and Rule 8(3) Illustration Case 2 extends retention duties to cloud processors. This points to a need for a DPA template for Nivomi's own sub-processors, and for Nivomi's role as processor for its business customers.
- **CERT-In FAQs (PIB PRID 1826388, May 2022).** These are needed to settle whether SaaS providers fall under direction (v) and whether logs can be kept abroad if a copy stays in India.
- **Act s.10 and s.16, and the Schedule to s.33.** Fetch the primary Act text (https://www.meity.gov.in/static/uploads/2024/06/2bf1f0e9f04e6fb4f8fef35e82c42aa5.pdf) to confirm the SDF criteria, the India-based DPO and independent auditor requirements, the s.16 negative-list mechanism and the penalty amounts, which S2 gives only as a summary.
- **MeitY PDF "F. No. 2(1)/2026-Pers.I".** At https://www.meity.gov.in/static/uploads/2026/05/cd481c027470b420b4cb85fb40a91c53.pdf; this is the primary source for the DPB appointment process.

## Looked for, not found

- Any notified Section 16 restricted-country list, Rule 15 general or special order, or Rule 13(4) localisation list as of 2026-09-25. None found; the latest evidence is S5 (April 2026), which calls these proposals.
- Any entity or class notified as an SDF. None found.
- Final notification of the January 2026 amendment proposals, meaning the shortened timeline. Not found.
- Any DPB enforcement action or penalty order. None found; S4 reports none as of August 2026.
- RBI payment data localisation (2018 circular) and how it applies to a platform that bills customers. Not researched within budget; a lead for another dimension.
- Any amendment or withdrawal of the CERT-In 2022 Directions after 2022. Not searched within budget; status is presumed unchanged but this is unverified.
- Act s.10 SDF criteria and DPO/auditor text. Not retrieved (see #13).
