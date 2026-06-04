# 1.0.0 (2026-06-04)


### Bug Fixes

* **build:** ESM-only output — CJS incompatible with top-level await ([fc10da5](https://github.com/datasynx-ai/datasynx-crm/commit/fc10da51fd47a8b6a7305d1ba994d462bc5c57d1))
* **ci:** switch license-checker from --onlyAllow to --failOn blocklist ([e10bd51](https://github.com/datasynx-ai/datasynx-crm/commit/e10bd51324165c8947ba114ca5ca68ecf88ee2e8))
* **e2e:** resolve 5 bugs found during first-user simulation ([dd29443](https://github.com/datasynx-ai/datasynx-crm/commit/dd29443794f73e44fb2415be036e01b3e97dfec9))
* **e2e:** resolve 9 bugs from E2E audit — RBAC, session, backup, survey, docs ([1b0463e](https://github.com/datasynx-ai/datasynx-crm/commit/1b0463e5e6ac10d789b8737eecef30c3c25a9955))
* **enterprise-B:** P0 concurrent write safety + deadline validation + iteration cap ([1e6807c](https://github.com/datasynx-ai/datasynx-crm/commit/1e6807cb39217d51d5049cf5e259f6f3be97e539))
* **enterprise-B:** P0 concurrent write safety + deadline validation + iteration cap ([9d42222](https://github.com/datasynx-ai/datasynx-crm/commit/9d42222bf99d7b2d499958103d8373b60a8c3eeb))
* **enterprise-C:** LLM circuit breaker, response guard, email normalization, permanently_failed ([4b3af18](https://github.com/datasynx-ai/datasynx-crm/commit/4b3af189b6f3f8c13ae43c53f741be27b91789c2))
* **enterprise-C:** LLM circuit breaker, response guard, email normalization, permanently_failed ([0889825](https://github.com/datasynx-ai/datasynx-crm/commit/088982561d247f0a535686244af866f62390b843))
* honor DXCRM_DATA_DIR in backup and clean vault decrypt errors ([1f6647a](https://github.com/datasynx-ai/datasynx-crm/commit/1f6647a33e04d9a1d847ad43960f31927970895e))
* honor DXCRM_DATA_DIR in status, agent, import and backup schedule ([4e0e93c](https://github.com/datasynx-ai/datasynx-crm/commit/4e0e93c85ab7fef5a085477e4c27fbf87c6ee693))
* **integrity:** atomic writes for agent queue, configs, goals, signals ([84aeadc](https://github.com/datasynx-ai/datasynx-crm/commit/84aeadc4943e892d3b5d7cf7033ef28ba53836eb))
* **integrity:** atomic writes for core customer data files ([413494c](https://github.com/datasynx-ai/datasynx-crm/commit/413494c4ff4e9f844a4e58d278607e9d30d2bc5e))
* **integrity:** atomic writes for customer creation (create + imports) ([7bcdbf8](https://github.com/datasynx-ai/datasynx-crm/commit/7bcdbf84a3f6265b2d0ba1e952081e14f1475c77))
* **integrity:** atomic writes for log_interaction main_facts + backup state ([ba3f25a](https://github.com/datasynx-ai/datasynx-crm/commit/ba3f25aec92769641ef4bcf14f18d440d9f31047))
* **integrity:** atomic writes for vault, rbac and remaining state files ([05b07ca](https://github.com/datasynx-ai/datasynx-crm/commit/05b07ca0863a8132acda9eabcbe185b652aa17ba))
* **integrity:** make withJsonFile and health snapshots crash-safe ([dbbeba5](https://github.com/datasynx-ai/datasynx-crm/commit/dbbeba5c501f4433148f1a827795dc745f72788b))
* **pkg:** correct repository URL and add npm metadata for publishing ([faf268e](https://github.com/datasynx-ai/datasynx-crm/commit/faf268eb0fe13f19af4fc91f6b9f95c46aa4c8a4))
* **security:** atomic JSON writes and escaped interpolated regexes ([96a19e3](https://github.com/datasynx-ai/datasynx-crm/commit/96a19e342a2ec52d1338f90695863345cd5e220b))
* **security:** guard all untrusted name->path inputs (custom objects, KB) ([2dd2a50](https://github.com/datasynx-ai/datasynx-crm/commit/2dd2a50b1edd1b661b5d35791fe9c88158db126a))
* **security:** reject path-traversal slugs at the fs boundary ([617c8b2](https://github.com/datasynx-ai/datasynx-crm/commit/617c8b28868a9ab51e6d731aa65e31a845962ed5))
* **test:** mock lancedb in sync tests to prevent model loading timeout ([de627ca](https://github.com/datasynx-ai/datasynx-crm/commit/de627caff91a419c73feb18d0414029b8f9b13e9))
* **usage:** tolerate a malformed ledger line instead of dropping all usage ([9f24b00](https://github.com/datasynx-ai/datasynx-crm/commit/9f24b005ac55f5164b5f16b9f7c15e8831884d8f))


### Features

* **attach:** dxcrm attach command + export_customer lists attachments ([3cfff44](https://github.com/datasynx-ai/datasynx-crm/commit/3cfff44fadea2e276f2bf4bbe9385bcd9343bcb0))
* **backlog:** schema.json on init + DXCRM_DAEMON_INTERVAL config ([b955674](https://github.com/datasynx-ai/datasynx-crm/commit/b9556749f8782abd36c03a84d84d46c29da4cc14))
* **backup:** restore-drill — verify a backup is restorable (D1) ([7940d1b](https://github.com/datasynx-ai/datasynx-crm/commit/7940d1b00fa671d1edbf90af3875108a3a1ad58a))
* **build:** enterprise npm hardening — P0→P3 plan-enterprise-npm.md implemented ([0bcd6fb](https://github.com/datasynx-ai/datasynx-crm/commit/0bcd6fb10a6b035c83d41bcc6a398047165278f3))
* **capabilities:** add all 50 tools to get_capabilities() + /survey/respond ([c49a1e8](https://github.com/datasynx-ai/datasynx-crm/commit/c49a1e841acf4abd9d34572d5e04bffcd9017c63))
* **cli:** implement CLI commands (create, list, validate, session, guide, init, sync, backup, daemon) ([2e01225](https://github.com/datasynx-ai/datasynx-crm/commit/2e0122599dfb42cc900715d697a6ff7fd0c915db))
* **core+sync:** embedder singleton, calendar-sync, and missing tests ([38be939](https://github.com/datasynx-ai/datasynx-crm/commit/38be9399e76b842eed8c55b4641735eb10a7af16))
* **core:** add custom-fields registry and dxcrm fields CLI (metadata model v1) ([33c08d0](https://github.com/datasynx-ai/datasynx-crm/commit/33c08d01d2fb3723a5a651aeaeb3c96f207a6457))
* **core:** agent memories per customer + global (D6) ([7f0eee0](https://github.com/datasynx-ai/datasynx-crm/commit/7f0eee0409485b44ed76edc369d4b4739427d9a6))
* **core:** ask-your-CRM natural-language Q&A retrieval (D10) ([047bcf0](https://github.com/datasynx-ai/datasynx-crm/commit/047bcf0db9da177b3cae86ccfeae940b239a350d))
* **core:** bi-temporal knowledge-graph edges (validity + transaction time) ([41bd01c](https://github.com/datasynx-ai/datasynx-crm/commit/41bd01cdd731f2ad8ec9638a84715b538985ba13))
* **core:** call/meeting transcript autofill extraction (D9) ([8d690b2](https://github.com/datasynx-ai/datasynx-crm/commit/8d690b221bac0a5bbdbf370b03b90e23aa6ba7d7))
* **core:** churn early-warning engine (D13) ([720791d](https://github.com/datasynx-ai/datasynx-crm/commit/720791dcc2ceac78dd43a7903fb880c7d804b621))
* **core:** command-center metrics from the audit trail ([6aaf46e](https://github.com/datasynx-ai/datasynx-crm/commit/6aaf46ec3e3dd0a1f0b14a62133cff45b57453a7))
* **core:** compliance hardening + local-LLM option (D17) ([c410532](https://github.com/datasynx-ai/datasynx-crm/commit/c410532f7a1e68d756ed8aaefd06191a7c259f28))
* **core:** conversation-intelligence-lite (D16) ([ca32a7a](https://github.com/datasynx-ai/datasynx-crm/commit/ca32a7a18c4bd6f054e59e0e6d8904313b34486d))
* **core:** custom objects (runtime-defined entities, no-migration) ([3c1ae91](https://github.com/datasynx-ai/datasynx-crm/commit/3c1ae913a413530fc65f2bacec7ed5eef4a6de7d))
* **core:** customer segments (marketing lists) ([685d560](https://github.com/datasynx-ai/datasynx-crm/commit/685d56091dd5150961ac79f835932d75b6230c55))
* **core:** data-hygiene scan (missing/malformed/duplicate) (D5) ([4d1f2bb](https://github.com/datasynx-ai/datasynx-crm/commit/4d1f2bb51c9058287f7d4d2bcab513c2eb6499ba))
* **core:** human-in-the-loop approval gate + autonomy policy (D4) ([f37faf1](https://github.com/datasynx-ai/datasynx-crm/commit/f37faf199e17193b8e182e97b01d84386a09e1e9))
* **core:** hybrid-search engine (keyword + RRF fusion) (D2) ([28f2fbb](https://github.com/datasynx-ai/datasynx-crm/commit/28f2fbb2268906b6c350134aee9739cc1c0a0bb3))
* **core:** identity resolution v1 — duplicate detection (CDP) ([386fa16](https://github.com/datasynx-ai/datasynx-crm/commit/386fa1646051a94701998c2a327a9f216743f776))
* **core:** implement LLM integration layer with prompt caching and fallback ([1a686a8](https://github.com/datasynx-ai/datasynx-crm/commit/1a686a8c69bac48a88c94654c7604f05655d9480))
* **core:** journey engine v1 — branching automation ([07f758f](https://github.com/datasynx-ai/datasynx-crm/commit/07f758f0a5db952238b1d474670f92ac05cfc851))
* **core:** multi-agent orchestration v1 (subagent handoff routing) ([7141c6b](https://github.com/datasynx-ai/datasynx-crm/commit/7141c6b21cf9df8f840623a8fc7415b6990e963b))
* **core:** next-best-action engine (D11) ([eee7903](https://github.com/datasynx-ai/datasynx-crm/commit/eee7903a1728b09fa1f6cd0d2fe441d5be31f209))
* **core:** omni-channel routing v1 (skill/availability/load) ([9326e4d](https://github.com/datasynx-ai/datasynx-crm/commit/9326e4ddeb53e9602f3ad9d2f3eb00693f35b7fe))
* **core:** opportunity win-likelihood scoring ([749f521](https://github.com/datasynx-ai/datasynx-crm/commit/749f52133bc33d93c55e87ab89a8c2be6b087236))
* **core:** opt-in PII masking before LLM calls ([9586a5a](https://github.com/datasynx-ai/datasynx-crm/commit/9586a5aae2aaac64aa931138352d605b3591790c))
* **core:** opt-in prompt-injection guardrails for LLM inputs ([ef2de9c](https://github.com/datasynx-ai/datasynx-crm/commit/ef2de9c21a99d32131857e37638597a5738d2753))
* **core:** outbound webhooks with replay store (event-driven CRUD) ([45e77b4](https://github.com/datasynx-ai/datasynx-crm/commit/45e77b4f478a49d0b42b0aa4cb1e9d267e3c964b))
* **core:** per-customer token-cost observability (D3) ([7472183](https://github.com/datasynx-ai/datasynx-crm/commit/74721839af7e0597630cbdbe4f1ca16ab6a132eb))
* **core:** per-customer tonality profiles wired into draft_email (D8) ([e4a40e6](https://github.com/datasynx-ai/datasynx-crm/commit/e4a40e6798a3bef32c8d5b633e39fc46eb4fe061))
* **core:** pluggable vault-backed enrichment layer (D15) ([c296c5f](https://github.com/datasynx-ai/datasynx-crm/commit/c296c5f6fb708c83df2da5790fa099d851c14ce4))
* **core:** predictive lead-scoring model (D14) ([0632fc9](https://github.com/datasynx-ai/datasynx-crm/commit/0632fc9a3933adf88c25d3519a32cbe13734d49f))
* **core:** sop module with hybrid trigger-search (D7) ([7960e29](https://github.com/datasynx-ai/datasynx-crm/commit/7960e299e0ad9fc4c6a915d258389186dd745655))
* **core:** structured buildContextBlock alongside string buildContext ([dda4013](https://github.com/datasynx-ai/datasynx-crm/commit/dda401327db028da519a23927b5e09eae1924638))
* **core:** transfer-to-human escalation (ticket + routing) ([6d5281b](https://github.com/datasynx-ai/datasynx-crm/commit/6d5281b7833ed064831e96e05b164a5771804e5a))
* **D11:** Knowledge Graph Layer — graph.ts, graph-extractor.ts, get_relationship_graph MCP tool ([23ebd82](https://github.com/datasynx-ai/datasynx-crm/commit/23ebd82f7a2768f94adb137d6684eee410d2dcb9)), closes [#15](https://github.com/datasynx-ai/datasynx-crm/issues/15)
* **D11:** optimize getStakeholders dedup, add setNodeRole tests, document get_relationship_graph ([48c6ccf](https://github.com/datasynx-ai/datasynx-crm/commit/48c6ccfda5c46fb11dc53770c59f2341e2314bc6))
* **D12:** Relationship Health Engine — get_relationship_health MCP tool ([2ebc2eb](https://github.com/datasynx-ai/datasynx-crm/commit/2ebc2eb5b8420875871dbdc824937931fa5b307d)), closes [#16](https://github.com/datasynx-ai/datasynx-crm/issues/16)
* **D13:** Autonomous Deal Agent — run_deal_agent + approve_agent_action MCP tools ([16dac71](https://github.com/datasynx-ai/datasynx-crm/commit/16dac71a57abe7c53228b76cfe0f9aba9475a5a7)), closes [#17](https://github.com/datasynx-ai/datasynx-crm/issues/17) [#18](https://github.com/datasynx-ai/datasynx-crm/issues/18)
* **D14:** Revenue Simulation Engine — simulate_revenue MCP tool (Monte Carlo P10/P50/P90) ([421a0a7](https://github.com/datasynx-ai/datasynx-crm/commit/421a0a70333aca6ca5c6e095f229929e55390273)), closes [#19](https://github.com/datasynx-ai/datasynx-crm/issues/19)
* **D15:** Procedural Memory / Playbooks — 4 neue MCP-Tools ([a94ae90](https://github.com/datasynx-ai/datasynx-crm/commit/a94ae9051b398f47d3d09292c81405851d5d368a))
* **D16:** Goal-Based Orchestration — pursue_goal + get_goal_status MCP tools ([97114ef](https://github.com/datasynx-ai/datasynx-crm/commit/97114ef997b478f03432938e2f397c1b866a02c5))
* **D17:** Real-Time Push Ingestion — Gmail Pub/Sub, MS Graph Webhooks, Slack Events ([6c9af34](https://github.com/datasynx-ai/datasynx-crm/commit/6c9af345df2d8a39512605ab2e6e2bab7b05f0e3))
* **d18:** Org Intelligence Layer — buildStakeholderMap + buildRiskAssessment ([3139344](https://github.com/datasynx-ai/datasynx-crm/commit/31393443d43400b69354328e1baaed8384c8e578))
* **d18:** Org Intelligence Layer — buildStakeholderMap + buildRiskAssessment ([1d8e4f2](https://github.com/datasynx-ai/datasynx-crm/commit/1d8e4f27269836e4d46753dc4abf7f996d8325c2))
* **d18:** register get_org_intelligence MCP tool ([4d4c923](https://github.com/datasynx-ai/datasynx-crm/commit/4d4c9235b2fdc47ff4ae87057f6af9c07aedf6d4))
* **d18:** register get_org_intelligence MCP tool ([59a89f4](https://github.com/datasynx-ai/datasynx-crm/commit/59a89f458392acdca707c1328cac0545344680ab))
* **d19:** Multi-Agent Deal Room — buildDealRoom orchestrator + open_deal_room MCP tool ([5b6935e](https://github.com/datasynx-ai/datasynx-crm/commit/5b6935e875d4b3101e3d85cc137df8d2d9aff25b))
* **d19:** Multi-Agent Deal Room — buildDealRoom orchestrator + open_deal_room MCP tool ([64ad000](https://github.com/datasynx-ai/datasynx-crm/commit/64ad0002df8986e06db658addb5825470782d0cb))
* **d20:** Proactive Agent — AgentTask queue + buildDailyBriefing + get_proactive_briefing MCP tool ([b7f3005](https://github.com/datasynx-ai/datasynx-crm/commit/b7f3005ce45cc0cc9bcb4700c6422d40398b1970))
* **d20:** Proactive Agent — AgentTask queue + buildDailyBriefing + get_proactive_briefing MCP tool ([6e1f307](https://github.com/datasynx-ai/datasynx-crm/commit/6e1f3074cfe35fce124dbf6b0d22831f72ec1890))
* **doctor:** --fix cleans orphaned atomic-write temp files ([0bbebc3](https://github.com/datasynx-ai/datasynx-crm/commit/0bbebc39319ffaa39b3c58fbd03df67a427af2d7))
* **doctor:** dxcrm doctor self-diagnostic command ([bbb6864](https://github.com/datasynx-ai/datasynx-crm/commit/bbb6864f15ccbbe8a0bbe7b68562fb924a1bb437))
* **enterprise:** full enterprise feature set — E1–E6 complete ([a72e502](https://github.com/datasynx-ai/datasynx-crm/commit/a72e502b8d7a2b58a094ddef7348dc2a4fc34397))
* **enterprise:** HubSpot migration + enterprise backup — 50 MCP tools ([17d6afb](https://github.com/datasynx-ai/datasynx-crm/commit/17d6afbac6824f69d8e3e8e7b50b4548b4e2187d)), closes [#49](https://github.com/datasynx-ai/datasynx-crm/issues/49) [#50](https://github.com/datasynx-ai/datasynx-crm/issues/50)
* **g1:** harness-content v1→v2 — 30 MCP tools, proactive patterns ([c1fe52f](https://github.com/datasynx-ai/datasynx-crm/commit/c1fe52f2bdbe4fe722962e2a584defd0978fb030))
* **g2:** proactive daemon — runDailyProactiveChecks + CronJob wiring ([8227ea5](https://github.com/datasynx-ai/datasynx-crm/commit/8227ea5873ba7a928799eb1e78b7e18beb00c8c6))
* **g3:** queue-draining + notification dispatch ([677663c](https://github.com/datasynx-ai/datasynx-crm/commit/677663c6d0f6c657b34588e422a3557eb43294af))
* **g4:** external signals — HN, Crunchbase, Clearbit + proactive wiring ([6378bcb](https://github.com/datasynx-ai/datasynx-crm/commit/6378bcb387b9da5bcb6249481d28903f822e1581))
* **g5-g8:** GDPR cleanup, findPath, E2E tests, goal auto-sync ([629da2e](https://github.com/datasynx-ai/datasynx-crm/commit/629da2e010b123e6a262daa6694696aff1848d6e))
* **grok:** Grok Build (xAI) framework adapter — MCP + AGENTS.md harnessing ([c9455fd](https://github.com/datasynx-ai/datasynx-crm/commit/c9455fde05d1b70c211c0848a4c354d25405fa82))
* **h1:** email sequences engine — enroll, process, and auto-send multi-step sequences ([75a1bf5](https://github.com/datasynx-ai/datasynx-crm/commit/75a1bf5a712da59a589a6a2377f00833fb09944c)), closes [#37](https://github.com/datasynx-ai/datasynx-crm/issues/37)
* **h1:** email sequences engine — enroll, process, and auto-send multi-step sequences ([1555f68](https://github.com/datasynx-ai/datasynx-crm/commit/1555f6818c05c6ec4ba216e5a45d7c4f8c876474)), closes [#37](https://github.com/datasynx-ai/datasynx-crm/issues/37)
* **h2+infra:** email templates vault + shared infra (gmail-sender, template-engine) ([3507d3b](https://github.com/datasynx-ai/datasynx-crm/commit/3507d3b3cc49632de590b17e247f43b0ff84df44)), closes [#31](https://github.com/datasynx-ai/datasynx-crm/issues/31) [#32](https://github.com/datasynx-ai/datasynx-crm/issues/32) [#33](https://github.com/datasynx-ai/datasynx-crm/issues/33)
* **h2+infra:** email templates vault + shared infra (gmail-sender, template-engine) ([6568152](https://github.com/datasynx-ai/datasynx-crm/commit/6568152dc2abd0622c523165069ee20638074d34)), closes [#31](https://github.com/datasynx-ai/datasynx-crm/issues/31) [#32](https://github.com/datasynx-ai/datasynx-crm/issues/32) [#33](https://github.com/datasynx-ai/datasynx-crm/issues/33)
* **h3+h6:** Calendly booking links + ticket management with SLA engine ([d88457e](https://github.com/datasynx-ai/datasynx-crm/commit/d88457e76df2973b26f7be470927b1d5412756e0)), closes [#44](https://github.com/datasynx-ai/datasynx-crm/issues/44)
* **h3+h6:** Calendly booking links + ticket management with SLA engine ([bc45b12](https://github.com/datasynx-ai/datasynx-crm/commit/bc45b12f2f51074145955d9563302c050276322d)), closes [#44](https://github.com/datasynx-ai/datasynx-crm/issues/44)
* **h4+h5:** quote generator + HubSpot multi-file CSV import ([0358794](https://github.com/datasynx-ai/datasynx-crm/commit/0358794325886c3df3f03247eaacc5f21a5c168e)), closes [#39](https://github.com/datasynx-ai/datasynx-crm/issues/39)
* **h4+h5:** quote generator + HubSpot multi-file CSV import ([5c58ce5](https://github.com/datasynx-ai/datasynx-crm/commit/5c58ce523628cbd54faa375eebccc9aa268f2fce)), closes [#39](https://github.com/datasynx-ai/datasynx-crm/issues/39)
* **h7+h8:** NPS/CSAT survey engine + knowledge base — 48 MCP tools total ([1ac7319](https://github.com/datasynx-ai/datasynx-crm/commit/1ac7319f22f22e27b07dd021b5e6eb6b6d36519b)), closes [#45](https://github.com/datasynx-ai/datasynx-crm/issues/45) [#46](https://github.com/datasynx-ai/datasynx-crm/issues/46) [#47](https://github.com/datasynx-ai/datasynx-crm/issues/47) [#48](https://github.com/datasynx-ai/datasynx-crm/issues/48)
* **import:** import Salesforce campaign members as Note interactions ([c0ad305](https://github.com/datasynx-ai/datasynx-crm/commit/c0ad3057e4a5b60a3e0e500df01d634865de667e))
* **import:** import Salesforce cases as support tickets ([f78c698](https://github.com/datasynx-ai/datasynx-crm/commit/f78c698664b5dde283190ff60c0a21ff26339710))
* **import:** import Salesforce events as Meeting interactions ([b244df2](https://github.com/datasynx-ai/datasynx-crm/commit/b244df2ced75d856123b3a1b5927e2b5a7dafe5d))
* **import:** import Salesforce leads as customers with lead interaction ([5181aa1](https://github.com/datasynx-ai/datasynx-crm/commit/5181aa175b92312f58e84ebf08d07dc1206d8c5c))
* **import:** import Salesforce notes as Note interactions ([3952e20](https://github.com/datasynx-ai/datasynx-crm/commit/3952e20106ca524b7ad78f4d2696405d34fc4bd3))
* **import:** import Salesforce opportunities into pipeline with pagination ([f2ba1ab](https://github.com/datasynx-ai/datasynx-crm/commit/f2ba1ab18a0e1e207b93db148683c6fcf323a2fa))
* **import:** import Salesforce opportunity line items as quotes ([4092f67](https://github.com/datasynx-ai/datasynx-crm/commit/4092f675ac6d7ff413765f5a08cc9acf572707b5))
* **llm-mapping:** replace heuristic detectFieldMapping with LLM-backed mapCsvFields ([d186c55](https://github.com/datasynx-ai/datasynx-crm/commit/d186c55c1d65ef8bc26d0793251d73591bd8faf3))
* **logging:** size-based rotation + route MCP server logs through logger ([6d21756](https://github.com/datasynx-ai/datasynx-crm/commit/6d21756121fca789af33f3e4b3698658675414e1))
* **logging:** unified structured logger, queryable via CLI and MCP ([3444386](https://github.com/datasynx-ai/datasynx-crm/commit/344438647b1f60e91f7e1c83a20e4a8d0e66615d))
* **mcp:** add bearer-token auth (OAuth 2.1 resource server) to HTTP /mcp ([8769f92](https://github.com/datasynx-ai/datasynx-crm/commit/8769f92707074a957b1c18c8b2630015106b1762))
* **mcp:** add MCP Resources and Prompts (playbooks) ([64dd12d](https://github.com/datasynx-ai/datasynx-crm/commit/64dd12d31c22b84cfa8d546500613642c594e07e))
* **mcp:** add optional LLM tone polish to draft_email ([594f648](https://github.com/datasynx-ai/datasynx-crm/commit/594f64830f372ee056264db20bccb606bb07e7e9))
* **mcp:** add server.json registry manifest ([1ccbe30](https://github.com/datasynx-ai/datasynx-crm/commit/1ccbe309c35cb6cccbb1e63d75493a7e0c889252))
* **mcp:** add trigger_sync + get_audit_log tools and consolidate test coverage ([b6563ef](https://github.com/datasynx-ai/datasynx-crm/commit/b6563ef38d6d8d3f985fe697741c7c65b467d152))
* **mcp:** elicitation helper for missing tool inputs ([b74a461](https://github.com/datasynx-ai/datasynx-crm/commit/b74a461fe600088994cefece3282e1a5d0686b5e))
* **mcp:** expose custom objects via MCP tools (56 tools total) ([5e6a883](https://github.com/datasynx-ai/datasynx-crm/commit/5e6a883784eec9f5ce4e44846ea238aa280dc3d2))
* **mcp:** HTTP transport + dxcrm mcp start command ([4f58b05](https://github.com/datasynx-ai/datasynx-crm/commit/4f58b05ea723c909c729785c32f8747c3957bf08))
* **mcp:** tool-search over the tool catalog (lazy discovery) ([5057d32](https://github.com/datasynx-ai/datasynx-crm/commit/5057d32b22ff245fcd523e17932dad896de46af9))
* **phase-d:** P2-6 cross-provider email dedup via normalizeEmail ([659bae8](https://github.com/datasynx-ai/datasynx-crm/commit/659bae81313c4c5d9832e50daf47ef9e5fa4efde))
* **phase-d:** P2-6 cross-provider email dedup via normalizeEmail ([9da8f26](https://github.com/datasynx-ai/datasynx-crm/commit/9da8f269c3b0a4d1e5a80ca1bd1dae48da147997))
* **phase-d:** playbook OR-logic and DST-safe date arithmetic ([c97de9c](https://github.com/datasynx-ai/datasynx-crm/commit/c97de9c469b813e0dff94d3df383703dbf67bb0d))
* **phase-d:** playbook OR-logic and DST-safe date arithmetic ([259c51b](https://github.com/datasynx-ai/datasynx-crm/commit/259c51bfb2d7b5644a043c5ff6ccda2e4c2a0e5b))
* **phase-d:** winning-only byCloseMonth, graph pruning, goal progress sync ([6caf360](https://github.com/datasynx-ai/datasynx-crm/commit/6caf360701ffc81d6de77e2cf493dbd5f119dad6))
* **phase-d:** winning-only byCloseMonth, graph pruning, goal progress sync ([937491b](https://github.com/datasynx-ai/datasynx-crm/commit/937491b59102a50d5f47de4e1200937f0449783b))
* **phase2:** add agent spawn, import command, LLM transcript watcher, full test coverage ([13ebfae](https://github.com/datasynx-ai/datasynx-crm/commit/13ebfae5dbdd08429317a74cf101e9a9c9edf04a))
* **phase2:** add Foundation Layer — sync-state, oauth-store, on-query sync, last_touchpoint ([a5f52d8](https://github.com/datasynx-ai/datasynx-crm/commit/a5f52d83f57bb35edcb5eb132b3fdeea258c67fe))
* **phase2:** add status command, backup schedule, daemon improvements ([9f4deee](https://github.com/datasynx-ai/datasynx-crm/commit/9f4deee01597280258fe7bfabcab197552fb9dab))
* **phase3:** complete Week 12 — deployment docs, dxcrm init --team, dxcrm server ([5ceb26c](https://github.com/datasynx-ai/datasynx-crm/commit/5ceb26cdaa35cc9264be639a16dd5b20454f625d))
* **phase3:** implement Team Layer — audit trail, session ownership, server command ([6cd092b](https://github.com/datasynx-ai/datasynx-crm/commit/6cd092b3b4a903dcd91805544b297758007ebdd3))
* **phase4:** enterprise layer — RBAC, GDPR, Microsoft/Salesforce sync, write-queue ([40ca15b](https://github.com/datasynx-ai/datasynx-crm/commit/40ca15b99023bba8f0e47850682dcbdd24615a4f))
* **phase5:** migration layer — update_customer_facts, Pipedrive import, LLM field mapping ([3a456f4](https://github.com/datasynx-ai/datasynx-crm/commit/3a456f44f2af5ae3ea98ddffaf1df3e95e671366))
* **R1:** HubSpot v4 Associations Connector — contacts + activity history ([b93aa77](https://github.com/datasynx-ai/datasynx-crm/commit/b93aa77026e7a0462ad45360c58f7992db970411))
* **R6:** SSO, Google Drive sync, E2E tests, CLI sync --provider ([50c412f](https://github.com/datasynx-ai/datasynx-crm/commit/50c412f8c43738f6dba84567212f079d3da5e885))
* **rbac:** enforce RBAC in write MCP tools + fix rep permissions ([2ff428f](https://github.com/datasynx-ai/datasynx-crm/commit/2ff428fb3c3bd63c85f695be3fd7432e2646b257))
* **rbac:** field-level access control (redact sensitive fields by role) ([0c5752b](https://github.com/datasynx-ai/datasynx-crm/commit/0c5752b4e7804fde13da8bcda1898464f125c6f6))
* **rbac:** RBAC enforcement on export_customer + can_see data-visibility filtering ([ee7afab](https://github.com/datasynx-ai/datasynx-crm/commit/ee7afab856078bcfd7ceea3bd47a67bd3dadc441))
* **remaining:** Sprints R1–R5 — HubSpot, Gmail Push Watch, Webhooks, Plugins, Intelligence ([8248a2b](https://github.com/datasynx-ai/datasynx-crm/commit/8248a2bc729501d82460a388cf39c7d46ba22f1c))
* **schemas+fs+ui:** implement schemas, FS utilities, UI helpers ([b79108d](https://github.com/datasynx-ai/datasynx-crm/commit/b79108df670f823061976452541bde0730f4bcac))
* **sprint6-8:** validate --fix, Salesforce/Pipedrive file import, Microsoft Calendar, team sessions overview ([676192c](https://github.com/datasynx-ai/datasynx-crm/commit/676192cf05e272a7b020c0e6a230738a55c57f85))
* **sprint9:** E2E tests, HTML docs, agent context, updated README ([bfa394c](https://github.com/datasynx-ai/datasynx-crm/commit/bfa394c42be27843c7c4e6b1ac0080124e588c4d))
* **survey:** /survey/respond HTTP endpoint — close NPS/CSAT survey loop ([bd52efe](https://github.com/datasynx-ai/datasynx-crm/commit/bd52efeac67dafea5e2b0659bd64472f8e2447ee))
* **sync:** implement vector indexing pipeline and full sync command ([c891ca0](https://github.com/datasynx-ai/datasynx-crm/commit/c891ca0dce008e142240e7495367efda1cae4be4))
* **sync:** paginate Salesforce contacts and tasks (remove 200/500 caps) ([7fa237a](https://github.com/datasynx-ai/datasynx-crm/commit/7fa237a71bb8de9928618c31cdeec5956a80c8c9))
* **sync:** phase-2 domino 2a+2b — gmail hardening + telegram agent wake ([6fe53b8](https://github.com/datasynx-ai/datasynx-crm/commit/6fe53b825b2f55f02a197c11062214eefb9e52de))
* **sync:** use LLM for transcript-to-customer matching with heuristic fallback ([91664a2](https://github.com/datasynx-ai/datasynx-crm/commit/91664a27b72bd69c7e56b4f8baaeced83a72d478))
* v0.1.0 — close all open tasks, optimize, complete documentation ([e485b19](https://github.com/datasynx-ai/datasynx-crm/commit/e485b19f772115374d344af9f88e61b0cf177443))
* **vault:** local AES-256-GCM credential vault (D12) ([1d4f1ba](https://github.com/datasynx-ai/datasynx-crm/commit/1d4f1baaca3868ed1f5f2b8be9d6fa0844f1a5b3))


### Performance Improvements

* cut redundant I/O in hot read paths ([6e450c3](https://github.com/datasynx-ai/datasynx-crm/commit/6e450c38b4d975d6870d113bcf350e653b9245f4))
* **deps:** replace googleapis mega-package with scoped clients ([6159fda](https://github.com/datasynx-ai/datasynx-crm/commit/6159fdafe41eb3e9adc9296ab2f5839b576ab4ec))
* **import-hubspot:** linear engagement dedup and batched main_facts writes ([abfe23d](https://github.com/datasynx-ai/datasynx-crm/commit/abfe23d5e863c5e1bd3d983bb19bb4d0fa0a7c36))
* **import:** make bulk import dedup linear instead of O(rows squared) ([76c62eb](https://github.com/datasynx-ai/datasynx-crm/commit/76c62eb4bd151d58ab13f3ed1442696766e7bb26))
* **kb:** look up and delete articles by file path, not full-KB scan ([e3efe89](https://github.com/datasynx-ai/datasynx-crm/commit/e3efe8905876f901c07aac54358eea6fc891553e))
* **sync:** read interactions once before loop + update sync docs ([bc80629](https://github.com/datasynx-ai/datasynx-crm/commit/bc8062989f35864337d8896b2d32801e2365f4a0))

# Changelog

All notable changes to `@datasynx/opencrm` are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)

## [Unreleased]

### Changed — Optimization pass

- **Dependencies:** replaced the `googleapis` mega-package (~112 MB installed,
  pulls every Google API) with the scoped `@googleapis/gmail`,
  `@googleapis/calendar` and `google-auth-library` — cutting roughly 110 MB
  from the transitive install. Gmail/Calendar sync behavior is unchanged.
- **Dependencies:** dropped three declared-but-unused packages (`@iarna/toml`,
  `@topcli/spinner`, `which`).

### Fixed

- `dxcrm status`, `dxcrm agent`, `dxcrm import`, `dxcrm backup`/`restore` and
  `dxcrm backup schedule` now honor `DXCRM_DATA_DIR` (these command actions
  previously fell back to the current working directory, so e.g. `status`
  reported 0 customers when the data dir was set elsewhere).
- `dxcrm vault get|list` with a wrong master key now prints a clear error and
  exits 1 instead of crashing with an uncaught crypto exception.
- Consolidated the customer-slug listing duplicated across ~13 files into a
  single `listCustomerSlugs` helper; several copies used an unguarded
  `statSync` that could throw on a file-race — the shared helper guards it.

## [0.1.0] — 2026-06-02

### Added — Core Loop (Phase 1)

- `dxcrm init` — framework detection + MCP harness generation for 9 adapters (Claude Code, Codex, Cursor, Hermes, Continue, Cline, Zed, Windsurf, generic)
- `dxcrm create` — customer scaffold with `main_facts.md`, `interactions.md`, `pipeline.md`, `sources.json`
- `dxcrm sync <slug>` — Gmail + Google Calendar sync via googleapis (OAuth2), with pagination (5 pages via nextPageToken) and exponential backoff retry
- `dxcrm daemon start/stop/status` — background sync daemon running on 30-minute cron
- `dxcrm session open/close/status` — customer session management with active-session tracking
- `dxcrm validate` — schema validation for all customer directories against Zod schemas
- `dxcrm backup` — ZIP backup with SHA-256 integrity
- `dxcrm backup restore` — restore from a named backup archive
- `dxcrm backup verify` — verify backup integrity via SHA-256 checksum
- `dxcrm backup list` — list all available backups with metadata
- `dxcrm backup schedule` — automated backup schedule with configurable retention policy
- `dxcrm list` — customer list with pipeline health filter (hot/warm/cold/stalled)
- `dxcrm status` — CRM health dashboard showing sync state and unmatched transcripts
- `dxcrm audit` — audit log viewer with filtering by date, user, and operation
- `dxcrm gdpr erase` — GDPR erasure of all customer data including LanceDB vector cleanup
- `dxcrm guide` — in-terminal documentation for all commands

### Added — MCP Server (50 tools)

- **Customer CRUD**: `create_customer`, `get_customer`, `update_customer`, `delete_customer`, `list_customers`
- **Interaction management**: `add_interaction`, `get_interactions`, `update_interaction`, `delete_interaction`
- **Pipeline operations**: `get_pipeline`, `update_pipeline_stage`, `get_pipeline_health`
- **Session tools**: `open_session`, `close_session`, `get_session_status`
- **Sync tools**: `sync_customer`, `get_sync_status`, `list_unmatched_transcripts`
- **Search**: `search_customers`, `semantic_search` (LanceDB-backed vector search)
- **Knowledge base**: `create_kb_article`, `get_kb_article`, `list_kb_articles`, `delete_kb_article`
- **Sequences**: `create_sequence`, `get_sequence`, `list_sequences`, `update_sequence_step`
- **Email templates**: `create_template`, `get_template`, `list_templates`, `delete_template`
- **Quotes**: `create_quote`, `get_quote`, `list_quotes`, `update_quote_status`
- **Tickets**: `create_ticket`, `get_ticket`, `list_tickets`, `update_ticket_status`
- **Surveys**: `create_survey`, `get_survey`, `list_surveys`
- **RBAC**: `get_my_role`, `list_rbac_roles`, `set_rbac_role`
- **Audit**: `get_audit_log`
- **GDPR**: `gdpr_erase`
- **Capabilities**: `get_capabilities` — always returns current, complete tool documentation

### Added — Phase 2 Features

- `dxcrm agent spawn <slug>` — per-customer Telegram wake agent for real-time notifications
- Gmail sync pagination (5 pages via `nextPageToken`) + exponential backoff on rate-limit errors
- `dxcrm import --from hubspot|salesforce|pipedrive|csv` — CRM data migration
- `dxcrm import --mode api` — Salesforce and Pipedrive API-based import (OAuth)
- Telegram wake notification on new inbound email (via `notifyAgentWake`)

### Added — Enterprise Features

- RBAC with roles: `admin`, `manager`, `rep` — per-tool enforcement and customer visibility scoping
- Audit trail for all write operations (who, what, when, result)
- `dxcrm security-report` — SOC2 / security questionnaire export (Markdown + JSON)
- `dxcrm rbac show` — display current role assignments
- `dxcrm rbac set <user> <role>` — assign a role to a user
- `dxcrm rbac set-default <role>` — set the default role for new users
- `dxcrm rbac owned` — list customers owned by the current user
- LanceDB embedded semantic search with Float32 vectors and `@huggingface/transformers` embeddings
- Knowledge base articles, sequences, email templates, quotes, tickets, surveys

### Added — Developer / Package

- Dual ESM + CJS output via `tsdown`
- TypeScript declarations for all public APIs (`.d.ts` + `.d.cts`)
- `publint` + `@arethetypeswrong/cli` (`attw`) validation in `prepublishOnly`
- 5-stage GitHub Actions CI/CD pipeline (lint → typecheck → test → build → publish)
- `semantic-release` for automated versioning and changelog generation
- `commitlint` + `husky` pre-commit hooks enforcing Conventional Commits
- ESLint (`typescript-eslint`) + Prettier code quality tooling
- 2123 tests (Vitest, memfs for filesystem mocking, 80% coverage threshold)
- npm provenance attestation (`@datasynx/opencrm` scoped package, `publishConfig.provenance: true`)
