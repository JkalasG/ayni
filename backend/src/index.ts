import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import { ZodError } from "zod";
import { config } from "./config";
import { router } from "./routes";
import { HttpError } from "./services/groups";
import { startEngine } from "./services/engine";
import { PayPalError } from "./paypal";
import { fakePayPal } from "./mock/fake-paypal";

const app = express();
app.use(cors());
app.use(express.json({ limit: "200kb" }));
// APP_MODE=mock: PayPal is simulated by this same server (nothing leaves the machine).
if (config.mode === "mock") app.use("/__paypal", fakePayPal(config.paypal.webBase));
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

const server = app.listen(config.port, () => {
  console.log(`Ayni API on :${config.port} (${config.mode} mode)`);
  startEngine(config.engineIntervalMs);
});
server.on("error", (e: NodeJS.ErrnoException) => {
  if (e.code === "EADDRINUSE") {
    console.error(
      `\n❌ El puerto ${config.port} ya está en uso: probablemente otro "npm run dev" sigue abierto.\n` +
        `   Ciérralo (Ctrl+C en esa terminal) o busca el proceso con:\n` +
        `     netstat -ano | findstr :${config.port}      y luego   taskkill /PID <número> /F\n` +
        `   O usa otro puerto: PORT=4001 en backend/.env (y EXPO_PUBLIC_API_URL=http://localhost:4001 en app/.env).\n`
    );
    process.exit(1);
  }
  throw e;
});
