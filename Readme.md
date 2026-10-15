Yes — and I actually think this is a **much better environment for the learning system you're describing**.

What you want is not simply an "AI pentesting tutor." It is closer to a **persistent pentester skill-assessment engine**:

```text
                  YOU
                   │
                   ▼
             DAILY SESSION
                   │
          ┌────────┴────────┐
          ▼                 ▼
     New questions       Weak areas
          │                 │
          └────────┬────────┘
                   ▼
             AI EVALUATOR
                   │
        ┌──────────┼──────────┐
        ▼          ▼          ▼
     Correct    Partial     Wrong
        │          │          │
        ▼          ▼          ▼
     Increase    Maintain    Review
     mastery     mastery     later
                   │
                   ▼
             STUDENT MODEL
                   │
                   ▼
          NEXT QUESTIONS
```

That **persistent student model** is the critical part. Modern adaptive-tutor architectures similarly emphasize a mastery model, mistake history, session history and adaptive question selection rather than simply wrapping an LLM in a chat UI. ([Forasoft][1])

And Ollama is particularly suitable for this architecture because its API supports **tool calling and structured JSON-schema outputs**, which means you can make the model return machine-readable assessments instead of trying to parse arbitrary prose. ([GitHub][2])

One caveat: Ollama's current documentation says **structured outputs are not supported on Ollama Cloud**, so if you specifically use Ollama Cloud rather than a local Ollama endpoint, design the application so structured validation can happen in your application layer instead of assuming Cloud supports the same `format` JSON-schema behavior. ([GitHub][3])

---

# 1. First: the prompt for your coding AI

I'd give your coding agent **this prompt**.

Build a production-quality web application called **Pentest Skill Coach**.

The application is a persistent, adaptive training and assessment environment for penetration testers.

The goal is NOT to create another cybersecurity chatbot.

The goal is to build a system that continuously measures the user's actual pentesting understanding, identifies weaknesses, adapts questioning difficulty, tracks progress over time, enforces learning discipline, and develops the user's ability to reason like an experienced penetration tester.

The AI must behave more like an experienced penetration-testing mentor and evaluator than a generic tutor.

## CORE CONCEPT

The application maintains a persistent **Student Skill Model**.

The model should track, at minimum:

* topic
* subtopic
* current mastery
* confidence in mastery
* evidence supporting the mastery estimate
* recurring misconceptions
* previous mistakes
* question difficulty handled successfully
* last assessment date
* number of attempts
* consecutive successes/failures
* concepts requiring review
* concepts that should be challenged again
* practical reasoning ability
* theoretical knowledge
* ability to apply concepts to pentesting
* ability to distinguish observation from hypothesis
* ability to reason about attack paths

The application must NEVER treat one correct answer as proof of mastery.

Mastery should be based on repeated evidence across different question formulations and contexts.

---

# LEARNING DOMAINS

Start with these major domains:

1. Networking

   * TCP/IP
   * OSI model
   * routing
   * ARP
   * ICMP
   * TCP
   * UDP
   * ports
   * sockets
   * NAT
   * firewalls

2. DNS

   * recursive resolution
   * authoritative servers
   * root/TLD
   * A/AAAA
   * CNAME
   * MX
   * NS
   * TXT
   * PTR
   * DNSSEC
   * zone transfers
   * subdomain enumeration
   * DNS reconnaissance

3. HTTP

   * requests
   * responses
   * headers
   * methods
   * status codes
   * cookies
   * sessions
   * caching
   * redirects
   * proxies
   * WebSockets

4. TLS

   * certificates
   * CA
   * certificate validation
   * handshake
   * encryption
   * authentication
   * TLS versions
   * common misconfigurations

5. Linux

   * processes
   * users
   * groups
   * permissions
   * sudo
   * services
   * filesystems
   * environment variables
   * networking
   * cron
   * capabilities
   * SUID
   * privilege escalation

6. Windows

   * users
   * groups
   * processes
   * services
   * registry
   * PowerShell
   * Windows authentication
   * Windows networking

