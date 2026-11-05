/** npm run mock:reset — erase the local mock database; the next `npm run dev` seeds it again. */
import "dotenv/config";
import { resetMockDb } from "./env";

resetMockDb()
  .then(() => {
    console.log("Mock database erased. Run `npm run dev` to start fresh.");
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
