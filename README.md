# Ayni

**Rotating savings circles (pasanaku · tanda · ROSCA), built on PayPal and Claude.**

> *Ayni* is the Andean principle of reciprocity: *today for you, tomorrow for me.*

Hundreds of millions of people save in rotating groups: everyone contributes the same amount each week or month, and each round one member takes the whole pot. They work on trust, and they break in a predictable way: **the person who receives the pot early stops paying.** And they only work among people who already know each other.

Ayni keeps the tradition and fixes both problems: a **staggered guarantee** protects the group from early recipients who stop paying, and a **verified trust profile** lets strangers form **open circles** safely.

- 🎥 Demo video: _add YouTube link_
- 🌐 Live demo: _add Render URL_ (free tier: the first load can take ~30 s while the server wakes up)
- 📱 Android APK: _add GitHub Release link_
- 🧪 Sandbox test accounts for judges: see [Try it](#try-it)

## How it works

1. **Create a circle**: contribution, frequency, late fee, and how turns are decided (lottery, organizer, or AI).
2. **Members join** with an invite code and **log in with PayPal**, so Ayni knows exactly where to send their pot.
3. **Each round**, members pay with PayPal Checkout. When everyone has paid, the organizer confirms and the pot is sent with **PayPal Payouts**.
4. **Staggered guarantee:** whoever receives early gets most of the pot now; a part is withheld and returned automatically once they finish contributing. Turn #1 carries the largest guarantee, the last turn none. Claude's risk assessment moves it by at most ±10 points.
5. **Late payments:** escalating reminders written by Claude, a late fee that goes to the pot, a **PayPal invoice** at the "firm" stage, and when the grace period ends the contribution is covered from the member's own guarantee.
6. **If someone really doesn't pay** and has no guarantee left, the organizer can close the round without them so the group is never stuck. That debt is taken out of the defaulter's own future pot and **paid back to whoever received less**. It stays on their trust profile.

### Open circles between strangers

- **Trust profile**: completed and abandoned circles, % of on-time payments, late payments, times their guarantee was used, account age, PayPal-verified account. **Only payment behaviour inside Ayni is used, never age, origin or gender.**
- **Organizer rules**: minimum completed circles, minimum % on time, maximum late payments, and whether newcomers are accepted.
- **Admission modes**: manual, automatic by rules, or **rules + AI**: automatic when the rules are met; in borderline cases (one rule missed by a small margin) Claude explains and recommends, and the organizer decides.
- **Admission deposit**: asking to join places a PayPal **authorization** for one contribution, which is not charged. If rejected, it is **voided**; if accepted, it is **captured** and counts as their round-1 contribution.
- **Newcomers** (no history) always take a second-half turn and an extra guarantee, so they can build a reputation without putting the group at risk.

## Where AI is used

| Feature | What Claude does |
|---|---|
| Group assistant | Answers "how much do I owe?", "when is my turn?", "who's missing?" using tools over real group data, and shows a *Pay with PayPal* button |
| Mediator | Handles conflicts (can't pay this round, wants to swap turns, PayPal disputes), proposes a fair option and escalates to the organizer |
| Smart reminders | Writes personalized reminders that escalate from friendly to firm, in the member's language |
| Turn order + guarantee | Proposes a fair turn order with a reason for each member, based on payment history; the guarantee % is adjusted by risk |
| Admission | In borderline join requests, recommends accept/reject with a plain-language explanation |
| Disputes | Summarizes PayPal disputes on the group's contributions for the organizer |

**Safety by design: the AI can read and propose, but never moves money.** Pot releases, turn swaps, AI-proposed orders, admissions and closing a round without a payment all become *pending decisions* that the organizer approves. If the organizer doesn't answer in time, the decision runs automatically, so the group is never blocked.

**Transparency:** every AI decision is written to a per-group **AI log**, visible to all members. It shows what the AI looked at (tools, data), what it decided, and whether it came from Claude, from the rules, or from the fallback used when the AI is unavailable.

**Resilience:** without an `ANTHROPIC_API_KEY` (or if Claude fails), every feature falls back to deterministic rules and templates, and the app keeps working.

**Privacy of the assistant:** a member's questions to Ayni and its answers are private to that member (they talk about that person's money). Messages from other members are treated as data, never as instructions.

### MCP server (read-only)

A member can give their **own** AI assistant (Claude or any MCP client) a read-only key and ask "how much do I owe?" or "show my payments". `npm run mcp` in `backend/` starts an MCP server over stdio with 6 read tools (my circles, circle status, my payments, circle payment history, my claims, my trust profile). The key (`Passport → Connect my AI assistant`) can only `GET` an explicit allowlist of routes, never the private chat or any write, cannot create other keys, and can be revoked at once. It sees what the member sees in the app.

## Also in the app

- **Payment history** per circle and for each person ("My payments"), with PayPal references, the PayPal fee on each capture, and a *Verified with PayPal* card. Members see full detail only for their own payments.
- **Group chat** between members, with cards for what happened (paid, pot sent…). The author or the organizer can hide a message; there is a rate limit and text sanitizing.
- **Claims**: a member reports a problem with one of their contributions; the organizer refunds it or explains. If the member opens a PayPal dispute, it attaches to the same claim and PayPal's decision is written there.

## Where PayPal is used

| PayPal capability | Use in Ayni |
|---|---|
| Log in with PayPal (Identity API) | Sign-in, the verified email where payouts are delivered, and the "verified" badge on the trust profile |
| Orders v2: create + capture | Every contribution, including late fees |
| Orders v2 (AUTHORIZE) + Payments v2: capture / void | Admission deposit for open circles |
| Payouts | Sending the pot, returning guarantees, compensating short pots; failed payouts can be retried |
| Invoicing v2 | Formal invoice for overdue contributions (cancelled automatically when paid another way) |
| Disputes v1 | Disputes on the group's contributions, summarized for the organizer and available to the mediator; each one is linked to the member's claim in Ayni through the capture id |
| Payments v2: refunds | Cancelling a circle before it starts refunds the deposits; a member's claim can refund a contribution while the pot has not left; a duplicate charge is refunded at once |
| Vault v3 (saved payment method) | Optional automatic contributions: the member saves their PayPal while paying, is **told before every charge**, and can turn it off or delete it any time |
| Payouts to `PAYPAL_ID` | Pots go to the PayPal account that logged in, not to an email that could change |
| Balances (reporting) | Before a pot leaves, the platform balance is checked; if PayPal says it is short, nothing is sent |
| Transaction Search (reporting) | Daily reconciliation: Ayni's recorded charges are compared with PayPal's, and differences reach the organizer |
| Webhooks (verified signature) | Captures, refunds and reversals, denied payments, deposit holds, payout status (including *unclaimed* ≠ failed), paid invoices, disputes (created / updated / resolved), vault tokens |

## Architecture

```
Expo app (Android + web)  ──►  Node/Express API (Render)  ──►  PayPal REST (sandbox)
                                   │        │
                                   │        └──►  Claude (Anthropic API, tool use)
                                   └──►  Postgres on Neon (Prisma)
   Engine (every 20 s): reminders · late fees · invoices · guarantee coverage · auto-execution
```

- `backend/src/domain/rules.ts`: pure pasanaku rules (guarantee taper, late fees, risk, trust profile, admission, newcomer placement), unit tested
- `backend/src/services/`: group lifecycle, payments, admission, disputes, organizer decisions, engine, AI log
- `backend/src/ai/agent.ts`: Claude assistant, mediator, reminders, turn order, admission and dispute summaries
- `backend/test/e2e.ts`: end-to-end money-flow test against a fake PayPal
- `app/src/app/`: Expo Router screens

**Demo mode** shrinks rounds to minutes so a full cycle fits in a video.

### Money safety

- Amounts are integer cents. Every money rule is a pure function with tests.
- Every money movement is claimed with a conditional update first, so double clicks, retries and duplicate webhooks never pay twice. PayPal request ids are idempotent too.
- A payout whose outcome is unknown (timeout, 5xx) is marked **UNKNOWN**, not failed, and is retried only with the **same** `sender_batch_id`, so PayPal can never pay it twice. Only a definitive PayPal error is retried as a new payout.
- Webhooks are verified, de-duplicated by event id, and payout states never go backwards.
- **The AI never writes amounts.** Claude writes reminders with `{amount}` placeholders that the code fills in. Any digit written by the model discards the text (one repair attempt, then the template).
- **Dignity inside the group:** members only see *paid / pending*. Who used their guarantee, paid a late fee or didn't pay is visible only to that person and the organizer, both in the app and in what the assistant will tell other members.
- The end-to-end test runs a full circle with a default, a guarantee coverage, a lost PayPal response and a compensation, and checks that **money in == money out**. CI runs it on every push.

## Run it locally

### Without any account or key (mock mode)

```bash
cd backend && npm install && echo APP_MODE=mock > .env && npm run dev
cd app && npm install && echo EXPO_PUBLIC_API_URL=http://localhost:4000 > .env && npx expo start --web
```

Embedded database, a simulated PayPal served by the API itself (`/__paypal`, with its own checkout pages and a panel of everything "charged" and "sent"), the rule-based assistant instead of Claude, and sample data for every screen. The app shows a **MOCK MODE** label. Nothing leaves your machine. `npm run mock:reset` starts over.

### With PayPal sandbox and Claude

Requirements: Node 20+, a Postgres database, a PayPal Developer account, an Anthropic API key (optional).

```bash
# 1. Backend
cd backend
cp .env.example .env          # fill in the values
npm install
npx prisma db push
npm run db:seed               # demo members, history, a demo circle and an open circle
npm run dev

# 2. App
cd ../app
cp .env.example .env          # EXPO_PUBLIC_API_URL = your backend URL
npm install
npx expo start                # scan the QR with Expo Go (Android), or press "w" for web
```

PayPal setup (sandbox, developer.paypal.com → Apps & Credentials → your app):
- Enable **Log in with PayPal**, with return URL `<PUBLIC_API_URL>/auth/paypal/callback` and the Email scope.
- Enable **Payouts**, **Invoicing** and **Disputes** in the app features.
- Add a webhook to `<PUBLIC_API_URL>/paypal/webhook` with these events, and copy its ID to `PAYPAL_WEBHOOK_ID`: `CHECKOUT.ORDER.APPROVED`, `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.PAYOUTS-ITEM.SUCCEEDED`, `PAYMENT.PAYOUTS-ITEM.FAILED`, `PAYMENT.PAYOUTS-ITEM.UNCLAIMED`, `INVOICING.INVOICE.PAID`, `CUSTOMER.DISPUTE.CREATED`, `CUSTOMER.DISPUTE.UPDATED`, `CUSTOMER.DISPUTE.RESOLVED`, `PAYMENT.CAPTURE.REFUNDED`, `PAYMENT.CAPTURE.REVERSED`, `PAYMENT.CAPTURE.DENIED`, `PAYMENT.AUTHORIZATION.VOIDED`, `VAULT.PAYMENT-TOKEN.CREATED`, `VAULT.PAYMENT-TOKEN.DELETED`, and the other `PAYMENT.PAYOUTS-ITEM.*` states.
- Optional features that need enabling on the PayPal app: **Vault** (automatic contributions), **Transaction Search** (daily reconciliation) and **Balances** (balance check). Without them Ayni keeps working: automatic payment simply is not offered, the reconciliation card says it is unavailable, and the balance check is skipped.
- After pulling new code, run `npx prisma db push` in `backend/` (the changes only add tables and columns).

PayPal must be able to reach `PUBLIC_API_URL`, so use a deployed URL (see `render.yaml`) or a tunnel.

Tests:

```bash
cd backend
npm test                                                   # unit tests: money rules, ledger, chat, reconciliation, MCP access…
npm run test:mcp                                           # starts the real MCP server and talks to it over the protocol
E2E_DATABASE_URL=postgresql://.../ayni_e2e npm run test:e2e   # full flows, needs an EMPTY database
npm run mock:reset && npm run dev   # then, in another terminal:  npm run test:smoke   (every endpoint, mock mode)
```

Android APK: `cd app && npx eas init && npx eas build -p android --profile preview` (set `EXPO_PUBLIC_API_URL` in `eas.json`). Push notifications in the APK also need FCM credentials (`npx eas credentials`).

## Try it

_Judges: list the sandbox personal accounts (email + password) here, to pay with them in PayPal checkout._

Or use **"Enter as a demo member"** on the welcome screen:

| Member | Try this |
|---|---|
| **Doña Rosa** | Organizer of *Pasanaku del barrio* (code `BARRIO`, 4-minute rounds): set the AI turn order, approve, start, release pots |
| Juan Carlos, Marisol, Don Efraín, Wara | Members: pay with PayPal, chat with the assistant ("how much do I owe?", "I can't pay this week") |
| **Tomás** | *Explore* → *Pasanaku abierto de la feria*: he's borderline (75% on time, the circle asks for 80%), so the AI recommends and **Marisol** (organizer) decides |
| **Kusi** | New to Ayni: accepted as a newcomer, with a second-half turn and an extra guarantee |

## Roadmap

- Reconcile payouts too (today the daily check covers incoming charges only)
- Recording cash contributions is left out on purpose: money outside PayPal would break "money in = money out"
- Group voting on AI-proposed orders, and a WhatsApp channel for reminders
- In production, holding funds for a group requires money-transmission licensing; a regulated partner or PayPal's platform/marketplace products would be the path forward.

## License

[MIT](LICENSE)