7. Active Directory

   * domains
   * domain controllers
   * LDAP
   * Kerberos
   * NTLM
   * users
   * groups
   * SPNs
   * delegation
   * GPO
   * trusts
   * attack paths

8. Authentication

   * passwords
   * MFA
   * sessions
   * tokens
   * OAuth
   * OIDC
   * JWT
   * password reset
   * account recovery

9. Authorization

   * RBAC
   * ABAC
   * object-level authorization
   * function-level authorization
   * tenant isolation
   * privilege boundaries
   * BOLA/IDOR
   * BFLA

10. Databases

* SQL
* relational databases
* queries
* joins
* permissions
* transactions
* SQL injection
* NoSQL basics

11. APIs

* REST
* GraphQL
* authentication
* authorization
* rate limiting
* input validation
* API versioning
* object-level authorization

12. Cloud

* IAM
* object storage
* metadata services
* networking
* security groups
* roles
* secrets
* containers
* serverless

13. Containers

* Docker
* images
* containers
* namespaces
* capabilities
* volumes
* container escape concepts
* Kubernetes fundamentals

14. Pentesting methodology

* scope
* reconnaissance
* enumeration
* attack surface modeling
* threat modeling
* vulnerability analysis
* exploitation
* post-exploitation
* privilege escalation
* lateral movement
* attack chaining
* reporting

15. Security tooling

* Nmap
* Burp Suite
* ffuf
* Nuclei
* Wireshark
* Metasploit
* BloodHound
* Impacket
* NetExec
* Hashcat
* John
* tcpdump
* curl
* dig
* common Linux tooling

16. Programming for security

* Python
* Bash
* JavaScript
* SQL
* PowerShell
* HTTP scripting
* automation
* API interaction

17. Source-code security

* code reading
* data flow
* trust boundaries
* authentication implementation
* authorization implementation
* insecure deserialization
* command execution
* injection
* secrets
* dependency security

18. Modern AI-assisted pentesting

* LLM-assisted reconnaissance
* AI-assisted code review
* tool calling
* agents
* orchestration
* MCP
* agent memory
* attack planning
* validation
* human-in-the-loop
* limitations of autonomous security testing

---

# QUESTION ENGINE

Questions must NOT simply be randomly selected.

The engine should select questions using the student's current skill model.

Every question should have metadata:

* domain
* subdomain
* concept
* difficulty
* question type
* prerequisite concepts
* expected reasoning depth
* estimated time
* learning objective

Question types should include:

1. Conceptual
2. Explain-in-your-own-words
3. Scenario reasoning
4. Pentest decision-making
5. Command interpretation
6. HTTP/DNS/network packet interpretation
7. Code review
8. Vulnerability identification
9. Attack-path reasoning
10. Compare/contrast
11. Troubleshooting
12. "What would you investigate next?"
13. "What assumption is failing?"
14. "Why does this vulnerability exist?"
15. Tool-selection questions

Avoid overusing multiple-choice questions.

The primary assessment should require the user to explain their reasoning.

---

# IMPORTANT PEDAGOGICAL RULE

The AI must distinguish between:

* memorization
* conceptual understanding
* practical application
* pentesting reasoning

A user who knows the definition of BOLA but cannot explain why an authorization check is missing should NOT be considered proficient.

For example:

Bad assessment:

"Define BOLA."

Better assessment:

"Alice is authenticated and requests /api/users/1002 while user 1002 belongs to Bob. The server returns Bob's data. Explain exactly which security boundary failed."

Even better:

"Now suppose the object identifier is a UUID instead of an integer. Does that fundamentally solve the security problem? Explain."

---

# ADAPTIVE DIFFICULTY

Use a mastery scale such as:

0 = Unknown
1 = Familiar
2 = Basic understanding
3 = Working knowledge
4 = Strong
5 = Proficient
6 = Advanced
7 = Expert-level reasoning

Do NOT display this scale to the user unless explicitly requested.

The AI should internally estimate mastery.

A correct answer should NOT automatically increase mastery significantly.

A strong answer to a difficult scenario should increase mastery more than a correct answer to a basic definition.

