import { createApp } from './app';
import { env } from './env';
import { iniciarAlertasDePrazo } from './modules/notificacoes/notificacoes';

// Em produção (Render etc.) o processo precisa escutar em 0.0.0.0.
const host = env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1';

createApp().listen(env.PORT, host, () => {
  console.log(`Stante API em http://${host}:${env.PORT}`);
  // Gera os avisos de prazo ao subir (cobre o plano gratuito que "dorme") e depois a cada 30 minutos
  iniciarAlertasDePrazo();
});
