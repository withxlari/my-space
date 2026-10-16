import { fileURLToPath } from 'node:url';
import { createSiteServer } from './server.mjs';
import { loadEnvironment } from './env.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
loadEnvironment(root);
const portArgument = process.argv.indexOf('--port');
const port = Number(portArgument >= 0 ? process.argv[portArgument + 1] : process.env.PORT || process.env.MYSPACE_PORT || 4173);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Use uma porta válida entre 1 e 65535.');
const { server, auth, ready } = createSiteServer({ root });
await ready;
server.on('error', error => {
  console.error(error.code === 'EADDRINUSE' ? `A porta ${port} está em uso. Encerre a prévia antiga com Ctrl+C e execute novamente.` : error.message);
  process.exitCode = 1;
});
const online = Boolean(process.env.MYSPACE_PUBLIC_ORIGIN);
server.listen(port, online ? '0.0.0.0' : '127.0.0.1', async () => {
  console.log(`Site: http://127.0.0.1:${port}`);
  console.log(`Admin: http://127.0.0.1:${port}/admin.html`);
  if (!await auth.account()) {
    if (online) { console.log('Primeiro acesso online: configure MYSPACE_SETUP_CODE como segredo do servidor e abra /admin.html.'); return; }
    console.log('\nPrimeiro acesso: abra o Admin e crie seu usuário e senha.');
    console.log(`Código de configuração de uso único: ${auth.setupCode}`);
    console.log('Este código muda ao reiniciar o servidor. Depois da configuração, o cadastro fica fechado.\n');
  }
});