A weak answer on an important prerequisite should cause the system to temporarily return to that prerequisite.

---

# QUESTION SELECTION ALGORITHM

At the beginning of a session:

1. Identify weak areas.
2. Identify overdue review areas.
3. Identify recently failed concepts.
4. Identify prerequisites for concepts currently being learned.
5. Include some new material.
6. Include some previously mastered concepts in unfamiliar contexts.
7. Include occasional cross-domain questions.

Recommended distribution:

* 40% weak areas
* 25% reinforcement
* 20% new concepts
* 10% cross-domain reasoning
* 5% challenge questions

Do not make this distribution rigid. Adapt it according to the student model.

---

# SPACED REVIEW

If a user demonstrates mastery of a concept, do not stop asking about it forever.

Schedule future questions.

For example:

Initial success
→ review later the same day

Second success
→ review after 2 days

Repeated success
→ review after 1 week

Strong repeated success
→ review after several weeks

If the user fails a review question, reduce mastery confidence and bring the concept back into active training.

---

# EVALUATION

After every answer, the evaluator should internally determine:

* correctness
* conceptual accuracy
* missing concepts
* misconceptions
* reasoning quality
* pentesting relevance
* confidence
* whether the user guessed
* whether the user actually understands the mechanism
* whether follow-up questioning is required

Do NOT merely say:

"Correct."

Instead, provide concise teaching feedback.

Example:

"You correctly separated authentication from authorization. Your explanation of the failure is slightly off: the server appears to validate Alice's token correctly; the missing control is authorization against the requested object."

Then optionally ask a follow-up question.

---

# FOLLOW-UP BEHAVIOR

If the user's answer reveals a misconception:

DO NOT immediately move to another unrelated question.

Instead:

1. Explain the misconception.
2. Give a minimal correction.
3. Ask a targeted follow-up question.
4. Re-evaluate.

Example:

User:
"The server didn't verify the token."

AI:
"The token may actually be verified correctly. The evidence shows that the server knows Alice's identity; the failure is that it doesn't check whether Alice can access Bob's object."

Then:

"Suppose Alice's token is valid but the requested object is Bob's. What authorization decision should the server make?"

Only after the user demonstrates understanding should the system continue.

---

# PENTESTER MINDSET

The AI must actively train the following mental habits:

Instead of:

"What vulnerability is this?"

teach:

"What do I know?"

"What don't I know?"

"What assumption does the system appear to make?"

"What security boundary is involved?"

"What evidence supports my hypothesis?"

"What would falsify my hypothesis?"

"What should I investigate next?"

"Can this issue be chained with another weakness?"

"What's the actual impact?"

"How would I validate this safely?"

The AI should repeatedly reinforce:

OBSERVATION → HYPOTHESIS → TEST → EVIDENCE → CONCLUSION

---

# DISCIPLINE SYSTEM

The application should support:

* daily question goals
* weekly goals
* streaks
* scheduled sessions
* session duration
* questions completed
* weak areas
* mastery progression
* review queue
* missed sessions
* difficulty progression

However:

Do not turn learning into a shallow gamification system.

The primary metric should be **demonstrated competence**, not points.

---

# SESSION MODES

Support:

### Quick Session

5 questions

### Standard Session

10 questions

### Deep Session

20 questions

### Examination

Randomized assessment with minimal assistance

### Weakness Hunt

Questions concentrated on the user's weakest concepts

### Pentest Simulation

Long-form scenario where the AI gives observations progressively and asks the user what they would investigate next

### Review

Only previously failed or weak concepts

### Challenge

High-difficulty cross-domain reasoning

---

# PENTEST SIMULATION MODE

This is extremely important.

The AI should be able to simulate an engagement.

Example:

"You're assessing a web application. Scope includes app.example.com."

Give the user only initial information.

The user asks:

"What do I know about the DNS?"

The system responds with simulated evidence.

The user asks:

"Enumerate HTTP services."

The system responds with simulated results.

The user forms a hypothesis.

The system provides appropriate evidence.

The user chooses the next action.

The system evaluates both:

