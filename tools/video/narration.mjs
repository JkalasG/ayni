// The script of the video, scene by scene. The voice-over decides how long each scene lasts.
// Keep the total under three minutes (the contest rules): check with `node make.mjs tts`.
export const SCENES = [
  {
    id: "s01-story",
    vo: "Meet Doña Rosa. She sells at a street market, and like hundreds of millions of families, she saves in a pasanaku. Everyone puts in the same amount, every week, and one person takes the whole pot. It runs on trust. Until the day the first person to get the pot stopped answering. Doña Rosa paid the missing money from her own pocket. And her daughter, in Madrid, can't join the family circle, because the money only moves in cash, hand to hand.",
  },
  {
    id: "s02-reveal",
    vo: "This is Ayni. Today for you, tomorrow for me. A savings circle where every payment moves through PayPal, and an AI that proposes, but never touches the money.",
  },
  {
    id: "s03-login",
    vo: "Members sign in with PayPal, so Ayni knows where their pot will be sent. For the judges, the logins tag shows the sandbox accounts, ready to copy.",
  },
  {
    id: "s04-assistant",
    vo: "Every circle has an assistant that reads the group and its PayPal payments, and tells the organizer what to do next, with the reason. A gentle reminder for someone with a good record, a PayPal invoice for someone often late. Nothing happens until she taps.",
  },
  {
    id: "s05-pay",
    vo: "Paying takes two taps. Ayni opens PayPal Checkout. The member signs in with their own PayPal account and approves. PayPal charges the payment, and the member comes back to Ayni with it confirmed.",
  },
  {
    id: "s06-pot",
    vo: "When everyone has paid, the organizer approves, and PayPal Payouts sends the pot to the person whose turn it is. Whoever receives early has a guarantee withheld, returned when they finish contributing. If someone stops paying, that guarantee covers the group.",
  },
  {
    id: "s07-chat",
    vo: "Members can ask the assistant anything, in private. How much do I owe? When is my turn? It answers from real data, in the member's language, with the PayPal button.",
  },
  {
    id: "s08-bryntum",
    vo: "Time becomes visible with Bryntum Scheduler and Calendar. The turn timeline shows who receives the pot, and when. The organizer drags a turn to swap it, and the server checks it again. The payment schedule shows who has paid this round. The guarantee timeline shows where every guarantee is. And the personal calendar adds up what you will have by any date.",
  },
  {
    id: "s09-trust",
    vo: "Trust is built only from how you pay inside Ayni, never from age, origin or gender. That passport lets strangers open circles together, across countries, with a refundable deposit held on PayPal.",
  },
  {
    id: "s10-safety",
    vo: "The AI never moves money and never writes an amount. Other members' messages are data, not instructions. Every action is logged for the whole group. And we measured it: twenty two of twenty two evaluation cases passed.",
  },
  {
    id: "s11-close",
    vo: "Ayni. Today for you, tomorrow for me. No limits, no borders.",
  },
];
