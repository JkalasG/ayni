# Ayni

**Rotating savings circles (pasanaku · tanda · ROSCA), built on PayPal and Claude.**

> *Ayni* is the Andean principle of reciprocity: *today for you, tomorrow for me.*

Hundreds of millions of people save in rotating groups: everyone contributes the same amount each week or month, and each round one member takes the whole pot. They work on trust, and they break in a predictable way: **the person who receives the pot early stops paying.** Ayni keeps the tradition and fixes the trust problem.

- 🎥 Demo video: _add YouTube link_
- 🌐 Live demo: _add Render URL_
- 🧪 Sandbox test accounts for judges: see [Try it](#try-it)

## How it works

1. **Create a circle**: contribution, frequency, late fee, and how turns are decided (lottery, organizer, or AI).
2. **Members join** with an invite code and **log in with PayPal**, so Ayni knows exactly where to send their pot.
3. **Each round**, members pay with PayPal Checkout. When everyone has paid, the organizer confirms and the pot is sent with **PayPal Payouts**.
4. **Staggered guarantee:** whoever receives early gets most of the pot now; a small part is withheld and returned automatically once they finish contributing. Turn #1 carries the largest guarantee, the last turn none.
5. **Late payments:** escalating reminders written by Claude, a late fee that goes to the pot, and if the grace period ends, the contribution is covered from the member's own guarantee. The group never loses money.

## Where AI is used

| Feature | What Claude does |
|---|---|
| Group assistant | Answers "how much do I owe?", "when is my turn?", "who's missing?" using tools over real group data, and shows a *Pay with PayPal* button |
| Mediator | Handles conflicts (can't pay this round, wants to swap turns), proposes a fair option and escalates to the organizer |
| Smart reminders | Writes personalized reminders that escalate from friendly to firm, in the member's language |
| Turn order + guarantee | Proposes a fair turn order with a reason for each member, based on payment history; the guarantee % is adjusted by risk |

**Safety by design: the AI can read and propose, but never moves money.** Pot releases, turn swaps and AI-proposed orders become *pending decisions* that the organizer approves. If the organizer doesn't answer in time, the decision runs automatically, so the group is never blocked.

## Where PayPal is used

| PayPal capability | Use in Ayni |
|---|---|
| Log in with PayPal (Identity API) | Sign-in, and the verified email where payouts are delivered |
| Orders v2 (create + capture) | Every contribution, including late fees |
| Payouts | Sending the pot each round and returning guarantees |
| Webhooks | Backup confirmation of captures and payout status |

## Architecture

```
Expo app (Android + web)  ──►  Node/Express API (Render)  ──►  PayPal REST (sandbox)
                                   │        │
                                   │        └──►  Claude (Anthropic API, tool use)
                                   └──►  Postgres (Prisma)
            Engine (every 20s): reminders · late fees · guarantee coverage · auto-execution
```

- `backend/src/domain/rules.ts`: pure pasanaku rules (guarantee taper, late fees, risk score), unit tested
- `backend/src/services/`: group lifecycle, payments, organizer decisions, engine
- `backend/src/ai/agent.ts`: Claude assistant, mediator, reminders and turn-order proposals
- `app/src/app/`: Expo Router screens

**Demo mode** shrinks rounds to minutes so a full cycle fits in a video.

## Run it locally

Requirements: Node 20+, a Postgres database, a PayPal Developer account, an Anthropic API key.

```bash
# 1. Backend
cd backend
cp .env.example .env          # fill in the values
npm install
npx prisma db push
npm run db:seed               # optional: 5 demo members + a demo circle
npm run dev

# 2. App
cd ../app
cp .env.example .env          # EXPO_PUBLIC_API_URL = your backend URL
npm install
npx expo start                # scan the QR with Expo Go (Android), or press "w" for web
```

PayPal setup (sandbox, developer.paypal.com → Apps & Credentials → your app):
- Enable **Log in with PayPal**, with return URL `<PUBLIC_API_URL>/auth/paypal/callback`, and the Email scope.
- Enable **Payouts**.
- Add a webhook to `<PUBLIC_API_URL>/paypal/webhook` and copy its ID to `PAYPAL_WEBHOOK_ID`.

PayPal must be able to reach `PUBLIC_API_URL`, so use a deployed URL (see `render.yaml`) or a tunnel.

Run the rule tests with `cd backend && npm test`.

## Try it

_Judges: list the sandbox personal accounts (email + password) here, or use "Enter as a demo member" on the welcome screen._

## Roadmap

- Push notifications (Expo push) for reminders
- Group voting on AI-proposed orders
- WhatsApp channel for reminders
- In production, holding funds for a group requires money-transmission licensing; a regulated partner or PayPal's marketplace products would be the path forward.

## License

MIT