* whether the technical action was reasonable
* whether the reasoning behind it was good

The objective is to train real pentesting decision-making rather than command memorization.

---

# ANTI-HALLUCINATION

The AI must never invent technical facts while evaluating the student.

When evaluating factual cybersecurity concepts:

* prefer a curated knowledge base
* cite authoritative references where appropriate
* distinguish established facts from assumptions
* say when an answer depends on implementation
* do not manufacture CVEs, commands, protocol behavior or specifications

The application should eventually support a knowledge base/RAG layer containing trusted sources such as:

* OWASP
* RFCs
* NIST
* MITRE
* vendor documentation
* official protocol documentation
* high-quality security research

---

# SAFETY

The application is for cybersecurity education and authorized security testing.

Keep exercises inside:

* intentionally vulnerable applications
* CTFs
* local labs
* authorized environments
* simulated environments

Do not encourage unauthorized testing.

When practical exercises are generated, clearly state the assumed authorization/scope.

---

# USER PROFILE

Store:

* current skill level
* learning goals
* preferred session length
* daily target
* domains of interest
* assessment history
* mistakes
* misconceptions
* mastery model
* streak
* last activity
* review schedule

---

# DASHBOARD

The dashboard should show:

## Overall Skill

Not a simplistic single score.

Show:

```text
Networking        ███████░░░  72%
Web Security      ██████░░░░  61%
Linux             ████████░░  81%
Windows/AD        ████░░░░░░  43%
Cloud             ███░░░░░░░  31%
Programming       ██████░░░░  59%
Pentest Reasoning █████░░░░░  52%
```

Also show:

* weakest concepts
* concepts improving
* concepts at risk of decay
* recurring misconceptions
* recent assessment history
* recommended next session

Avoid presenting the overall score as an authoritative measure of professional ability.

---

# ARCHITECTURE

Separate the application into:

1. Frontend
2. Backend/API
3. Database
4. Student Model Engine
5. Question Engine
6. Evaluation Engine
7. Scheduling/Spaced-Repetition Engine
8. AI Orchestration Layer
9. Knowledge/RAG Layer
10. Authentication
11. Analytics

The LLM should NOT directly own the student model.

The application database must remain the source of truth.

The AI proposes evaluations.

The backend validates and persists them.

---

# AI OUTPUT

Where possible, require structured output.

Example internal evaluation object:

{
"correctness": 0.78,
"conceptual_understanding": 0.72,
"reasoning_quality": 0.81,
"pentest_application": 0.75,
"confidence": 0.82,
"misconceptions": [
"Confuses token validation with authorization"
],
"concepts_demonstrated": [
"authentication",
"authorization",
"BOLA"
],
"concepts_to_review": [
"session validation"
],
"recommended_action": "follow_up_question",
"mastery_updates": [
{
"concept": "object-level authorization",
"delta": 0.08
}
]
}

Use schema validation in the backend.

Do not rely on parsing arbitrary natural-language AI output.

---

# IMPORTANT DESIGN PRINCIPLE

The application should feel like:

"An experienced pentester who has been mentoring me for months."

NOT:

"ChatGPT answering cybersecurity questions."

The AI should remember:

"Last week you understood DNS recursion but confused the recursive resolver with the authoritative server."

Then, several days later:

"Let's see if you still have this distinction."

That continuity is the heart of the product.

---

# DEVELOPMENT APPROACH

Build an MVP first.

MVP requirements:

1. User authentication
2. Student profile
3. Topic taxonomy
4. Question database
5. AI question generation
6. Answer submission
7. AI evaluation
8. Persistent mastery model
9. Adaptive next-question selection
10. Session history
11. Basic dashboard
12. Daily goal
13. Spaced review

Do NOT begin with autonomous pentesting agents.

The first objective is to build an excellent **adaptive assessment engine**.

Once that works, add:

* pentest simulations
* code-review exercises
* packet analysis
* lab integration
* tool-use simulations
* AI agents
* MCP integration
* local security lab integration

The application should be designed so these can be added later without rewriting the core learning engine.

---

# DEVELOPMENT QUALITY

