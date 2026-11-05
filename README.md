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

## Where PayPal is used

| PayPal capability | Use in Ayni |
|---|---|
| Log in with PayPal (Identity API) | Sign-in, the verified email where payouts are delivered, and the "verified" badge on the trust profile |
| Orders v2: create + capture | Every contribution, including late fees |
| Orders v2 (AUTHORIZE) + Payments v2: capture / void | Admission deposit for open circles |
| Payouts | Sending the pot, returning guarantees, compensating short pots; failed payouts can be retried |
| Invoicing v2 | Formal invoice for overdue contributions (cancelled automatically when paid another way) |
| Disputes v1 | Disputes on the group's contributions, summarized for the organizer and available to the mediator |
| Webhooks (verified signature) | Captures, deposits, payout status, paid invoices, new disputes |

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
- Add a webhook to `<PUBLIC_API_URL>/paypal/webhook` with these events, and copy its ID to `PAYPAL_WEBHOOK_ID`: `CHECKOUT.ORDER.APPROVED`, `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.PAYOUTS-ITEM.SUCCEEDED`, `PAYMENT.PAYOUTS-ITEM.FAILED`, `PAYMENT.PAYOUTS-ITEM.UNCLAIMED`, `INVOICING.INVOICE.PAID`, `CUSTOMER.DISPUTE.CREATED`.

PayPal must be able to reach `PUBLIC_API_URL`, so use a deployed URL (see `render.yaml`) or a tunnel.

Tests:

```bash
cd backend
npm test                                                   # money rules
E2E_DATABASE_URL=postgresql://.../ayni_e2e npm run test:e2e   # full flows, needs an EMPTY database
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

- Automatic contributions with PayPal Subscriptions
- PayPal Agent Toolkit (MCP) for the assistant, restricted to read-only tools
- Ledger reconciliation with Transaction Search
- Group voting on AI-proposed orders, and a WhatsApp channel for reminders
- In production, holding funds for a group requires money-transmission licensing; a regulated partner or PayPal's platform/marketplace products would be the path forward.

## License

[MIT](LICENSE)
