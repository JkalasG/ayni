import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import { ZodError } from "zod";
import { config } from "./config";
import { router } from "./routes";
import { HttpError } from "./services/groups";
import { startEngine } from "./services/engine";
import { PayPalError } from "./paypal";

const app = express();
app.use(cors());
app.use(express.json({ limit: "200kb" }));
app.use(router);

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err instanceof ZodError) return res.status(400).json({ error: "invalid_input", details: err.issues });
  if (err instanceof PayPalError) {
    console.error(err);
    return res.status(502).json({ error: "paypal_error", op: err.op });
  }
  console.error(err);
  res.status(500).json({ error: "internal_error" });
});

app.listen(config.port, () => {
  console.log(`Ayni API on :${config.port}`);
  startEngine(config.engineIntervalMs);
});