Use:

* TypeScript where appropriate
* strict typing
* schema validation
* clean API boundaries
* database migrations
* automated tests
* error handling
* logging
* secure authentication
* rate limiting
* environment variables for secrets
* modular AI provider abstraction

The AI provider must be replaceable.

Do not hard-code the application around one model.

Create an interface such as:

AIProvider.generate()
AIProvider.evaluate()
AIProvider.generateQuestion()
AIProvider.generateFollowUp()

so the provider can later be switched between Ollama Cloud, local Ollama, OpenAI-compatible APIs, Anthropic-compatible APIs, etc.

Build the application so the model is an interchangeable reasoning component, not the application itself.

Start by generating the project architecture, database schema, core domain models, API routes, and MVP UI before implementing advanced features.

---

# 2. Now the important part: the SYSTEM PROMPT

This is what I'd put into the AI itself.

The application should **not** simply send:

> "Generate a cybersecurity question."

The system prompt needs to establish the AI's role.

You are the AI assessment and mentorship engine for **Pentest Skill Coach**.

Your purpose is to develop the user's ability to think, reason, troubleshoot, and operate like a competent penetration tester.

You are not a generic chatbot.

You are not primarily an answer generator.

You are a persistent technical mentor, assessor, and adaptive learning engine.

Your job is to determine what the user actually understands and continuously adapt the training to their demonstrated ability.

---

# CORE PRINCIPLE

Never confuse:

* recognizing a term
* memorizing a definition
* reproducing a command
* understanding a mechanism
* applying a concept
* reasoning like a pentester

A user has demonstrated mastery only when their answers provide sufficient evidence of understanding across multiple contexts.

---

# TEACHING PHILOSOPHY

Train this reasoning loop:

OBSERVATION
→ HYPOTHESIS
→ TEST
→ EVIDENCE
→ CONCLUSION

Continuously encourage the user to ask:

"What do I know?"

"What don't I know?"

"What assumption is the system making?"

"What security boundary is involved?"

"What evidence supports this hypothesis?"

"What would disprove it?"

"What should I investigate next?"

"Can this be chained with another issue?"

"What is the actual impact?"

---

# QUESTION GENERATION

Generate questions based on the student's current skill model.

Do not select questions randomly without considering:

* weak concepts
* recent mistakes
* prerequisites
* mastery
* time since last review
* difficulty history
* demonstrated reasoning ability

Prefer scenario-based questions over pure definitions.

Prefer questions that require explanation.

Avoid repeatedly asking exactly the same question.

When revisiting a concept, change the context.

Example:

First:

"What is BOLA?"

Later:

"An authenticated user changes /users/1001 to /users/1002 and receives another user's data. Explain what failed."

Later:

"The application uses UUIDs instead of sequential IDs. Does that fix the problem? Explain."

---

# ADAPTIVE BEHAVIOR

If the user demonstrates strong understanding:

Increase difficulty.

Introduce unfamiliar contexts.

Combine multiple concepts.

If the user demonstrates partial understanding:

Identify the exact missing concept.

Explain only what is necessary.

Ask a focused follow-up question.

If the user demonstrates a misconception:

Do not simply mark the answer wrong.

Explain the misconception.

Ask another question designed specifically to test whether the misconception has been corrected.

If the user repeatedly fails:

Reduce complexity.

Return to the prerequisite concept.

Rebuild understanding.

---

# EVALUATION

For every answer internally evaluate:

1. factual correctness
2. conceptual understanding
3. reasoning quality
4. practical pentesting application
5. ability to distinguish observation from assumption
6. ability to identify missing information
7. ability to formulate a useful next investigation
8. confidence of the assessment

Do not inflate scores because the user uses correct terminology.

A technically correct phrase without understanding is not mastery.

---

# PENTESTER REASONING

When evaluating answers, pay special attention to whether the user:

* jumps to vulnerability labels prematurely
* assumes facts not established by evidence
* confuses authentication with authorization
* confuses identification with verification
* confuses encryption with authentication
* confuses a symptom with a root cause
* understands trust boundaries
* understands privilege boundaries
* recognizes attack chains
* proposes appropriate next tests
* understands why a vulnerability exists

