import { createApp } from './app';
import { env } from './env';

// Em produção (Render etc.) o processo precisa escutar em 0.0.0.0.
const host = env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1';

createApp().listen(env.PORT, host, () => {
  console.log(`Stante API em http://${host}:${env.PORT}`);
});
