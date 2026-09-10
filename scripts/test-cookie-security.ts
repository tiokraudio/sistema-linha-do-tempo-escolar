/**
 * Teste automatizado para validação estrita da detecção de segurança de cookies
 * e compatibilidade de rede local (LAN HTTP vs HTTPS) no authService.
 *
 * Cenários mínimos exigidos:
 * 1. http://localhost:3000 -> Secure false
 * 2. http://127.0.0.1:3000 -> Secure false
 * 3. http://10.10.4.10:3000 em produção -> Secure false
 * 4. HTTPS direto (req.secure === true ou protocol: 'https') -> Secure true
 * 5. Proxy com X-Forwarded-Proto: https -> Secure true
 *
 * Cenários adicionais de robustez:
 * 6. Proxy com múltiplos saltos: X-Forwarded-Proto: https, http -> Secure true
 * 7. Proxy com X-Forwarded-Proto: http -> Secure false
 * 8. Compatibilidade estrita entre getSessionCookieOptions e getClearCookieOptions
 * 9. Servidor HTTP real com resposta de Set-Cookie em requisições de login e logout
 */

import express from 'express';
import http from 'http';
import {
  isSecureRequest,
  getSessionCookieOptions,
  getClearCookieOptions,
  AUTH_COOKIE_NAME,
} from '../server/authService';

interface TestCase {
  id: string;
  description: string;
  mockReq: Partial<express.Request>;
  nodeEnv: string;
  expectedSecure: boolean;
}

const testCases: TestCase[] = [
  {
    id: 'T1',
    description: 'http://localhost:3000 em desenvolvimento -> Secure false',
    mockReq: {
      secure: false,
      protocol: 'http',
      headers: { host: 'localhost:3000' },
    },
    nodeEnv: 'development',
    expectedSecure: false,
  },
  {
    id: 'T2',
    description: 'http://localhost:3000 em produção -> Secure false',
    mockReq: {
      secure: false,
      protocol: 'http',
      headers: { host: 'localhost:3000' },
    },
    nodeEnv: 'production',
    expectedSecure: false,
  },
  {
    id: 'T3',
    description: 'http://127.0.0.1:3000 em desenvolvimento -> Secure false',
    mockReq: {
      secure: false,
      protocol: 'http',
      headers: { host: '127.0.0.1:3000' },
    },
    nodeEnv: 'development',
    expectedSecure: false,
  },
  {
    id: 'T4',
    description: 'http://127.0.0.1:3000 em produção -> Secure false',
    mockReq: {
      secure: false,
      protocol: 'http',
      headers: { host: '127.0.0.1:3000' },
    },
    nodeEnv: 'production',
    expectedSecure: false,
  },
  {
    id: 'T5',
    description: 'http://10.10.4.10:3000 em produção (Cenário Real do Usuário) -> Secure false',
    mockReq: {
      secure: false,
      protocol: 'http',
      headers: { host: '10.10.4.10:3000' },
    },
    nodeEnv: 'production',
    expectedSecure: false,
  },
  {
    id: 'T6',
    description: 'http://192.168.1.100:3000 em produção (LAN genérica) -> Secure false',
    mockReq: {
      secure: false,
      protocol: 'http',
      headers: { host: '192.168.1.100:3000' },
    },
    nodeEnv: 'production',
    expectedSecure: false,
  },
  {
    id: 'T7',
    description: 'HTTPS direto (req.secure === true) -> Secure true',
    mockReq: {
      secure: true,
      protocol: 'https',
      headers: { host: 'escola.exemplo.com' },
    },
    nodeEnv: 'production',
    expectedSecure: true,
  },
  {
    id: 'T8',
    description: 'HTTPS direto (protocol === "https") -> Secure true',
    mockReq: {
      secure: false,
      protocol: 'https',
      headers: { host: 'escola.exemplo.com' },
    },
    nodeEnv: 'production',
    expectedSecure: true,
  },
  {
    id: 'T9',
    description: 'Proxy com X-Forwarded-Proto: https -> Secure true',
    mockReq: {
      secure: false,
      protocol: 'http',
      headers: {
        host: 'escola.exemplo.com',
        'x-forwarded-proto': 'https',
      },
    },
    nodeEnv: 'production',
    expectedSecure: true,
  },
  {
    id: 'T10',
    description: 'Proxy com múltiplos saltos X-Forwarded-Proto: https, http -> Secure true',
    mockReq: {
      secure: false,
      protocol: 'http',
      headers: {
        host: 'escola.exemplo.com',
        'x-forwarded-proto': 'https, http',
      },
    },
    nodeEnv: 'production',
    expectedSecure: true,
  },
  {
    id: 'T11',
    description: 'Proxy com X-Forwarded-Proto: http -> Secure false',
    mockReq: {
      secure: false,
      protocol: 'http',
      headers: {
        host: 'escola.exemplo.com',
        'x-forwarded-proto': 'http',
      },
    },
    nodeEnv: 'production',
    expectedSecure: false,
  },
  {
    id: 'T12',
    description: 'Proxy com X-Forwarded-Ssl: on -> Secure true',
    mockReq: {
      secure: false,
      protocol: 'http',
      headers: {
        host: 'escola.exemplo.com',
        'x-forwarded-ssl': 'on',
      },
    },
    nodeEnv: 'production',
    expectedSecure: true,
  },
];