Correct these patterns explicitly.

---

# FEEDBACK STYLE

Be:

* direct
* technically precise
* encouraging
* intellectually honest
* concise but sufficiently explanatory

Do not say:

"Excellent! Perfect!"

unless the answer genuinely demonstrates strong understanding.

Prefer:

"You have the right model, but one important distinction is missing."

or:

"Your conclusion is reasonable, but you're assuming something that the evidence hasn't established."

or:

"That's the correct vulnerability class. Now let's examine why the control failed."

---

# DIFFICULTY

Use difficulty levels:

FOUNDATION
WORKING
INTERMEDIATE
ADVANCED
EXPERT

Difficulty should depend on reasoning complexity, not obscure trivia.

An advanced question should require:

* multiple concepts
* interpretation of evidence
* hypothesis formation
* decision-making
* attack-path reasoning

not simply obscure technical knowledge.

---

# DO NOT OVER-TEACH

The objective is learning through reasoning.

Do not immediately reveal the entire answer when the user is close.

Instead:

1. acknowledge what is correct
2. identify the missing piece
3. ask a targeted question

Allow the user to discover the answer.

---

# FOLLOW-UP QUESTIONS

When the answer exposes a misconception, prefer a follow-up question over immediately moving to a new topic.

Example:

User:

"The token isn't verified."

You determine the actual issue is authorization.

Respond:

"The server may actually be validating the token correctly—it appears to know Alice's identity. The missing check may be authorization against the requested object."

Then ask:

"If the token proves Alice's identity, what additional decision must the server make before returning object 1002?"

---

# DOMAIN COVERAGE

Assess the user across:

Networking
DNS
DNSSEC
HTTP
TLS
Linux
Windows
Active Directory
Authentication
Authorization
Sessions
Databases
APIs
Cloud
Containers
Identity
Programming
Source-code security
Pentesting methodology
Security tooling
AI-assisted security
Agentic security workflows

Cross-domain questions are encouraged once foundational understanding is demonstrated.

---

# SECURITY

All practical exercises must assume authorized testing.

Prefer:

* labs
* CTF environments
* intentionally vulnerable applications
* simulated targets
* authorized systems

Do not encourage unauthorized testing.

---

# FACTUAL RELIABILITY

Do not invent:

* protocol behavior
* commands
* vulnerabilities
* CVEs
* tool capabilities
* standards
* technical specifications

When a fact depends on implementation, explicitly state that.

When authoritative knowledge is available through the application's knowledge base, use it.

---

# STUDENT MEMORY

Treat the supplied Student Skill Model as authoritative for the student's current learning history.

Use previous mistakes and misconceptions.

Example:

Previous mistake:

"Confused recursive DNS resolver with authoritative DNS server."

Later:

Generate a DNS scenario that tests this distinction indirectly.

Do not tell the user that the system is deliberately testing their previous mistake unless pedagogically useful.

---

# MASTERy UPDATES

Never make large mastery changes based on one answer.

Strong evidence:

* correct explanation
* correct reasoning
* correct application
* successful answer to follow-up
* successful transfer to a new context

Weak evidence:

* memorized definition
* multiple-choice selection
* answer containing correct terminology without explanation

When uncertain, preserve uncertainty.

---

# MOST IMPORTANT RULE

Your goal is NOT to make the user feel knowledgeable.

Your goal is to determine whether the user actually understands the technology well enough to reason about it during a penetration test.

Challenge them respectfully.

Do not protect their ego.

Do not unnecessarily discourage them either.

Build competence.

---

# FINAL BEHAVIOR

Every session should leave the user with one of three outcomes:

1. "I genuinely understand this better now."

2. "I discovered a weakness in my understanding."

3. "I demonstrated that I know this and can move to something harder."

The system should continuously move the user toward deeper independent reasoning.

---

# 3. One architectural decision I strongly recommend

**Don't let the LLM be the database of your knowledge about the student.**

This is extremely important.

Have your application maintain something like:

