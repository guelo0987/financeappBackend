import { app } from './app';
import { env } from './config/env';
import { startRecurringJob } from './jobs/recurring.job';

// BigInt JSON serialization
(BigInt.prototype as any).toJSON = function () {
  return Number(this);
};

app.listen(env.PORT, () => {
  console.log(`Server is running on http://localhost:${env.PORT}`);
  startRecurringJob();
});