async function runUnitTests(): Promise<boolean> {
  console.log('======================================================================');
  console.log('--- TESTE UNITÁRIO: isSecureRequest() & OPÇÕES DE COOKIE ---');
  console.log('======================================================================\n');

  const origEnv = process.env.NODE_ENV;
  let allPassed = true;

  for (const tc of testCases) {
    process.env.NODE_ENV = tc.nodeEnv;
    const req = tc.mockReq as express.Request;
    const secureActual = isSecureRequest(req);
    const sessionOpts = getSessionCookieOptions(req);
    const clearOpts = getClearCookieOptions(req);

    const isSecureOk = secureActual === tc.expectedSecure;
    const isSessionOptsOk = sessionOpts.secure === tc.expectedSecure;
    const isClearOptsOk = clearOpts.secure === tc.expectedSecure;
    const isParityOk =
      sessionOpts.httpOnly === clearOpts.httpOnly &&
      sessionOpts.sameSite === clearOpts.sameSite &&
      sessionOpts.path === clearOpts.path &&
      sessionOpts.secure === clearOpts.secure;

    const testPassed = isSecureOk && isSessionOptsOk && isClearOptsOk && isParityOk;

    if (!testPassed) {
      allPassed = false;
      console.error(`❌ [${tc.id}] FALHOU: ${tc.description}`);
      console.error(`   Esperado secure=${tc.expectedSecure}, obtido secure=${secureActual}`);
      console.error(`   sessionOpts.secure=${sessionOpts.secure}, clearOpts.secure=${clearOpts.secure}`);
      console.error(`   Paridade entre login e logout: ${isParityOk ? 'OK' : 'FALHOU'}`);
    } else {
      console.log(`✅ [${tc.id}] PASSOU: ${tc.description}`);
      console.log(
        `   secure=${secureActual} | httpOnly=${sessionOpts.httpOnly} | sameSite=${sessionOpts.sameSite} | path=${sessionOpts.path}`
      );
    }
  }

  process.env.NODE_ENV = origEnv;
  return allPassed;
}

