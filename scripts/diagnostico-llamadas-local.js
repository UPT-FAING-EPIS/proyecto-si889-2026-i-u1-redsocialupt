const { chromium, devices } = require('playwright');
const readline = require('readline');

// ========================================
// ENV SELECTOR
// ========================================

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer));
  });
}

// ========================================
// LOCAL DEV LOGIN
// ========================================

async function devLogin(baseUrl, role = 'user') {
  const response = await fetch(`${baseUrl}/api/auth/dev-login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ role }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`No se pudo iniciar sesion local (${role}): ${response.status} ${text}`);
  }

  const data = await response.json();
  if (!data?.token || !data?.user) {
    throw new Error(`Respuesta de dev-login invalida para ${role}`);
  }

  return data;
}

async function addSession(ctx, session) {
  await ctx.addInitScript(
    ({ token, user }) => {
      localStorage.setItem('upt_token', token);
      localStorage.setItem('upt_user', JSON.stringify(user));
    },
    {
      token: session.token,
      user: session.user,
    }
  );
}

// ========================================
// CALL DEBUG
// ========================================

async function getCallInfo(page, label) {
  const result = await page.evaluate(() => {
    const q = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        selector: sel,
        text: el.textContent?.replace(/\s+/g, ' ').trim() || '',
        rect: {
          x: Math.round(r.x),
          y: Math.round(r.y),
          width: Math.round(r.width),
          height: Math.round(r.height),
        },
        css: {
          display: cs.display,
          visibility: cs.visibility,
          opacity: cs.opacity,
          position: cs.position,
          transform: cs.transform,
        },
      };
    };

    const remoteVideo = document.querySelector('#call-remote-video');
    const localVideo = document.querySelector('#call-local-video');
    const remoteAudio = document.querySelector('#call-remote-audio');
    const root = document.querySelector('#floating-call-window');

    return {
      url: location.href,
      rootClass: root?.className || null,
      status: q('#call-window-status'),
      name: q('#call-window-name'),
      modeBadge: q('#call-mode-badge'),
      callWindow: q('#floating-call-window'),
      stage: q('#call-video-stage'),
      videoFrame: q('.call-window__video-frame'),
      actions: q('#call-actions-row'),
      accept: q('#call-accept-btn'),
      reject: q('#call-reject-btn'),
      hangup: q('#call-hangup-btn'),
      minimize: q('#call-minimize-btn'),
      volume: q('#call-volume-pill'),
      localPreview: q('#call-local-preview-shell'),
      remotePlaceholder: q('#call-remote-placeholder'),
      remoteVideo: {
        rect: q('#call-remote-video')?.rect || null,
        naturalWidth: remoteVideo?.videoWidth || 0,
        naturalHeight: remoteVideo?.videoHeight || 0,
        readyState: remoteVideo?.readyState || 0,
        paused: remoteVideo?.paused ?? null,
        muted: remoteVideo?.muted ?? null,
        hidden: remoteVideo?.classList?.contains('hidden') ?? null,
      },
      localVideo: {
        rect: q('#call-local-video')?.rect || null,
        naturalWidth: localVideo?.videoWidth || 0,
        naturalHeight: localVideo?.videoHeight || 0,
        readyState: localVideo?.readyState || 0,
        paused: localVideo?.paused ?? null,
        muted: localVideo?.muted ?? null,
        hidden: localVideo?.classList?.contains('hidden') ?? null,
      },
      remoteAudio: {
        paused: remoteAudio?.paused ?? null,
        muted: remoteAudio?.muted ?? null,
        volume: remoteAudio?.volume ?? null,
        readyState: remoteAudio?.readyState || 0,
      },
    };
  });

  console.log('\n========================');
  console.log(label);
  console.log('========================');
  console.log(JSON.stringify(result, null, 2));
}

async function waitForVisible(page, selector, label, timeout = 60000) {
  await page.waitForSelector(selector, { state: 'visible', timeout });
  console.log(label);
}

async function safeClick(page, selector, label) {
  await page.waitForSelector(selector, { state: 'visible', timeout: 60000 });
  await page.click(selector);
  console.log(label);
}

async function openMessages(page, baseUrl, targetUserId, label) {
  await page.goto(`${baseUrl}/app.html#messages?user=${targetUserId}`, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });

  await page.waitForSelector('#start-audio-call-btn', { timeout: 60000 });
  await page.waitForSelector('#start-video-call-btn', { timeout: 60000 });
  console.log(label);
}

async function endCallIfActive(page) {
  const button = await page.$('#call-hangup-btn');
  if (button) {
    const visible = await button.isVisible().catch(() => false);
    if (visible) {
      await button.click().catch(() => {});
      await page.waitForTimeout(1500);
    }
  }
}

async function runCallScenario({ caller, receiver, mode }) {
  const isVideo = mode === 'video';
  const startSelector = isVideo ? '#start-video-call-btn' : '#start-audio-call-btn';
  const label = isVideo ? 'VIDEOLLAMADA' : 'LLAMADA DE VOZ';

  console.log('\n========================');
  console.log(`INICIANDO ${label}`);
  console.log('========================');

  await safeClick(caller, startSelector, `Caller inicio ${label}`);

  await waitForVisible(caller, '#floating-call-window', 'Caller ve card de llamada');
  await waitForVisible(receiver, '#floating-call-window', 'Receiver ve llamada entrante', 90000);
  await getCallInfo(caller, `CALLER - ${label} - RINGING`);
  await getCallInfo(receiver, `RECEIVER - ${label} - INCOMING`);

  await safeClick(receiver, '#call-accept-btn', `Receiver acepto ${label}`);
  await caller.waitForTimeout(8000);
  await receiver.waitForTimeout(8000);

  await getCallInfo(caller, `CALLER - ${label} - ACCEPTED`);
  await getCallInfo(receiver, `RECEIVER - ${label} - ACCEPTED`);

  const minimize = '#call-minimize-btn';
  await safeClick(caller, minimize, `Caller minimizo ${label}`);
  await caller.waitForTimeout(1000);
  await getCallInfo(caller, `CALLER - ${label} - MINIMIZED`);
  await safeClick(caller, minimize, `Caller expandio ${label}`);

  await endCallIfActive(caller);
  await caller.waitForTimeout(2500);
  await receiver.waitForTimeout(2500);
}

// ========================================
// MAIN
// ========================================

(async () => {
  console.log('\n========================');
  console.log('UPTCONNECT CALL TEST');
  console.log('========================\n');

  console.log('1 -> LOCALHOST');
  console.log('2 -> IP / LAN');
  console.log('3 -> PRODUCCION (solo si dev-login esta habilitado)\n');

  const answer = await ask('Selecciona entorno: ');
  let BASE_URL;

  if (answer === '2') {
    const host = await ask('IP o host LAN, ej. 192.168.1.43: ');
    BASE_URL = `http://${host.replace(/^https?:\/\//, '').replace(/\/$/, '')}`;
    console.log('\nModo LAN');
  } else if (answer === '3') {
    BASE_URL = 'https://uptconnect.duckdns.org';
    console.log('\nModo PRODUCCION');
  } else {
    BASE_URL = 'http://localhost';
    console.log('\nModo LOCALHOST');
  }

  rl.close();

  console.log('URL:', BASE_URL);

  const userSession = await devLogin(BASE_URL, 'user');
  const adminSession = await devLogin(BASE_URL, 'admin');

  console.log('\nUsuario caller:', userSession.user.full_name || userSession.user.name, `#${userSession.user.id}`);
  console.log('Usuario receiver:', adminSession.user.full_name || adminSession.user.name, `#${adminSession.user.id}`);

  const browser = await chromium.launch({
    headless: false,
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
      '--no-first-run',
    ],
  });

  const callerCtx = await browser.newContext({
    ...devices['Pixel 5'],
    permissions: ['camera', 'microphone'],
  });
  await addSession(callerCtx, userSession);

  const receiverCtx = await browser.newContext({
    ...devices['Pixel 5'],
    permissions: ['camera', 'microphone'],
  });
  await addSession(receiverCtx, adminSession);

  const caller = await callerCtx.newPage();
  const receiver = await receiverCtx.newPage();

  for (const page of [caller, receiver]) {
    page.on('response', async (response) => {
      if (response.status() >= 400) {
        console.log('ERROR:', response.status(), response.url());
      }
    });

    page.on('console', (message) => {
      if (['error', 'warning'].includes(message.type())) {
        console.log(`CONSOLE ${message.type().toUpperCase()}:`, message.text());
      }
    });
  }

  await openMessages(caller, BASE_URL, adminSession.user.id, 'Caller abierto en chat con Admin Prueba Local');
  await openMessages(receiver, BASE_URL, userSession.user.id, 'Receiver abierto en chat con Usuario Prueba Local');

  await runCallScenario({ caller, receiver, mode: 'audio' });
  await runCallScenario({ caller, receiver, mode: 'video' });

  console.log('\n========================');
  console.log('TODO LISTO');
  console.log('========================');
  console.log('\nCTRL + C para cerrar.\n');
})();