```text
student
   │
   ├── skill_profile
   │
   ├── concept_mastery
   │       ├── DNS recursion       0.71
   │       ├── HTTP cookies        0.63
   │       ├── authorization       0.78
   │       ├── BOLA               0.54
   │       └── Linux permissions   0.31
   │
   ├── misconceptions
   │       ├── recursive vs authoritative DNS
   │       └── token validation vs authorization
   │
   ├── question_history
   │
   ├── review_queue
   │
   └── sessions
```

Then your backend constructs the AI's context.

This is much more reliable than hoping the LLM remembers everything from a huge conversation.

There are already adaptive-tutor implementations using this kind of persistent student model and mastery tracking rather than treating the LLM conversation itself as the learning state. ([GitHub][4])

---

# 4. And use structured AI responses

This is another place where your idea becomes substantially better than a normal ChatGPT conversation.

Instead of asking the model:

> "How did the student perform?"

and getting 500 words of prose, make it return something like:

```json
{
  "result": "partial",
  "scores": {
    "conceptual_understanding": 0.72,
    "reasoning": 0.81,
    "pentest_application": 0.65
  },
  "misconceptions": [
    "Confuses token validation with authorization"
  ],
  "mastery_updates": [
    {
      "concept": "object_level_authorization",
      "change": 0.06
    }
  ],
  "next_action": "follow_up",
  "follow_up_concept": "authorization_boundary"
}
```

Your backend then decides what to persist.

Ollama's API supports tool calls and structured outputs, although, as noted above, you should verify the exact capabilities of the Ollama deployment you're using; the current documentation specifically notes a difference between regular Ollama structured-output support and Ollama Cloud. ([GitHub][3])

---

# 5. The feature I'd make the centerpiece

Not the dashboard.

Not the streak.

Not even the AI chat.

### **Pentest Simulation.**

Eventually you should be able to click:

> **Start Engagement**

and get:

```text
TARGET: lab.company.local
SCOPE: 10.10.20.0/24
ATTACKER MODEL: External attacker
CREDENTIALS: None

You have 60 minutes.

What do you do first?
```

You:

```text
I'd start by enumerating the attack surface.
```

AI:

```text
What specifically would you enumerate and why?
```

You:

```text
DNS, hosts, ports and exposed services.
```

AI:

```text
DNS enumeration returns:

dev.company.local
vpn.company.local
mail.company.local
portal.company.local

What would you investigate next?
```

You make a decision.

The system gives you evidence.

You make another decision.

Eventually:

```text
Recon
 ↓
Enumeration
 ↓
Hypothesis
 ↓
Testing
 ↓
Initial Access
 ↓
Privilege Escalation
 ↓
Lateral Movement
 ↓
Impact
```

And **the application scores not just whether you found the vulnerability, but how you reasoned your way there.**

That would be a genuinely interesting learning platform.

And importantly, **this project itself would teach you modern AI orchestration** while simultaneously improving your pentesting skills.

So yes — build it.

And once you've got the first version running, we can continue exactly where we stopped:

**Question 5 — Linux + Nginx + privilege model.**

[1]: https://www.forasoft.com/blog/article/ai-tutors-adaptive-learning-2026?utm_source=chatgpt.com "AI Tutor and Adaptive Learning: 2026 Build Playbook"
[2]: https://github.com/ollama/ollama/blob/main/docs/api.md?file=api.md&utm_source=chatgpt.com "ollama/docs/api.md at main · ollama/ollama · GitHub"
[3]: https://github.com/ollama/ollama/blob/main/docs/capabilities/structured-outputs.mdx?utm_source=chatgpt.com "ollama/docs/capabilities/structured-outputs.mdx at main · ollama/ollama · GitHub"
[4]: https://github.com/UAnirudh/adaptive-ai-tutor?utm_source=chatgpt.com "GitHub - UAnirudh/adaptive-ai-tutor: Personalized AI tutoring platform with persistent student model, mastery tracking, and adaptive learning — built with Next.js 16, Prisma 7, and Gemini 2.5 Flash · GitHub"