async function runHttpIntegrationTests(): Promise<boolean> {
  console.log('\n======================================================================');
  console.log('--- TESTE DE INTEGRAÇÃO HTTP: Set-Cookie VIA SERVIDOR EXPRESS ---');
  console.log('======================================================================\n');

  const app = express();

  app.get('/test/login-cookie', (req, res) => {
    res.cookie(AUTH_COOKIE_NAME, 'mock_token_abc123', getSessionCookieOptions(req));
    res.json({ ok: true });
  });

  app.get('/test/logout-cookie', (req, res) => {
    res.clearCookie(AUTH_COOKIE_NAME, getClearCookieOptions(req));
    res.json({ ok: true });
  });

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as any).port;

  function doRequest(headers: Record<string, string>, path: string): Promise<string[]> {
    return new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port,
          path,
          method: 'GET',
          headers,
        },
        (res) => {
          let cookies: string[] = [];
          const rawCookies = res.headers['set-cookie'];
          if (Array.isArray(rawCookies)) {
            cookies = rawCookies;
          } else if (rawCookies) {
            cookies = [rawCookies];
          }
          resolve(cookies);
        }
      );
      req.on('error', reject);
      req.end();
    });
  }

  let integrationPassed = true;

  try {
    // 1. Simular requisição HTTP da LAN: Host: 10.10.4.10:3000 em NODE_ENV=production
    process.env.NODE_ENV = 'production';
    const lanCookies = await doRequest({ host: '10.10.4.10:3000' }, '/test/login-cookie');
    const lanCookieStr = lanCookies.join('; ');
    const lanHasSecure = /;\s*Secure/i.test(lanCookieStr);
    const lanHasHttpOnly = /;\s*HttpOnly/i.test(lanCookieStr);
    const lanHasSameSiteStrict = /SameSite=Strict/i.test(lanCookieStr);

    console.log('1. Requisição simulando cliente LAN (Host: 10.10.4.10:3000, NODE_ENV=production):');
    console.log('   Set-Cookie:', lanCookieStr);
    if (!lanHasSecure && lanHasHttpOnly && lanHasSameSiteStrict) {
      console.log('   ✅ PASSOU: Cookie NÃO tem Secure (navegador aceita em HTTP LAN) e mantém HttpOnly + SameSite=Strict');
    } else {
      console.error('   ❌ FALHOU: Cookie não deveria ter Secure para HTTP LAN');
      integrationPassed = false;
    }

    // 2. Simular logout da LAN: Host: 10.10.4.10:3000 em NODE_ENV=production
    const lanLogoutCookies = await doRequest({ host: '10.10.4.10:3000' }, '/test/logout-cookie');
    const lanLogoutStr = lanLogoutCookies.join('; ');
    const lanLogoutHasSecure = /;\s*Secure/i.test(lanLogoutStr);
    console.log('\n2. Logout simulando cliente LAN (Host: 10.10.4.10:3000, NODE_ENV=production):');
    console.log('   Set-Cookie:', lanLogoutStr);
    if (!lanLogoutHasSecure) {
      console.log('   ✅ PASSOU: Cookie de logout NÃO tem Secure (compatível com o cookie emitido)');
    } else {
      console.error('   ❌ FALHOU: Cookie de logout não deveria ter Secure para HTTP LAN');
      integrationPassed = false;
    }

    // 3. Simular requisição via proxy HTTPS: X-Forwarded-Proto: https
    const httpsProxyCookies = await doRequest(
      {
        host: 'escola.exemplo.com',
        'x-forwarded-proto': 'https',
      },
      '/test/login-cookie'
    );
    const httpsProxyStr = httpsProxyCookies.join('; ');
    const httpsHasSecure = /;\s*Secure/i.test(httpsProxyStr);
    console.log('\n3. Requisição via proxy HTTPS (X-Forwarded-Proto: https):');
    console.log('   Set-Cookie:', httpsProxyStr);
    if (httpsHasSecure) {
      console.log('   ✅ PASSOU: Cookie tem atributo Secure sob proxy HTTPS');
    } else {
      console.error('   ❌ FALHOU: Cookie deveria ter Secure sob proxy HTTPS');
      integrationPassed = false;
    }

    // 4. Simular logout via proxy HTTPS: X-Forwarded-Proto: https
    const httpsLogoutCookies = await doRequest(
      {
        host: 'escola.exemplo.com',
        'x-forwarded-proto': 'https',
      },
      '/test/logout-cookie'
    );
    const httpsLogoutStr = httpsLogoutCookies.join('; ');
    const httpsLogoutHasSecure = /;\s*Secure/i.test(httpsLogoutStr);
    console.log('\n4. Logout via proxy HTTPS (X-Forwarded-Proto: https):');
    console.log('   Set-Cookie:', httpsLogoutStr);
    if (httpsLogoutHasSecure) {
      console.log('   ✅ PASSOU: Cookie de logout tem atributo Secure sob proxy HTTPS');
    } else {
      console.error('   ❌ FALHOU: Cookie de logout deveria ter Secure sob proxy HTTPS');
      integrationPassed = false;
    }
  } finally {
    server.close();
  }

  return integrationPassed;
}

async function main() {
  const unitOk = await runUnitTests();
  const integrationOk = await runHttpIntegrationTests();

  console.log('\n======================================================================');
  if (unitOk && integrationOk) {
    console.log('✅ TODOS OS TESTES DE COOKIE E REDE LOCAL (LAN HTTP) FORAM APROVADOS!');
    console.log('======================================================================');
    process.exit(0);
  } else {
    console.error('❌ HOUVE FALHAS NOS TESTES!');
    console.error('======================================================================');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Erro inesperado:', err);
  process.exit(1);
});
