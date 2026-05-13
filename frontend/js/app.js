(async function () {
  requireAuth();

  const appView = document.getElementById('app-view');
  const sidebar = document.querySelector('app-sidebar');
  const appState = {
    user: getUser(),
    cleanup: null,
  };
  const publicUsersState = {
    loaded: false,
    loading: null,
    map: new Map(),
  };
  const PRESENCE_PING_INTERVAL_MS = 60000;
  const PRESENCE_ONLINE_WINDOW_MS = 2 * 60 * 1000;
  const GLOBAL_INCOMING_CALL_POLL_INTERVAL_MS = 1000;
  let presencePingTimer = null;
  let presencePingInFlight = false;
  let globalIncomingCallPollTimer = null;
  let globalIncomingCallPollInFlight = false;

  if (!appState.user) {
    logout();
    return;
  }

  if (appState.user.is_profile_complete === false) {
    window.location.href = '/pages/onboarding.html';
    return;
  }

  if (isLoggedIn()) {
    AuthAPI.getProfile().then((bootstrapProfile) => {
      if (!bootstrapProfile?.ok || !bootstrapProfile.data) {
        return;
      }

      updateStoredUser(bootstrapProfile.data);
      appState.user = getUser();

      if (appState.user?.is_profile_complete === false) {
        window.location.href = '/pages/onboarding.html';
        return;
      }

      if (window.setupLayoutData) {
        window.setupLayoutData(appState.user);
      }

      if (window.AppRouter?.currentRoute) {
        const currentRouteName = String(window.AppRouter.currentRoute?.route || '');
        if (currentRouteName !== 'live') {
          window.AppRouter.render();
        }
      }
    }).catch((error) => {
      console.error('No se pudo hidratar la sesion desde /auth/me:', error);
    });
  }

  startPresenceHeartbeat();

  const ROUTE_ALIASES = {
    '': 'feed',
    '/': 'feed',
    'admin_publicaciones': 'admin-posts',
    'admin-publicaciones': 'admin-posts',
  };

  const EMOJI_DATA = {
    '😀': ['😀', '😁', '😂', '🤣', '😊', '😍', '😎', '🤩', '🤔', '😴', '😭', '😡', '🥳', '🤯', '😇', '🙌'],
    '👍': ['👍', '👎', '👏', '🙌', '🤝', '🙏', '✌️', '🤘', '💪', '👀', '🔥', '✨', '🎉', '💯', '📚', '🎓'],
    '❤️': ['❤️', '🧡', '💛', '💚', '💙', '💜', '🤍', '🤎', '💔', '💕', '💞', '💓', '💗', '💖', '💘', '💝'],
    '🐶': ['🐶', '🐱', '🐼', '🦊', '🐯', '🦁', '🐵', '🐸', '🐧', '🦄', '🐝', '🦋', '🌱', '🌸', '🌞', '🌙'],
    '🍕': ['🍕', '🍔', '🌮', '🍜', '🍣', '🍩', '🍪', '🍫', '☕', '🍵', '🥤', '🍎', '🍓', '🥑', '🍿', '🎂'],
    '⚽': ['⚽', '🏀', '🏐', '🎾', '🏓', '🥊', '🏃', '🏊', '🚴', '🎮', '🎧', '🎤', '🎸', '🎬', '📷', '💻'],
  };

  const REACTION_META = {
    me_gusta: { emoji: '👍', label: 'Me gusta' },
    me_encanta: { emoji: '❤️', label: 'Me encanta' },
    me_divierte: { emoji: '😂', label: 'Me divierte' },
    me_sorprende: { emoji: '😮', label: 'Me sorprende' },
    me_enoja: { emoji: '😡', label: 'Me enoja' },
  };

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      '\'': '&#39;',
    }[char]));
  }

  function nl2br(value) {
    return escapeHtml(value).replace(/\n/g, '<br>');
  }

  function safeUrl(url) {
    return String(url || '').replace(/'/g, '%27');
  }

  function getVisibilityMeta(visibility) {
    switch (visibility) {
      case 'friends':
        return {
          icon: 'group',
          label: 'Solo amigos',
          tone: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
        };
      case 'faculty':
        return {
          icon: 'school',
          label: 'Solo mi facultad',
          tone: 'bg-amber-50 text-amber-700 border border-amber-200',
        };
      default:
        return {
          icon: 'public',
          label: 'Toda la UPT',
          tone: 'bg-slate-100 text-slate-600 border border-slate-200',
        };
    }
  }

  function displayName(user) {
    return window.getDisplayName ? window.getDisplayName(user) : (user?.full_name || user?.name || 'Usuario');
  }

  function careerLabel(user) {
    return window.getCareerLabel ? window.getCareerLabel(user) : (user?.school || user?.career || user?.area || user?.position_title || '');
  }

  function cycleLabel(value, short = false) {
    return window.formatAcademicCycle ? window.formatAcademicCycle(value, short) : String(value || '');
  }

  function userColor(userOrLabel) {
    if (typeof userOrLabel === 'string') return getFacultyColor(userOrLabel);
    return getFacultyColor(userOrLabel?.faculty || userOrLabel?.school || userOrLabel?.career || '');
  }

  function timeAgo(dateStr) {
    if (!dateStr) return '';
    const diff = Math.max(0, (Date.now() - new Date(dateStr).getTime()) / 1000);
    if (diff < 60) return 'ahora';
    if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`;
    return `hace ${Math.floor(diff / 86400)} d`;
  }

  function formatBlockedUntilLabel(blockedUntil, isIndefinite = false) {
    if (isIndefinite || !blockedUntil) {
      return 'Bloqueo indefinido';
    }

    const date = new Date(blockedUntil);
    if (Number.isNaN(date.getTime())) {
      return 'Bloqueo temporal activo';
    }

    return `Hasta ${date.toLocaleString('es-PE', {
      dateStyle: 'medium',
      timeStyle: 'short',
    })}`;
  }

  function formatClock(dateStr) {
    if (!dateStr) return '';
    try {
      return new Date(dateStr).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
    } catch (error) {
      return '';
    }
  }

  function isUserOnline(user) {
    if (typeof user?.is_online === 'boolean') {
      return user.is_online;
    }

    if (!user?.last_seen_at) {
      return false;
    }

    const lastSeen = new Date(user.last_seen_at).getTime();
    if (Number.isNaN(lastSeen)) {
      return false;
    }

    return (Date.now() - lastSeen) <= PRESENCE_ONLINE_WINDOW_MS;
  }

  function presenceLabel(user) {
    if (isUserOnline(user)) {
      return 'En linea';
    }

    if (user?.last_seen_at) {
      return `Activo ${timeAgo(user.last_seen_at)}`;
    }

    return 'Inactivo';
  }

  function setBackgroundMedia(element, url, fallbackColor) {
    if (!element) return;
    if (url) {
      element.style.backgroundImage = `url('${safeUrl(url)}')`;
      element.style.backgroundSize = 'cover';
      element.style.backgroundPosition = 'center';
      if (fallbackColor) element.style.backgroundColor = fallbackColor;
      return;
    }
    element.style.backgroundImage = '';
    if (fallbackColor) element.style.backgroundColor = fallbackColor;
  }

  function setAvatarElement(element, user) {
    if (!element) return;
    const name = displayName(user);
    const color = userColor(user);
    if (user?.avatar_url) {
      element.textContent = '';
      setBackgroundMedia(element, user.avatar_url, color);
    } else {
      element.textContent = initials(name);
      element.style.backgroundImage = '';
      element.style.backgroundColor = color;
    }
  }

  function renderAvatar(user, options = {}) {
    const sizeClass = options.sizeClass || 'w-10 h-10';
    const textClass = options.textClass || 'text-white font-bold';
    const extraClass = options.extraClass || '';
    const showOnline = options.showOnline && isUserOnline(user)
      ? '<div class="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-white"></div>'
      : '';
    const name = displayName(user);
    const color = userColor(user);

    if (user?.avatar_url) {
      return `
        <div class="${sizeClass} ${extraClass} rounded-full shrink-0 relative bg-cover bg-center" style="background-image:url('${safeUrl(user.avatar_url)}'); background-color:${color}">
          ${showOnline}
        </div>
      `;
    }

    return `
      <div class="${sizeClass} ${extraClass} rounded-full shrink-0 relative flex items-center justify-center ${textClass}" style="background:${color}">
        ${escapeHtml(initials(name))}
        ${showOnline}
      </div>
    `;
  }

  function numericId(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  async function ensurePublicUsersLoaded(force = false) {
    if (publicUsersState.loaded && !force) return publicUsersState.map;
    if (publicUsersState.loading && !force) return publicUsersState.loading;

    publicUsersState.loading = (async () => {
      const result = await AuthAPI.listPublicUsers();
      if (result?.ok) {
        publicUsersState.map = new Map();
        getList(result).forEach((listedUser) => {
          const id = numericId(listedUser?.id);
          if (id !== null) {
            publicUsersState.map.set(id, listedUser);
          }
        });
        publicUsersState.loaded = true;
      }
      return publicUsersState.map;
    })();

    try {
      return await publicUsersState.loading;
    } finally {
      publicUsersState.loading = null;
    }
  }

  function resolveProfileData(source = {}) {
    const id = numericId(source.id ?? source.user_id);
    const cached = id !== null ? publicUsersState.map.get(id) : null;
    const fullName = source.full_name || source.name || source.user_name || cached?.full_name || cached?.name || (id !== null ? `Usuario #${id}` : 'Usuario');
    const school = source.school || source.user_school || source.career || cached?.career || cached?.school || '';
    const faculty = source.faculty || source.user_faculty || cached?.faculty || '';

    return {
      ...cached,
      ...source,
      id,
      name: fullName,
      full_name: fullName,
      school,
      career: school,
      faculty,
      avatar_url: source.avatar_url || cached?.avatar_url || source.user_avatar || null,
      banner_url: source.banner_url || cached?.banner_url || null,
      last_seen_at: source.last_seen_at || cached?.last_seen_at || null,
      is_online: typeof source.is_online === 'boolean' ? source.is_online : cached?.is_online,
    };
  }

  function normalizeFriendEntries(entries = []) {
    return entries.map((entry) => {
      if (entry && typeof entry === 'object') {
        return resolveProfileData(entry);
      }

      const cached = publicUsersState.map.get(Number(entry));
      return cached ? resolveProfileData(cached) : resolveProfileData({ id: entry });
    }).filter((entry) => entry.id !== null);
  }

  function findIncomingRequest(requests = [], targetUserId) {
    const targetId = numericId(targetUserId);
    return requests.find((request) => numericId(request?.sender_id || request?.sender?.id || request?.sender?.user_id) === targetId) || null;
  }

  function getUserTypeLabel(userType) {
    switch (userType) {
      case 'teacher':
        return 'Docente';
      case 'administrativo':
        return 'Administrativo';
      default:
        return 'Estudiante';
    }
  }

  function reactionCountSummary(reactionsCount = {}) {
    return Object.entries(REACTION_META)
      .map(([type, meta]) => ({ type, meta, total: Number(reactionsCount?.[type] || 0) }))
      .filter((entry) => entry.total > 0)
      .map((entry) => `${entry.meta.emoji} ${entry.total}`)
      .join(' ');
  }

  function renderReactionButtons(targetType, targetId, currentReaction, interactive = true) {
    const baseClass = 'inline-flex items-center justify-center w-8 h-8 rounded-full border text-sm transition-colors';
    return Object.entries(REACTION_META).map(([type, meta]) => {
      const active = currentReaction === type;
      const tone = active
        ? 'bg-[#1B2A6B] text-white border-[#1B2A6B]'
        : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50';
      if (!interactive) {
        return `<span class="${baseClass} ${tone}" title="${escapeHtml(meta.label)}">${meta.emoji}</span>`;
      }
      return `
        <button type="button" data-action="react-${targetType}" data-${targetType}-id="${targetId}" data-reaction="${type}" class="${baseClass} ${tone}" title="${escapeHtml(meta.label)}">
          ${meta.emoji}
        </button>
      `;
    }).join('');
  }

  async function reportContent(kind, id) {
    const confirmed = window.confirm(`Quieres reportar esta ${kind}?`);
    if (!confirmed) {
      return;
    }

    let result = null;
    if (kind === 'publicacion') result = await PostsAPI.reportPost(id);
    if (kind === 'comentario') result = await PostsAPI.reportComment(id);
    if (kind === 'mensaje') result = await ChatAPI.reportMessage(id);

    if (result?.ok) {
      showToast('Reporte enviado correctamente', 'success');
      return;
    }

    showToast(result?.data?.error || 'No se pudo enviar el reporte', 'error');
  }

  function renderCommentCard(comment, options = {}) {
    const interactive = options.interactive !== false;
    const compact = options.compact !== false;
    const footerActions = options.footerActions || '';
    const author = resolveProfileData({
      id: comment.user_id,
      user_name: comment.user_name,
      user_faculty: comment.user_faculty,
      user_avatar: comment.user_avatar,
    });

    return `
      <article class="rounded-[18px] border border-slate-200 bg-slate-50 ${compact ? 'p-3' : 'p-4'}">
        <div class="flex items-start ${compact ? 'gap-2.5' : 'gap-3'}">
          ${renderAvatar(author, { sizeClass: compact ? 'w-8 h-8 md:w-9 md:h-9' : 'w-10 h-10', textClass: 'text-white font-bold text-sm' })}
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-1.5 mb-1">
              <span class="font-semibold text-[13px] text-slate-900">${escapeHtml(displayName(author))}</span>
              ${author.faculty ? `
                <span class="text-[9px] font-bold text-white px-1.5 py-0.5 rounded-full" style="background:${userColor(author)}">
                  ${escapeHtml(author.faculty)}
                </span>
              ` : ''}
              <span class="text-[11px] text-slate-500">${escapeHtml(timeAgo(comment.created_at))}</span>
            </div>
            <p class="content-break text-[13px] text-slate-700 ${compact ? 'leading-5' : 'leading-6'}">${nl2br(comment.content || '')}</p>
            <div class="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
              <div class="flex items-center gap-2">
                ${renderReactionButtons('comment', comment.id, comment.current_reaction, interactive)}
              </div>
              <span class="font-medium text-slate-600">${escapeHtml(reactionCountSummary(comment.reactions_count)) || `${comment.reactions_total || 0} reacciones`}</span>
              ${interactive ? `
                <button type="button" data-action="report-comment" data-comment-id="${comment.id}" class="ml-auto text-[11px] font-semibold text-slate-500 hover:text-slate-700 transition-colors">
                  Reportar
                </button>
              ` : ''}
            </div>
            ${footerActions ? `<div class="mt-2 flex items-center justify-end gap-2">${footerActions}</div>` : ''}
          </div>
        </div>
      </article>
    `;
  }

  function syncCurrentUser(payload) {
    if (payload?.token && payload?.user) {
      saveSession(payload.token, payload.user);
    } else if (payload?.user) {
      updateStoredUser(payload.user);
    } else if (payload) {
      updateStoredUser(payload);
    }

    appState.user = getUser();
    if (appState.user?.id) {
      publicUsersState.map.set(Number(appState.user.id), appState.user);
    }
    if (window.setupLayoutData) window.setupLayoutData(appState.user);
  }

  async function refreshPresence(forceUsers = false) {
    if (!appState.user?.id || presencePingInFlight) {
      return;
    }

    presencePingInFlight = true;

    try {
      const result = await AuthAPI.touchPresence();
      if (result?.ok && result.data?.user) {
        syncCurrentUser(result.data.user);
        publicUsersState.map.set(Number(result.data.user.id), result.data.user);
      }

      if (forceUsers) {
        await ensurePublicUsersLoaded(true);
      }

      window.dispatchEvent(new CustomEvent('presence:updated'));
    } finally {
      presencePingInFlight = false;
    }
  }

  function startPresenceHeartbeat() {
    if (!appState.user?.id || presencePingTimer) {
      return;
    }

    const pingNow = () => {
      if (document.visibilityState === 'hidden') {
        return;
      }

      refreshPresence(true);
    };

    pingNow();
    presencePingTimer = window.setInterval(pingNow, PRESENCE_PING_INTERVAL_MS);
    window.addEventListener('focus', pingNow);
    document.addEventListener('visibilitychange', pingNow);
  }

  function buildHash(route, params = {}) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        searchParams.set(key, value);
      }
    });
    const query = searchParams.toString();
    return `#${route}${query ? `?${query}` : ''}`;
  }

  function parseRoute() {
    const rawHash = window.location.hash.replace(/^#/, '');
    const [rawRoute, queryString = ''] = (rawHash || 'feed').split('?');
    const normalized = (rawRoute || 'feed').replace(/^\/+|\/+$/g, '');
    const route = ROUTE_ALIASES[normalized] || normalized || 'feed';
    const params = Object.fromEntries(new URLSearchParams(queryString));
    return { route, params };
  }

  function setDocumentTitle(title) {
    document.title = title ? `${title} - UPT Connect` : 'UPT Connect';
  }

  function getLivestreamEngineHost() {
    return window.location.hostname || 'localhost';
  }

  function buildLivestreamHlsUrl(streamKey) {
    return `${window.location.origin}/ome/app/${encodeURIComponent(streamKey)}/master.m3u8`;
  }

  function normalizeLivestreamPlaybackUrl(streamKey, _playbackUrl) {
    // Always rebuild from stream_key to ensure the viewer uses the frontend proxy
    return buildLivestreamHlsUrl(streamKey);
  }

  function buildLivestreamPublishUrl(streamKey) {
    return `${window.location.origin}/ome/app/${encodeURIComponent(streamKey)}?direction=whip&transport=tcp`;
  }

  function buildLivestreamStreamKey(userId) {
    return `upt-live-${userId}-${Date.now().toString(36)}`;
  }

  function isDesktopClient() {
    // Real device detection: UA + pointer + touch — NOT viewport size
    const ua = navigator.userAgent || '';
    const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|Tablet/i.test(ua);
    const hasCoarsePointer = window.matchMedia('(pointer: coarse)').matches;
    const hasFinePointer = window.matchMedia('(pointer: fine)').matches;
    const isTouchOnly = ('ontouchstart' in window || navigator.maxTouchPoints > 0) && !hasFinePointer;
    // Desktop = not a mobile UA, has a fine pointer (mouse), and is not touch-only
    if (isMobileUA || (hasCoarsePointer && !hasFinePointer) || isTouchOnly) return false;
    return true;
  }

  function isMobileDevice() {
    return !isDesktopClient();
  }

  function loadExternalScript(src, globalName) {
    if (globalName && window[globalName]) {
      return Promise.resolve(window[globalName]);
    }

    const existing = document.querySelector(`script[data-external-src="${src}"]`);
    if (existing) {
      return new Promise((resolve, reject) => {
        if (globalName && window[globalName]) {
          resolve(window[globalName]);
          return;
        }

        existing.addEventListener('load', () => resolve(globalName ? window[globalName] : true), { once: true });
        existing.addEventListener('error', () => reject(new Error(`No se pudo cargar ${src}`)), { once: true });
      });
    }

    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.dataset.externalSrc = src;
      script.onload = () => resolve(globalName ? window[globalName] : true);
      script.onerror = () => reject(new Error(`No se pudo cargar ${src}`));
      document.head.appendChild(script);
    });
  }

  function loadExternalStyle(href) {
    if (document.querySelector(`link[data-external-style="${href}"]`)) {
      return;
    }

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.dataset.externalStyle = href;
    document.head.appendChild(link);
  }

  async function ensureLivestreamLibraries() {
    await loadExternalScript('https://cdn.jsdelivr.net/npm/hls.js@latest', 'Hls');
    await loadExternalScript('https://cdn.jsdelivr.net/npm/ovenlivekit@latest/dist/OvenLiveKit.min.js', 'OvenLiveKit');
  }

  function renderLivestreamCard(post, currentUserId, options = {}) {
    const author = resolveProfileData({
      id: post.user_id,
      user_name: post.user_name,
      user_faculty: post.user_faculty,
      user_school: post.user_school,
      user_avatar: post.user_avatar,
    });
    const isLive = post.live_status === 'live';
    const canDelete = options.canDelete ?? Number(post.user_id) === Number(currentUserId);
    const badgeTone = isLive ? 'bg-[#ff0b53] text-white' : 'bg-slate-200 text-slate-700';

    return `
      <article class="bg-white border border-slate-200 rounded-3xl p-4 shadow-sm overflow-hidden">
        <div class="flex items-start justify-between gap-3 mb-4">
          <button type="button" class="flex items-center gap-3 text-left" data-action="open-profile" data-user-id="${post.user_id}">
            ${renderAvatar(author, { sizeClass: 'w-11 h-11', textClass: 'text-white font-bold', showOnline: true })}
            <div>
              <div class="flex items-center gap-2 flex-wrap">
                <span class="font-bold text-sm text-slate-900">${escapeHtml(displayName(author))}</span>
                <span class="text-white text-[10px] font-bold px-2 py-0.5 rounded-full" style="background:${userColor(author)}">${escapeHtml(author.faculty || 'UPT')}</span>
              </div>
              <p class="text-xs text-slate-500 mt-0.5">${escapeHtml(timeAgo(post.created_at))}</p>
            </div>
          </button>
          ${canDelete ? `
            <button type="button" data-action="delete-post" data-post-id="${post.id}" class="text-slate-400 hover:bg-slate-50 p-1 rounded-full shrink-0">
              <span class="material-symbols-outlined">delete</span>
            </button>
          ` : ''}
        </div>
        <button type="button" data-action="open-livestream" data-live-id="${post.id}" class="block w-full text-left">
          <div class="rounded-[28px] overflow-hidden relative min-h-[280px] bg-[radial-gradient(circle_at_top_left,_#6d28d9,_#0f172a_55%,_#020617)]">
            <div class="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(255,132,0,0.26),_transparent_30%),radial-gradient(circle_at_bottom_left,_rgba(236,72,153,0.20),_transparent_26%)]"></div>
            <div class="absolute top-4 left-4 right-4 flex items-center justify-between gap-3 z-10">
              <div class="flex items-center gap-2">
                <span class="px-3 py-1 rounded-full text-xs font-black tracking-[0.18em] ${badgeTone}">${isLive ? 'LIVE' : 'FINALIZADO'}</span>
                <span class="px-3 py-1 rounded-full bg-black/45 text-white text-xs font-semibold flex items-center gap-1">
                  <span class="material-symbols-outlined text-[14px]">visibility</span>
                  ${Number(post.viewer_count || 0)} 
                </span>
              </div>
              <span class="px-3 py-1 rounded-full bg-white/10 text-white text-xs font-semibold">${escapeHtml(post.live_source === 'screen' ? 'Pantalla' : 'Camara')}</span>
            </div>
            <div class="relative z-10 h-full min-h-[280px] flex flex-col justify-end p-5 text-white">
              <h3 class="text-xl md:text-2xl font-black leading-tight max-w-[80%]">${escapeHtml(post.live_title || 'Directo UPT')}</h3>
              <p class="text-sm text-white/80 mt-2 max-w-[80%]">${escapeHtml((post.content || '').slice(0, 140) || 'Transmision en vivo de la comunidad UPT')}</p>
              <div class="mt-5 flex items-center gap-3">
                <span class="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 bg-white/12 text-xs font-semibold">
                  <span class="material-symbols-outlined text-[14px]">favorite</span>
                  ${escapeHtml(reactionCountSummary(post.reactions_count)) || `${post.reactions_total || 0} reacciones`}
                </span>
                <span class="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 bg-white/12 text-xs font-semibold">
                  <span class="material-symbols-outlined text-[14px]">chat</span>
                  ${Number(post.comments_count || 0)} comentarios
                </span>
              </div>
            </div>
          </div>
        </button>
      </article>
    `;
  }

  function renderPostCard(post, currentUserId, options = {}) {
    if ((post.post_type || 'standard') === 'livestream') {
      return renderLivestreamCard(post, currentUserId, options);
    }
    const canDelete = options.canDelete ?? Number(post.user_id) === Number(currentUserId);
    const interactive = options.interactive !== false;
    const clickable = options.clickable !== false;
    const mediaHeightClass = options.mediaHeightClass || 'h-64';
    const author = resolveProfileData({
      id: post.user_id,
      user_name: post.user_name,
      user_faculty: post.user_faculty,
      user_school: post.user_school,
      user_avatar: post.user_avatar,
    });
      const authorCareer = careerLabel(author);
      const visibilityMeta = getVisibilityMeta(post.visibility);
      const audienceMarkup = post.group_id ? `
        <span class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold bg-sky-50 text-sky-700 border border-sky-200">
          <span class="material-symbols-outlined text-[14px]">diversity_3</span>
          ${escapeHtml(post.group_name || 'Grupo')}
        </span>
      ` : `
        <span class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${visibilityMeta.tone}">
          <span class="material-symbols-outlined text-[14px]">${visibilityMeta.icon}</span>
          ${escapeHtml(visibilityMeta.label)}
        </span>
      `;
      const authorMeta = [
        authorCareer ? `<span>${escapeHtml(authorCareer)}</span>` : '',
        `<span>${escapeHtml(timeAgo(post.created_at))}</span>`,
      ].filter(Boolean).join('<span>&middot;</span>');

    return `
      <article class="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow ${clickable ? 'cursor-pointer' : ''}" ${clickable ? `data-post-card="true" data-post-id="${post.id}"` : ''}>
        <div class="flex justify-between items-start mb-3">
          <button type="button" class="flex items-center gap-3 text-left" data-action="open-profile" data-user-id="${post.user_id}">
            ${renderAvatar(author, { sizeClass: 'w-10 h-10', textClass: 'text-white font-bold', showOnline: true })}
            <div>
              <div class="flex items-center gap-1">
                <span class="font-bold text-sm text-slate-900">${escapeHtml(displayName(author))}</span>
                <span class="text-white text-[10px] font-bold px-2 py-0.5 rounded-full ml-1" style="background:${userColor(author)}">${escapeHtml(author.faculty || 'UPT')}</span>
              </div>
                <div class="text-slate-500 text-xs mt-0.5">${authorMeta}</div>
              </div>
            </button>
            ${canDelete ? `
            <button type="button" data-action="delete-post" data-post-id="${post.id}" class="text-slate-400 hover:bg-slate-50 p-1 rounded-full">
              <span class="material-symbols-outlined">delete</span>
              </button>
            ` : ''}
          </div>
          <div class="mb-3 flex items-center gap-2">
            ${audienceMarkup}
          </div>
          <div class="text-sm text-slate-800 mb-4"><p class="content-break">${nl2br(post.content || '')}</p></div>
          ${post.image_url ? `<div class="w-full ${mediaHeightClass} bg-slate-100 overflow-hidden rounded-xl mb-3"><img alt="Imagen de la publicacion" class="w-full h-full object-cover" src="${safeUrl(post.image_url)}" onerror="this.parentElement.style.display='none'"/></div>` : ''}
        ${interactive ? `
          <div class="pt-3 border-t border-slate-100 flex flex-wrap justify-start gap-3 items-center text-slate-500">
            <div class="flex items-center gap-2">
              ${renderReactionButtons('post', post.id, post.current_reaction, true)}
            </div>
            <span class="text-sm font-medium text-slate-600">${escapeHtml(reactionCountSummary(post.reactions_count)) || `${post.reactions_total || 0} reacciones`}</span>
            <button type="button" data-action="comment-post" data-post-id="${post.id}" class="flex items-center gap-1.5 hover:text-slate-700 transition-colors">
              <span class="material-symbols-outlined text-[18px]">chat_bubble_outline</span>
              <span class="text-sm">${post.comments_count || 0} Comentarios</span>
            </button>
            <button type="button" data-action="report-post" data-post-id="${post.id}" class="text-sm font-medium text-slate-500 hover:text-slate-700 transition-colors">
              Reportar
            </button>
          </div>
        ` : ''}
      </article>
    `;
  }

  function renderPostModalPreview(post, currentUserId) {
    if (!post) {
      return `
        <div class="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-400">
          No se pudo cargar la publicacion seleccionada.
        </div>
      `;
    }

      const author = resolveProfileData({
        id: post.user_id,
        user_name: post.user_name,
        user_faculty: post.user_faculty,
        user_school: post.user_school,
        user_avatar: post.user_avatar,
      });
      const visibilityMeta = getVisibilityMeta(post.visibility);
      const audienceMarkup = post.group_id ? `
        <span class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold bg-sky-50 text-sky-700 border border-sky-200">
          <span class="material-symbols-outlined text-[14px]">diversity_3</span>
          ${escapeHtml(post.group_name || 'Grupo')}
        </span>
      ` : `
        <span class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${visibilityMeta.tone}">
          <span class="material-symbols-outlined text-[14px]">${visibilityMeta.icon}</span>
          ${escapeHtml(visibilityMeta.label)}
        </span>
      `;
      const authorMeta = [
        careerLabel(author) ? `<span>${escapeHtml(careerLabel(author))}</span>` : '',
        `<span>${escapeHtml(timeAgo(post.created_at))}</span>`,
      ].filter(Boolean).join('<span>&middot;</span>');

    return `
      <article class="post-modal-preview-card">
        <div class="post-modal-preview-head">
          <div class="flex items-start gap-2.5">
            ${renderAvatar(author, { sizeClass: 'w-9 h-9', textClass: 'text-white font-bold text-sm' })}
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-1.5 flex-wrap">
                <span class="font-bold text-[13px] text-slate-900">${escapeHtml(displayName(author))}</span>
                <span class="text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full" style="background:${userColor(author)}">
                  ${escapeHtml(author.faculty || 'UPT')}
                </span>
              </div>
                <div class="text-[11px] text-slate-500 mt-0.5">${authorMeta}</div>
              </div>
            </div>
            <div class="mt-3">
              ${audienceMarkup}
            </div>
            ${post.content ? `
              <div class="post-modal-preview-copy content-break">${nl2br(post.content)}</div>
            ` : ''}
        </div>
        ${post.image_url ? `
          <div class="post-modal-preview-media">
            <img src="${safeUrl(post.image_url)}" alt="Imagen de la publicacion" onerror="this.parentElement.style.display='none'"/>
          </div>
        ` : ''}
        <div class="post-modal-preview-stats">
          <div class="flex items-center gap-3">
            <span>${post.reactions_total || 0} Reacciones</span>
            <span>${post.comments_count || 0} Comentarios</span>
          </div>
        </div>
      </article>
    `;
  }

  let headerSearchCleanup = null;
  let headerMenusCleanup = null;

  window.setupHeaderSearch = function setupHeaderSearch() {
    const input = document.getElementById('header-search-input');
    const dropdown = document.getElementById('header-search-dropdown');
    const results = document.getElementById('header-search-results');

    if (!input || !dropdown || !results || !window.AppRouter) return;

    if (headerSearchCleanup) {
      headerSearchCleanup();
      headerSearchCleanup = null;
    }

    let debounceTimer = null;
    let requestVersion = 0;

    function closeDropdown() {
      dropdown.classList.add('hidden');
    }

    function openDropdown() {
      dropdown.classList.remove('hidden');
    }

    function renderSearchMessage(message) {
      results.innerHTML = `<div class="px-4 py-4 text-sm text-slate-500 text-center">${escapeHtml(message)}</div>`;
    }

    async function runSearch(query) {
      const normalized = String(query || '').trim();

      if (normalized.length < 2) {
        renderSearchMessage('Escribe al menos 2 letras para buscar.');
        closeDropdown();
        return;
      }

      const currentRequest = ++requestVersion;
      openDropdown();
      renderSearchMessage('Buscando estudiantes...');

      const result = await SocialAPI.searchDirectory(normalized);
      if (currentRequest !== requestVersion) return;

      if (!result?.ok) {
        renderSearchMessage(result?.data?.error || 'No se pudo completar la busqueda.');
        return;
      }

      const users = getList(result)
        .map((entry) => resolveProfileData(entry))
        .filter((entry) => Number(entry.id) !== Number(appState.user.id));

      users.forEach((entry) => {
        if (entry.id !== null) {
          publicUsersState.map.set(Number(entry.id), entry);
        }
      });

      if (!users.length) {
        renderSearchMessage('No se encontraron estudiantes.');
        return;
      }

      results.innerHTML = users.map((entry) => `
        <button type="button" class="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-slate-50 transition-colors" data-header-search-user="${entry.id}">
          ${renderAvatar(entry, { sizeClass: 'w-10 h-10', textClass: 'text-white font-bold text-sm' })}
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="font-semibold text-sm text-slate-900 truncate">${escapeHtml(displayName(entry))}</span>
              ${entry.faculty ? `
                <span class="text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full" style="background:${userColor(entry)}">
                  ${escapeHtml(entry.faculty)}
                </span>
              ` : ''}
            </div>
            <p class="text-xs text-slate-500 truncate mt-0.5">${escapeHtml(careerLabel(entry) || 'Perfil UPT')}</p>
          </div>
        </button>
      `).join('');
    }

    function handleInput() {
      const query = input.value;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => {
        runSearch(query);
      }, 220);
    }

    function handleDocumentClick(event) {
      const target = event.target;
      if (target.closest('#header-search-dropdown') || target.closest('#header-search-input')) {
        return;
      }
      closeDropdown();
    }

    function handleResultsClick(event) {
      const button = event.target.closest('[data-header-search-user]');
      if (!button) return;

      input.value = '';
      renderSearchMessage('Escribe al menos 2 letras para buscar.');
      closeDropdown();
      window.AppRouter.navigate('profile', { id: button.dataset.headerSearchUser });
    }

    function handleKeydown(event) {
      if (event.key === 'Escape') {
        closeDropdown();
      }
    }

    input.addEventListener('input', handleInput);
    input.addEventListener('focus', handleInput);
    input.addEventListener('keydown', handleKeydown);
    results.addEventListener('click', handleResultsClick);
    document.addEventListener('click', handleDocumentClick);

    headerSearchCleanup = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      input.removeEventListener('input', handleInput);
      input.removeEventListener('focus', handleInput);
      input.removeEventListener('keydown', handleKeydown);
      results.removeEventListener('click', handleResultsClick);
      document.removeEventListener('click', handleDocumentClick);
    };
  };

  window.setupHeaderMenus = function setupHeaderMenus() {
    const notifContainer = document.getElementById('notif-container');
    const notifToggle = document.getElementById('notif-toggle-btn');
    const notifDropdown = document.getElementById('notifications-dropdown');
    const profileContainer = document.getElementById('profile-menu-container');
    const profileToggle = document.getElementById('header-initials');
    const profileDropdown = document.getElementById('profile-menu-dropdown');

    if (!notifContainer || !notifToggle || !notifDropdown || !profileContainer || !profileToggle || !profileDropdown) {
      return;
    }

    if (headerMenusCleanup) {
      headerMenusCleanup();
      headerMenusCleanup = null;
    }

    function setMenuState(toggle, dropdown, isOpen) {
      dropdown.classList.toggle('hidden', !isOpen);
      toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    }

    function closeMenus() {
      setMenuState(notifToggle, notifDropdown, false);
      setMenuState(profileToggle, profileDropdown, false);
    }

    function toggleMenu(kind) {
      const targetToggle = kind === 'notifications' ? notifToggle : profileToggle;
      const targetDropdown = kind === 'notifications' ? notifDropdown : profileDropdown;
      const shouldOpen = targetDropdown.classList.contains('hidden');

      closeMenus();

      if (!shouldOpen) {
        return;
      }

      setMenuState(targetToggle, targetDropdown, true);
      if (kind === 'notifications' && window.loadNotifications) {
        window.loadNotifications();
      }
    }

    function handleDocumentClick(event) {
      const target = event.target;
      if (target.closest('#notif-container') || target.closest('#profile-menu-container')) {
        return;
      }
      closeMenus();
    }

    function handleKeydown(event) {
      if (event.key === 'Escape') {
        closeMenus();
      }
    }

    function handleNotifToggle(event) {
      event.preventDefault();
      event.stopPropagation();
      toggleMenu('notifications');
    }

    function handleProfileToggle(event) {
      event.preventDefault();
      event.stopPropagation();
      toggleMenu('profile');
    }

    function stopInsideClick(event) {
      event.stopPropagation();
    }

    notifToggle.addEventListener('click', handleNotifToggle);
    profileToggle.addEventListener('click', handleProfileToggle);
    notifDropdown.addEventListener('click', stopInsideClick);
    profileDropdown.addEventListener('click', stopInsideClick);
    document.addEventListener('click', handleDocumentClick);
    document.addEventListener('keydown', handleKeydown);

    headerMenusCleanup = () => {
      notifToggle.removeEventListener('click', handleNotifToggle);
      profileToggle.removeEventListener('click', handleProfileToggle);
      notifDropdown.removeEventListener('click', stopInsideClick);
      profileDropdown.removeEventListener('click', stopInsideClick);
      document.removeEventListener('click', handleDocumentClick);
      document.removeEventListener('keydown', handleKeydown);
      closeMenus();
    };
  };

  function initMessagesView({ container, user, params, callManagerOnly = false }) {
    const inboxList = container.querySelector('#inbox-list');
    const chatPanel = container.querySelector('#chat-panel');
    const messagesSummary = container.querySelector('#messages-summary');
    const messagesCount = container.querySelector('#messages-count');
    const CHAT_POLL_INTERVAL_MS = 1000;
    const CALL_POLL_INTERVAL_MS = 1000;
    const CALL_SIGNAL_POLL_INTERVAL_MS = 700;
    const CALL_ICE_SERVERS = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:uptconnect.duckdns.org:3478' },
      {
        urls: [
          'turn:uptconnect.duckdns.org:3478?transport=udp',
          'turn:uptconnect.duckdns.org:3478?transport=tcp',
        ],
        username: 'uptturn',
        credential: 'UptTurn2026!media',
      },
    ];

    let friends = [];
    let conversations = [];
    let activeChat = params.user ? Number(params.user) : null;
    let activeUser = null;
    let currentMessages = [];
    let activeConversationToken = 0;
    let chatPollTimer = null;
    let chatPollInFlight = false;
    let callInboxTimer = null;
    let callInboxPollInFlight = false;
    let callSessionTimer = null;
    let callSignalTimer = null;
    let callMeterFrame = null;
    let callSessionPollInFlight = false;
    let callSignalPollInFlight = false;
    const callRuntimeId = `call-runtime-${Math.random().toString(36).slice(2)}`;

    const callState = {
      session: null,
      otherUser: null,
      mode: 'audio',
      initialMode: 'audio',
      status: 'idle',
      startedAt: 0,
      pendingIncoming: null,
      localStream: null,
      remoteStream: null,
      peerConnection: null,
      lastSignalId: 0,
      drag: null,
      localVideoEnabled: false,
      isMuted: false,
      remoteVolume: 1,
      adjustingVolume: false,
      minimized: false,
      outgoingOfferSent: false,
      isFinalizing: false,
      awaitingAnswer: false,
      cameraBusy: false,
      makingOffer: false,
      ignoreOffer: false,
      pendingIceCandidates: [],
      initialVideoSyncDone: false,
      audioSender: null,
      videoSender: null,
      videoTransceiver: null,
      audioContext: null,
      audioAnalyser: null,
      audioMeterData: null,
      ringAudio: null,
    };

    function getGlobalCallRuntime() {
      return window.__uptGlobalCallRuntime || null;
    }

    function hasForeignCallManager() {
      return Boolean(window.__uptCallManager && window.__uptCallManager.id !== callRuntimeId);
    }

    function hasForeignActiveCallRuntime() {
      const runtime = getGlobalCallRuntime();
      return Boolean(runtime && runtime.id !== callRuntimeId && runtime.isActive?.());
    }

    function claimCallRuntime() {
      const runtime = getGlobalCallRuntime();
      if (!runtime || runtime.id === callRuntimeId || !runtime.isActive?.()) {
        window.__uptGlobalCallRuntime = {
          id: callRuntimeId,
          isActive: () => Boolean(callState.session),
        };
      }
    }

    function releaseCallRuntime() {
      if (window.__uptGlobalCallRuntime?.id === callRuntimeId) {
        delete window.__uptGlobalCallRuntime;
      }
    }

    function clampCallWindow(root = ensureCallWindow()) {
      if (!root || root.classList.contains('hidden')) return;
      const rect = root.getBoundingClientRect();
      const maxLeft = Math.max(8, window.innerWidth - root.offsetWidth - 8);
      const maxTop = Math.max(8, window.innerHeight - root.offsetHeight - 8);
      root.style.left = `${Math.min(Math.max(8, rect.left), maxLeft)}px`;
      root.style.top = `${Math.min(Math.max(8, rect.top), maxTop)}px`;
      root.style.right = 'auto';
    }

    function stopRingTone() {
      if (!callState.ringAudio) return;
      try {
        callState.ringAudio.pause();
        callState.ringAudio.currentTime = 0;
      } catch (error) {
        console.warn('No se pudo detener el tono:', error);
      }
    }

    async function playRingTone() {
      if (!callState.ringAudio) {
        callState.ringAudio = new Audio('/sonidos/phone-ringing.mp3');
        callState.ringAudio.loop = true;
        callState.ringAudio.preload = 'auto';
      }

      try {
        callState.ringAudio.currentTime = 0;
        await callState.ringAudio.play();
      } catch (error) {
        console.warn('No se pudo reproducir el tono:', error);
      }
    }

    function stopAudioMeter() {
      if (callMeterFrame) {
        cancelAnimationFrame(callMeterFrame);
        callMeterFrame = null;
      }
      document.querySelectorAll('[data-audio-meter-bar]').forEach((bar) => {
        bar.style.transform = 'scaleY(0.2)';
        bar.style.opacity = '0.35';
      });
    }

    function startAudioMeter() {
      stopAudioMeter();
      if (!callState.audioAnalyser || !callState.audioMeterData || callState.isMuted) return;
      const bars = Array.from(document.querySelectorAll('[data-audio-meter-bar]'));
      if (!bars.length) return;

      const tick = () => {
        if (!callState.audioAnalyser || !callState.audioMeterData || callState.isMuted) {
          stopAudioMeter();
          return;
        }

        callState.audioAnalyser.getByteFrequencyData(callState.audioMeterData);
        const chunk = Math.max(1, Math.floor(callState.audioMeterData.length / bars.length));
        bars.forEach((bar, index) => {
          const slice = callState.audioMeterData.slice(index * chunk, (index + 1) * chunk);
          const avg = slice.reduce((sum, value) => sum + value, 0) / Math.max(1, slice.length);
          const scale = Math.max(0.2, Math.min(1, avg / 90));
          bar.style.transform = `scaleY(${scale})`;
          bar.style.opacity = String(Math.max(0.35, scale));
        });

        callMeterFrame = requestAnimationFrame(tick);
      };

      tick();
    }

    function ensureCallWindow() {
      let root = document.getElementById('floating-call-window');
      if (!root) {
        root = document.createElement('div');
        root.id = 'floating-call-window';
        root.className = 'hidden fixed z-[70] flex max-h-[calc(100vh-1rem)] w-[calc(100vw-1rem)] sm:w-[360px] sm:max-w-[calc(100vw-1rem)] flex-col rounded-[28px] bg-[#1f1f1f] text-white shadow-2xl border border-white/10 overflow-hidden';
        root.style.top = '96px';
        root.style.right = '24px';
        root.innerHTML = `
          <div class="cursor-move px-5 pt-4 pb-3 bg-[#232323] flex items-center gap-3 select-none" data-call-drag-handle="true">
            <div class="w-12 h-12 rounded-full bg-emerald-900/60 flex items-center justify-center text-emerald-400 shrink-0" id="call-avatar-badge">
              <span class="material-symbols-outlined text-[28px]">person</span>
            </div>
            <div class="min-w-0 flex-1">
              <h3 id="call-window-name" class="font-bold text-lg truncate">Llamada</h3>
              <p id="call-window-status" class="text-white/70 text-sm">Esperando...</p>
            </div>
            <button type="button" id="call-minimize-btn" class="w-10 h-10 rounded-full bg-white/8 hover:bg-white/12 transition-colors flex items-center justify-center">
              <span class="material-symbols-outlined text-[20px]">remove</span>
            </button>
          </div>
          <div id="call-video-stage" class="px-4 sm:px-5 pt-3 sm:pt-4 shrink min-h-0">
            <div class="relative overflow-hidden rounded-3xl bg-[#2b2b2b] min-h-[170px] sm:min-h-[230px] md:min-h-[280px] flex items-center justify-center">
              <audio id="call-remote-audio" class="hidden" autoplay playsinline></audio>
              <video id="call-remote-video" class="absolute inset-0 w-full h-full object-cover hidden" autoplay playsinline muted></video>
              <div id="call-remote-placeholder" class="absolute inset-0 bg-[linear-gradient(160deg,#21264a_0%,#2f3d8b_60%,#1b2248_100%)] flex flex-col items-center justify-center gap-4">
                <div class="w-24 h-24 rounded-full border-4 border-white shadow-lg overflow-hidden bg-black/20 flex items-center justify-center">
                  <div id="call-remote-avatar" class="w-full h-full flex items-center justify-center bg-emerald-900/70 text-emerald-300 text-5xl">
                    <span class="material-symbols-outlined text-[44px]">person</span>
                  </div>
                </div>
                <span id="call-video-placeholder-label" class="text-white/70 text-sm">Camara apagada</span>
              </div>
              <video id="call-local-video" class="absolute bottom-3 right-3 sm:bottom-4 sm:right-4 w-24 h-16 sm:w-28 sm:h-20 rounded-2xl object-cover bg-black/40 border border-white/20 hidden" autoplay playsinline muted></video>
            </div>
          </div>
          <div id="call-actions-row" class="px-3 sm:px-4 py-3 sm:py-4 mt-auto flex flex-col gap-2 sm:gap-3">
            <div class="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              <button type="button" id="call-toggle-video-btn" class="w-12 h-12 shrink-0 rounded-full bg-white text-slate-900 hover:bg-slate-100 transition-colors flex items-center justify-center">
                <span class="material-symbols-outlined text-[22px]">videocam_off</span>
              </button>
              <div class="flex items-center gap-2 rounded-full bg-[#2c2c2c] px-3 h-12 shrink-0">
                <button type="button" id="call-toggle-mic-btn" class="w-8 h-8 shrink-0 rounded-full hover:bg-[#363636] transition-colors flex items-center justify-center">
                  <span class="material-symbols-outlined text-[22px]">mic</span>
                </button>
                <div class="flex items-end gap-1 h-6" aria-label="Medidor de sonido">
                  <span data-audio-meter-bar class="w-1.5 h-3 rounded-full bg-emerald-400 origin-bottom transition-transform duration-75 opacity-35"></span>
                  <span data-audio-meter-bar class="w-1.5 h-4 rounded-full bg-emerald-400 origin-bottom transition-transform duration-75 opacity-35"></span>
                  <span data-audio-meter-bar class="w-1.5 h-5 rounded-full bg-emerald-400 origin-bottom transition-transform duration-75 opacity-35"></span>
                  <span data-audio-meter-bar class="w-1.5 h-4 rounded-full bg-emerald-400 origin-bottom transition-transform duration-75 opacity-35"></span>
                </div>
              </div>
              <div class="flex items-center gap-2 rounded-full bg-[#2c2c2c] px-3 h-12 min-w-0 w-full sm:w-[170px]">
                <span class="material-symbols-outlined text-[18px] text-white/70">volume_down</span>
                <input id="call-remote-volume" type="range" min="0" max="1" step="0.05" value="1" class="flex-1 min-w-0 accent-emerald-400" aria-label="Volumen de llamada"/>
              </div>
            </div>
            <div class="grid grid-cols-3 gap-2 w-full shrink-0">
              <button type="button" id="call-accept-btn" class="hidden px-2 sm:px-4 h-11 sm:h-12 rounded-full bg-emerald-500 hover:bg-emerald-600 transition-colors text-sm font-semibold shrink-0">Aceptar</button>
              <button type="button" id="call-reject-btn" class="hidden px-2 sm:px-4 h-11 sm:h-12 rounded-full bg-white/10 hover:bg-white/15 transition-colors text-sm font-semibold shrink-0">Rechazar</button>
              <button type="button" id="call-hangup-btn" class="col-start-3 w-full h-11 sm:h-12 shrink-0 rounded-full bg-[#ff0b53] hover:bg-[#e00549] transition-colors flex items-center justify-center">
                <span class="material-symbols-outlined text-[22px]">call_end</span>
              </button>
            </div>
          </div>
        `;
        document.body.appendChild(root);
      }

      if (hasForeignCallManager()) {
        return root;
      }

      if (typeof root.__callCleanup === 'function') {
        root.__callCleanup();
      }

      root.querySelectorAll('button, input[type="range"]').forEach((element) => {
        element.style.touchAction = 'manipulation';
      });

      const bindControlClick = (element, handler) => {
        if (!element) return () => {};
        const listener = (event) => {
          event.preventDefault();
          event.stopPropagation();
          Promise.resolve(handler(event)).catch((error) => {
            console.warn('Error en accion de llamada:', error);
          });
        };
        element.addEventListener('click', listener);
        return () => element.removeEventListener('click', listener);
      };

      const cleanups = [];
      const handle = root.querySelector('[data-call-drag-handle="true"]');
      const onMouseDown = (event) => {
        if (event.target.closest('button')) return;
        const rect = root.getBoundingClientRect();
        callState.drag = {
          offsetX: event.clientX - rect.left,
          offsetY: event.clientY - rect.top,
        };
        document.body.classList.add('select-none');
      };
      const onMouseMove = (event) => {
        if (!callState.drag) return;
        const nextLeft = Math.min(Math.max(8, event.clientX - callState.drag.offsetX), window.innerWidth - root.offsetWidth - 8);
        const nextTop = Math.min(Math.max(8, event.clientY - callState.drag.offsetY), window.innerHeight - root.offsetHeight - 8);
        root.style.left = `${nextLeft}px`;
        root.style.top = `${nextTop}px`;
        root.style.right = 'auto';
      };
      const onMouseUp = () => {
        callState.drag = null;
        document.body.classList.remove('select-none');
      };
      handle.addEventListener('mousedown', onMouseDown);
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
      cleanups.push(() => handle.removeEventListener('mousedown', onMouseDown));
      cleanups.push(() => document.removeEventListener('mousemove', onMouseMove));
      cleanups.push(() => document.removeEventListener('mouseup', onMouseUp));

      const minimizeButton = root.querySelector('#call-minimize-btn');
      const onMinimize = () => {
        callState.minimized = !callState.minimized;
        root.querySelector('#call-video-stage').classList.toggle('hidden', callState.minimized);
      };
      minimizeButton.addEventListener('click', onMinimize);
      cleanups.push(() => minimizeButton.removeEventListener('click', onMinimize));

      cleanups.push(bindControlClick(root.querySelector('#call-toggle-mic-btn'), toggleMicrophone));
      cleanups.push(bindControlClick(root.querySelector('#call-toggle-video-btn'), toggleCamera));
      cleanups.push(bindControlClick(root.querySelector('#call-hangup-btn'), endActiveCall));
      cleanups.push(bindControlClick(root.querySelector('#call-accept-btn'), acceptIncomingCall));
      cleanups.push(bindControlClick(root.querySelector('#call-reject-btn'), rejectIncomingCall));

      const volumeInput = root.querySelector('#call-remote-volume');
      const onVolumePointerDown = () => {
        callState.adjustingVolume = true;
      };
      const onVolumePointerUp = () => {
        callState.adjustingVolume = false;
      };
      const onVolumePointerCancel = () => {
        callState.adjustingVolume = false;
      };
      const onVolumeChange = () => {
        callState.adjustingVolume = false;
      };
      const onVolumeInput = (event) => {
        const nextVolume = Number(event.target.value);
        callState.remoteVolume = Number.isFinite(nextVolume) ? Math.min(1, Math.max(0, nextVolume)) : 1;
        syncRemoteMediaVolume();
      };
      volumeInput.addEventListener('pointerdown', onVolumePointerDown);
      volumeInput.addEventListener('pointerup', onVolumePointerUp);
      volumeInput.addEventListener('pointercancel', onVolumePointerCancel);
      volumeInput.addEventListener('change', onVolumeChange);
      volumeInput.addEventListener('input', onVolumeInput);
      cleanups.push(() => volumeInput.removeEventListener('pointerdown', onVolumePointerDown));
      cleanups.push(() => volumeInput.removeEventListener('pointerup', onVolumePointerUp));
      cleanups.push(() => volumeInput.removeEventListener('pointercancel', onVolumePointerCancel));
      cleanups.push(() => volumeInput.removeEventListener('change', onVolumeChange));
      cleanups.push(() => volumeInput.removeEventListener('input', onVolumeInput));

      const onResize = () => clampCallWindow(root);
      window.addEventListener('resize', onResize);
      cleanups.push(() => window.removeEventListener('resize', onResize));

      root.__callCleanup = () => {
        cleanups.forEach((cleanup) => {
          try { cleanup(); } catch (error) {}
        });
        root.__callCleanup = null;
      };

      return root;
    }

    function syncRemoteMediaVolume() {
      const root = ensureCallWindow();
      const remoteAudio = root.querySelector('#call-remote-audio');
      const remoteVideo = root.querySelector('#call-remote-video');
      const volumeInput = root.querySelector('#call-remote-volume');

      if (volumeInput && !callState.adjustingVolume) {
        volumeInput.value = String(callState.remoteVolume);
      }
      if (remoteAudio) {
        remoteAudio.volume = callState.remoteVolume;
      }
      if (remoteVideo) {
        remoteVideo.muted = true;
        remoteVideo.volume = 0;
      }
    }

    function hasLiveRemoteVideo() {
      return Boolean(
        callState.remoteStream
        && callState.remoteStream.getVideoTracks().some((track) => track.readyState === 'live' && !track.muted)
      );
    }

    function isPolitePeer() {
      return Number(callState.session?.receiver_id) === Number(user.id);
    }

    async function flushPendingIceCandidates() {
      const peer = callState.peerConnection;
      if (!peer?.remoteDescription) {
        return;
      }

      const pending = callState.pendingIceCandidates.splice(0);
      for (const candidate of pending) {
        try {
          await peer.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (error) {
          console.warn('No se pudo agregar ICE candidate en cola:', error);
        }
      }
    }

    function syncMediaElementStream(element, stream) {
      if (!element) {
        return;
      }

      if (element.srcObject !== stream) {
        element.srcObject = stream;
      }

      if (stream && typeof element.play === 'function') {
        element.play().catch(() => {});
      }
    }

    function getLocalAudioTrack() {
      return callState.localStream?.getAudioTracks()?.[0] || null;
    }

    function getLocalVideoTrack() {
      return callState.localStream?.getVideoTracks()?.[0] || null;
    }

    async function tryPlayRemoteMedia() {
      const root = ensureCallWindow();
      const remoteAudio = root.querySelector('#call-remote-audio');
      const remoteVideo = root.querySelector('#call-remote-video');

      if (remoteAudio?.srcObject) {
        remoteAudio.play().catch(() => {});
      }
      if (remoteVideo?.srcObject) {
        remoteVideo.play().catch(() => {});
      }
    }

    function updateCallWindow() {
      const root = ensureCallWindow();
      const session = callState.session;
      const otherUser = callState.otherUser || {};
      const hasRemoteVideo = hasLiveRemoteVideo();
      const showVideoStage = callState.initialMode === 'video' || callState.localVideoEnabled || hasRemoteVideo;

      root.classList.toggle('hidden', !session);
      if (!session) {
        releaseCallRuntime();
        stopCallTimers();
        stopRingTone();
        return;
      }

      claimCallRuntime();

      root.classList.toggle('w-[390px]', showVideoStage);
      root.querySelector('#call-window-name').textContent = displayName(otherUser);
      root.querySelector('#call-window-status').textContent = describeCallStatus(session.status);
      root.querySelector('#call-video-stage').classList.toggle('hidden', callState.minimized || !showVideoStage);
      root.querySelector('#call-accept-btn').classList.toggle('hidden', !(session.status === 'ringing' && Number(session.receiver_id) === Number(user.id)));
      root.querySelector('#call-reject-btn').classList.toggle('hidden', !(session.status === 'ringing' && Number(session.receiver_id) === Number(user.id)));
      root.querySelector('#call-toggle-video-btn').classList.toggle('hidden', session.status !== 'accepted');
      root.querySelector('#call-toggle-mic-btn').classList.toggle('hidden', session.status !== 'accepted');
      root.querySelector('#call-minimize-btn').classList.toggle('hidden', !showVideoStage);

      const micIcon = root.querySelector('#call-toggle-mic-btn .material-symbols-outlined');
      const videoIcon = root.querySelector('#call-toggle-video-btn .material-symbols-outlined');
      micIcon.textContent = callState.isMuted ? 'mic_off' : 'mic';
      videoIcon.textContent = callState.localVideoEnabled ? 'videocam' : 'videocam_off';

      const remoteVideo = root.querySelector('#call-remote-video');
      const localVideo = root.querySelector('#call-local-video');
      const remotePlaceholder = root.querySelector('#call-remote-placeholder');
      const remoteLabel = root.querySelector('#call-video-placeholder-label');

      remoteVideo.classList.toggle('hidden', !hasRemoteVideo);
      remotePlaceholder.classList.toggle('hidden', hasRemoteVideo);
      localVideo.classList.toggle('hidden', !(callState.localVideoEnabled && callState.localStream));
      remoteLabel.textContent = hasRemoteVideo ? '' : 'Camara apagada';
      if (session.status === 'ringing') {
        playRingTone();
      } else {
        stopRingTone();
      }
      syncRemoteMediaVolume();
      clampCallWindow(root);
    }

    function describeCallStatus(status) {
      if (status === 'ringing') {
        return Number(callState.session?.caller_id) === Number(user.id)
          ? (callState.initialMode === 'video' ? 'Iniciando videollamada...' : 'Llamando...')
          : (callState.initialMode === 'video' ? 'Videollamada entrante' : 'Llamada entrante');
      }
      if (status === 'accepted') {
        return callState.localVideoEnabled || hasLiveRemoteVideo()
          ? 'En videollamada'
          : 'En llamada';
      }
      if (status === 'rejected') return 'Llamada rechazada';
      if (status === 'ended') return 'Llamada finalizada';
      return 'Conectando...';
    }

    function stopCallTimers() {
      if (callInboxTimer) {
        window.clearInterval(callInboxTimer);
        callInboxTimer = null;
      }
      if (callSessionTimer) {
        window.clearInterval(callSessionTimer);
        callSessionTimer = null;
      }
      if (callSignalTimer) {
        window.clearInterval(callSignalTimer);
        callSignalTimer = null;
      }
    }

    function cleanupPeerConnection() {
      if (
        hasForeignCallManager()
        && !callState.session
        && !callState.peerConnection
        && !callState.localStream
        && !callState.remoteStream
      ) {
        return;
      }

      if (callState.peerConnection) {
        try { callState.peerConnection.ontrack = null; } catch (error) {}
        try { callState.peerConnection.onicecandidate = null; } catch (error) {}
        try { callState.peerConnection.close(); } catch (error) {}
      }
      callState.peerConnection = null;
      callState.remoteStream = null;

      if (callState.localStream) {
        callState.localStream.getTracks().forEach((track) => track.stop());
      }
      callState.localStream = null;
      callState.localVideoEnabled = false;
      callState.isMuted = false;
      callState.cameraBusy = false;
      callState.makingOffer = false;
      callState.ignoreOffer = false;
      callState.pendingIceCandidates = [];
      callState.initialVideoSyncDone = false;
      callState.audioSender = null;
      callState.videoSender = null;
      callState.videoTransceiver = null;
      if (callState.audioContext) {
        callState.audioContext.close().catch(() => {});
      }
      callState.audioContext = null;
      callState.audioAnalyser = null;
      callState.audioMeterData = null;
      stopAudioMeter();
      stopRingTone();

      const root = ensureCallWindow();
      syncMediaElementStream(root.querySelector('#call-remote-audio'), null);
      syncMediaElementStream(root.querySelector('#call-remote-video'), null);
      syncMediaElementStream(root.querySelector('#call-local-video'), null);
      syncRemoteMediaVolume();
      if (!callState.session) {
        releaseCallRuntime();
      }
    }

    async function ensureLocalStream(mode = 'audio') {
      const needsVideo = mode === 'video';
      if (!callState.localStream) {
        try {
          callState.localStream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: needsVideo,
          });
        } catch (err) {
          // If device is busy (another app using mic/camera), release and retry once
          if (err.name === 'NotReadableError' || err.name === 'AbortError') {
            // Release any partial streams held by other contexts
            releaseCallRuntime();
            await new Promise(r => setTimeout(r, 600));
            callState.localStream = await navigator.mediaDevices.getUserMedia({
              audio: true,
              video: needsVideo,
            });
          } else {
            throw err;
          }
        }
      } else {
        if (!getLocalAudioTrack()) {
          const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
          audioStream.getAudioTracks().forEach((track) => callState.localStream.addTrack(track));
        }

        if (needsVideo && !getLocalVideoTrack()) {
          const videoStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
          videoStream.getVideoTracks().forEach((track) => callState.localStream.addTrack(track));
        }
      }

      callState.localVideoEnabled = Boolean(getLocalVideoTrack());

      if (!callState.audioContext && getLocalAudioTrack()) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) {
          callState.audioContext = new AudioContextClass();
          const analyserStream = new MediaStream([getLocalAudioTrack()]);
          const source = callState.audioContext.createMediaStreamSource(analyserStream);
          callState.audioAnalyser = callState.audioContext.createAnalyser();
          callState.audioAnalyser.fftSize = 64;
          callState.audioMeterData = new Uint8Array(callState.audioAnalyser.frequencyBinCount);
          source.connect(callState.audioAnalyser);
          if (callState.audioContext.state === 'suspended') {
            callState.audioContext.resume().catch(() => {});
          }
          startAudioMeter();
        }
      }

      const root = ensureCallWindow();
      const localVideo = root.querySelector('#call-local-video');
      syncMediaElementStream(localVideo, callState.localStream);

      return callState.localStream;
    }

    function createPeerConnection() {
      if (callState.peerConnection) {
        return callState.peerConnection;
      }

      const peer = new RTCPeerConnection({ iceServers: CALL_ICE_SERVERS });
      const root = ensureCallWindow();
      if (!callState.remoteStream) {
        callState.remoteStream = new MediaStream();
      }

      peer.ontrack = (event) => {
        const incomingStream = event.streams?.[0] || null;
        if (incomingStream) {
          incomingStream.getTracks().forEach((track) => {
            const alreadyExists = callState.remoteStream.getTracks().some((item) => item.id === track.id);
            if (!alreadyExists) {
              callState.remoteStream.addTrack(track);
            }
          });
        }

        const trackAlreadyExists = callState.remoteStream.getTracks().some((item) => item.id === event.track.id);
        if (!trackAlreadyExists) {
          callState.remoteStream.addTrack(event.track);
        }

        syncMediaElementStream(root.querySelector('#call-remote-audio'), callState.remoteStream);
        syncMediaElementStream(root.querySelector('#call-remote-video'), callState.remoteStream);
        syncRemoteMediaVolume();
        tryPlayRemoteMedia();

        event.track.onunmute = () => {
          tryPlayRemoteMedia();
          updateCallWindow();
        };
        event.track.onmute = () => updateCallWindow();
        event.track.onended = () => {
          try {
            callState.remoteStream.removeTrack(event.track);
          } catch (error) {}
          updateCallWindow();
        };
        updateCallWindow();
      };

      peer.onicecandidate = (event) => {
        if (!event.candidate || !callState.session) return;
        ChatAPI.sendCallSignal(callState.session.id, 'ice-candidate', event.candidate.toJSON());
      };

      peer.onconnectionstatechange = () => {
        if (peer.connectionState === 'failed') {
          console.warn('La conexion WebRTC fallo');
        }
      };

      if (callState.localStream) {
        callState.localStream.getTracks().forEach((track) => {
          if (track.kind === 'audio') {
            callState.audioSender = peer.addTrack(track, callState.localStream);
          }
        });
      }

      const localVideoTrack = getLocalVideoTrack();
      callState.videoTransceiver = peer.addTransceiver(localVideoTrack || 'video', {
        direction: localVideoTrack ? 'sendrecv' : 'recvonly',
        streams: callState.localStream ? [callState.localStream] : [],
      });
      callState.videoSender = callState.videoTransceiver.sender;

      callState.peerConnection = peer;
      return peer;
    }

    async function renegotiateCall() {
      if (!callState.session || callState.session.status !== 'accepted' || callState.awaitingAnswer || callState.makingOffer) return;
      const peer = createPeerConnection();
      try {
        callState.makingOffer = true;
        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);
        await ChatAPI.sendCallSignal(callState.session.id, 'offer', serializeSessionDescription(peer.localDescription || offer));
        callState.awaitingAnswer = true;
      } finally {
        callState.makingOffer = false;
      }
    }

    async function applyRemoteSignal(signal) {
      const peer = createPeerConnection();
      const payload = signal.payload || null;

      if (signal.signal_type === 'offer' && payload) {
        const offerCollision = callState.makingOffer || peer.signalingState !== 'stable';
        callState.ignoreOffer = !isPolitePeer() && offerCollision;
        if (callState.ignoreOffer) {
          return;
        }

        if (offerCollision) {
          await Promise.all([
            peer.setLocalDescription({ type: 'rollback' }),
            peer.setRemoteDescription(new RTCSessionDescription(payload)),
          ]);
        } else {
          await peer.setRemoteDescription(new RTCSessionDescription(payload));
        }

        await flushPendingIceCandidates();

        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        await ChatAPI.sendCallSignal(callState.session.id, 'answer', serializeSessionDescription(peer.localDescription || answer));
        callState.awaitingAnswer = false;

        if (
          Number(callState.session?.receiver_id) === Number(user.id)
          && callState.initialMode === 'video'
          && callState.localVideoEnabled
          && !callState.initialVideoSyncDone
        ) {
          callState.initialVideoSyncDone = true;
          window.setTimeout(() => {
            renegotiateCall().catch((error) => console.warn('No se pudo sincronizar el video inicial:', error));
          }, 150);
        }
      } else if (signal.signal_type === 'answer' && payload) {
        try {
          const sameAnswer = peer.currentRemoteDescription?.type === 'answer'
            && peer.currentRemoteDescription?.sdp === payload.sdp;

          if (!callState.ignoreOffer && !sameAnswer && peer.signalingState === 'have-local-offer') {
            await peer.setRemoteDescription(new RTCSessionDescription(payload));
            await flushPendingIceCandidates();
          }
        } finally {
          callState.awaitingAnswer = false;
          callState.ignoreOffer = false;
        }
      } else if (signal.signal_type === 'ice-candidate' && payload) {
        if (!peer.remoteDescription) {
          callState.pendingIceCandidates.push(payload);
          return;
        }

        try {
          await peer.addIceCandidate(new RTCIceCandidate(payload));
        } catch (error) {
          if (!callState.ignoreOffer) {
            console.warn('No se pudo agregar ICE candidate:', error);
          }
        }
      }
    }

    function serializeSessionDescription(description) {
      if (!description) {
        return null;
      }

      return {
        type: description.type,
        sdp: description.sdp,
      };
    }

    function resetCallNegotiationState() {
      callState.outgoingOfferSent = false;
      callState.awaitingAnswer = false;
      callState.makingOffer = false;
      callState.ignoreOffer = false;
      callState.lastSignalId = 0;
    }

    async function beginWebRtcIfNeeded() {
      if (!callState.session || callState.session.status !== 'accepted') return;
      const needsVideo = callState.localVideoEnabled;
      const needsLocalStream =
        !callState.localStream
        || !getLocalAudioTrack()
        || (needsVideo && !getLocalVideoTrack());

      if (needsLocalStream) {
        await ensureLocalStream(needsVideo ? 'video' : 'audio');
      }
      const peer = createPeerConnection();

      if (Number(callState.session.caller_id) === Number(user.id) && !callState.outgoingOfferSent) {
        try {
          callState.makingOffer = true;
          const offer = await peer.createOffer();
          await peer.setLocalDescription(offer);
          await ChatAPI.sendCallSignal(callState.session.id, 'offer', serializeSessionDescription(peer.localDescription || offer));
          callState.outgoingOfferSent = true;
          callState.awaitingAnswer = true;
        } finally {
          callState.makingOffer = false;
        }
      }

      tryPlayRemoteMedia();
      updateCallWindow();
    }

    async function pollCallSignals() {
      if (!callState.session || callState.session.status !== 'accepted' || callSignalPollInFlight) return;
      const expectedSessionId = Number(callState.session.id);
      callSignalPollInFlight = true;
      try {
        const result = await ChatAPI.getCallSignals(expectedSessionId, callState.lastSignalId);
        if (!result?.ok) return;
        if (!callState.session || Number(callState.session.id) !== expectedSessionId) return;

        const signals = getList(result);
        for (const signal of signals) {
          if (!callState.session || Number(callState.session.id) !== expectedSessionId) {
            break;
          }
          callState.lastSignalId = Math.max(callState.lastSignalId, Number(signal.id || 0));
          await applyRemoteSignal(signal);
        }
      } finally {
        callSignalPollInFlight = false;
      }
    }

    async function pollActiveCallState() {
      if (!callState.session || callSessionPollInFlight) return;
      const expectedSessionId = Number(callState.session.id);
      callSessionPollInFlight = true;
      try {
        const result = await ChatAPI.getCall(expectedSessionId);
        if (!result?.ok) return;
        if (!callState.session || Number(callState.session.id) !== expectedSessionId) return;

        const nextSession = result.data || null;
        if (!nextSession) return;

        callState.session = nextSession;
        if (nextSession.status === 'ringing') {
          callState.initialMode = nextSession.mode || callState.initialMode;
        }
        updateCallWindow();

        if (nextSession.status === 'accepted') {
          if (!callState.startedAt) {
            callState.startedAt = Date.now();
          }
          await beginWebRtcIfNeeded();
        } else if (['rejected', 'ended'].includes(nextSession.status)) {
          const message = nextSession.status === 'rejected' ? 'La llamada fue rechazada' : 'La llamada termino';
          await finalizeCall(message);
        }
      } finally {
        callSessionPollInFlight = false;
      }
    }

    function presentIncomingCall(incoming) {
      if (!incoming || callState.session) {
        return false;
      }

      const callerId = Number(incoming.caller_id || 0);
      if (!callerId) {
        return false;
      }

      const caller =
        findConversationUser(callerId)
        || publicUsersState.map.get(callerId)
        || {
          id: callerId,
          full_name: `Usuario #${callerId}`,
          name: `Usuario #${callerId}`,
          faculty: '',
          career: '',
          school: '',
          avatar_url: null,
        };

      callState.session = incoming;
      callState.otherUser = resolveProfileData(caller);
      callState.mode = incoming.mode || 'audio';
      callState.initialMode = incoming.mode || 'audio';
      callState.status = incoming.status || 'ringing';
      callState.minimized = false;
      resetCallNegotiationState();
      updateCallWindow();
      startActiveCallPolling();
      return true;
    }

    function startIncomingCallPolling() {
      if (callInboxTimer) return;
      callInboxTimer = window.setInterval(async () => {
        try {
          await pollPendingCallsOnce();
        } catch (error) {
          console.warn('Error de llamadas pendientes:', error);
        }
      }, CALL_POLL_INTERVAL_MS);
    }

    async function pollPendingCallsOnce() {
      if (document.hidden || callState.session || callInboxPollInFlight) {
        return false;
      }

      callInboxPollInFlight = true;
      try {
        const result = await ChatAPI.getPendingCalls();
        if (!result?.ok) return false;

        const pending = getList(result);
        if (!pending.length) return false;

        return presentIncomingCall(pending[0]);
      } finally {
        callInboxPollInFlight = false;
      }
    }

    function handleCallRouteChange() {
      if (!callState.session) {
        return;
      }

      window.setTimeout(() => {
        if (!callState.session) {
          return;
        }

        const root = ensureCallWindow();
        syncMediaElementStream(root.querySelector('#call-remote-audio'), callState.remoteStream);
        syncMediaElementStream(root.querySelector('#call-remote-video'), callState.remoteStream);
        syncMediaElementStream(root.querySelector('#call-local-video'), callState.localStream);
        tryPlayRemoteMedia();
        updateCallWindow();
      }, 80);
    }

    function startActiveCallPolling() {
      if (!callState.session) return;

      if (!callSessionTimer) {
        callSessionTimer = window.setInterval(() => {
          pollActiveCallState().catch((error) => console.warn('Error de estado de llamada:', error));
        }, CALL_POLL_INTERVAL_MS);
      }

      if (!callSignalTimer) {
        callSignalTimer = window.setInterval(() => {
          pollCallSignals().catch((error) => console.warn('Error de senales de llamada:', error));
        }, CALL_SIGNAL_POLL_INTERVAL_MS);
      }
    }

    async function openOutgoingCall(mode) {
      if (!activeUser?.id) return;

      try {
        await ensureLocalStream(mode);
      } catch (error) {
        const busy = error?.name === 'NotReadableError' || error?.name === 'AbortError';
        showToast(busy
          ? (mode === 'video' ? 'Otro app usa el micrófono/cámara. Ciérrala e inténtalo de nuevo.' : 'Otro app usa el micrófono. Ciérralo e inténtalo de nuevo.')
          : (mode === 'video' ? 'Debes permitir microfono y camara para iniciar la videollamada' : 'Debes permitir el microfono para iniciar la llamada'),
        'error');
        return;
      }

      const result = await ChatAPI.startCall({ receiverId: activeUser.id, mode });
      if (!result?.ok) {
        showToast(result?.data?.error || 'No se pudo iniciar la llamada', 'error');
        cleanupPeerConnection();
        return;
      }

      callState.session = result.data;
      callState.otherUser = resolveProfileData(activeUser);
      callState.mode = mode === 'video' ? 'video' : 'audio';
      callState.initialMode = callState.mode;
      callState.minimized = false;
      resetCallNegotiationState();
      tryPlayRemoteMedia();
      updateCallWindow();
      startActiveCallPolling();
    }

    async function startOutgoingCallForUser(targetUser, mode) {
      activeUser = resolveProfileData(targetUser);
      await openOutgoingCall(mode);
    }

    async function acceptIncomingCall() {
      if (!callState.session) return;
      try {
        await ensureLocalStream(callState.mode);
      } catch (error) {
        const busy = error?.name === 'NotReadableError' || error?.name === 'AbortError';
        showToast(busy
          ? (callState.mode === 'video' ? 'Otro app usa el micrófono/cámara. Ciérrala e inténtalo de nuevo.' : 'Otro app usa el micrófono. Ciérralo e inténtalo de nuevo.')
          : (callState.mode === 'video' ? 'Debes permitir microfono y camara para aceptar la videollamada' : 'Debes permitir el microfono para aceptar la llamada'),
        'error');
        return;
      }
      const result = await ChatAPI.acceptCall(callState.session.id);
      if (!result?.ok) {
        showToast(result?.data?.error || 'No se pudo aceptar la llamada', 'error');
        return;
      }

      callState.session = result.data;
      callState.startedAt = Date.now();
      resetCallNegotiationState();
      await beginWebRtcIfNeeded();
      tryPlayRemoteMedia();
      startActiveCallPolling();
    }

    async function rejectIncomingCall() {
      if (!callState.session) return;
      await ChatAPI.rejectCall(callState.session.id);
      await finalizeCall('Llamada rechazada');
    }

    async function endActiveCall() {
      if (!callState.session || callState.isFinalizing) return;
      callState.isFinalizing = true;
      const sessionId = callState.session.id;
      const durationSeconds = callState.startedAt ? Math.max(0, Math.floor((Date.now() - callState.startedAt) / 1000)) : 0;
      ChatAPI.endCall(sessionId, durationSeconds).catch((error) => {
        console.warn('No se pudo cerrar la llamada en segundo plano:', error);
      });
      await finalizeCall('Llamada finalizada');
    }

    function endCallOnPageLeave() {
      if (!callState.session || callState.isFinalizing) {
        return;
      }

      const token = getToken();
      if (!token) {
        return;
      }

      callState.isFinalizing = true;
      const sessionId = callState.session.id;
      const durationSeconds = callState.startedAt ? Math.max(0, Math.floor((Date.now() - callState.startedAt) / 1000)) : 0;

      fetch(`${API.chat}/calls/${sessionId}/end`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ duration_seconds: durationSeconds }),
        keepalive: true,
      }).catch(() => {});
    }

    async function finalizeCall(toastMessage = '') {
      if (!callState.session && !callState.isFinalizing) {
        return;
      }
      cleanupPeerConnection();
      stopCallTimers();

      const root = ensureCallWindow();
      root.classList.add('hidden');
      root.querySelector('#call-video-stage').classList.remove('hidden');
      root.querySelector('#call-window-status').textContent = 'Esperando...';
      root.querySelector('#call-toggle-mic-btn .material-symbols-outlined').textContent = 'mic';
      root.querySelector('#call-toggle-video-btn .material-symbols-outlined').textContent = 'videocam_off';
      root.querySelector('#call-local-video').classList.add('hidden');
      root.querySelector('#call-remote-video').classList.add('hidden');
      root.querySelector('#call-remote-placeholder').classList.remove('hidden');
      root.querySelector('#call-video-placeholder-label').textContent = 'Camara apagada';

      callState.session = null;
      callState.otherUser = null;
      callState.mode = 'audio';
      callState.initialMode = 'audio';
      callState.status = 'idle';
      callState.startedAt = 0;
      callState.pendingIncoming = null;
      callState.lastSignalId = 0;
      callState.drag = null;
      callState.minimized = false;
      callState.isFinalizing = false;
      callState.videoSender = null;
      resetCallNegotiationState();
      releaseCallRuntime();

      if (ownsCallLifecycle) {
        startIncomingCallPolling();
        window.setTimeout(() => {
          pollPendingCallsOnce().catch((error) => console.warn('Error de recovery de llamada:', error));
        }, 150);
      } else {
        stopCallTimers();
        window.removeEventListener('hashchange', handleCallRouteChange);
        window.removeEventListener('pagehide', handleCallPageLeave);
        window.removeEventListener('beforeunload', handleCallPageLeave);
      }

      if (toastMessage) {
        showToast(toastMessage, 'success');
      }
    }

    async function toggleMicrophone() {
      if (!callState.localStream || !getLocalAudioTrack()) return;
      callState.isMuted = !callState.isMuted;
      callState.localStream.getAudioTracks().forEach((track) => {
        track.enabled = !callState.isMuted;
      });
      if (!callState.isMuted) {
        startAudioMeter();
      } else {
        stopAudioMeter();
      }
      updateCallWindow();
    }

    async function toggleCamera() {
      if (!callState.session || callState.session.status !== 'accepted' || callState.cameraBusy) return;
      callState.cameraBusy = true;
      const root = ensureCallWindow();
      const localVideo = root.querySelector('#call-local-video');
      const peer = createPeerConnection();

      try {
        if (!callState.localVideoEnabled) {
          const media = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
          const videoTrack = media.getVideoTracks()[0];

          if (!callState.localStream) {
            await ensureLocalStream('audio');
          }

          callState.localVideoEnabled = true;
          callState.localStream.addTrack(videoTrack);
          syncMediaElementStream(localVideo, callState.localStream);
          if (!callState.videoTransceiver) {
            callState.videoTransceiver = peer.addTransceiver('video', { direction: 'recvonly' });
            callState.videoSender = callState.videoTransceiver.sender;
          }
          callState.videoTransceiver.direction = 'sendrecv';
          await callState.videoSender.replaceTrack(videoTrack);

          await renegotiateCall();
        } else {
          callState.localVideoEnabled = false;
          if (callState.localStream) {
            callState.localStream.getVideoTracks().forEach((track) => {
              track.stop();
              callState.localStream.removeTrack(track);
            });
          }
          if (callState.videoTransceiver) {
            callState.videoTransceiver.direction = 'recvonly';
          }
          if (callState.videoSender?.replaceTrack) {
            await callState.videoSender.replaceTrack(null);
          }
          syncMediaElementStream(localVideo, callState.localStream);
          await renegotiateCall();
        }

        updateCallWindow();
      } finally {
        callState.cameraBusy = false;
      }
    }

    function updateUrlForChat(userId) {
      window.history.replaceState(
        null,
        '',
        `${window.location.pathname}${buildHash('messages', userId ? { user: userId } : {})}`
      );
    }

    function getMessagePreview(message) {
      if (!message) return 'Empieza la conversacion';

      const content = String(message.content || '').trim();
      if (message.image_url && content) return `Imagen · ${content}`;
      if (message.image_url) return 'Imagen enviada';
      return content || 'Empieza la conversacion';
    }

    function buildConversationList(friendEntries, inboxEntries) {
      const inboxByUserId = new Map(
        inboxEntries.map((entry) => [Number(entry.contact_id), entry]).filter(([id]) => Number.isFinite(id))
      );

      return friendEntries
        .map((friend) => {
          const friendId = Number(friend.id);
          const inboxEntry = inboxByUserId.get(friendId) || null;
          return {
            other_user: resolveProfileData(friend),
            last_message: inboxEntry?.last_message || null,
            unread_count: Number(inboxEntry?.unread_count || 0),
          };
        })
        .sort((left, right) => {
          const leftDate = left.last_message?.created_at ? new Date(left.last_message.created_at).getTime() : 0;
          const rightDate = right.last_message?.created_at ? new Date(right.last_message.created_at).getTime() : 0;
          if (leftDate !== rightDate) return rightDate - leftDate;
          return displayName(left.other_user).localeCompare(displayName(right.other_user), 'es', { sensitivity: 'base' });
        });
    }

    function findConversationUser(userId) {
      return conversations.find((item) => Number(item.other_user?.id) === Number(userId))?.other_user || null;
    }

    function renderEmptyChatPanel(message) {
      chatPanel.innerHTML = `
        <div class="flex-1 flex items-center justify-center px-6">
          <p class="text-slate-400 text-sm text-center">${escapeHtml(message)}</p>
        </div>
      `;
    }

    function renderInbox() {
      if (!friends.length) {
        inboxList.innerHTML = '<p class="text-sm text-slate-400 p-4">Aun no tienes amigos para conversar.</p>';
        return;
      }

      if (!conversations.length) {
        inboxList.innerHTML = '<p class="text-sm text-slate-400 p-4">Aun no hay conversaciones, pero ya puedes escribir a tus amigos.</p>';
        return;
      }

      inboxList.innerHTML = conversations.map((conversation) => {
        const otherUser = conversation.other_user || {};
        const isActive = Number(otherUser.id) === Number(activeChat);
        return `
          <button type="button" class="w-full flex items-start gap-3 p-3 mx-2 my-1 ${isActive ? 'bg-slate-100 ring-1 ring-slate-200' : 'hover:bg-slate-50'} rounded-xl cursor-pointer transition-colors text-left" data-open-chat="${otherUser.id}">
            ${renderAvatar(otherUser, { sizeClass: 'w-12 h-12', textClass: 'text-white font-bold', showOnline: true })}
            <div class="flex-1 min-w-0">
              <div class="flex items-center justify-between gap-3 mb-1">
                <div class="min-w-0">
                  <h3 class="font-bold text-sm text-slate-900 truncate">${escapeHtml(displayName(otherUser))}</h3>
                  <p class="text-xs text-slate-500 truncate">${escapeHtml(careerLabel(otherUser) || otherUser.faculty || 'Amigo UPT')}</p>
                </div>
                ${conversation.unread_count > 0 ? `
                  <span class="min-w-[22px] h-6 px-2 inline-flex items-center justify-center rounded-full bg-[#1B2A6B] text-white text-[11px] font-bold">
                    ${conversation.unread_count}
                  </span>
                ` : ''}
              </div>
              <p class="text-sm text-slate-500 truncate">${escapeHtml(getMessagePreview(conversation.last_message))}</p>
            </div>
          </button>
        `;
      }).join('');
    }

    function updateMessagesMeta() {
      if (messagesSummary) {
        messagesSummary.textContent = friends.length
          ? `Tienes ${friends.length} ${friends.length === 1 ? 'amigo disponible' : 'amigos disponibles'} para chatear.`
          : 'Tus conversaciones con amigos apareceran aqui.';
      }

      if (messagesCount) {
        messagesCount.textContent = String(friends.length || 0);
        messagesCount.classList.toggle('hidden', !friends.length);
      }
    }

    function hasConversationChanged(nextMessages) {
      if (nextMessages.length !== currentMessages.length) {
        return true;
      }

      for (let index = 0; index < nextMessages.length; index += 1) {
        const current = currentMessages[index];
        const next = nextMessages[index];
        if (Number(current?.id) !== Number(next?.id)) {
          return true;
        }
        if (String(current?.content || '') !== String(next?.content || '')) {
          return true;
        }
        if (String(current?.image_url || '') !== String(next?.image_url || '')) {
          return true;
        }
        if (String(current?.created_at || '') !== String(next?.created_at || '')) {
          return true;
        }
      }

      return false;
    }

    function canAppendMessages(nextMessages) {
      if (!currentMessages.length || nextMessages.length <= currentMessages.length) {
        return false;
      }

      for (let index = 0; index < currentMessages.length; index += 1) {
        const current = currentMessages[index];
        const next = nextMessages[index];
        if (
          Number(current?.id) !== Number(next?.id)
          || String(current?.content || '') !== String(next?.content || '')
          || String(current?.image_url || '') !== String(next?.image_url || '')
          || String(current?.created_at || '') !== String(next?.created_at || '')
        ) {
          return false;
        }
      }

      return true;
    }

    function shouldAutoScroll(area) {
      if (!area) return false;
      const distanceFromBottom = area.scrollHeight - area.scrollTop - area.clientHeight;
      return distanceFromBottom <= 80;
    }

    function renderMessages(messages, options = {}) {
      const area = chatPanel.querySelector('#messages-area');
      if (!area) return;
      const preserveScroll = options.preserveScroll === true;
      const autoScroll = !preserveScroll || shouldAutoScroll(area);

      if (!messages.length) {
        area.innerHTML = '<p class="text-center text-slate-400 text-sm">Todavia no hay mensajes. Escribe el primero.</p>';
        currentMessages = [];
        return;
      }

      area.innerHTML = messages.map((message) => {
        const isMine = Number(message.sender_id) === Number(user.id);
        const hasImage = Boolean(message.image_url);
        const hasContent = Boolean(String(message.content || '').trim());
        const bubbleClass = hasImage
          ? `${isMine ? 'bg-[#1B2A6B]/6 border border-[#1B2A6B]/10' : 'bg-white border border-slate-200'} overflow-hidden`
          : `${isMine ? 'bg-[#1B2A6B] text-white' : 'bg-white text-slate-800 border border-slate-200'} px-4 py-3`;

        return `
          <div class="flex ${isMine ? 'justify-end' : 'justify-start'}">
            <div class="max-w-[78%] flex flex-col ${isMine ? 'items-end' : 'items-start'}">
              <div class="rounded-2xl ${isMine ? 'rounded-br-sm' : 'rounded-bl-sm'} shadow-sm ${bubbleClass}">
                ${hasImage ? `
                  <img src="${safeUrl(message.image_url)}" alt="Imagen enviada" class="block w-full max-w-[320px] max-h-[320px] object-cover ${hasContent ? '' : 'rounded-2xl'}"/>
                ` : ''}
                ${hasContent ? `
                  <div class="${hasImage ? 'px-4 py-3 text-sm leading-6 text-slate-800' : 'text-sm leading-6'}">
                    ${nl2br(message.content || '')}
                  </div>
                ` : ''}
              </div>
              <div class="mt-1 px-1 flex items-center gap-2">
                <span class="text-[11px] text-slate-500">${escapeHtml(formatClock(message.created_at))}</span>
                ${!isMine ? `
                  <button type="button" data-action="report-message" data-message-id="${message.id}" class="text-[11px] font-semibold text-slate-500 hover:text-slate-700 transition-colors">
                    Reportar
                  </button>
                ` : ''}
              </div>
            </div>
          </div>
        `;
      }).join('');

      currentMessages = messages;
      if (autoScroll) {
        area.scrollTop = area.scrollHeight;
      }
    }

    function renderMessageBubble(message) {
      const isMine = Number(message.sender_id) === Number(user.id);
      const hasImage = Boolean(message.image_url);
      const hasContent = Boolean(String(message.content || '').trim());
      const bubbleClass = hasImage
        ? `${isMine ? 'bg-[#1B2A6B]/6 border border-[#1B2A6B]/10' : 'bg-white border border-slate-200'} overflow-hidden`
        : `${isMine ? 'bg-[#1B2A6B] text-white' : 'bg-white text-slate-800 border border-slate-200'} px-4 py-3`;

      return `
        <div class="flex ${isMine ? 'justify-end' : 'justify-start'}">
          <div class="max-w-[78%] flex flex-col ${isMine ? 'items-end' : 'items-start'}">
            <div class="rounded-2xl ${isMine ? 'rounded-br-sm' : 'rounded-bl-sm'} shadow-sm ${bubbleClass}">
              ${hasImage ? `
                <img src="${safeUrl(message.image_url)}" alt="Imagen enviada" class="block w-full max-w-[320px] max-h-[320px] object-cover ${hasContent ? '' : 'rounded-2xl'}"/>
              ` : ''}
              ${hasContent ? `
                <div class="${hasImage ? 'px-4 py-3 text-sm leading-6 text-slate-800' : 'text-sm leading-6'}">
                  ${nl2br(message.content || '')}
                </div>
              ` : ''}
            </div>
            <div class="mt-1 px-1 flex items-center gap-2">
              <span class="text-[11px] text-slate-500">${escapeHtml(formatClock(message.created_at))}</span>
              ${!isMine ? `
                <button type="button" data-action="report-message" data-message-id="${message.id}" class="text-[11px] font-semibold text-slate-500 hover:text-slate-700 transition-colors">
                  Reportar
                </button>
              ` : ''}
            </div>
          </div>
        </div>
      `;
    }

    function appendNewMessages(messages) {
      const area = chatPanel.querySelector('#messages-area');
      if (!area || !messages.length) return;

      const fragment = document.createDocumentFragment();
      messages.forEach((message) => {
        const wrapper = document.createElement('div');
        wrapper.innerHTML = renderMessageBubble(message).trim();
        fragment.appendChild(wrapper.firstElementChild);
      });
      area.appendChild(fragment);
      currentMessages = currentMessages.concat(messages);
      area.scrollTop = area.scrollHeight;
    }

    function refreshActiveChatPresenceLabel() {
      if (!activeUser?.id) {
        return;
      }

      const liveUser = publicUsersState.map.get(Number(activeUser.id));
      if (liveUser) {
        activeUser = resolveProfileData(liveUser);
      }

      const headerPresence = chatPanel.querySelector('p.text-sm.text-slate-500.truncate');
      if (!headerPresence) {
        return;
      }

      headerPresence.textContent = `${careerLabel(activeUser) || 'Amigo UPT'} · ${presenceLabel(activeUser)}`;
    }

    function updateConversationPreview(messages) {
      if (!activeChat || !activeUser) {
        return;
      }

      const lastMessage = messages[messages.length - 1] || null;
      const activeChatId = Number(activeChat);
      const liveUser = publicUsersState.map.get(activeChatId);
      const nextUser = resolveProfileData(liveUser || activeUser);

      conversations = conversations
        .map((entry) => {
          if (Number(entry?.other_user?.id) !== activeChatId) {
            return entry;
          }

          return {
            ...entry,
            other_user: nextUser,
            last_message: lastMessage,
            unread_count: 0,
          };
        })
        .sort((left, right) => {
          const leftDate = new Date(left?.last_message?.created_at || 0).getTime();
          const rightDate = new Date(right?.last_message?.created_at || 0).getTime();
          return rightDate - leftDate;
        });

      activeUser = nextUser;
      renderInbox();
      refreshActiveChatPresenceLabel();
    }

    async function loadConversation(userId, otherUser = findConversationUser(userId)) {
      const numericUserId = Number(userId);
      if (!numericUserId) return;
      const conversationToken = ++activeConversationToken;

      const friendProfile = otherUser ? resolveProfileData(otherUser) : findConversationUser(numericUserId);
      if (!friendProfile?.id) {
        activeChat = null;
        activeUser = null;
        currentMessages = [];
        updateUrlForChat(null);
        renderInbox();
        renderEmptyChatPanel('Solo puedes enviar mensajes a tus amigos.');
        showToast('Solo puedes chatear con tus amigos', 'error');
        return;
      }

      activeChat = numericUserId;
      activeUser = friendProfile;
      currentMessages = [];
      updateUrlForChat(numericUserId);
      renderInbox();

      chatPanel.innerHTML = `
        <div class="flex items-center gap-3 p-4 bg-white border-b border-slate-200 shrink-0">
          ${renderAvatar(friendProfile, { sizeClass: 'w-12 h-12', textClass: 'text-white font-bold', showOnline: true })}
            <div class="min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <h2 class="font-bold text-slate-900 text-lg leading-tight">${escapeHtml(displayName(friendProfile))}</h2>
              ${friendProfile.faculty ? `
                <span class="text-white text-[10px] font-bold px-2 py-0.5 rounded-full" style="background:${userColor(friendProfile)}">
                  ${escapeHtml(friendProfile.faculty)}
                </span>
                ` : ''}
              </div>
            <p class="text-sm text-slate-500 truncate">${escapeHtml(`${careerLabel(friendProfile) || 'Amigo UPT'} · ${presenceLabel(friendProfile)}`)}</p>
          </div>
          <div class="flex items-center gap-2 ml-auto">
            <button id="start-audio-call-btn" type="button" class="w-11 h-11 rounded-full bg-slate-100 hover:bg-slate-200 transition-colors flex items-center justify-center text-slate-700" title="Llamada">
              <span class="material-symbols-outlined text-[22px]">call</span>
            </button>
            <button id="start-video-call-btn" type="button" class="w-11 h-11 rounded-full bg-slate-100 hover:bg-slate-200 transition-colors flex items-center justify-center text-slate-700" title="Videollamada">
              <span class="material-symbols-outlined text-[22px]">videocam</span>
            </button>
          </div>
        </div>
        <div class="flex-1 overflow-y-auto p-4 md:p-5 flex flex-col gap-3 custom-scrollbar" id="messages-area">
          <p class="text-center text-slate-400 text-sm">Cargando mensajes...</p>
        </div>
        <div class="p-4 bg-white border-t border-slate-200 shrink-0">
          <div class="flex items-end gap-3">
            <textarea id="msg-input" class="flex-1 bg-slate-100 border border-slate-200 rounded-[1.4rem] px-4 py-3 text-sm focus:ring-1 focus:ring-[#1B2A6B] outline-none resize-none min-h-[50px] max-h-36" placeholder="Escribe un mensaje para ${escapeHtml(displayName(friendProfile))}..." rows="1"></textarea>
            <button id="send-msg-btn" type="button" class="w-11 h-11 rounded-full bg-[#D4A017] flex items-center justify-center text-white hover:bg-[#b88a14] transition-colors shrink-0 shadow-sm">
              <span class="material-symbols-outlined text-[20px] ml-0.5">send</span>
            </button>
          </div>
        </div>
      `;

      const area = chatPanel.querySelector('#messages-area');
      const input = chatPanel.querySelector('#msg-input');
      const sendButton = chatPanel.querySelector('#send-msg-btn');
      const startAudioCallButton = chatPanel.querySelector('#start-audio-call-btn');
      const startVideoCallButton = chatPanel.querySelector('#start-video-call-btn');

      async function sendMessage() {
        const content = input.value.trim();
        if (!activeChat || !content) return;

        sendButton.disabled = true;

        const result = await ChatAPI.sendMessage({
          receiverId: activeChat,
          content,
        });

        sendButton.disabled = false;

        if (!result?.ok) {
          showToast(result?.data?.error || 'Error al enviar el mensaje', 'error');
          return;
        }

        input.value = '';
        await Promise.all([
          loadConversation(activeChat, friendProfile),
          loadInbox(false),
        ]);
        startChatPolling();
      }
      sendButton.addEventListener('click', sendMessage);
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          sendMessage();
        }
      });
      input.addEventListener('input', () => {
        input.style.height = 'auto';
        input.style.height = `${Math.min(input.scrollHeight, 144)}px`;
      });
      area.addEventListener('click', async (event) => {
        const button = event.target.closest('[data-action="report-message"]');
        if (!button) return;
        await reportContent('mensaje', Number(button.dataset.messageId));
      });
      startAudioCallButton?.addEventListener('click', async () => {
        if (window.__uptCallManager?.startOutgoingCall) {
          await window.__uptCallManager.startOutgoingCall(friendProfile, 'audio');
          return;
        }
        await openOutgoingCall('audio');
      });
      startVideoCallButton?.addEventListener('click', async () => {
        if (window.__uptCallManager?.startOutgoingCall) {
          await window.__uptCallManager.startOutgoingCall(friendProfile, 'video');
          return;
        }
        await openOutgoingCall('video');
      });

      const result = await ChatAPI.getConversation(numericUserId);
      if (conversationToken !== activeConversationToken) {
        return;
      }
      if (!result?.ok) {
        if (result?.status === 403) {
          activeChat = null;
          activeUser = null;
          currentMessages = [];
          updateUrlForChat(null);
          renderInbox();
          renderEmptyChatPanel('Solo puedes enviar mensajes a tus amigos.');
        } else {
          area.innerHTML = '<p class="text-center text-slate-400 text-sm">No se pudo cargar la conversacion.</p>';
        }
        return;
      }

      renderMessages(getList(result), { preserveScroll: false });
      startChatPolling();
    }

    async function openChatByUserId(userId) {
      const numericUserId = Number(userId);
      if (!numericUserId) return;

      const otherUser = findConversationUser(numericUserId);
      if (!otherUser) {
        showToast('Solo puedes chatear con tus amigos', 'error');
        activeChat = null;
        activeUser = null;
        currentMessages = [];
        stopChatPolling();
        updateUrlForChat(null);
        renderInbox();
        renderEmptyChatPanel('Solo puedes enviar mensajes a tus amigos.');
        return;
      }

      await loadConversation(numericUserId, otherUser);
    }

    async function refreshActiveConversation() {
      if (!activeChat || !activeUser) {
        return;
      }

      const area = chatPanel.querySelector('#messages-area');
      if (!area) {
        return;
      }

      const result = await ChatAPI.getConversation(activeChat);
      if (!result?.ok) {
        if (result?.status === 403) {
          activeChat = null;
          activeUser = null;
          currentMessages = [];
          updateUrlForChat(null);
          renderInbox();
          renderEmptyChatPanel('Solo puedes enviar mensajes a tus amigos.');
        }
        return;
      }

      const nextMessages = getList(result);
      if (hasConversationChanged(nextMessages)) {
        if (canAppendMessages(nextMessages)) {
          appendNewMessages(nextMessages.slice(currentMessages.length));
        } else {
          renderMessages(nextMessages, { preserveScroll: true });
        }
        updateConversationPreview(nextMessages);
      }
    }

    function stopChatPolling() {
      if (chatPollTimer) {
        window.clearInterval(chatPollTimer);
        chatPollTimer = null;
      }
      chatPollInFlight = false;
    }

    function startChatPolling() {
      stopChatPolling();
      chatPollTimer = window.setInterval(async () => {
        if (chatPollInFlight || !activeChat || !activeUser) {
          return;
        }

        if (document.hidden) {
          return;
        }

        chatPollInFlight = true;
        try {
          await refreshActiveConversation();
        } finally {
          chatPollInFlight = false;
        }
      }, CHAT_POLL_INTERVAL_MS);
    }

    async function loadInbox(shouldRestoreActiveChat = true) {
      await ensurePublicUsersLoaded();

      const [friendsResult, inboxResult] = await Promise.all([
        SocialAPI.getFriends(),
        ChatAPI.getInbox(),
      ]);

      if (!friendsResult?.ok) {
        inboxList.innerHTML = '<p class="text-sm text-slate-400 p-4">No se pudieron cargar tus amigos.</p>';
        renderEmptyChatPanel('No se pudo cargar la bandeja de mensajes.');
        return;
      }

      const friendEntries = normalizeFriendEntries(getList(friendsResult))
        .filter((entry) => Number(entry.id) !== Number(user.id));

      friends = friendEntries;
      conversations = buildConversationList(friendEntries, getList(inboxResult));
      updateMessagesMeta();
      renderInbox();

      if (!friends.length) {
        activeChat = null;
        activeUser = null;
        currentMessages = [];
        stopChatPolling();
        updateUrlForChat(null);
        renderEmptyChatPanel('Aun no tienes amigos aceptados para conversar.');
        return;
      }

      if (!shouldRestoreActiveChat) {
        return;
      }

      if (activeChat) {
        const selectedFriend = findConversationUser(activeChat);
        if (selectedFriend) {
          await loadConversation(activeChat, selectedFriend);
          startChatPolling();
          return;
        }

        activeChat = null;
        activeUser = null;
        currentMessages = [];
        stopChatPolling();
        updateUrlForChat(null);
        showToast('Ese chat solo esta disponible para amigos aceptados', 'error');
      }

      stopChatPolling();
      renderEmptyChatPanel('Selecciona un amigo para empezar a conversar.');
    }

      async function handleFriendshipChanged() {
        await loadInbox(Boolean(activeChat || activeUser));
      }

      async function handleBlocksChanged() {
        await loadInbox(Boolean(activeChat || activeUser));
      }

    async function handlePresenceUpdated() {
      renderInbox();
      refreshActiveChatPresenceLabel();
    }

    function handleMessagesVisibilityChange() {
      if (document.hidden) {
        return;
      }

      if (!activeChat || !activeUser || chatPollInFlight) {
        return;
      }

      chatPollInFlight = true;
      refreshActiveConversation().finally(() => {
        chatPollInFlight = false;
      });
    }

    function handleCallPageLeave() {
      endCallOnPageLeave();
    }

    function detachCallRouteLifecycle() {
      window.removeEventListener('hashchange', handleCallRouteChange);
      window.removeEventListener('pagehide', handleCallPageLeave);
      window.removeEventListener('beforeunload', handleCallPageLeave);
    }

    inboxList.addEventListener('click', (event) => {
      const button = event.target.closest('[data-open-chat]');
      if (!button) return;
      openChatByUserId(button.dataset.openChat);
    });

    const ownsCallLifecycle = callManagerOnly || !hasForeignCallManager();
    if (ownsCallLifecycle) {
      window.__uptCallManager = {
        id: callRuntimeId,
        isActive: () => Boolean(callState.session),
        startOutgoingCall: (targetUser, mode) => startOutgoingCallForUser(targetUser, mode),
        consumeIncomingCall: (incoming) => presentIncomingCall(incoming),
        pollPendingCallsOnce: () => pollPendingCallsOnce(),
      };
    }
    window.addEventListener('friendship:changed', handleFriendshipChanged);
    window.addEventListener('blocks:changed', handleBlocksChanged);
    window.addEventListener('presence:updated', handlePresenceUpdated);
    document.addEventListener('visibilitychange', handleMessagesVisibilityChange);
    if (ownsCallLifecycle) {
      window.addEventListener('hashchange', handleCallRouteChange);
      window.addEventListener('pagehide', handleCallPageLeave);
      window.addEventListener('beforeunload', handleCallPageLeave);
      ensureCallWindow();
      startIncomingCallPolling();
    }
    loadInbox(Boolean(activeChat));

    return () => {
      stopChatPolling();
      if (!callState.session) {
        stopCallTimers();
        cleanupPeerConnection();
      }
      window.removeEventListener('friendship:changed', handleFriendshipChanged);
      window.removeEventListener('blocks:changed', handleBlocksChanged);
      window.removeEventListener('presence:updated', handlePresenceUpdated);
      document.removeEventListener('visibilitychange', handleMessagesVisibilityChange);
      if (ownsCallLifecycle && !callState.session) {
        detachCallRouteLifecycle();
      }
    };
  }

  const views = {
    feed: {
      title: 'Feed',
      activeNav: 'feed',
      render() {
        return `
          <div class="grid grid-cols-1 md:grid-cols-9 gap-6">
            <main class="md:col-span-6 flex flex-col gap-6 min-w-0">
              <div class="feed-composer-card bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
                <div class="feed-composer-header">
                  <div class="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0 bg-cover bg-center" id="composer-avatar" style="background:#1B2A6B">U</div>
                  <div class="feed-composer-input-wrap">
                    <textarea id="post-content" class="feed-composer-input" placeholder="¿Que esta pasando?" rows="2"></textarea>
                    <div id="img-preview-wrap" class="feed-composer-preview">
                      <img id="img-preview" alt="Vista previa"/>
                      <button id="clear-image-btn" type="button" title="Quitar imagen">x</button>
                    </div>
                  </div>
                </div>
                <input type="file" id="file-input" accept="image/*" class="hidden"/>
                <div class="feed-composer-footer">
                  <div class="feed-composer-tools">
                    <button id="pick-image-btn" type="button" class="feed-composer-tool">
                      <span class="material-symbols-outlined text-[19px]">image</span>
                    </button>
                    <button id="open-live-modal-btn" type="button" class="feed-composer-tool" title="Iniciar directo">
                      <span class="material-symbols-outlined text-[19px]">broadcast_on_personal</span>
                    </button>
                    <div class="relative feed-composer-emoji-anchor">
                      <button id="toggle-emoji-btn" type="button" class="feed-composer-tool">
                        <span class="material-symbols-outlined text-[19px]">mood</span>
                      </button>
                      <div id="emoji-picker">
                        <div class="emoji-cats" id="emoji-cats"></div>
                        <div class="emoji-grid" id="emoji-grid"></div>
                      </div>
                    </div>
                  </div>
                  <div class="feed-composer-actions">
                    <div class="feed-composer-visibility">
                      <span class="material-symbols-outlined feed-composer-visibility-icon">groups</span>
                      <span class="feed-composer-visibility-copy">
                        <span class="feed-composer-visibility-label">Visible para</span>
                        <input id="post-visibility" type="hidden" value="all"/>
                        <button id="post-visibility-trigger" type="button" class="feed-composer-select" aria-haspopup="listbox" aria-expanded="false">
                          <span id="post-visibility-text">Toda la comunidad UPT</span>
                        </button>
                        <div id="post-visibility-menu" class="feed-composer-select-menu hidden" role="listbox" aria-label="Opciones de visibilidad">
                          <button type="button" class="feed-composer-select-option is-active" data-visibility-option="all">
                            <span class="material-symbols-outlined text-[16px]">public</span>
                            <span class="feed-composer-select-option-copy">
                              <span class="feed-composer-select-option-title">Toda la comunidad UPT</span>
                              <span class="feed-composer-select-option-desc">Visible para todos en la red.</span>
                            </span>
                          </button>
                          <button type="button" class="feed-composer-select-option" data-visibility-option="friends">
                            <span class="material-symbols-outlined text-[16px]">group</span>
                            <span class="feed-composer-select-option-copy">
                              <span class="feed-composer-select-option-title">Solo amigos</span>
                              <span class="feed-composer-select-option-desc">Solo tus amistades podran verla.</span>
                            </span>
                          </button>
                          <button type="button" class="feed-composer-select-option" data-visibility-option="faculty">
                            <span class="material-symbols-outlined text-[16px]">school</span>
                            <span class="feed-composer-select-option-copy">
                              <span class="feed-composer-select-option-title">Solo mi facultad</span>
                              <span class="feed-composer-select-option-desc">Visible para usuarios de tu facultad.</span>
                            </span>
                          </button>
                        </div>
                      </span>
                    </div>
                    <button id="btn-publish" type="button" class="feed-composer-submit bg-[#E5D59A] text-[#5A4A1A] px-6 py-1.5 rounded-full text-sm font-bold hover:bg-[#d8c686] transition-colors">Publicar</button>
                  </div>
                </div>
              </div>
              <div id="feed-posts" class="flex flex-col gap-6">
                <p class="text-center text-slate-500 py-8">Cargando publicaciones...</p>
              </div>
            </main>
            <aside class="md:col-span-3 hidden md:flex flex-col gap-6">
              <div class="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
                <h3 class="font-bold text-sm text-slate-900 mb-4">Companeros en linea</h3>
                <div id="online-friends" class="flex flex-col gap-4">
                  <p class="text-sm text-slate-400">Cargando...</p>
                </div>
              </div>
            </aside>
          </div>
          <div id="delete-modal" class="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 hidden">
            <div class="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 mx-4">
              <h3 class="text-xl font-bold text-slate-900 mb-2">Eliminar publicacion</h3>
              <p class="text-slate-600 text-sm mb-6">Esta accion no se puede deshacer.</p>
              <div class="flex justify-end gap-3">
                <button id="cancel-delete-btn" type="button" class="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">Cancelar</button>
                <button id="confirm-delete-btn" type="button" class="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors shadow-sm">Eliminar</button>
              </div>
            </div>
          </div>
          <div id="comment-modal" class="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-50 hidden px-3 py-4">
            <div class="post-comments-modal bg-white rounded-[28px] shadow-xl w-full overflow-hidden flex flex-col">
              <div class="post-comments-topbar">
                <h3 class="post-comments-topbar-title">Publicacion</h3>
                <button id="close-comment-top-btn" type="button" class="post-comments-topbar-close" aria-label="Cerrar modal de comentarios">
                  <span class="material-symbols-outlined text-[20px]">close</span>
                </button>
              </div>
              <div class="post-comments-body">
                <div class="post-comments-scroll custom-scrollbar">
                  <div id="comment-post-preview" class="post-comments-preview"></div>
                  <div class="post-comments-side">
                    <div class="post-comments-section-head">
                      <span class="post-comments-section-title">Comentarios</span>
                      <select id="comment-sort" class="post-comments-sort">
                        <option value="newest">Mas recientes</option>
                        <option value="oldest">Mas antiguos</option>
                      </select>
                    </div>
                    <div id="comment-list" class="post-comments-list">
                      <p class="text-sm text-slate-400 text-center">Selecciona una publicacion para ver sus comentarios.</p>
                    </div>
                  </div>
                </div>
                <div class="post-comments-compose">
                  <div class="post-comments-compose-row">
                    <textarea id="comment-input" class="post-comments-compose-input" rows="1" placeholder="Escribe un comentario..."></textarea>
                    <button id="confirm-comment-btn" type="button" class="post-comments-compose-send" aria-label="Enviar comentario">
                      <span class="material-symbols-outlined text-[18px]">send</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div id="livestream-modal" class="fixed inset-0 bg-slate-950/70 hidden items-center justify-center z-50 px-4 py-6">
            <div class="w-full max-w-2xl bg-[#0f172a] text-white rounded-[32px] border border-white/10 shadow-2xl overflow-hidden">
              <div class="px-6 py-5 border-b border-white/10 flex items-center justify-between gap-3">
                <div>
                  <h3 class="text-xl font-black">Iniciar directo</h3>
                  <p class="text-sm text-white/65 mt-1">Crearas una publicacion en vivo con comentarios y reacciones en tiempo real.</p>
                </div>
                <button id="close-live-modal-btn" type="button" class="w-10 h-10 rounded-full bg-white/8 hover:bg-white/14 flex items-center justify-center">
                  <span class="material-symbols-outlined">close</span>
                </button>
              </div>
              <div class="p-6 space-y-5">
                <label class="block">
                  <span class="text-xs uppercase tracking-[0.2em] text-white/55 font-bold">Titulo</span>
                  <input id="live-title-input" type="text" maxlength="180" class="mt-2 w-full rounded-2xl bg-slate-950/70 border border-white/10 px-4 py-3 text-sm text-white caret-[#ff0b53] outline-none focus:border-[#ff0b53] placeholder:text-white/35" style="-webkit-text-fill-color:#fff;" placeholder="Ponle un titulo a tu directo"/>
                </label>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div class="rounded-3xl border border-white/10 bg-white/5 p-4">
                    <p class="text-xs uppercase tracking-[0.2em] text-white/55 font-bold">Fuente</p>
                    <div class="mt-3 grid gap-2" id="live-source-options">
                      <label class="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                        <input type="radio" name="live-source" value="camera" checked/>
                        <span class="text-sm font-semibold">Camara + microfono</span>
                      </label>
                      <label class="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3" id="live-screen-option">
                        <input type="radio" name="live-source" value="screen"/>
                        <span class="text-sm font-semibold">Compartir pantalla + audio del sistema/microfono</span>
                      </label>
                    </div>
                  </div>
                  <div class="rounded-3xl border border-white/10 bg-white/5 p-4">
                    <p class="text-xs uppercase tracking-[0.2em] text-white/55 font-bold">Visibilidad</p>
                    <div class="mt-3 grid gap-2">
                      <label class="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                        <input type="radio" name="live-visibility" value="all" checked/>
                        <span class="text-sm font-semibold">Toda la comunidad UPT</span>
                      </label>
                      <label class="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                        <input type="radio" name="live-visibility" value="friends"/>
                        <span class="text-sm font-semibold">Solo amigos</span>
                      </label>
                      <label class="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                        <input type="radio" name="live-visibility" value="faculty"/>
                        <span class="text-sm font-semibold">Solo mi facultad</span>
                      </label>
                    </div>
                  </div>
                </div>
              </div>
              <div class="px-6 py-5 border-t border-white/10 flex items-center justify-end gap-3">
                <button id="cancel-live-modal-btn" type="button" class="px-5 py-3 rounded-full bg-white/10 hover:bg-white/14 text-sm font-semibold">Cancelar</button>
                <button id="confirm-live-create-btn" type="button" class="px-5 py-3 rounded-full bg-[#ff0b53] hover:bg-[#e00549] text-sm font-black tracking-[0.12em]">EMPEZAR</button>
              </div>
            </div>
          </div>
        `;
      },
      mount({ container, user, router }) {
        let selectedImageFile = null;
        let pendingDeleteId = null;
        let pendingCommentId = null;
        let currentCommentSort = 'newest';
        let feedPosts = [];
        let currentCategory = '😀';

        const composerAvatar = container.querySelector('#composer-avatar');
        const postsContainer = container.querySelector('#feed-posts');
        const onlineFriends = container.querySelector('#online-friends');
        const fileInput = container.querySelector('#file-input');
        const previewWrap = container.querySelector('#img-preview-wrap');
        const previewImage = container.querySelector('#img-preview');
        const postContent = container.querySelector('#post-content');
        const postVisibility = container.querySelector('#post-visibility');
        const postVisibilityTrigger = container.querySelector('#post-visibility-trigger');
        const postVisibilityText = container.querySelector('#post-visibility-text');
        const postVisibilityMenu = container.querySelector('#post-visibility-menu');
        const emojiPicker = container.querySelector('#emoji-picker');
        const emojiCats = container.querySelector('#emoji-cats');
        const emojiGrid = container.querySelector('#emoji-grid');
        const deleteModal = container.querySelector('#delete-modal');
        const commentModal = container.querySelector('#comment-modal');
        const livestreamModal = container.querySelector('#livestream-modal');
        const commentPostPreview = container.querySelector('#comment-post-preview');
        const commentList = container.querySelector('#comment-list');
        const commentSort = container.querySelector('#comment-sort');
        const commentInput = container.querySelector('#comment-input');
        const publishButton = container.querySelector('#btn-publish');
        const openLiveModalButton = container.querySelector('#open-live-modal-btn');
        const liveTitleInput = container.querySelector('#live-title-input');

        const confirmLiveCreateButton = container.querySelector('#confirm-live-create-btn');
        const liveScreenOption = container.querySelector('#live-screen-option');
        const visibilityLabels = {
          all: 'Toda la comunidad UPT',
          friends: 'Solo amigos',
          faculty: 'Solo mi facultad',
        };

        setAvatarElement(composerAvatar, user);

        function renderEmojiPicker() {
          emojiCats.innerHTML = Object.keys(EMOJI_DATA).map((category) => `
            <button type="button" class="${category === currentCategory ? 'active' : ''}" data-emoji-category="${category}">${category}</button>
          `).join('');

          emojiGrid.innerHTML = EMOJI_DATA[currentCategory].map((emoji) => `
            <button type="button" data-emoji-value="${emoji}">${emoji}</button>
          `).join('');
        }

        function clearImage() {
          selectedImageFile = null;
          fileInput.value = '';
          previewWrap.style.display = 'none';
          previewImage.src = '';
        }

        function setPostVisibility(value = 'all') {
          if (postVisibility) postVisibility.value = value;
          if (postVisibilityText) postVisibilityText.textContent = visibilityLabels[value] || visibilityLabels.all;
          if (postVisibilityMenu) {
            postVisibilityMenu.querySelectorAll('[data-visibility-option]').forEach((option) => {
              option.classList.toggle('is-active', option.dataset.visibilityOption === value);
            });
          }
        }

        function closeVisibilityMenu() {
          if (!postVisibilityMenu || !postVisibilityTrigger) return;
          postVisibilityMenu.classList.add('hidden');
          postVisibilityTrigger.setAttribute('aria-expanded', 'false');
        }

        function toggleVisibilityMenu() {
          if (!postVisibilityMenu || !postVisibilityTrigger) return;
          const willOpen = postVisibilityMenu.classList.contains('hidden');
          postVisibilityMenu.classList.toggle('hidden', !willOpen);
          postVisibilityTrigger.setAttribute('aria-expanded', String(willOpen));
        }

        function findFeedPost(postId) {
          return feedPosts.find((post) => Number(post.id) === Number(postId)) || null;
        }

        function renderCommentModalPost(postId = pendingCommentId) {
          commentPostPreview.innerHTML = renderPostModalPreview(findFeedPost(postId), user.id);
        }

        function openCommentModal(postId) {
          pendingCommentId = Number(postId);
          commentInput.value = '';
          commentInput.style.height = '';
          commentSort.value = currentCommentSort;
          commentModal.classList.remove('hidden');
          commentModal.classList.add('flex');
          renderCommentModalPost(pendingCommentId);
          loadComments(pendingCommentId, currentCommentSort);
          setTimeout(() => commentInput.focus(), 60);
        }

        function closeCommentModal() {
          pendingCommentId = null;
          commentPostPreview.innerHTML = '';
          commentList.innerHTML = '<p class="text-sm text-slate-400 text-center">Selecciona una publicacion para ver sus comentarios.</p>';
          commentModal.classList.add('hidden');
          commentModal.classList.remove('flex');
        }

        function openDeleteModal(postId) {
          pendingDeleteId = postId;
          deleteModal.classList.remove('hidden');
        }

        function closeDeleteModal() {
          pendingDeleteId = null;
          deleteModal.classList.add('hidden');
        }

        function openLivestreamModal() {
          livestreamModal.classList.remove('hidden');
          livestreamModal.classList.add('flex');
          liveTitleInput.value = '';

          if (!isDesktopClient() && liveScreenOption) {
            liveScreenOption.classList.add('hidden');
            const cameraOption = livestreamModal.querySelector('input[name="live-source"][value="camera"]');
            if (cameraOption) cameraOption.checked = true;
          } else if (liveScreenOption) {
            liveScreenOption.classList.remove('hidden');
          }
        }

        function closeLivestreamModal() {
          livestreamModal.classList.add('hidden');
          livestreamModal.classList.remove('flex');
        }

        async function loadComments(postId = pendingCommentId, sort = currentCommentSort) {
          if (!postId) return;

          currentCommentSort = sort;
          commentSort.value = sort;
          commentList.innerHTML = '<p class="text-sm text-slate-400 text-center">Cargando comentarios...</p>';

          await ensurePublicUsersLoaded();
          const result = await PostsAPI.getComments(postId, sort);
          const comments = getList(result);

          if (!result?.ok) {
            commentList.innerHTML = '<p class="text-sm text-slate-400 text-center">No se pudieron cargar los comentarios.</p>';
            return;
          }

          if (!comments.length) {
            commentList.innerHTML = '<p class="text-sm text-slate-400 text-center">Todavia no hay comentarios en esta publicacion.</p>';
            return;
          }

          commentList.innerHTML = comments.map((comment) => renderCommentCard(comment)).join('');
        }

        async function loadFeed() {
          await ensurePublicUsersLoaded();
          const result = await PostsAPI.getFeed();
          const posts = getList(result);

          if (!result?.ok) {
            postsContainer.innerHTML = '<p class="text-center text-slate-400 py-8">No se pudo cargar el feed.</p>';
            return;
          }

          feedPosts = posts;
          if (!posts.length) {
            postsContainer.innerHTML = '<p class="text-center text-slate-400 py-8">No hay publicaciones todavia. Se el primero.</p>';
            return;
          }

          postsContainer.innerHTML = posts.map((post) => renderPostCard(post, user.id)).join('');
          if (pendingCommentId) {
            renderCommentModalPost(pendingCommentId);
          }
        }

        async function loadFriends() {
          await ensurePublicUsersLoaded();
          const result = await SocialAPI.getFriends();
          const friends = normalizeFriendEntries(getList(result));
          const activeFriends = friends
            .filter((friend) => isUserOnline(friend))
            .sort((left, right) => {
              const leftSeen = left?.last_seen_at ? new Date(left.last_seen_at).getTime() : 0;
              const rightSeen = right?.last_seen_at ? new Date(right.last_seen_at).getTime() : 0;
              return rightSeen - leftSeen;
            });

          if (!friends.length) {
            onlineFriends.innerHTML = '<p class="text-sm text-slate-400">Sin companeros aun</p>';
            return;
          }

          if (!activeFriends.length) {
            onlineFriends.innerHTML = '<p class="text-sm text-slate-400">No hay companeros activos ahora</p>';
            return;
          }

          onlineFriends.innerHTML = activeFriends.slice(0, 5).map((friend) => `
            <button type="button" class="flex items-center gap-3 text-left" data-open-profile="${friend.id}">
              ${renderAvatar(friend, { sizeClass: 'w-10 h-10', textClass: 'text-white font-bold', showOnline: true })}
              <div>
                <p class="text-sm font-bold text-slate-900 leading-tight">${escapeHtml(displayName(friend))}</p>
                <p class="text-xs text-slate-500">${escapeHtml(presenceLabel(friend))}</p>
              </div>
              <span class="text-white text-[10px] font-bold px-2 py-0.5 rounded-full ml-auto" style="background:${userColor(friend)}">${escapeHtml(friend.faculty || 'UPT')}</span>
            </button>
          `).join('');
        }

        async function publishPost() {
          const content = postContent.value.trim();
          const visibility = postVisibility?.value || 'all';
          if (!content && !selectedImageFile) {
            showToast('Escribe algo o adjunta una imagen', 'error');
            return;
          }

          publishButton.disabled = true;
          publishButton.textContent = 'Publicando...';

          const result = await PostsAPI.createPost({ content, imageFile: selectedImageFile, visibility });

          publishButton.disabled = false;
          publishButton.textContent = 'Publicar';

          if (result?.ok) {
            postContent.value = '';
            setPostVisibility('all');
            clearImage();
            showToast('Publicacion creada', 'success');
            loadFeed();
            return;
          }

          showToast(result?.data?.error || 'Error al publicar', 'error');
        }

        async function createLivestream() {
          const liveTitle = liveTitleInput.value.trim();

          const visibility = livestreamModal.querySelector('input[name="live-visibility"]:checked')?.value || 'all';
          const liveSource = livestreamModal.querySelector('input[name="live-source"]:checked')?.value || 'camera';

          if (!liveTitle) {
            showToast('Ponle un titulo al directo', 'error');
            return;
          }

          confirmLiveCreateButton.disabled = true;
          confirmLiveCreateButton.textContent = 'PREPARANDO...';

          // If screen source, request screen selection BEFORE creating the livestream
          let preCapturedStream = null;
          if (liveSource === 'screen' && isDesktopClient()) {
            try {
              preCapturedStream = await navigator.mediaDevices.getDisplayMedia({
                video: true,
                audio: true,
              });
            } catch (err) {
              // User cancelled the screen picker
              confirmLiveCreateButton.disabled = false;
              confirmLiveCreateButton.textContent = 'EMPEZAR';
              showToast('No se selecciono ninguna pantalla para compartir', 'error');
              return;
            }
          }

          confirmLiveCreateButton.textContent = 'CREANDO...';

          const streamKey = buildLivestreamStreamKey(user.id);
          const playbackUrl = buildLivestreamHlsUrl(streamKey);

          const result = await PostsAPI.createLivestream({
            liveTitle,

            visibility,
            liveSource,
            streamKey,
            playbackUrl,
          });

          confirmLiveCreateButton.disabled = false;
          confirmLiveCreateButton.textContent = 'EMPEZAR';

          if (!result?.ok) {
            // Release pre-captured stream if creation failed
            if (preCapturedStream) {
              preCapturedStream.getTracks().forEach(t => t.stop());
            }
            showToast(result?.data?.error || 'No se pudo crear el directo', 'error');
            return;
          }

          // Store pre-captured stream for the live page to use
          if (preCapturedStream) {
            window.__uptLivePreCapturedStream = preCapturedStream;
          }

          postContent.value = '';
          closeLivestreamModal();
          showToast('Directo creado', 'success');
          router.navigate('live', { id: result.data.id, host: '1' });
        }

        async function confirmComment() {
          const content = commentInput.value.trim();
          if (!pendingCommentId || !content) return;

          const result = await PostsAPI.addComment(pendingCommentId, content);
          if (result?.ok) {
            showToast('Comentario anadido', 'success');
            commentInput.value = '';
            await loadFeed();
            await loadComments(pendingCommentId, currentCommentSort);
            return;
          }

          showToast(result?.data?.error || 'Error al comentar', 'error');
        }

        async function confirmDelete() {
          if (!pendingDeleteId) return;
          const result = await PostsAPI.deletePost(pendingDeleteId);
          if (result?.ok) {
            showToast('Publicacion eliminada', 'success');
            closeDeleteModal();
            loadFeed();
            return;
          }
          showToast(result?.data?.error || 'Error al eliminar', 'error');
        }

        function insertEmoji(emoji) {
          const start = postContent.selectionStart;
          const end = postContent.selectionEnd;
          postContent.value = `${postContent.value.slice(0, start)}${emoji}${postContent.value.slice(end)}`;
          postContent.selectionStart = postContent.selectionEnd = start + emoji.length;
          postContent.focus();
        }

        const onDocumentClick = (event) => {
          const insidePicker = event.target.closest('#emoji-picker');
          const insideToggle = event.target.closest('#toggle-emoji-btn');
          if (!insidePicker && !insideToggle) {
            emojiPicker.classList.remove('open');
          }

          const insideVisibility = event.target.closest('#post-visibility-trigger, #post-visibility-menu');
          if (!insideVisibility) {
            closeVisibilityMenu();
          }
        };

        container.querySelector('#pick-image-btn').addEventListener('click', () => fileInput.click());
        container.querySelector('#clear-image-btn').addEventListener('click', clearImage);
        container.querySelector('#toggle-emoji-btn').addEventListener('click', () => {
          emojiPicker.classList.toggle('open');
          if (emojiPicker.classList.contains('open')) renderEmojiPicker();
        });
        postVisibilityTrigger?.addEventListener('click', toggleVisibilityMenu);
        container.querySelector('#cancel-delete-btn').addEventListener('click', closeDeleteModal);
        container.querySelector('#confirm-delete-btn').addEventListener('click', confirmDelete);
        container.querySelector('#close-comment-top-btn').addEventListener('click', closeCommentModal);
        container.querySelector('#confirm-comment-btn').addEventListener('click', confirmComment);
        openLiveModalButton?.addEventListener('click', openLivestreamModal);
        container.querySelector('#close-live-modal-btn')?.addEventListener('click', closeLivestreamModal);
        container.querySelector('#cancel-live-modal-btn')?.addEventListener('click', closeLivestreamModal);
        confirmLiveCreateButton?.addEventListener('click', createLivestream);
        commentSort.addEventListener('change', () => {
          if (!pendingCommentId) return;
          loadComments(pendingCommentId, commentSort.value);
        });
        publishButton.addEventListener('click', publishPost);

        fileInput.addEventListener('change', (event) => {
          const [file] = event.target.files || [];
          if (!file) return;
          selectedImageFile = file;
          const reader = new FileReader();
          reader.onload = (loadEvent) => {
            previewImage.src = loadEvent.target.result;
            previewWrap.style.display = 'block';
          };
          reader.readAsDataURL(file);
        });

        emojiCats.addEventListener('click', (event) => {
          const button = event.target.closest('[data-emoji-category]');
          if (!button) return;
          currentCategory = button.dataset.emojiCategory;
          renderEmojiPicker();
        });

        emojiGrid.addEventListener('click', (event) => {
          const button = event.target.closest('[data-emoji-value]');
          if (!button) return;
          insertEmoji(button.dataset.emojiValue);
        });

        postVisibilityMenu?.addEventListener('click', (event) => {
          const option = event.target.closest('[data-visibility-option]');
          if (!option) return;
          setPostVisibility(option.dataset.visibilityOption);
          closeVisibilityMenu();
        });

        commentInput.addEventListener('keydown', async (event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            await confirmComment();
          }
        });
        commentInput.addEventListener('input', () => {
          commentInput.style.height = 'auto';
          commentInput.style.height = `${Math.min(commentInput.scrollHeight, 96)}px`;
        });

        postsContainer.addEventListener('click', async (event) => {
          const actionTarget = event.target.closest('[data-action]');
          if (actionTarget) {
            const postId = Number(actionTarget.dataset.postId);
            if (actionTarget.dataset.action === 'open-profile') {
              router.navigate('profile', { id: actionTarget.dataset.userId });
              return;
            }
            if (actionTarget.dataset.action === 'react-post') {
              await PostsAPI.reactPost(postId, actionTarget.dataset.reaction);
              loadFeed();
              return;
            }
            if (actionTarget.dataset.action === 'comment-post') {
              openCommentModal(postId);
              return;
            }
            if (actionTarget.dataset.action === 'open-livestream') {
              router.navigate('live', { id: actionTarget.dataset.liveId });
              return;
            }
            if (actionTarget.dataset.action === 'report-post') {
              await reportContent('publicacion', postId);
              return;
            }
            if (actionTarget.dataset.action === 'delete-post') {
              openDeleteModal(postId);
            }
            return;
          }

          const postCard = event.target.closest('[data-post-card]');
          if (postCard) {
            openCommentModal(postCard.dataset.postId);
          }
        });

        commentList.addEventListener('click', async (event) => {
          const button = event.target.closest('[data-action]');
          if (!button || !pendingCommentId) return;

          if (button.dataset.action === 'react-comment') {
            const result = await PostsAPI.reactComment(button.dataset.commentId, button.dataset.reaction);
            if (result?.ok) {
              await loadComments(pendingCommentId, currentCommentSort);
              return;
            }

            showToast(result?.data?.error || 'No se pudo reaccionar al comentario', 'error');
            return;
          }

          if (button.dataset.action === 'report-comment') {
            await reportContent('comentario', Number(button.dataset.commentId));
          }
        });

        commentPostPreview.addEventListener('click', (event) => {
          const actionTarget = event.target.closest('[data-action="open-profile"]');
          if (!actionTarget) return;
          router.navigate('profile', { id: actionTarget.dataset.userId });
        });

        onlineFriends.addEventListener('click', (event) => {
          const button = event.target.closest('[data-open-profile]');
          if (!button) return;
          router.navigate('profile', { id: button.dataset.openProfile });
        });

        deleteModal.addEventListener('click', (event) => {
          if (event.target === deleteModal) closeDeleteModal();
        });

        commentModal.addEventListener('click', (event) => {
          if (event.target === commentModal) closeCommentModal();
        });

        setPostVisibility(postVisibility?.value || 'all');
        document.addEventListener('click', onDocumentClick);
          async function handleBlocksChanged() {
            await Promise.all([
              loadFeed(),
              loadFriends(),
            ]);
          }

          window.addEventListener('presence:updated', loadFriends);
          window.addEventListener('blocks:changed', handleBlocksChanged);

          loadFeed();
          loadFriends();

          return () => {
            document.removeEventListener('click', onDocumentClick);
            window.removeEventListener('presence:updated', loadFriends);
            window.removeEventListener('blocks:changed', handleBlocksChanged);
          };
        },
      },
    live: {
      title: 'Directo',
      activeNav: 'feed',
      render() {
        return `
          <section class="w-full">
            <div id="live-shell" class="live-root text-white">
              <div class="live-layout">

                <!-- ═══ VIDEO PANEL ═══ -->
                <div class="live-video-col">
                  <div id="live-video-wrap" class="live-video-wrap">
                    <div id="live-viewer-player" class="absolute inset-0 hidden"></div>
                    <video id="live-host-preview" class="absolute inset-0 w-full h-full object-cover bg-black hidden" style="object-fit:cover" playsinline autoplay muted></video>

                    <!-- Fallback -->
                    <div id="live-video-fallback" class="absolute inset-0 flex flex-col items-center justify-center text-center px-6 z-[5]">
                      <div class="w-20 h-20 rounded-full bg-white/10 border border-white/15 flex items-center justify-center mb-5">
                        <span class="material-symbols-outlined text-[36px]">sensors</span>
                      </div>
                      <h3 id="live-fallback-title" class="text-2xl font-black">Preparando directo</h3>
                      <p id="live-fallback-copy" class="text-white/70 text-sm mt-3 max-w-md">Conecta la fuente del directo para comenzar a transmitir.</p>
                    </div>

                    <!-- ── OVERLAY (top) ── -->
                    <div data-live-overlay class="live-overlay absolute top-0 left-0 right-0 z-30 flex items-start justify-between p-4 bg-gradient-to-b from-black/60 to-transparent transition-opacity duration-300">
                      <div class="flex items-center gap-2 flex-wrap">
                        <div id="live-status-chip" class="flex items-center gap-2 rounded-full gradient-live live-pulse shadow-glow px-3 py-1.5">
                          <div id="live-status-dot" class="w-2 h-2 rounded-full bg-white"></div>
                          <span id="live-status-badge" class="text-[10px] font-black tracking-[0.18em]">LIVE</span>
                        </div>
                        <div class="rounded-full glass px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5">
                          <span class="material-symbols-outlined text-[14px]">visibility</span>
                          <span id="live-viewer-count">0</span>
                        </div>
                      </div>
                      <div class="flex items-center gap-2">
                        <button id="live-immersive-btn" type="button" class="w-9 h-9 rounded-full glass flex items-center justify-center text-white hover:bg-white/20 transition" title="Modo inmersivo">
                          <span class="material-symbols-outlined text-[20px]">open_in_full</span>
                        </button>
                        <button id="live-fullscreen-btn" type="button" class="w-9 h-9 rounded-full glass flex items-center justify-center text-white hover:bg-white/20 transition live-desktop-only" title="Pantalla completa (video)">
                          <span class="material-symbols-outlined text-[20px]">fullscreen</span>
                        </button>
                        <button id="live-host-end-btn" type="button" class="hidden rounded-full bg-[#ff0b53] hover:bg-[#e00549] px-4 py-2 text-xs font-black tracking-[0.16em] transition">FINALIZAR</button>
                      </div>
                    </div>

                    <!-- ── OVERLAY (bottom – title + host tools, desktop only) ── -->
                    <div data-live-overlay class="live-overlay live-desktop-only absolute bottom-0 left-0 right-0 z-30 p-4 bg-gradient-to-t from-black/70 via-black/30 to-transparent transition-opacity duration-300">
                      <div class="flex items-end justify-between gap-4">
                        <div class="min-w-0 flex items-center gap-3">
                          <h2 id="live-title" class="text-xl md:text-2xl font-black leading-tight break-words drop-shadow-lg">Cargando directo...</h2>
                          <button id="live-viewer-mute-btn" type="button" class="hidden w-9 h-9 rounded-full glass flex items-center justify-center text-white hover:bg-white/20 transition shrink-0" title="Silenciar / Activar sonido">
                            <span class="material-symbols-outlined text-[20px]">volume_up</span>
                          </button>
                        </div>
                        <div id="live-host-tools" class="hidden items-center gap-2 shrink-0">
                          <button id="live-toggle-mic-btn" type="button" class="w-10 h-10 rounded-full glass flex items-center justify-center text-white hover:bg-white/20 transition" title="Silenciar microfono">
                            <span class="material-symbols-outlined text-[20px]">mic</span>
                          </button>
                          <button id="live-toggle-system-audio-btn" type="button" class="hidden w-10 h-10 rounded-full glass flex items-center justify-center text-white hover:bg-white/20 transition" title="Silenciar audio del sistema">
                            <span class="material-symbols-outlined text-[20px]">volume_up</span>
                          </button>
                          <button id="live-flip-camera-btn" type="button" class="hidden w-10 h-10 rounded-full glass flex items-center justify-center text-white hover:bg-white/20 transition" title="Cambiar camara">
                            <span class="material-symbols-outlined text-[20px]">flip_camera_ios</span>
                          </button>
                          <button id="live-switch-source-btn" type="button" class="rounded-full glass hover:bg-white/20 px-3 py-1.5 text-xs font-semibold transition">Cambiar fuente</button>
                        </div>
                      </div>
                    </div>

                    <!-- ── PLAYER CONTROLS (mobile only, bottom-right of video) ── -->
                    <div id="live-player-controls" class="live-mobile-only absolute bottom-3 right-3 z-30 flex items-center gap-2">
                      <button id="live-player-mute-btn" type="button" class="hidden w-10 h-10 rounded-full glass flex items-center justify-center text-white hover:bg-white/20 transition" title="Silenciar / Activar sonido">
                        <span class="material-symbols-outlined text-[20px]">volume_up</span>
                      </button>
                      <button id="live-player-fs-btn" type="button" class="hidden w-10 h-10 rounded-full glass flex items-center justify-center text-white hover:bg-white/20 transition" title="Pantalla completa">
                        <span class="material-symbols-outlined text-[20px]">fullscreen</span>
                      </button>
                    </div>

                    <!-- Floating reactions -->
                    <div id="live-floating-reactions" class="pointer-events-none absolute inset-y-0 right-2 w-20 overflow-visible z-20"></div>
                  </div>

                  <!-- ═══ MOBILE CONTENT: title + comments + input (BELOW video, not overlaid) ═══ -->
                  <div id="live-mobile-overlay" class="live-mobile-content live-mobile-only">
                    <div class="px-4 pb-1 pt-3">
                      <h2 id="live-title-mobile" class="text-lg font-black leading-tight break-words drop-shadow-lg">Cargando directo...</h2>
                    </div>
                    <div id="live-comments-mobile" class="live-mobile-comments custom-scrollbar" style="overflow-y:auto;touch-action:pan-y;"></div>
                    <div class="live-mobile-input-row">
                      <!-- Mobile mic button (host only, hidden for viewers) -->
                      <button id="live-toggle-mic-mobile-btn" type="button" class="hidden w-10 h-10 rounded-full glass flex items-center justify-center text-white hover:bg-white/20 transition shrink-0" title="Silenciar micrófono">
                        <span class="material-symbols-outlined text-[20px]">mic</span>
                      </button>
                      <!-- Flip camera button (host mobile only) -->
                      <button id="live-flip-camera-mobile-btn" type="button" class="hidden w-10 h-10 rounded-full glass flex items-center justify-center text-white hover:bg-white/20 transition shrink-0" title="Cambiar cámara">
                        <span class="material-symbols-outlined text-[20px]">flip_camera_ios</span>
                      </button>
                      <textarea id="live-comment-input-mobile" rows="1" class="live-mobile-input" placeholder="Escribe algo..."></textarea>
                      <div class="relative">
                        <button id="live-reaction-trigger" type="button" class="w-12 h-12 rounded-full gradient-live shadow-glow flex items-center justify-center text-xl shrink-0 transition-transform active:scale-90 select-none" title="Mantén presionado para elegir reacción">❤️</button>
                        <div id="live-reaction-selector" class="hidden absolute bottom-[120%] right-0 glass rounded-2xl px-1.5 py-2 flex flex-col items-center gap-1 shadow-xl z-50" style="animation:live-selector-pop 0.2s ease-out both;">
                          <button type="button" class="w-10 h-10 rounded-full hover:bg-white/15 flex items-center justify-center text-lg transition-transform hover:scale-125" data-live-set-reaction="me_gusta">❤️</button>
                          <button type="button" class="w-10 h-10 rounded-full hover:bg-white/15 flex items-center justify-center text-lg transition-transform hover:scale-125" data-live-set-reaction="me_encanta">😍</button>
                          <button type="button" class="w-10 h-10 rounded-full hover:bg-white/15 flex items-center justify-center text-lg transition-transform hover:scale-125" data-live-set-reaction="me_divierte">😂</button>
                          <button type="button" class="w-10 h-10 rounded-full hover:bg-white/15 flex items-center justify-center text-lg transition-transform hover:scale-125" data-live-set-reaction="me_sorprende">😮</button>
                          <button type="button" class="w-10 h-10 rounded-full hover:bg-white/15 flex items-center justify-center text-lg transition-transform hover:scale-125" data-live-set-reaction="me_enoja">😡</button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- ═══ CHAT PANEL (desktop only) ═══ -->
                <aside class="live-chat-col live-desktop-only live-desktop-flex">
                  <div class="px-5 py-4 border-b border-white/10">
                    <p class="text-xs uppercase tracking-[0.24em] text-white/45 font-black">Chat en vivo</p>
                    <h3 class="font-black text-xl mt-1">Comentarios</h3>
                  </div>
                  <div id="live-comments" class="custom-scrollbar flex-1 h-0 min-h-[220px] overflow-y-auto px-5 py-4 space-y-4">
                    <p class="text-sm text-white/55">Cargando comentarios...</p>
                  </div>
                  <div class="px-5 py-4 border-t border-white/10">
                    <div class="flex items-end gap-3">
                      <textarea id="live-comment-input" rows="1" class="flex-1 min-h-[48px] max-h-28 rounded-[22px] bg-slate-950/70 border border-white/10 focus:border-[#ec4899]/40 px-4 py-3 text-sm text-white caret-[#ec4899] outline-none resize-none placeholder:text-white/35 transition" style="-webkit-text-fill-color:#fff;" placeholder="Escribe algo..."></textarea>
                      <div class="relative">
                        <button id="live-reaction-trigger-desktop" type="button" class="w-12 h-12 rounded-full gradient-live shadow-glow hover:brightness-110 flex items-center justify-center text-xl shrink-0 transition-transform active:scale-90 select-none" title="Mantén presionado para elegir reacción">❤️</button>
                        <div id="live-reaction-selector-desktop" class="hidden absolute bottom-[120%] right-0 glass rounded-2xl px-1.5 py-2 flex flex-col items-center gap-1 shadow-xl z-50" style="animation:live-selector-pop 0.2s ease-out both;">
                          <button type="button" class="w-10 h-10 rounded-full hover:bg-white/15 flex items-center justify-center text-lg transition-transform hover:scale-125" data-live-set-reaction="me_gusta">❤️</button>
                          <button type="button" class="w-10 h-10 rounded-full hover:bg-white/15 flex items-center justify-center text-lg transition-transform hover:scale-125" data-live-set-reaction="me_encanta">😍</button>
                          <button type="button" class="w-10 h-10 rounded-full hover:bg-white/15 flex items-center justify-center text-lg transition-transform hover:scale-125" data-live-set-reaction="me_divierte">😂</button>
                          <button type="button" class="w-10 h-10 rounded-full hover:bg-white/15 flex items-center justify-center text-lg transition-transform hover:scale-125" data-live-set-reaction="me_sorprende">😮</button>
                          <button type="button" class="w-10 h-10 rounded-full hover:bg-white/15 flex items-center justify-center text-lg transition-transform hover:scale-125" data-live-set-reaction="me_enoja">😡</button>
                        </div>
                      </div>
                    </div>
                  </div>
                </aside>

              </div>
            </div>
          </section>
        `;
      },
      mount({ container, user, params, router }) {
        const liveId = Number(params.id || 0);
        const isHostRoute = String(params.host || '') === '1';

        // Apply device class to root (controls entire layout via CSS)
        const liveShell = container.querySelector('#live-shell');
        if (isDesktopClient() && liveShell) {
          liveShell.classList.add('live-is-desktop');
        }
        // Host broadcasting from mobile: full-bleed camera mode
        if (isHostRoute && !isDesktopClient() && liveShell) {
          liveShell.classList.add('live-host-mobile');
        }

        const viewerPlayerRoot = container.querySelector('#live-viewer-player');
        const hostPreviewVideo = container.querySelector('#live-host-preview');
        const liveVideoFallback = container.querySelector('#live-video-fallback');
        const liveFallbackTitle = container.querySelector('#live-fallback-title');
        const liveFallbackCopy = container.querySelector('#live-fallback-copy');
        const liveTitle = container.querySelector('#live-title');
        const liveViewerCount = container.querySelector('#live-viewer-count');
        const liveStatusChip = container.querySelector('#live-status-chip');
        const liveStatusDot = container.querySelector('#live-status-dot');
        const liveStatusBadge = container.querySelector('#live-status-badge');
        const liveComments = container.querySelector('#live-comments');
        const liveCommentInput = container.querySelector('#live-comment-input');
        const liveCommentsMobile = container.querySelector('#live-comments-mobile');
        const liveCommentInputMobile = container.querySelector('#live-comment-input-mobile');
        const liveTitleMobile = container.querySelector('#live-title-mobile');
        const floatingReactions = container.querySelector('#live-floating-reactions');
        const hostEndButton = container.querySelector('#live-host-end-btn');
        const hostTools = container.querySelector('#live-host-tools');
        const toggleMicButton = container.querySelector('#live-toggle-mic-btn');
        const toggleMicMobileButton = container.querySelector('#live-toggle-mic-mobile-btn');
        const toggleSystemAudioButton = container.querySelector('#live-toggle-system-audio-btn');
        const switchSourceButton = container.querySelector('#live-switch-source-btn');
        const flipCameraButton = container.querySelector('#live-flip-camera-btn');
        const flipCameraMobileButton = container.querySelector('#live-flip-camera-mobile-btn');

        const fullscreenBtn = container.querySelector('#live-fullscreen-btn');
        const immersiveBtn = container.querySelector('#live-immersive-btn');
        const reactionTrigger = container.querySelector('#live-reaction-trigger');
        const reactionSelector = container.querySelector('#live-reaction-selector');
        const reactionTriggerDesktop = container.querySelector('#live-reaction-trigger-desktop');
        const reactionSelectorDesktop = container.querySelector('#live-reaction-selector-desktop');
        const liveVideoWrap = container.querySelector('#live-video-wrap');
        const overlays = container.querySelectorAll('[data-live-overlay]');

        let liveData = null;
        let activeReaction = 'me_gusta';
        let commentsTimer = null;
        let heartbeatTimer = null;
        let liveStateTimer = null;
        let lastEventId = 0;
        let sourceBusy = false;
        let startedAt = Date.now();
        let ovenLivekit = null;
        let viewerVideo = null;
        let viewerHls = null;
        let hostMediaBundle = null;
        let hostMicMuted = false;
        let hostSystemMuted = false;
        let endedByHost = false;
        let hostPublishing = false;
        let hostPublishedSource = null;
        let viewerPlayerSourceUrl = null;
        let viewerPlayerCreatedAt = 0;
        let viewerPlayerLastRetryAt = 0;
        let viewerBootstrapInFlight = false;
        let commentsInitialized = false;
        let overlayTimer = null;
        let longPressTimer = null;
        let selectorOpen = false;
        let lastKnownSource = null;
        let currentFacingMode = 'environment'; // default: rear camera on mobile
        let wakeLock = null; // Screen Wake Lock to prevent black screen

        // Mobile-only player controls (on the video itself)
        const playerMuteBtn = container.querySelector('#live-player-mute-btn');
        const playerFsBtn = container.querySelector('#live-player-fs-btn');

        // Wake Lock: keep screen awake during livestream
        async function requestWakeLock() {
          try {
            if ('wakeLock' in navigator) {
              wakeLock = await navigator.wakeLock.request('screen');
              wakeLock.addEventListener('release', () => { wakeLock = null; });
            }
          } catch (e) { /* not critical */ }
        }

        // If the user is scrolling the chat, avoid snapping back to bottom on the next poll.
        let lastCommentsUserScrollAt = 0;
        function markCommentsUserScroll() {
          lastCommentsUserScrollAt = Date.now();
        }
        function userRecentlyScrolledComments() {
          return (Date.now() - lastCommentsUserScrollAt) < 1500;
        }
        function releaseWakeLock() {
          if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
        }
        // Re-acquire wake lock when page becomes visible again
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible' && liveData?.live_status === 'live') {
            requestWakeLock();
          }
        });
        requestWakeLock();

        function cleanupMediaBundle(bundle) {
          if (!bundle) {
            return;
          }

          const tracks = [];
          [bundle.previewStream, bundle.publishedStream, bundle.micStream].forEach((stream) => {
            if (stream?.getTracks) {
              tracks.push(...stream.getTracks());
            }
          });

          const seen = new Set();
          tracks.forEach((track) => {
            if (!track || seen.has(track.id)) {
              return;
            }
            seen.add(track.id);
            try {
              track.stop();
            } catch (error) {
              console.warn('No se pudo detener un track del directo:', error);
            }
          });

          if (bundle.audioContext) {
            bundle.audioContext.close().catch(() => {});
          }
        }

        function stopHostStreams() {
          cleanupMediaBundle(hostMediaBundle);
          hostMediaBundle = null;
          hostPreviewVideo.srcObject = null;
        }

        function destroyPlayer() {
          if (viewerHls && typeof viewerHls.destroy === 'function') {
            viewerHls.destroy();
          }
          viewerHls = null;
          if (viewerVideo) {
            viewerVideo.pause();
            viewerVideo.removeAttribute('src');
            viewerVideo.load();
          }
          viewerVideo = null;
          viewerPlayerSourceUrl = null;
          viewerPlayerCreatedAt = 0;
          viewerPlayerRoot.innerHTML = '';
        }

        function showFallback(title, copy) {
          viewerPlayerRoot.classList.add('hidden');
          hostPreviewVideo.classList.add('hidden');
          liveVideoFallback.classList.remove('hidden');
          liveFallbackTitle.textContent = title;
          liveFallbackCopy.textContent = copy;
        }

        function showHostPreview() {
          viewerPlayerRoot.classList.add('hidden');
          hostPreviewVideo.classList.remove('hidden');
          liveVideoFallback.classList.add('hidden');
        }

        function showViewerPlayer() {
          hostPreviewVideo.classList.add('hidden');
          viewerPlayerRoot.classList.remove('hidden');
          // Don't hide fallback yet — wait until video actually has frames
          // The fallback will be hidden in the 'playing' event listener on the video
          if (viewerVideo && viewerVideo.readyState >= 2) {
            liveVideoFallback.classList.add('hidden');
          }
        }


        const commentMarkup = (comment) => {
          const author = resolveProfileData({
            id: comment.user_id,
            user_name: comment.user_name,
            user_faculty: comment.user_faculty,
            user_avatar: comment.user_avatar,
          });
          const avatarBg = author.avatar_url ? `background-image:url('${safeUrl(author.avatar_url)}');background-color:${userColor(author)}` : `background:${userColor(author)}`;
          const avatarContent = author.avatar_url ? '' : escapeHtml(initials(displayName(author)));

          return `
            <div class="flex items-start gap-3" data-comment-id="${comment.id}" style="animation:live-comment-in 0.3s ease-out both;">
              <div class="w-10 h-10 rounded-full bg-slate-600 shrink-0 flex items-center justify-center text-white text-xs font-bold" style="${avatarBg};background-size:cover;background-position:center;">${avatarContent}</div>
              <div class="min-w-0">
                <span class="font-bold text-[13px] text-white">${escapeHtml(displayName(author))}</span>
                <span class="text-[11px] text-white/35 ml-1.5">${escapeHtml(timeAgo(comment.created_at))}</span>
                <p class="text-[13px] text-white/80 mt-0.5 break-words whitespace-pre-wrap">${escapeHtml(comment.content || '')}</p>
              </div>
            </div>
          `;
        };



        function addFloatingReaction(type) {
          const emojiMap = {
            me_gusta: '❤️',
            me_divierte: '😂',
            me_sorprende: '😮',
            me_enoja: '😡',
            me_entristece: '😢',
          };
          const emoji = emojiMap[type] || '❤️';
          const xOffset = (Math.random() - 0.5) * 30;

          [floatingReactions].forEach((target) => {
            if (!target) return;
            const bubble = document.createElement('div');
            bubble.textContent = emoji;
            bubble.className = 'live-float-emoji';
            bubble.style.right = `${Math.random() * 40}px`;
            bubble.style.setProperty('--float-x', `${xOffset}px`);
            target.appendChild(bubble);
            window.setTimeout(() => bubble.remove(), 3200);
          });
        }

        function refreshReactionButtons() {
          const emojiLookup = { me_gusta: '❤️', me_divierte: '😂', me_sorprende: '😮', me_enoja: '😡', me_entristece: '😢', me_encanta: '😍' };
          const activeEmoji = emojiLookup[activeReaction] || '❤️';
          // Update BOTH trigger buttons to show the currently active emoji
          [reactionTrigger, reactionTriggerDesktop].forEach(btn => {
            if (!btn) return;
            btn.textContent = activeEmoji;
          });
          // Update ALL selector items: highlight only the active one
          container.querySelectorAll('[data-live-set-reaction]').forEach((button) => {
            const isActive = button.dataset.liveSetReaction === activeReaction;
            button.style.background = isActive ? 'rgba(255,255,255,0.2)' : '';
            button.style.transform = isActive ? 'scale(1.2)' : '';
            button.style.boxShadow = isActive ? '0 0 0 2px rgba(236,72,153,0.5)' : '';
          });
        }

        function setAudioTrackEnabled(tracks, enabled) {
          (tracks || []).forEach((track) => {
            try {
              track.enabled = enabled;
            } catch (error) {
              console.warn('No se pudo cambiar el estado de un track de audio:', error);
            }
          });
        }

        function applyHostAudioState(bundle = hostMediaBundle) {
          if (!bundle) {
            return;
          }

          if (bundle.micGainNode) {
            bundle.micGainNode.gain.value = hostMicMuted ? 0 : 1;
          } else {
            setAudioTrackEnabled(bundle.micAudioTracks, !hostMicMuted);
          }

          if (bundle.systemGainNode) {
            bundle.systemGainNode.gain.value = hostSystemMuted ? 0 : 1;
          } else {
            setAudioTrackEnabled(bundle.systemAudioTracks, !hostSystemMuted);
          }
        }

        function refreshHostAudioButtons() {
          const allMicBtns = [toggleMicButton].filter(Boolean);
          const allSysBtns = [toggleSystemAudioButton].filter(Boolean);

          allMicBtns.forEach((btn) => {
            const icon = btn.querySelector('.material-symbols-outlined');
            if (icon) icon.textContent = hostMicMuted ? 'mic_off' : 'mic';
            btn.classList.toggle('gradient-live', hostMicMuted);
            btn.title = hostMicMuted ? 'Activar microfono' : 'Silenciar microfono';
          });

          const isScreenSource = liveData?.live_source === 'screen' && isDesktopClient();
          allSysBtns.forEach((btn) => {
            btn.classList.toggle('hidden', !isScreenSource);
            btn.classList.toggle('flex', isScreenSource);
            const icon = btn.querySelector('.material-symbols-outlined');
            if (icon) icon.textContent = hostSystemMuted ? 'volume_off' : 'volume_up';
            btn.classList.toggle('gradient-live', hostSystemMuted);
            btn.title = hostSystemMuted ? 'Activar audio del sistema' : 'Silenciar audio del sistema';
          });

          // Flip camera button: only on mobile, camera source, and owner
          const isMobileCamera = !isDesktopClient() && (liveData?.live_source || 'camera') === 'camera' && isHostOwner();
          if (flipCameraButton) {
            flipCameraButton.classList.toggle('hidden', !isMobileCamera);
            flipCameraButton.classList.toggle('flex', isMobileCamera);
          }
          // Also show/hide the mobile input row flip button
          if (flipCameraMobileButton) {
            flipCameraMobileButton.classList.toggle('hidden', !isMobileCamera);
            flipCameraMobileButton.classList.toggle('flex', isMobileCamera);
          }
          // Hide switch source button on mobile (only desktop has screen share)
          if (switchSourceButton && !isDesktopClient()) {
            switchSourceButton.classList.add('hidden');
          }
        }

        function isHostOwner() {
          return isHostRoute && Number(liveData?.user_id || 0) === Number(user.id);
        }

        function refreshLiveStatusBadge() {
          const isLive = liveData?.live_status === 'live';
          liveStatusBadge.textContent = isLive ? 'LIVE' : 'FINALIZADO';
          liveStatusChip.classList.toggle('gradient-live', isLive);
          liveStatusChip.classList.toggle('live-pulse', isLive);
          liveStatusChip.classList.toggle('bg-slate-700/85', !isLive);
        }

        // Show fullscreen button only for landscape streams (from PC, not mobile camera)
        function updateFullscreenButtonVisibility() {
          if (!fullscreenBtn || isDesktopClient()) return; // always show on desktop
          // Check if the stream is from a screen share (always landscape)
          if (liveData?.live_source === 'screen') {
            fullscreenBtn.classList.remove('hidden');
            return;
          }
          // For camera source: check actual video dimensions if available
          const video = viewerVideo || hostPreviewVideo;
          if (video && video.videoWidth && video.videoHeight) {
            const isLandscape = video.videoWidth > video.videoHeight;
            fullscreenBtn.classList.toggle('hidden', !isLandscape);
          } else {
            // No video yet — hide on mobile by default (will re-check)
            fullscreenBtn.classList.add('hidden');
          }
        }

        // Show mobile-only player controls (mute + fullscreen on the video itself)
        function updateMobilePlayerControls() {
          if (isDesktopClient()) return;
          const isOwner = Number(liveData?.user_id) === Number(user.id) && isHostRoute;
          // Show mute button for viewers on mobile
          if (playerMuteBtn) {
            playerMuteBtn.classList.toggle('hidden', isOwner);
            playerMuteBtn.classList.toggle('flex', !isOwner);
          }
          // Show fullscreen button only for landscape/PC streams on mobile
          if (playerFsBtn) {
            let showFs = false;
            if (liveData?.live_source === 'screen') {
              showFs = true;
            } else {
              const video = viewerVideo || hostPreviewVideo;
              if (video && video.videoWidth && video.videoHeight) {
                showFs = video.videoWidth > video.videoHeight;
              }
            }
            playerFsBtn.classList.toggle('hidden', !showFs);
            playerFsBtn.classList.toggle('flex', showFs);
          }
        }

        // Detect portrait/phone camera streams for viewer → apply full-bleed TikTok layout
        function updateStreamLayout() {
          if (isDesktopClient() || isHostRoute) return; // only for mobile viewers
          const video = viewerVideo;
          if (!video || !video.videoWidth || !video.videoHeight) return;
          // Only treat as portrait if significantly taller than wide (ratio < 0.75)
          const ratio = video.videoWidth / video.videoHeight;
          const isPortrait = ratio < 0.75;
          if (liveShell) {
            liveShell.classList.toggle('live-cam-stream', isPortrait);
          }
          // Set object-fit based on stream orientation
          video.style.objectFit = isPortrait ? 'cover' : 'contain';
        }

        function viewerPlaybackLooksStalled() {
          if (!viewerVideo || !viewerPlayerSourceUrl) {
            return false;
          }

          const now = Date.now();
          // Give player plenty of time before declaring stalled (mobile needs more time)
          if ((now - viewerPlayerCreatedAt) < 8000 || (now - viewerPlayerLastRetryAt) < 8000) {
            return false;
          }

          // Only stall if HAVE_NOTHING (no data at all) AND paused — be very conservative
          if (viewerVideo.readyState < 1 && viewerVideo.paused) return true;
          return false;
        }

        function syncViewerToLiveEdge(force = false) {
          if (!viewerHls || !viewerVideo) {
            return;
          }

          const syncPosition = viewerHls.liveSyncPosition;
          if (!Number.isFinite(syncPosition) || syncPosition <= 0) {
            return;
          }

          const currentTime = Number(viewerVideo.currentTime || 0);
          const drift = syncPosition - currentTime;

          // Only seek on force or very large drift — seeking causes black frames
          // Seek on initial load OR if truly stuck/looping (drift > 4s)
          if ((force && currentTime <= 0) || drift > 4) {
            try {
              viewerVideo.currentTime = syncPosition;
            } catch (error) {
              console.warn('No se pudo saltar al borde en vivo del directo:', error);
            }
          }

          // Speed up gently if behind — avoids stutter but corrects drift
          if (drift > 1.5) {
            viewerVideo.playbackRate = Math.min(1.06, 1 + drift / 14);
            return;
          }

          viewerVideo.playbackRate = 1;
        }

        async function ensureViewerManifest(url) {
          const attempts = 5;
          const pauseMs = 650;

          for (let attempt = 0; attempt < attempts; attempt += 1) {
            try {
              const controller = new AbortController();
              const timeoutId = window.setTimeout(() => controller.abort(), 2200);
              const response = await fetch(`${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`, {
                method: 'GET',
                cache: 'no-store',
                signal: controller.signal,
              });
              window.clearTimeout(timeoutId);
              if (response.ok) {
                const manifest = await response.text();
                if (manifest.includes('#EXTM3U')) {
                  return true;
                }
              }
            } catch (error) {
              // seguimos intentando unos segundos antes de rendirnos
            }

            if (attempt < attempts - 1) {
              await new Promise((resolve) => window.setTimeout(resolve, pauseMs));
            }
          }

          return false;
        }

        function createViewerVideo() {
          const video = document.createElement('video');
          video.className = 'w-full h-full object-contain bg-black absolute inset-0';
          video.style.objectFit = 'contain';
          video.autoplay = true;
          video.controls = false;
          video.playsInline = true;
          video.setAttribute('playsinline', '');
          video.muted = true;
          // Don't clear innerHTML yet — keep old video visible until new one is ready
          viewerPlayerRoot.appendChild(video);
          viewerVideo = video;
          // Tap on video to unmute (only fires once)
          const unmuteHandler = () => {
            if (viewerVideo && viewerVideo.muted) {
              viewerVideo.muted = false;
            }
            liveVideoWrap?.removeEventListener('click', unmuteHandler);
          };
          liveVideoWrap?.addEventListener('click', unmuteHandler);
          // Re-check layout once dimensions are known
          video.addEventListener('loadedmetadata', () => {
            updateFullscreenButtonVisibility();
            updateMobilePlayerControls();
            updateStreamLayout();
            // Now safe to remove previous video elements
            Array.from(viewerPlayerRoot.children).forEach(el => {
              if (el !== video) viewerPlayerRoot.removeChild(el);
            });
          }, { once: true });
          // Hide fallback once video is actually rendering frames
          const hideFallback = () => { liveVideoFallback.classList.add('hidden'); };
          video.addEventListener('playing', hideFallback, { once: true });
          video.addEventListener('canplay', hideFallback, { once: true });
          // Generous timeout: only hide fallback after 8s as last resort
          setTimeout(() => {
            if (viewerVideo === video && !liveVideoFallback.classList.contains('hidden')) {
              hideFallback();
            }
          }, 8000);
          return video;
        }

        async function ensureViewerPlayer(forceRestart = false) {
          if (viewerBootstrapInFlight) {
            return;
          }

          if (!liveData?.stream_key) {
            showFallback('Preparando directo', 'La transmision todavia esta preparando su senal en vivo.');
            return;
          }

          viewerBootstrapInFlight = true;

          try {
            await ensureLivestreamLibraries();
            const sourceUrl = normalizeLivestreamPlaybackUrl(liveData.stream_key, liveData.playback_url);
            if (!forceRestart && viewerVideo && viewerPlayerSourceUrl === sourceUrl) {
              showViewerPlayer();
              // Don't call play() — HLS is already streaming, play() interrupts and causes black frames
              return;
            }

            const manifestReady = await ensureViewerManifest(sourceUrl);
            if (!manifestReady) {
              showFallback('Esperando directo', 'El stream todavia se esta preparando para los espectadores.');
              return;
            }

            // Destroy old player first, then show viewer container, then create new video
            destroyPlayer();
            showViewerPlayer();
            const video = createViewerVideo();
            const readyAt = Date.now();

            if (window.Hls && window.Hls.isSupported()) {
              viewerHls = new window.Hls({
                lowLatencyMode: true,
                liveDurationInfinity: true,
                backBufferLength: 8,          // reduce to avoid old-segment loop playback
                maxBufferLength: 12,
                liveSyncDurationCount: 2,     // stay 2 segments behind live edge (more stable)
                liveMaxLatencyDurationCount: 5,
                maxLiveSyncPlaybackRate: 1.06,
              });
              viewerHls.loadSource(sourceUrl);
              viewerHls.attachMedia(video);
              viewerHls.on(window.Hls.Events.MANIFEST_PARSED, () => {
                syncViewerToLiveEdge(true);
                video.play().catch(() => {});
              });
              viewerHls.on(window.Hls.Events.LEVEL_UPDATED, () => {
                syncViewerToLiveEdge();
              });
              viewerHls.on(window.Hls.Events.FRAG_BUFFERED, () => {
                syncViewerToLiveEdge();
              });
              viewerHls.on(window.Hls.Events.ERROR, (_event, data) => {
                if (!data?.fatal) {
                  return;
                }

                if (data.type === window.Hls.ErrorTypes.NETWORK_ERROR) {
                  viewerHls.startLoad();
                  return;
                }

                if (data.type === window.Hls.ErrorTypes.MEDIA_ERROR) {
                  viewerHls.recoverMediaError();
                  return;
                }

                destroyPlayer();
                showFallback('No se pudo reproducir el directo', 'Intenta entrar de nuevo en unos segundos.');
              });
            } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
              video.src = sourceUrl;
              video.addEventListener('loadedmetadata', () => {
                const seekable = video.seekable;
                if (seekable && seekable.length > 0) {
                  try {
                    video.currentTime = Math.max(0, seekable.end(seekable.length - 1) - 1);
                  } catch (error) {
                    console.warn('No se pudo ajustar el viewer nativo al borde del live:', error);
                  }
                }
                video.play().catch(() => {});
              }, { once: true });
            } else {
              showFallback('Reproduccion no compatible', 'Este navegador no pudo cargar el directo.');
                return;
            }

            viewerPlayerSourceUrl = sourceUrl;
            viewerPlayerCreatedAt = readyAt;
            viewerPlayerLastRetryAt = readyAt;
          } finally {
            viewerBootstrapInFlight = false;
          }
        }

        async function buildHostInputStream(source) {
          const bundle = {
            source,
            previewStream: null,
            publishedStream: null,
            micStream: null,
            audioContext: null,
            systemAudioTracks: [],
            micAudioTracks: [],
            systemGainNode: null,
            micGainNode: null,
          };

          if (source === 'screen' && isDesktopClient()) {
            // Reuse pre-captured stream from the modal if available
            let displayStream;
            if (window.__uptLivePreCapturedStream) {
              displayStream = window.__uptLivePreCapturedStream;
              window.__uptLivePreCapturedStream = null;
            } else {
              displayStream = await navigator.mediaDevices.getDisplayMedia({
                video: true,
                audio: true,
              });
            }
            let micStream = null;

            try {
              micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            } catch (error) {
              micStream = null;
            }

            bundle.previewStream = displayStream;
            bundle.micStream = micStream;

            const finalStream = new MediaStream();
            displayStream.getVideoTracks().forEach((track) => finalStream.addTrack(track));

            const displayAudioTracks = displayStream.getAudioTracks();
            const micAudioTracks = micStream?.getAudioTracks() || [];
            bundle.systemAudioTracks = displayAudioTracks;
            bundle.micAudioTracks = micAudioTracks;

            if (displayAudioTracks.length && micAudioTracks.length) {
              bundle.audioContext = new (window.AudioContext || window.webkitAudioContext)();
              const destination = bundle.audioContext.createMediaStreamDestination();
              const displaySource = bundle.audioContext.createMediaStreamSource(new MediaStream([displayAudioTracks[0]]));
              const micSource = bundle.audioContext.createMediaStreamSource(new MediaStream([micAudioTracks[0]]));
              bundle.systemGainNode = bundle.audioContext.createGain();
              bundle.micGainNode = bundle.audioContext.createGain();
              displaySource.connect(bundle.systemGainNode).connect(destination);
              micSource.connect(bundle.micGainNode).connect(destination);
              destination.stream.getAudioTracks().forEach((track) => finalStream.addTrack(track));
            } else if (displayAudioTracks.length) {
              finalStream.addTrack(displayAudioTracks[0]);
            } else if (micAudioTracks.length) {
              finalStream.addTrack(micAudioTracks[0]);
            }

            bundle.publishedStream = finalStream;
            applyHostAudioState(bundle);
            return bundle;
          }

          // On mobile use facingMode for front/rear camera; on desktop just { video: true }
          const videoConstraints = isDesktopClient()
            ? true
            : { facingMode: { ideal: currentFacingMode }, width: { ideal: 1920 }, height: { ideal: 1080 } };
          const cameraStream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints, audio: true });
          bundle.previewStream = cameraStream;
          bundle.publishedStream = cameraStream;
          bundle.micAudioTracks = cameraStream.getAudioTracks();
          applyHostAudioState(bundle);
          return bundle;
        }

        async function startHostSource(nextSource = null, forceRestart = false) {
          if (sourceBusy || !liveData?.stream_key) return;
          sourceBusy = true;

          try {
            await ensureLivestreamLibraries();
            const source = nextSource || liveData?.live_source || 'camera';
            if (hostPublishing && !forceRestart && hostPublishedSource === source) {
              return;
            }

            if (!ovenLivekit) {
              ovenLivekit = window.OvenLiveKit.create({
                callbacks: {
                  error: (error) => {
                    console.error('OvenLiveKit error:', error);
                  },
                },
              });
            }

            const previousBundle = hostMediaBundle;
            const nextBundle = await buildHostInputStream(source);
            liveData.live_source = source;
            ovenLivekit.attachMedia(hostPreviewVideo);
            await ovenLivekit.setMediaStream(nextBundle.publishedStream);
            hostMediaBundle = nextBundle;
            hostPreviewVideo.srcObject = nextBundle.previewStream || nextBundle.publishedStream;
            // PC host (screen share or desktop camera): contain to preserve 16:9 frame
            // Mobile host (camera): cover to fill vertical frame
            hostPreviewVideo.style.objectFit = (!isDesktopClient() && source === 'camera') ? 'cover' : 'contain';

            showHostPreview();
            await hostPreviewVideo.play().catch(() => {});
            if (!hostPublishing) {
              await ovenLivekit.startStreaming(buildLivestreamPublishUrl(liveData.stream_key));
              hostPublishing = true;
            }
            hostPublishing = true;
            hostPublishedSource = source;
            refreshHostAudioButtons();
            cleanupMediaBundle(previousBundle);
          } catch (error) {
            console.error('No se pudo iniciar el directo con OME:', error);
            hostPublishing = false;
            hostPublishedSource = null;
            showFallback('Fuente no disponible', 'No se pudo acceder a la camara o pantalla compartida para el directo.');
            showToast('No se pudo iniciar la transmision en vivo', 'error');
          } finally {
            sourceBusy = false;
          }
        }

        async function loadLivestream() {
          const result = await PostsAPI.getLivestream(liveId);
          if (!result?.ok) {
            liveTitle.textContent = 'No se pudo cargar el directo';
            showFallback('No se pudo cargar el directo', result?.data?.error || 'Este directo ya no esta disponible.');
            return;
          }

          liveData = result.data;
          const titleText = liveData.live_title || 'Directo UPT';
          liveTitle.textContent = titleText;
          if (liveTitleMobile) liveTitleMobile.textContent = titleText;
          const viewCount = String(liveData.live_status === 'live' ? Number(liveData.viewer_count || 0) : 0);
          liveViewerCount.textContent = viewCount;

          activeReaction = liveData.current_reaction || activeReaction;
          refreshReactionButtons();
          refreshLiveStatusBadge();

          const isOwner = Number(liveData.user_id) === Number(user.id) && isHostRoute;
          hostEndButton.classList.toggle('hidden', !isOwner);
          hostTools.classList.toggle('hidden', !isOwner);
          hostTools.classList.toggle('flex', isOwner);

          refreshHostAudioButtons();

          // Show viewer mute button only for viewers (not host) — desktop
          const viewerMuteBtn = container.querySelector('#live-viewer-mute-btn');
          if (viewerMuteBtn) {
            viewerMuteBtn.classList.toggle('hidden', isOwner);
            viewerMuteBtn.classList.toggle('flex', !isOwner);
          }
          // Mobile mic button — host only
          if (toggleMicMobileButton) {
            toggleMicMobileButton.classList.toggle('hidden', !isOwner);
            toggleMicMobileButton.classList.toggle('flex', isOwner && !isDesktopClient());
          }

          if (!isOwner && liveData.live_status === 'live') {
            // Detect source change → force viewer restart
            const currentSource = liveData.live_source || 'camera';
            const sourceChanged = lastKnownSource && lastKnownSource !== currentSource;
            lastKnownSource = currentSource;
            await ensureViewerPlayer(sourceChanged || viewerPlaybackLooksStalled());
            syncViewerToLiveEdge();
            updateFullscreenButtonVisibility();
            updateMobilePlayerControls();
            updateStreamLayout();
          }

          if (liveData.live_status !== 'live') {
            destroyPlayer();
            showFallback('Directo finalizado', 'La transmision termino, pero puedes seguir viendo su registro y comentarios.');
          }
        }

        function isCommentsNearBottom(element) {
          if (!element || element.clientHeight <= 0) return true;
          return (element.scrollHeight - element.scrollTop - element.clientHeight) < 72;
        }

        function shouldStickCommentsToBottom() {
          if (!commentsInitialized) return true;
          const activeCommentsContainer = (!isDesktopClient() && liveCommentsMobile) ? liveCommentsMobile : liveComments;
          return isCommentsNearBottom(activeCommentsContainer);
        }

        async function loadComments() {
          const stickToBottom = shouldStickCommentsToBottom();
          const result = await PostsAPI.getComments(liveId, 'newest');
          const comments = getList(result).slice().reverse().slice(-40);
          if (!result?.ok) {
            const errHtml = '<p class="text-sm text-white/55">No se pudieron cargar los comentarios.</p>';
            liveComments.innerHTML = errHtml;
            if (liveCommentsMobile) liveCommentsMobile.innerHTML = errHtml;
            return;
          }
          if (!comments.length) {
            if (!commentsInitialized) {
              const emptyHtml = '<p class="text-sm text-white/55">Todavia no hay comentarios en este directo.</p>';
              liveComments.innerHTML = emptyHtml;
              if (liveCommentsMobile) liveCommentsMobile.innerHTML = '';
            }
            commentsInitialized = true;
            return;
          }

          // Build set of new comment IDs
          const newIds = new Set(comments.map(c => String(c.id)));
          const existingIds = new Set();
          liveComments.querySelectorAll('[data-comment-id]').forEach(el => existingIds.add(el.dataset.commentId));

          // First load or major mismatch: full render
          if (!commentsInitialized || existingIds.size === 0) {
            const html = comments.map(c => commentMarkup(c)).join('');
            liveComments.innerHTML = html;
            if (liveCommentsMobile) liveCommentsMobile.innerHTML = html;
          } else {
            // Remove comments that are no longer in the list (old ones rotated out)
            liveComments.querySelectorAll('[data-comment-id]').forEach(el => {
              if (!newIds.has(el.dataset.commentId)) el.remove();
            });
            if (liveCommentsMobile) {
              liveCommentsMobile.querySelectorAll('[data-comment-id]').forEach(el => {
                if (!newIds.has(el.dataset.commentId)) el.remove();
              });
            }
            // Append only truly new comments
            const fragment = document.createDocumentFragment();
            const fragmentMobile = document.createDocumentFragment();
            comments.forEach(c => {
              if (!existingIds.has(String(c.id))) {
                const wrapper = document.createElement('div');
                wrapper.innerHTML = commentMarkup(c);
                const node = wrapper.firstElementChild;
                if (node) {
                  fragment.appendChild(node);
                  fragmentMobile.appendChild(node.cloneNode(true));
                }
              }
            });
            if (fragment.childNodes.length) {
              liveComments.appendChild(fragment);
              if (liveCommentsMobile) liveCommentsMobile.appendChild(fragmentMobile);
            }
          }

          commentsInitialized = true;
          if (stickToBottom && !userRecentlyScrolledComments()) {
            liveComments.scrollTop = liveComments.scrollHeight;
            if (liveCommentsMobile) liveCommentsMobile.scrollTop = liveCommentsMobile.scrollHeight;
          }
        }

        async function sendComment() {
          const content = (liveCommentInput?.value || liveCommentInputMobile?.value || '').trim();
          if (!content) return;
          const result = await PostsAPI.addComment(liveId, content);
          if (!result?.ok) {
            showToast(result?.data?.error || 'No se pudo comentar en el directo', 'error');
            return;
          }
          if (liveCommentInput) liveCommentInput.value = '';
          if (liveCommentInputMobile) liveCommentInputMobile.value = '';
          await loadComments();
        }

        async function heartbeat() {
          if (liveData?.live_status !== 'live') {
            liveViewerCount.textContent = '0';
            return;
          }
          const result = await PostsAPI.livestreamHeartbeat(liveId);
          if (result?.ok) {
            const count = String(Number(result.data?.viewer_count || 0));
            liveViewerCount.textContent = count;
          }
        }

        async function pollReactionEvents() {
          const result = await PostsAPI.getLivestreamEvents(liveId, lastEventId);
          const events = getList(result);
          if (!result?.ok || !events.length) return;
          events.forEach((event) => {
            lastEventId = Math.max(lastEventId, Number(event.id || 0));
            addFloatingReaction(event.reaction_type);
          });
        }

        async function sendActiveReaction() {
          const result = await PostsAPI.reactLivestream(liveId, activeReaction);
          if (!result?.ok) {
            showToast(result?.data?.error || 'No se pudo enviar la reaccion', 'error');
            return;
          }
          lastEventId = Math.max(lastEventId, Number(result.data?.event_id || 0));
          addFloatingReaction(activeReaction);
        }

        let endingLivestream = false;
        async function endLivestream() {
          if (endingLivestream) return;
          endingLivestream = true;
          const durationSeconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
          const result = await PostsAPI.endLivestream(liveId, durationSeconds);
          if (!result?.ok) {
            showToast(result?.data?.error || 'No se pudo finalizar el directo', 'error');
            endingLivestream = false; // allow retry
            return;
          }
          endedByHost = true;
          if (ovenLivekit && typeof ovenLivekit.stopStreaming === 'function') {
            try {
              ovenLivekit.stopStreaming();
            } catch (error) {
              console.warn('No se pudo detener OvenLiveKit al finalizar:', error);
            }
          }
          showToast('Directo finalizado', 'success');
          // Reset stuck flag then navigate
          exitingLivestream = false;
          exitLivestream();
        }

        const commentsLoop = () => loadComments().catch(() => {});
        const heartbeatLoop = () => heartbeat().catch(() => {});
        const stateLoop = async () => {
          await loadLivestream();
          await pollReactionEvents();
        };

        // ── Auto-hide overlay (desktop hover / mobile tap-to-toggle) ──
        const mobileOverlay = container.querySelector('#live-mobile-overlay');
        const playerControls = container.querySelector('#live-player-controls');
        let inVideoFullscreen = false; // landscape fullscreen (video only)
        let overlayVisible = true;
        const isHostOnMobile = isHostRoute && !isDesktopClient();

        function showOverlay() {
          overlayVisible = true;
          overlays.forEach(el => { el.style.opacity = '1'; el.style.pointerEvents = 'auto'; });
          if (playerControls) { playerControls.style.opacity = '1'; playerControls.style.pointerEvents = 'auto'; }
          // Show X button on mobile viewers only (host never sees X)
          if (immersiveBtn && !isDesktopClient() && !isHostOnMobile) {
            immersiveBtn.classList.remove('hidden'); // clear display:none from video-fullscreen
            immersiveBtn.style.opacity = '1';
            immersiveBtn.style.pointerEvents = 'auto';
          }
          clearTimeout(overlayTimer);
          overlayTimer = setTimeout(hideOverlay, 5000);
        }
        function hideOverlay() {
          if (selectorOpen) return;
          overlayVisible = false;
          overlays.forEach(el => { el.style.opacity = '0'; el.style.pointerEvents = 'none'; });
          // Hide player controls
          if (playerControls) { playerControls.style.opacity = '0'; playerControls.style.pointerEvents = 'none'; }
          // Hide X button
          if (immersiveBtn && !isDesktopClient()) {
            immersiveBtn.style.opacity = '0';
            immersiveBtn.style.pointerEvents = 'none';
          }
          // DO NOT hide mobile-overlay (title/comments/input/reactions must always be visible)
        }
        function toggleOverlay() {
          if (overlayVisible) { clearTimeout(overlayTimer); hideOverlay(); }
          else { showOverlay(); }
        }
        let lastTouchTime = 0; // guard against synthetic mouse events after touch
        if (liveVideoWrap) {
          liveVideoWrap.addEventListener('mouseenter', () => { if (Date.now() - lastTouchTime > 600) showOverlay(); });
          liveVideoWrap.addEventListener('mousemove',  () => { if (Date.now() - lastTouchTime > 600) showOverlay(); });
          liveVideoWrap.addEventListener('mouseleave', () => { if (Date.now() - lastTouchTime > 600) { clearTimeout(overlayTimer); overlayTimer = setTimeout(hideOverlay, 1200); } });
          // Mobile: touchend toggles overlay
          let lastTouchToggleTime = 0;
          liveVideoWrap.addEventListener('touchend', (e) => {
            if (e.target.closest('button')) return;
            lastTouchTime = Date.now();
            lastTouchToggleTime = Date.now();
            toggleOverlay();
          }, { passive: true });
          // Prevent click from re-toggling after a touch-toggle
          let lastVideoWrapTouchTime = 0;
          liveVideoWrap.addEventListener('touchend', () => {
            lastVideoWrapTouchTime = Date.now();
          }, { passive: true, capture: true }); // capture phase to record time before other handlers
          liveVideoWrap.addEventListener('click', (e) => {
            if (Date.now() - lastTouchToggleTime < 600) e.stopImmediatePropagation();
          }, true);
        }
        // Also toggle on tap anywhere on the live shell (not just video wrap)
        if (liveShell && !isDesktopClient()) {
          let lastShellTouchTime = 0;
          liveShell.addEventListener('touchend', (e) => {
            if (e.target.closest('button, input, textarea, #live-comments-mobile, .live-mobile-input')) return;
            // Skip if video wrap already handled this touch (same timestamp within 50ms)
            if (liveVideoWrap && liveVideoWrap.contains(e.target)) return;
            const now = Date.now();
            if (now - lastShellTouchTime < 400) return;
            lastShellTouchTime = now;
            toggleOverlay();
          }, { passive: true });
        }
        // On desktop show overlay initially, on mobile start hidden (tap to reveal)
        if (isDesktopClient()) {
          showOverlay();
        } else {
          hideOverlay();
          // Host on mobile: always hide X button
          if (isHostOnMobile && immersiveBtn) {
            immersiveBtn.style.display = 'none';
          }
        }

        // ── Video Fullscreen (landscape, video only) ──
        let pendingVideoFs = false;
        if (fullscreenBtn && liveVideoWrap) {
          fullscreenBtn.addEventListener('click', async () => {
            if (document.fullscreenElement === liveVideoWrap) {
              document.exitFullscreen().catch(() => {});
              try { screen.orientation.unlock(); } catch(e) {}
            } else {
              pendingVideoFs = true;
              try {
                await liveVideoWrap.requestFullscreen();
                try { await screen.orientation.lock('landscape'); } catch(e) {}
              } catch(e) {}
              pendingVideoFs = false;
            }
          });
        }

        // ── Immersive mode (hides page chrome, keeps chat) ──
        let immersiveActive = false;
        let immersiveBtnOriginalParent = immersiveBtn?.parentElement || null;
        let exitingLivestream = false;

        function activateImmersive() {
          immersiveActive = true;
          document.body.classList.add('live-immersive-active');
          liveShell.classList.add('live-immersive-shell');

          if (!isDesktopClient()) {
            // Mobile: use Fullscreen API for true immersive (hides browser chrome)
            liveShell.requestFullscreen().catch(() => {});
            // Move the X button out of the overlay so overlay timer can't hide it
            if (immersiveBtn && liveShell) {
              liveShell.appendChild(immersiveBtn);
            }
            const icon = immersiveBtn?.querySelector('.material-symbols-outlined');
            if (icon) icon.textContent = 'close';
          } else {
            const icon = immersiveBtn?.querySelector('.material-symbols-outlined');
            if (icon) icon.textContent = 'close_fullscreen';
          }
        }

        function deactivateImmersive() {
          immersiveActive = false;
          document.body.classList.remove('live-immersive-active');
          liveShell.classList.remove('live-immersive-shell');

          // Exit fullscreen if shell is the fullscreen element
          if (document.fullscreenElement === liveShell) {
            document.exitFullscreen().catch(() => {});
          }

          // Mobile: move button back to its original parent (the overlay)
          if (!isDesktopClient() && immersiveBtn && immersiveBtnOriginalParent) {
            immersiveBtnOriginalParent.appendChild(immersiveBtn);
          }

          const icon = immersiveBtn?.querySelector('.material-symbols-outlined');
          if (icon) icon.textContent = 'open_in_full';
        }

        function exitLivestream() {
          if (exitingLivestream) return;
          exitingLivestream = true;
          // Fade to black instantly to prevent flicker of normal layout
          if (liveShell) liveShell.style.opacity = '0';
          // Exit fullscreen then navigate
          const doNav = () => {
            setTimeout(() => {
              if (window.history.length > 1) history.back();
              else router.navigate('feed');
            }, 50);
          };
          if (document.fullscreenElement) {
            document.exitFullscreen().then(doNav).catch(doNav);
          } else {
            doNav();
          }
        }

        if (immersiveBtn && liveShell) {
          immersiveBtn.addEventListener('click', () => {
            if (!isDesktopClient()) {
              // Mobile: X button always exits the livestream
              exitLivestream();
            } else {
              // Desktop: toggle immersive mode
              if (immersiveActive) { deactivateImmersive(); } else { activateImmersive(); }
            }
          });
        }

        // Unified fullscreenchange handler
        document.addEventListener('fullscreenchange', () => {
          if (exitingLivestream || pendingVideoFs) return;

          const fsEl = document.fullscreenElement;

          if (fsEl === liveVideoWrap) {
            // Entered video fullscreen (landscape)
            inVideoFullscreen = true;
            const icon = fullscreenBtn?.querySelector('.material-symbols-outlined');
            if (icon) icon.textContent = 'fullscreen_exit';
            if (mobileOverlay) { mobileOverlay.style.opacity = '0'; mobileOverlay.style.pointerEvents = 'none'; }
            if (immersiveBtn && !isDesktopClient()) immersiveBtn.classList.add('hidden');
          } else if (fsEl === liveShell) {
            // Shell fullscreen active — show overlay so X reappears
            if (!isDesktopClient()) {
              // Ensure mobileOverlay is visible
              if (mobileOverlay) { mobileOverlay.style.opacity = ''; mobileOverlay.style.pointerEvents = ''; }
              showOverlay();
            }
          } else if (!fsEl) {
            if (inVideoFullscreen) {
              // Exited video fullscreen → restore mobileOverlay, re-enter shell fullscreen
              inVideoFullscreen = false;
              try { screen.orientation.unlock(); } catch(e) {}
              const icon = fullscreenBtn?.querySelector('.material-symbols-outlined');
              if (icon) icon.textContent = 'fullscreen';
              // Restore mobile overlay immediately
              if (mobileOverlay) { mobileOverlay.style.opacity = ''; mobileOverlay.style.pointerEvents = ''; }
              if (immersiveBtn && !isDesktopClient() && !isHostOnMobile) {
                immersiveBtn.classList.remove('hidden');
              }
              if (!isDesktopClient() && liveShell) {
                // Always try to re-enter shell fullscreen on mobile
                liveShell.requestFullscreen().catch(() => {
                  // requestFullscreen failed (e.g. browser policy) — still show overlay
                  showOverlay();
                });
              } else {
                showOverlay();
              }
            } else if (immersiveActive && !isDesktopClient()) {
              // User exited shell fullscreen via browser back → exit livestream
              exitLivestream();
            }
          }
        });

        // On mobile, auto-enter immersive mode immediately (uses Fullscreen API)
        if (!isDesktopClient() && liveShell) {
          activateImmersive();
        }

        // ── Viewer mute/unmute button (desktop) ──
        const viewerMuteBtn = container.querySelector('#live-viewer-mute-btn');
        if (viewerMuteBtn) {
          viewerMuteBtn.addEventListener('click', () => {
            if (viewerVideo) {
              viewerVideo.muted = !viewerVideo.muted;
              const icon = viewerMuteBtn.querySelector('.material-symbols-outlined');
              if (icon) icon.textContent = viewerVideo.muted ? 'volume_off' : 'volume_up';
              // Sync mobile mute icon
              const mIcon = playerMuteBtn?.querySelector('.material-symbols-outlined');
              if (mIcon) mIcon.textContent = viewerVideo.muted ? 'volume_off' : 'volume_up';
            }
          });
        }

        // ── Mobile player mute button ──
        if (playerMuteBtn) {
          playerMuteBtn.addEventListener('click', () => {
            if (viewerVideo) {
              viewerVideo.muted = !viewerVideo.muted;
              const icon = playerMuteBtn.querySelector('.material-symbols-outlined');
              if (icon) icon.textContent = viewerVideo.muted ? 'volume_off' : 'volume_up';
              // Sync desktop mute icon
              const dIcon = viewerMuteBtn?.querySelector('.material-symbols-outlined');
              if (dIcon) dIcon.textContent = viewerVideo.muted ? 'volume_off' : 'volume_up';
            }
          });
        }

        // ── Mobile mic button (in input row, host only) ──
        if (toggleMicMobileButton) {
          toggleMicMobileButton.addEventListener('click', () => {
            hostMicMuted = !hostMicMuted;
            applyHostAudioState();
            refreshHostAudioButtons();
            const icon = toggleMicMobileButton.querySelector('.material-symbols-outlined');
            if (icon) icon.textContent = hostMicMuted ? 'mic_off' : 'mic';
          });
        }

        // ── Mobile player fullscreen button (video-only landscape) ──
        if (playerFsBtn && liveVideoWrap) {
          playerFsBtn.addEventListener('click', async () => {
            if (document.fullscreenElement === liveVideoWrap) {
              document.exitFullscreen().catch(() => {});
              try { screen.orientation.unlock(); } catch(e) {}
            } else {
              pendingVideoFs = true;
              try {
                await liveVideoWrap.requestFullscreen();
                try { await screen.orientation.lock('landscape'); } catch(e) {}
              } catch(e) {}
              pendingVideoFs = false;
            }
          });
        }

        // ── Long-press reaction selector (both mobile + desktop) ──
        let selectorAutoCloseTimer = null;
        function openSelector(sel) {
          if (!sel) return;
          sel.classList.remove('hidden'); sel.classList.add('flex');
          selectorOpen = true;
          // Auto-close after 5s if no interaction
          if (selectorAutoCloseTimer) clearTimeout(selectorAutoCloseTimer);
          selectorAutoCloseTimer = setTimeout(() => closeAllSelectors(), 5000);
        }
        function closeAllSelectors() {
          [reactionSelector, reactionSelectorDesktop].forEach(sel => {
            if (sel) { sel.classList.add('hidden'); sel.classList.remove('flex'); }
          });
          selectorOpen = false;
          if (selectorAutoCloseTimer) { clearTimeout(selectorAutoCloseTimer); selectorAutoCloseTimer = null; }
        }

        function bindTrigger(trigger, selector) {
          if (!trigger) return;
          let lpTimer = null;
          let openedByLongPress = false;
          trigger.addEventListener('click', () => {
            // If selector was just opened by long-press, don't close it on the click release
            if (openedByLongPress) { openedByLongPress = false; return; }
            if (selectorOpen) { closeAllSelectors(); return; }
            sendActiveReaction();
          });
          trigger.addEventListener('pointerdown', () => {
            openedByLongPress = false;
            lpTimer = setTimeout(() => { openSelector(selector); openedByLongPress = true; }, 400);
          });
          trigger.addEventListener('pointerup', () => clearTimeout(lpTimer));
          trigger.addEventListener('pointerleave', () => clearTimeout(lpTimer));
        }
        bindTrigger(reactionTrigger, reactionSelector);
        bindTrigger(reactionTriggerDesktop, reactionSelectorDesktop);

        // Selector item click (all)
        container.querySelectorAll('[data-live-set-reaction]').forEach((button) => {
          button.addEventListener('click', async () => {
            activeReaction = button.dataset.liveSetReaction || 'me_gusta';
            refreshReactionButtons();
            closeAllSelectors();
            await sendActiveReaction();
          });
        });

        // Close selectors on outside click
        document.addEventListener('click', (e) => {
          if (!selectorOpen) return;
          const clickedInsideTrigger = (reactionTrigger?.contains(e.target)) || (reactionTriggerDesktop?.contains(e.target));
          const clickedInsideSelector = (reactionSelector?.contains(e.target)) || (reactionSelectorDesktop?.contains(e.target));
          if (!clickedInsideTrigger && !clickedInsideSelector) closeAllSelectors();
        });

        // ─── Comment events (Enter to send, no send button) ───
        function bindCommentInput(input) {
          if (!input) return;
          input.addEventListener('keydown', async (event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              const text = input.value.trim();
              if (!text) return;
              // Copy value to canonical input for sendComment
              liveCommentInput && (liveCommentInput.value = text);
              liveCommentInputMobile && (liveCommentInputMobile.value = text);
              await sendComment();
              input.value = '';
              if (liveCommentInput) liveCommentInput.value = '';
              if (liveCommentInputMobile) liveCommentInputMobile.value = '';
            }
          });
        }
        bindCommentInput(liveCommentInput);
        bindCommentInput(liveCommentInputMobile);

        // Mark user interaction with comments so polling doesn't fight touch scrolling.
        [liveComments, liveCommentsMobile].forEach((el) => {
          if (!el) return;
          el.addEventListener('scroll', markCommentsUserScroll, { passive: true });
          el.addEventListener('touchstart', markCommentsUserScroll, { passive: true });
          el.addEventListener('touchmove', markCommentsUserScroll, { passive: true });
        });

        // ─── Host buttons ───
        hostEndButton.addEventListener('click', endLivestream);
        const toggleMicHandler = () => {
          hostMicMuted = !hostMicMuted;
          applyHostAudioState();
          refreshHostAudioButtons();
        };
        toggleMicButton.addEventListener('click', toggleMicHandler);

        toggleSystemAudioButton.addEventListener('click', () => {
          hostSystemMuted = !hostSystemMuted;
          applyHostAudioState();
          refreshHostAudioButtons();
        });
        switchSourceButton.addEventListener('click', async () => {
          const next = liveData?.live_source === 'screen' ? 'camera' : 'screen';
          liveData.live_source = next;
          await startHostSource(next, true);
        });

        // Flip camera on mobile (front ↔ rear) — desktop host tool button
        if (flipCameraButton) {
          flipCameraButton.addEventListener('click', async () => {
            currentFacingMode = currentFacingMode === 'environment' ? 'user' : 'environment';
            await startHostSource('camera', true);
            if (hostPreviewVideo) {
              hostPreviewVideo.style.transform = currentFacingMode === 'user' ? 'scaleX(-1)' : '';
            }
          });
        }
        // Flip camera — mobile input row button (same logic)
        if (flipCameraMobileButton) {
          flipCameraMobileButton.addEventListener('click', async () => {
            currentFacingMode = currentFacingMode === 'environment' ? 'user' : 'environment';
            await startHostSource('camera', true);
            if (hostPreviewVideo) {
              hostPreviewVideo.style.transform = currentFacingMode === 'user' ? 'scaleX(-1)' : '';
            }
          });
        }

        loadLivestream().then(async () => {
          refreshReactionButtons();
          await loadComments();
          await heartbeat();
          await pollReactionEvents();
          if (isHostOwner()) {
            startedAt = Date.now();
            await startHostSource(liveData?.live_source || 'camera');
          }
          // Show fullscreen button only for landscape streams (from PC)
          updateFullscreenButtonVisibility();
        });

        commentsTimer = window.setInterval(commentsLoop, 2200);
        heartbeatTimer = window.setInterval(heartbeatLoop, 10000);
        liveStateTimer = window.setInterval(stateLoop, 1200);

        return () => {
          if (commentsTimer) window.clearInterval(commentsTimer);
          if (heartbeatTimer) window.clearInterval(heartbeatTimer);
          if (liveStateTimer) window.clearInterval(liveStateTimer);
          if (overlayTimer) clearTimeout(overlayTimer);
          if (longPressTimer) clearTimeout(longPressTimer);
          // Clean up immersive mode
          document.body.classList.remove('live-immersive-active');
          if (liveShell) liveShell.classList.remove('live-immersive-shell');
          releaseWakeLock();
          // If host mobile navigates away while stream is active, auto-end the stream via API
          if (isHostRoute && !isDesktopClient() && !endedByHost && liveId) {
            const dur = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
            PostsAPI.endLivestream(liveId, dur).catch(() => {});
          }
          if (!endedByHost && ovenLivekit && typeof ovenLivekit.stopStreaming === 'function') {
            try {
              ovenLivekit.stopStreaming();
            } catch (error) {
              console.warn('No se pudo detener la transmision al salir del live:', error);
            }
          }
          hostPublishing = false;
          hostPublishedSource = null;
          if (ovenLivekit && typeof ovenLivekit.remove === 'function') {
            ovenLivekit.remove();
          }
          ovenLivekit = null;
          destroyPlayer();
          stopHostStreams();
        };
      },
    },
    messages: {
      title: 'Mensajes',
      activeNav: 'messages',
      render() {
        return `
          <main class="flex flex-col lg:flex-row bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm min-w-0" style="height:calc(100vh - 7rem);">
            <div class="w-full lg:w-[340px] flex flex-col border-b lg:border-b-0 lg:border-r border-slate-200 bg-white flex-shrink-0">
              <div class="p-4 border-b border-slate-100">
                <div class="flex items-center justify-between gap-3">
                  <div>
                    <h2 class="text-xl font-bold text-slate-900">Mensajes</h2>
                    <p id="messages-summary" class="text-xs text-slate-500 mt-1">Tus conversaciones con amigos apareceran aqui.</p>
                  </div>
                  <span id="messages-count" class="hidden inline-flex min-w-[30px] h-8 px-3 rounded-full bg-slate-100 text-slate-700 text-sm font-bold items-center justify-center"></span>
                </div>
              </div>
              <div class="flex-1 overflow-y-auto custom-scrollbar" id="inbox-list">
                <p class="text-sm text-slate-400 p-4">Cargando conversaciones...</p>
              </div>
            </div>
            <div class="flex-1 flex flex-col bg-[#F6F8FB] min-h-0" id="chat-panel">
              <div class="flex-1 flex items-center justify-center px-6">
                <p class="text-slate-400 text-sm text-center">Selecciona un amigo para empezar a conversar.</p>
              </div>
            </div>
          </main>
        `;
      },
      mount({ container, user, params, router }) {
        return initMessagesView({ container, user, params, router });
      },
    },
    companions: {
      title: 'Companeros',
      activeNav: 'companions',
      render() {
        return `
          <div class="flex flex-col gap-6 w-full">
            <div class="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
              <div class="mb-6 flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div>
                  <h1 class="text-slate-900 mb-2 font-bold tracking-tight text-[28px]">Companeros</h1>
                  <p class="text-slate-500 text-[16px]">Gestiona el directorio social y las personas que bloqueaste.</p>
                </div>
                <div id="companions-directory-filters" class="flex flex-col sm:flex-row gap-4 w-full md:w-auto">
                  <div class="flex-1 sm:w-48">
                    <label class="block text-xs text-slate-500 mb-1 font-medium" for="filter-faculty">Facultad</label>
                    <select id="filter-faculty" class="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:border-[#1B2A6B] focus:ring-1 focus:ring-[#1B2A6B] outline-none">
                      <option value="">Todas las facultades</option>
                      <option value="FAING">FAING</option>
                      <option value="FACEM">FACEM</option>
                      <option value="FAEDCOH">FAEDCOH</option>
                      <option value="FADE">FADE</option>
                      <option value="FACSA">FACSA</option>
                      <option value="FAU">FAU</option>
                    </select>
                    </div>
                  </div>
                </div>
                <div class="flex items-center bg-[#E5E7EB] rounded-full p-1 w-max mb-6">
                  <button type="button" data-companions-tab="directory" class="companions-tab-btn px-5 py-1.5 bg-white rounded-full text-sm font-semibold text-slate-900 shadow-sm">Directorio</button>
                  <button type="button" data-companions-tab="blocked" class="companions-tab-btn px-5 py-1.5 rounded-full text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">Bloqueados</button>
                </div>
                <div id="companions-empty-state" class="hidden rounded-2xl border border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-400"></div>
                <div id="directory-grid" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                  <p class="text-slate-400 text-sm col-span-3 text-center py-8">Cargando companeros...</p>
                </div>
              </div>
            </div>
          `;
        },
        mount({ container, router, user }) {
          const grid = container.querySelector('#directory-grid');
          const filterFaculty = container.querySelector('#filter-faculty');
          const emptyState = container.querySelector('#companions-empty-state');
          const filtersWrap = container.querySelector('#companions-directory-filters');
          const tabButtons = Array.from(container.querySelectorAll('[data-companions-tab]'));
          let activeTab = 'directory';

          function setCompanionsTab(tab) {
            activeTab = tab;
            tabButtons.forEach((button) => {
              const isActive = button.dataset.companionsTab === tab;
              button.classList.toggle('bg-white', isActive);
              button.classList.toggle('shadow-sm', isActive);
              button.classList.toggle('text-slate-900', isActive);
              button.classList.toggle('font-semibold', isActive);
              button.classList.toggle('text-slate-600', !isActive);
              button.classList.toggle('font-medium', !isActive);
            });
            filtersWrap.classList.toggle('hidden', tab !== 'directory');
          }

          function renderCards(users, options = {}) {
            const {
              emptyMessage = 'No hay usuarios para mostrar.',
              blocked = false,
            } = options;

            if (!users.length) {
              grid.innerHTML = '';
              emptyState.textContent = emptyMessage;
              emptyState.classList.remove('hidden');
              return;
            }

            emptyState.classList.add('hidden');
            grid.innerHTML = users.map((directoryUser) => `
              <div class="bg-white rounded-xl border border-slate-200 p-5 flex flex-col items-center text-center hover:shadow-md transition-shadow relative">
                <div class="absolute top-3 right-3">
                  <span class="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold text-white" style="background:${userColor(directoryUser)}">${escapeHtml(directoryUser.faculty || 'UPT')}</span>
                </div>
                ${renderAvatar(directoryUser, { sizeClass: 'w-20 h-20', textClass: 'text-white font-bold text-2xl', extraClass: 'mb-3 border-2 border-slate-100' })}
                <h3 class="font-bold text-[16px] leading-tight text-slate-900 mb-1">${escapeHtml(displayName(directoryUser))}</h3>
                <p class="text-[13px] text-slate-500 mb-4">${escapeHtml(careerLabel(directoryUser) || getUserTypeLabel(directoryUser.user_type || 'student'))}</p>
                <div class="w-full mt-auto flex flex-col gap-2">
                  <button type="button" data-view-profile="${directoryUser.id}" class="w-full py-1.5 px-4 rounded-lg border border-[#1B2A6B] text-[#1B2A6B] font-medium text-sm hover:bg-[#1B2A6B] hover:text-white transition-colors">Ver perfil</button>
                  ${blocked ? `
                    <button type="button" data-unblock-user="${directoryUser.id}" class="w-full py-1.5 px-4 rounded-lg bg-slate-100 text-slate-700 font-medium text-sm hover:bg-slate-200 transition-colors">Desbloquear</button>
                  ` : ''}
                </div>
              </div>
            `).join('');
          }

          async function loadDirectory() {
            const faculty = filterFaculty.value;
            const params = faculty ? `faculty=${faculty}` : '';
            const result = await SocialAPI.getDirectory(params);
            const users = getList(result).filter((directoryUser) => Number(directoryUser.id) !== Number(user.id));

            if (!result?.ok) {
              grid.innerHTML = '';
              emptyState.textContent = 'No se pudieron cargar los companeros.';
              emptyState.classList.remove('hidden');
              return;
            }

            renderCards(users, {
              emptyMessage: 'No se encontraron companeros.',
            });
          }

          async function loadBlockedUsers() {
            const result = await SocialAPI.getBlockedDirectory();
            const users = getList(result).filter((blockedUser) => Number(blockedUser.id) !== Number(user.id));

            if (!result?.ok) {
              grid.innerHTML = '';
              emptyState.textContent = 'No se pudo cargar la lista de bloqueados.';
              emptyState.classList.remove('hidden');
              return;
            }

            renderCards(users, {
              blocked: true,
              emptyMessage: 'No tienes usuarios bloqueados.',
            });
          }

          async function loadActiveTab() {
            grid.innerHTML = '<p class="text-slate-400 text-sm col-span-3 text-center py-8">Cargando...</p>';
            emptyState.classList.add('hidden');

            if (activeTab === 'blocked') {
              await loadBlockedUsers();
              return;
            }

            await loadDirectory();
          }

          async function handleBlocksChanged() {
            await loadActiveTab();
          }

          filterFaculty.addEventListener('change', loadActiveTab);
          tabButtons.forEach((button) => {
            button.addEventListener('click', async () => {
              setCompanionsTab(button.dataset.companionsTab);
              await loadActiveTab();
            });
          });
          grid.addEventListener('click', async (event) => {
            const button = event.target.closest('[data-view-profile]');
            if (button) {
              router.navigate('profile', { id: button.dataset.viewProfile });
              return;
            }

            const unblockButton = event.target.closest('[data-unblock-user]');
            if (!unblockButton) return;

            const result = await SocialAPI.unblockUser(unblockButton.dataset.unblockUser);
            if (result?.ok) {
              showToast('Usuario desbloqueado', 'success');
              window.dispatchEvent(new CustomEvent('blocks:changed'));
              await loadActiveTab();
              return;
            }

            showToast(result?.data?.error || 'No se pudo desbloquear al usuario', 'error');
          });

          setCompanionsTab('directory');
          loadActiveTab();

          window.addEventListener('blocks:changed', handleBlocksChanged);

          return () => {
            window.removeEventListener('blocks:changed', handleBlocksChanged);
          };
      },
    },
    groups: {
      title: 'Grupos',
      activeNav: 'groups',
      render() {
        return `
          <div class="flex flex-col gap-6 w-full">
            <div class="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
              <div class="flex flex-col lg:flex-row lg:items-end justify-between gap-5 mb-6">
                <div>
                  <h1 class="text-slate-900 mb-2 font-bold tracking-tight text-[28px]">Grupos</h1>
                  <p class="text-slate-500 text-[16px]">Descubre comunidades, crea la tuya y gestiona tus espacios.</p>
                </div>
                <div class="w-full lg:w-80">
                  <label class="block text-xs text-slate-500 mb-1 font-medium" for="groups-search">Buscar grupo</label>
                  <input id="groups-search" type="text" class="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-700 focus:border-[#1B2A6B] focus:ring-1 focus:ring-[#1B2A6B] outline-none" placeholder="Nombre o descripcion"/>
                </div>
              </div>
              <div class="flex flex-wrap items-center bg-[#E5E7EB] rounded-full p-1 w-max mb-6">
                <button type="button" data-groups-tab="discover" class="groups-tab-btn px-5 py-1.5 bg-white rounded-full text-sm font-semibold text-slate-900 shadow-sm">Descubrir</button>
                <button type="button" data-groups-tab="mine" class="groups-tab-btn px-5 py-1.5 rounded-full text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">Mis grupos</button>
                <button type="button" data-groups-tab="create" class="groups-tab-btn px-5 py-1.5 rounded-full text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">Crear grupo</button>
              </div>
              <div id="groups-list-section">
                <div id="groups-empty-state" class="hidden rounded-2xl border border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-400"></div>
                <div id="groups-grid" class="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  <p class="text-slate-400 text-sm col-span-2 text-center py-8">Cargando grupos...</p>
                </div>
              </div>
              <div id="groups-create-section" class="hidden">
                <form id="create-group-form" class="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  <div class="space-y-4">
                    <div>
                      <label class="block text-sm font-semibold text-slate-700 mb-1" for="group-name">Nombre</label>
                      <input id="group-name" name="name" required maxlength="150" class="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-700 focus:border-[#1B2A6B] focus:ring-1 focus:ring-[#1B2A6B] outline-none" placeholder="Ej. Comunidad de IA UPT"/>
                    </div>
                    <div>
                      <label class="block text-sm font-semibold text-slate-700 mb-1" for="group-description">Descripcion</label>
                      <textarea id="group-description" name="description" rows="5" class="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-700 focus:border-[#1B2A6B] focus:ring-1 focus:ring-[#1B2A6B] outline-none resize-none" placeholder="Describe el objetivo del grupo"></textarea>
                    </div>
                  </div>
                  <div class="space-y-4">
                    <div>
                      <label class="block text-sm font-semibold text-slate-700 mb-1" for="group-privacy">Privacidad</label>
                      <select id="group-privacy" name="privacy" class="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-700 focus:border-[#1B2A6B] focus:ring-1 focus:ring-[#1B2A6B] outline-none">
                        <option value="public">Publico</option>
                        <option value="private">Privado</option>
                      </select>
                    </div>
                    <div>
                      <label class="block text-sm font-semibold text-slate-700 mb-1" for="group-cover">Portada</label>
                      <input id="group-cover" name="cover" type="file" accept="image/*" class="hidden"/>
                      <div id="group-cover-preview" class="h-40 rounded-2xl border border-slate-200 bg-slate-100 bg-cover bg-center" style="background:linear-gradient(135deg,#1B2A6B 0%,#3C4D91 100%)"></div>
                      <div class="mt-3 flex items-center gap-3">
                        <button id="pick-group-cover-btn" type="button" class="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors">Seleccionar portada</button>
                        <button id="clear-group-cover-btn" type="button" class="hidden px-4 py-2 rounded-xl border border-red-200 text-red-600 text-sm font-medium hover:bg-red-50 transition-colors">Quitar</button>
                      </div>
                    </div>
                    <div class="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 leading-6">
                      En la primera version los grupos incluyen informacion, conversacion, personas y multimedia. Los grupos publicos permiten unirse al instante y los privados requieren aprobacion.
                    </div>
                    <div class="flex justify-end">
                      <button id="create-group-submit" type="submit" class="px-5 py-2.5 rounded-xl bg-[#1B2A6B] text-white text-sm font-semibold hover:bg-[#15215a] transition-colors">Crear grupo</button>
                    </div>
                  </div>
                </form>
              </div>
            </div>
            <div id="group-create-crop-modal" class="fixed inset-0 bg-slate-900/60 hidden items-center justify-center z-50 px-3 py-4">
              <div class="bg-white rounded-[28px] shadow-xl w-full max-w-5xl overflow-hidden flex flex-col">
                <div class="flex items-center justify-between px-6 py-4 border-b border-slate-200">
                  <div>
                    <h3 class="text-lg font-bold text-slate-900">Ajustar portada del grupo</h3>
                    <p class="text-sm text-slate-500">Mueve y acerca la imagen para elegir la parte que quieres mostrar.</p>
                  </div>
                  <button id="group-create-crop-close-btn" type="button" class="w-10 h-10 rounded-full hover:bg-slate-100 transition-colors flex items-center justify-center">
                    <span class="material-symbols-outlined text-[20px]">close</span>
                  </button>
                </div>
                <div class="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_260px] gap-6 p-6">
                  <div id="group-create-crop-stage" class="rounded-[24px] bg-slate-900 overflow-hidden relative aspect-[16/5]">
                    <img id="group-create-crop-image" alt="Previsualizacion de portada del grupo" class="absolute top-0 left-0 max-w-none select-none touch-none cursor-grab active:cursor-grabbing"/>
                  </div>
                  <div class="space-y-4">
                    <div class="rounded-2xl border border-slate-200 p-4">
                      <h4 class="text-sm font-semibold text-slate-900 mb-3">Vista previa</h4>
                      <canvas id="group-create-crop-preview" class="w-full rounded-2xl border border-slate-200 bg-slate-100 aspect-[16/5]"></canvas>
                    </div>
                    <div>
                      <div class="flex items-center justify-between gap-3 mb-2">
                        <label for="group-create-crop-zoom" class="text-sm font-semibold text-slate-900">Zoom</label>
                        <span id="group-create-crop-zoom-label" class="text-xs font-semibold text-slate-500">100%</span>
                      </div>
                      <input id="group-create-crop-zoom" type="range" min="100" max="400" value="100" class="w-full accent-[#1B2A6B]"/>
                    </div>
                    <div class="flex justify-end gap-3">
                      <button id="group-create-crop-cancel-btn" type="button" class="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors">Cancelar</button>
                      <button id="group-create-crop-save-btn" type="button" class="px-4 py-2.5 rounded-xl bg-[#1B2A6B] text-white text-sm font-semibold hover:bg-[#15215a] transition-colors">Usar portada</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        `;
      },
      mount({ container, router }) {
        const grid = container.querySelector('#groups-grid');
        const emptyState = container.querySelector('#groups-empty-state');
        const searchInput = container.querySelector('#groups-search');
        const listSection = container.querySelector('#groups-list-section');
        const createSection = container.querySelector('#groups-create-section');
        const form = container.querySelector('#create-group-form');
        const submitButton = container.querySelector('#create-group-submit');
        const coverInput = container.querySelector('#group-cover');
        const coverPreview = container.querySelector('#group-cover-preview');
        const pickCoverButton = container.querySelector('#pick-group-cover-btn');
        const clearCoverButton = container.querySelector('#clear-group-cover-btn');
        const cropModal = container.querySelector('#group-create-crop-modal');
        const cropStage = container.querySelector('#group-create-crop-stage');
        const cropImage = container.querySelector('#group-create-crop-image');
        const cropPreviewCanvas = container.querySelector('#group-create-crop-preview');
        const cropZoom = container.querySelector('#group-create-crop-zoom');
        const cropZoomLabel = container.querySelector('#group-create-crop-zoom-label');
        const cropSaveButton = container.querySelector('#group-create-crop-save-btn');
        const cropCancelButton = container.querySelector('#group-create-crop-cancel-btn');
        const cropCloseButton = container.querySelector('#group-create-crop-close-btn');
        const tabButtons = Array.from(container.querySelectorAll('[data-groups-tab]'));
        let activeTab = 'discover';
        let searchTimer = null;
        let selectedCoverFile = null;
        const cropState = {
          file: null,
          objectUrl: '',
          image: null,
          naturalWidth: 0,
          naturalHeight: 0,
          viewportWidth: 0,
          viewportHeight: 0,
          minScale: 1,
          scale: 1,
          zoom: 1,
          maxZoom: 4,
          offsetX: 0,
          offsetY: 0,
          pointerId: null,
          dragStartX: 0,
          dragStartY: 0,
          dragOffsetX: 0,
          dragOffsetY: 0,
          saving: false,
        };

        function releaseCropObjectUrl() {
          if (!cropState.objectUrl) return;
          URL.revokeObjectURL(cropState.objectUrl);
          cropState.objectUrl = '';
        }

        function resetCropState(clearInput = false) {
          releaseCropObjectUrl();
          cropState.file = null;
          cropState.image = null;
          cropState.naturalWidth = 0;
          cropState.naturalHeight = 0;
          cropState.viewportWidth = 0;
          cropState.viewportHeight = 0;
          cropState.minScale = 1;
          cropState.scale = 1;
          cropState.zoom = 1;
          cropState.maxZoom = 4;
          cropState.offsetX = 0;
          cropState.offsetY = 0;
          cropState.pointerId = null;
          cropState.saving = false;
          cropImage.removeAttribute('src');
          cropZoom.value = '100';
          cropZoomLabel.textContent = '100%';
          if (clearInput) coverInput.value = '';
        }

        function closeCropModal(clearInput = false) {
          cropModal.classList.add('hidden');
          cropModal.classList.remove('flex');
          resetCropState(clearInput);
        }

        function drawCreateCropPreview() {
          if (!cropState.image) return;
          cropPreviewCanvas.width = 640;
          cropPreviewCanvas.height = 200;
          const context = cropPreviewCanvas.getContext('2d');
          if (!context) return;
          const sourceX = Math.max(0, -cropState.offsetX / cropState.scale);
          const sourceY = Math.max(0, -cropState.offsetY / cropState.scale);
          const sourceWidth = Math.min(cropState.naturalWidth, cropState.viewportWidth / cropState.scale);
          const sourceHeight = Math.min(cropState.naturalHeight, cropState.viewportHeight / cropState.scale);
          context.clearRect(0, 0, cropPreviewCanvas.width, cropPreviewCanvas.height);
          context.drawImage(cropState.image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, cropPreviewCanvas.width, cropPreviewCanvas.height);
        }

        function clampCreateCropAxis(offset, viewportSize, scaledSize) {
          if (scaledSize <= viewportSize) return (viewportSize - scaledSize) / 2;
          const minOffset = viewportSize - scaledSize;
          return Math.min(0, Math.max(minOffset, offset));
        }

        function renderCreateCropStage() {
          if (!cropState.image) return;
          const scaledWidth = cropState.naturalWidth * cropState.scale;
          const scaledHeight = cropState.naturalHeight * cropState.scale;
          cropState.offsetX = clampCreateCropAxis(cropState.offsetX, cropState.viewportWidth, scaledWidth);
          cropState.offsetY = clampCreateCropAxis(cropState.offsetY, cropState.viewportHeight, scaledHeight);
          cropImage.style.width = `${scaledWidth}px`;
          cropImage.style.height = `${scaledHeight}px`;
          cropImage.style.transform = `translate3d(${cropState.offsetX}px, ${cropState.offsetY}px, 0)`;
          cropZoomLabel.textContent = `${Math.round(cropState.zoom * 100)}%`;
          drawCreateCropPreview();
        }

        function initializeCreateCropViewport() {
          if (!cropState.image) return false;
          const rect = cropStage.getBoundingClientRect();
          if (!rect.width || !rect.height) return false;
          cropState.viewportWidth = rect.width;
          cropState.viewportHeight = rect.height;
          cropState.minScale = Math.max(rect.width / cropState.naturalWidth, rect.height / cropState.naturalHeight);
          cropState.zoom = 1;
          cropState.maxZoom = 4;
          cropState.scale = cropState.minScale;
          cropState.offsetX = (rect.width - cropState.naturalWidth * cropState.scale) / 2;
          cropState.offsetY = (rect.height - cropState.naturalHeight * cropState.scale) / 2;
          cropZoom.min = '100';
          cropZoom.max = `${Math.round(cropState.maxZoom * 100)}`;
          cropZoom.value = '100';
          renderCreateCropStage();
          return true;
        }

        function setCreateCropZoom(nextZoom) {
          if (!cropState.image) return;
          const boundedZoom = Math.min(cropState.maxZoom, Math.max(1, nextZoom));
          const previousScale = cropState.scale || cropState.minScale;
          const focusX = cropState.viewportWidth / 2;
          const focusY = cropState.viewportHeight / 2;
          const imageFocusX = (focusX - cropState.offsetX) / previousScale;
          const imageFocusY = (focusY - cropState.offsetY) / previousScale;
          cropState.zoom = boundedZoom;
          cropState.scale = cropState.minScale * cropState.zoom;
          cropState.offsetX = focusX - imageFocusX * cropState.scale;
          cropState.offsetY = focusY - imageFocusY * cropState.scale;
          cropZoom.value = `${Math.round(cropState.zoom * 100)}`;
          renderCreateCropStage();
        }

        async function openCreateCropModal(file) {
          if (!file || !String(file.type || '').startsWith('image/')) {
            showToast('Selecciona un archivo de imagen valido', 'error');
            coverInput.value = '';
            return;
          }
          resetCropState();
          cropState.file = file;
          cropState.objectUrl = URL.createObjectURL(file);
          cropState.image = await new Promise((resolve, reject) => {
            const image = new Image();
            image.onload = () => resolve(image);
            image.onerror = () => reject(new Error('No se pudo cargar la imagen seleccionada.'));
            image.src = cropState.objectUrl;
          });
          cropState.naturalWidth = cropState.image.naturalWidth;
          cropState.naturalHeight = cropState.image.naturalHeight;
          cropImage.src = cropState.objectUrl;
          cropModal.classList.remove('hidden');
          cropModal.classList.add('flex');
          requestAnimationFrame(() => {
            if (!initializeCreateCropViewport()) {
              setTimeout(() => initializeCreateCropViewport(), 40);
            }
          });
        }

        function updateCreateCoverPreview(file = null) {
          if (file) {
            const previewUrl = URL.createObjectURL(file);
            coverPreview.style.backgroundImage = `url('${safeUrl(previewUrl)}')`;
            coverPreview.style.backgroundSize = 'cover';
            coverPreview.style.backgroundPosition = 'center';
            clearCoverButton.classList.remove('hidden');
            setTimeout(() => URL.revokeObjectURL(previewUrl), 0);
            return;
          }
          coverPreview.style.backgroundImage = '';
          coverPreview.style.background = 'linear-gradient(135deg,#1B2A6B 0%,#3C4D91 100%)';
          clearCoverButton.classList.add('hidden');
        }

        function setTab(tab) {
          activeTab = tab;
          tabButtons.forEach((button) => {
            const isActive = button.dataset.groupsTab === tab;
            button.classList.toggle('bg-white', isActive);
            button.classList.toggle('shadow-sm', isActive);
            button.classList.toggle('text-slate-900', isActive);
            button.classList.toggle('font-semibold', isActive);
            button.classList.toggle('text-slate-600', !isActive);
            button.classList.toggle('font-medium', !isActive);
          });

          const showCreate = tab === 'create';
          listSection.classList.toggle('hidden', showCreate);
          createSection.classList.toggle('hidden', !showCreate);
          searchInput.closest('div').classList.toggle('hidden', showCreate);
        }

        function renderGroupCard(group) {
          const membershipLabel = group.is_member
            ? 'Miembro'
            : group.current_membership_status === 'pending'
              ? 'Solicitud enviada'
              : group.privacy === 'public'
                ? 'Publico'
                : 'Privado';

          return `
            <article class="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm hover:shadow-md transition-shadow">
              <button type="button" data-open-group="${group.id}" class="w-full text-left">
                <div class="h-40 bg-slate-200 bg-cover bg-center" style="${group.cover_url ? `background-image:url('${safeUrl(group.cover_url)}')` : 'background:linear-gradient(135deg,#1B2A6B 0%,#3C4D91 100%)'}"></div>
                <div class="p-5">
                  <div class="flex items-start justify-between gap-4 mb-3">
                    <div>
                      <h3 class="text-lg font-bold text-slate-900 leading-tight">${escapeHtml(group.name)}</h3>
                      <p class="text-xs text-slate-500 mt-1">${escapeHtml(group.member_count || 0)} miembros</p>
                    </div>
                    <span class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${group.privacy === 'private' ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}">
                      <span class="material-symbols-outlined text-[14px]">${group.privacy === 'private' ? 'lock' : 'public'}</span>
                      ${group.privacy === 'private' ? 'Privado' : 'Publico'}
                    </span>
                  </div>
                  <p class="text-sm text-slate-600 leading-6 min-h-[72px]">${escapeHtml((group.description || 'Sin descripcion').slice(0, 170))}</p>
                </div>
              </button>
              <div class="px-5 pb-5 flex items-center justify-between gap-3">
                <span class="text-xs font-semibold text-slate-500">${escapeHtml(membershipLabel)}</span>
                <div class="flex items-center gap-2">
                  ${!group.is_member && group.current_membership_status !== 'pending' ? `
                    <button type="button" data-join-group="${group.id}" class="px-4 py-2 rounded-xl bg-[#1B2A6B] text-white text-sm font-semibold hover:bg-[#15215a] transition-colors">
                      ${group.privacy === 'private' ? 'Solicitar ingreso' : 'Unirme'}
                    </button>
                  ` : ''}
                  <button type="button" data-open-group="${group.id}" class="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors">Ver grupo</button>
                </div>
              </div>
            </article>
          `;
        }

        function renderList(groups, emptyMessage) {
          if (!groups.length) {
            grid.innerHTML = '';
            emptyState.textContent = emptyMessage;
            emptyState.classList.remove('hidden');
            return;
          }

          emptyState.classList.add('hidden');
          grid.innerHTML = groups.map(renderGroupCard).join('');
        }

        async function loadDiscover() {
          grid.innerHTML = '<p class="text-slate-400 text-sm col-span-2 text-center py-8">Cargando grupos...</p>';
          emptyState.classList.add('hidden');
          const result = await SocialAPI.discoverGroups(searchInput.value.trim());
          if (!result?.ok) {
            renderList([], 'No se pudieron cargar los grupos.');
            return;
          }

          const discoverableGroups = getList(result).filter((group) => !group.is_member);
          renderList(discoverableGroups, 'No se encontraron grupos con esos criterios.');
        }

        async function loadMine() {
          grid.innerHTML = '<p class="text-slate-400 text-sm col-span-2 text-center py-8">Cargando grupos...</p>';
          emptyState.classList.add('hidden');
          const result = await SocialAPI.getMyGroups();
          if (!result?.ok) {
            renderList([], 'No se pudieron cargar tus grupos.');
            return;
          }

          renderList(getList(result), 'Todavia no perteneces a ningun grupo.');
        }

        async function loadActiveTab() {
          if (activeTab === 'mine') {
            await loadMine();
            return;
          }
          if (activeTab === 'discover') {
            await loadDiscover();
          }
        }

        searchInput.addEventListener('input', () => {
          if (activeTab !== 'discover') return;
          clearTimeout(searchTimer);
          searchTimer = setTimeout(() => {
            loadDiscover();
          }, 280);
        });

        tabButtons.forEach((button) => {
          button.addEventListener('click', async () => {
            setTab(button.dataset.groupsTab);
            await loadActiveTab();
          });
        });

        grid.addEventListener('click', async (event) => {
          const openButton = event.target.closest('[data-open-group]');
          if (openButton) {
            router.navigate('group', { id: openButton.dataset.openGroup });
            return;
          }

          const joinButton = event.target.closest('[data-join-group]');
          if (!joinButton) return;

          const result = await SocialAPI.joinGroup(joinButton.dataset.joinGroup);
          if (result?.ok) {
            showToast(result.data?.message || 'Solicitud enviada', 'success');
            await loadActiveTab();
            return;
          }

          showToast(result?.data?.error || 'No se pudo procesar la solicitud', 'error');
        });

        form.addEventListener('submit', async (event) => {
          event.preventDefault();
          submitButton.disabled = true;
          submitButton.textContent = 'Creando...';

          const payload = {
            name: form.name.value.trim(),
            description: form.description.value.trim(),
            privacy: form.privacy.value,
            coverFile: selectedCoverFile,
          };

          const result = await SocialAPI.createGroup(payload);
          submitButton.disabled = false;
          submitButton.textContent = 'Crear grupo';

          if (result?.ok) {
            showToast('Grupo creado', 'success');
            router.navigate('group', { id: result.data.id });
            return;
          }

          showToast(result?.data?.error || 'No se pudo crear el grupo', 'error');
        });

        pickCoverButton.addEventListener('click', () => coverInput.click());
        clearCoverButton.addEventListener('click', () => {
          selectedCoverFile = null;
          coverInput.value = '';
          updateCreateCoverPreview(null);
        });
        coverInput.addEventListener('change', async (event) => {
          const [file] = event.target.files || [];
          if (!file) return;
          try {
            await openCreateCropModal(file);
          } catch (error) {
            showToast(error.message || 'No se pudo preparar la portada', 'error');
            closeCropModal(true);
          }
        });
        cropZoom.addEventListener('input', (event) => {
          setCreateCropZoom(Number(event.target.value) / 100);
        });
        cropCancelButton.addEventListener('click', () => closeCropModal(true));
        cropCloseButton.addEventListener('click', () => closeCropModal(true));
        cropModal.addEventListener('click', (event) => {
          if (event.target === cropModal) closeCropModal(true);
        });
        cropStage.addEventListener('pointerdown', (event) => {
          if (!cropState.image || cropState.saving) return;
          cropState.pointerId = event.pointerId;
          cropState.dragStartX = event.clientX;
          cropState.dragStartY = event.clientY;
          cropState.dragOffsetX = cropState.offsetX;
          cropState.dragOffsetY = cropState.offsetY;
          cropStage.setPointerCapture(event.pointerId);
          event.preventDefault();
        });
        cropStage.addEventListener('pointermove', (event) => {
          if (cropState.pointerId !== event.pointerId) return;
          cropState.offsetX = cropState.dragOffsetX + (event.clientX - cropState.dragStartX);
          cropState.offsetY = cropState.dragOffsetY + (event.clientY - cropState.dragStartY);
          renderCreateCropStage();
          event.preventDefault();
        });
        const stopCreateCropDrag = (event) => {
          if (cropState.pointerId === null) return;
          if (event && cropState.pointerId !== event.pointerId) return;
          if (event && cropStage.hasPointerCapture(event.pointerId)) {
            cropStage.releasePointerCapture(event.pointerId);
          }
          cropState.pointerId = null;
        };
        cropStage.addEventListener('pointerup', stopCreateCropDrag);
        cropStage.addEventListener('pointercancel', stopCreateCropDrag);
        cropStage.addEventListener('lostpointercapture', () => {
          cropState.pointerId = null;
        });
        cropSaveButton.addEventListener('click', async () => {
          if (!cropState.image || cropState.saving) return;
          cropState.saving = true;
          cropSaveButton.disabled = true;
          cropSaveButton.textContent = 'Preparando...';
          try {
            const canvas = document.createElement('canvas');
            canvas.width = 1600;
            canvas.height = 500;
            const context = canvas.getContext('2d');
            const sourceX = Math.max(0, -cropState.offsetX / cropState.scale);
            const sourceY = Math.max(0, -cropState.offsetY / cropState.scale);
            const sourceWidth = Math.min(cropState.naturalWidth, cropState.viewportWidth / cropState.scale);
            const sourceHeight = Math.min(cropState.naturalHeight, cropState.viewportHeight / cropState.scale);
            context.drawImage(cropState.image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);
            const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
            if (!blob) throw new Error('No se pudo preparar la portada');
            selectedCoverFile = new File([blob], `group-cover-${Date.now()}.jpg`, { type: 'image/jpeg' });
            updateCreateCoverPreview(selectedCoverFile);
            closeCropModal(false);
          } catch (error) {
            showToast(error.message || 'No se pudo preparar la portada', 'error');
          } finally {
            cropState.saving = false;
            cropSaveButton.disabled = false;
            cropSaveButton.textContent = 'Usar portada';
          }
        });

        setTab('discover');
        loadActiveTab();
      },
    },
    group: {
      title: 'Grupo',
      activeNav: 'groups',
      render() {
        return `
          <div class="max-w-6xl mx-auto w-full space-y-6">
            <div id="group-shell" class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div class="h-52 md:h-64 bg-slate-200 bg-cover bg-center" id="group-cover-shell" style="background:linear-gradient(135deg,#1B2A6B 0%,#3C4D91 100%)"></div>
              <div class="px-6 py-5">
                <div class="flex flex-col lg:flex-row lg:items-start justify-between gap-5">
                  <div class="space-y-2">
                    <div class="flex items-center gap-2 flex-wrap">
                      <h1 id="group-title" class="text-3xl font-bold text-slate-900">Cargando grupo...</h1>
                      <span id="group-privacy-badge" class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold bg-slate-100 text-slate-600 border border-slate-200"></span>
                    </div>
                    <p id="group-description" class="text-sm text-slate-600 leading-6 max-w-3xl"></p>
                    <div class="flex items-center gap-3 flex-wrap text-sm text-slate-500">
                      <span id="group-member-count">0 miembros</span>
                      <span>&middot;</span>
                      <span id="group-creator-label">-</span>
                    </div>
                  </div>
                  <div id="group-actions" class="flex flex-wrap gap-3"></div>
                </div>
                <div class="flex flex-wrap items-center bg-[#E5E7EB] rounded-full p-1 w-max mt-6" id="group-tab-bar">
                  <button type="button" data-group-tab="info" class="group-tab-btn px-5 py-1.5 bg-white rounded-full text-sm font-semibold text-slate-900 shadow-sm">Informacion</button>
                  <button type="button" data-group-tab="conversation" class="group-tab-btn px-5 py-1.5 rounded-full text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">Conversacion</button>
                  <button type="button" data-group-tab="people" class="group-tab-btn px-5 py-1.5 rounded-full text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">Personas</button>
                  <button type="button" data-group-tab="media" class="group-tab-btn px-5 py-1.5 rounded-full text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">Multimedia</button>
                </div>
              </div>
            </div>

            <section id="group-tab-info" class="space-y-6"></section>
            <section id="group-tab-conversation" class="space-y-6 hidden"></section>
            <section id="group-tab-people" class="space-y-6 hidden"></section>
            <section id="group-tab-media" class="space-y-6 hidden"></section>

            <div id="group-edit-modal" class="fixed inset-0 bg-slate-900/60 hidden items-center justify-center z-50 px-3 py-4">
              <div class="bg-white rounded-[28px] shadow-xl w-full max-w-3xl overflow-hidden flex flex-col">
                <div class="flex items-center justify-between px-6 py-4 border-b border-slate-200">
                  <div>
                    <h3 class="text-lg font-bold text-slate-900">Editar grupo</h3>
                    <p class="text-sm text-slate-500">Actualiza la informacion principal y la portada del grupo.</p>
                  </div>
                  <button id="close-group-edit-modal-btn" type="button" class="w-10 h-10 rounded-full hover:bg-slate-100 transition-colors flex items-center justify-center">
                    <span class="material-symbols-outlined text-[20px]">close</span>
                  </button>
                </div>
                <form id="edit-group-modal-form" class="p-6 space-y-5">
                  <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    <div class="space-y-4">
                      <div>
                        <label class="block text-sm font-semibold text-slate-700 mb-1" for="edit-group-name">Nombre</label>
                        <input id="edit-group-name" name="name" class="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-700 focus:border-[#1B2A6B] focus:ring-1 focus:ring-[#1B2A6B] outline-none"/>
                      </div>
                      <div>
                        <label class="block text-sm font-semibold text-slate-700 mb-1" for="edit-group-privacy">Privacidad</label>
                        <select id="edit-group-privacy" name="privacy" class="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-700 focus:border-[#1B2A6B] focus:ring-1 focus:ring-[#1B2A6B] outline-none">
                          <option value="public">Publico</option>
                          <option value="private">Privado</option>
                        </select>
                      </div>
                      <div>
                        <label class="block text-sm font-semibold text-slate-700 mb-1" for="edit-group-description">Descripcion</label>
                        <textarea id="edit-group-description" name="description" rows="6" class="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-700 focus:border-[#1B2A6B] focus:ring-1 focus:ring-[#1B2A6B] outline-none resize-none"></textarea>
                      </div>
                    </div>
                    <div class="space-y-4">
                      <div>
                        <label class="block text-sm font-semibold text-slate-700 mb-1" for="edit-group-cover-input">Portada</label>
                        <input id="edit-group-cover-input" name="cover" type="file" accept="image/*" class="hidden"/>
                        <div id="edit-group-cover-preview" class="h-40 rounded-2xl border border-slate-200 bg-slate-100 bg-cover bg-center" style="background:linear-gradient(135deg,#1B2A6B 0%,#3C4D91 100%)"></div>
                        <div class="mt-3 flex items-center gap-3">
                          <button id="pick-edit-group-cover-btn" type="button" class="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors">Cambiar portada</button>
                          <button id="clear-edit-group-cover-btn" type="button" class="hidden px-4 py-2 rounded-xl border border-red-200 text-red-600 text-sm font-medium hover:bg-red-50 transition-colors">Quitar cambio</button>
                        </div>
                      </div>
                      <div class="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 leading-6">
                        La portada se ajusta antes de guardarse para que puedas elegir exactamente la parte visible del grupo.
                      </div>
                    </div>
                  </div>
                  <div class="flex justify-end gap-3 pt-2">
                    <button id="cancel-group-edit-modal-btn" type="button" class="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors">Cancelar</button>
                    <button id="save-group-edit-modal-btn" type="submit" class="px-5 py-2.5 rounded-xl bg-[#1B2A6B] text-white text-sm font-semibold hover:bg-[#15215a] transition-colors">Guardar cambios</button>
                  </div>
                </form>
              </div>
            </div>

            <div id="group-edit-crop-modal" class="fixed inset-0 bg-slate-900/60 hidden items-center justify-center z-50 px-3 py-4">
              <div class="bg-white rounded-[28px] shadow-xl w-full max-w-5xl overflow-hidden flex flex-col">
                <div class="flex items-center justify-between px-6 py-4 border-b border-slate-200">
                  <div>
                    <h3 class="text-lg font-bold text-slate-900">Ajustar portada del grupo</h3>
                    <p class="text-sm text-slate-500">Mueve y acerca la imagen para elegir la parte que quieres mostrar.</p>
                  </div>
                  <button id="group-edit-crop-close-btn" type="button" class="w-10 h-10 rounded-full hover:bg-slate-100 transition-colors flex items-center justify-center">
                    <span class="material-symbols-outlined text-[20px]">close</span>
                  </button>
                </div>
                <div class="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_260px] gap-6 p-6">
                  <div id="group-edit-crop-stage" class="rounded-[24px] bg-slate-900 overflow-hidden relative aspect-[16/5]">
                    <img id="group-edit-crop-image" alt="Previsualizacion de portada del grupo" class="absolute top-0 left-0 max-w-none select-none touch-none cursor-grab active:cursor-grabbing"/>
                  </div>
                  <div class="space-y-4">
                    <div class="rounded-2xl border border-slate-200 p-4">
                      <h4 class="text-sm font-semibold text-slate-900 mb-3">Vista previa</h4>
                      <canvas id="group-edit-crop-preview" class="w-full rounded-2xl border border-slate-200 bg-slate-100 aspect-[16/5]"></canvas>
                    </div>
                    <div>
                      <div class="flex items-center justify-between gap-3 mb-2">
                        <label for="group-edit-crop-zoom" class="text-sm font-semibold text-slate-900">Zoom</label>
                        <span id="group-edit-crop-zoom-label" class="text-xs font-semibold text-slate-500">100%</span>
                      </div>
                      <input id="group-edit-crop-zoom" type="range" min="100" max="400" value="100" class="w-full accent-[#1B2A6B]"/>
                    </div>
                    <div class="flex justify-end gap-3">
                      <button id="group-edit-crop-cancel-btn" type="button" class="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors">Cancelar</button>
                      <button id="group-edit-crop-save-btn" type="button" class="px-4 py-2.5 rounded-xl bg-[#1B2A6B] text-white text-sm font-semibold hover:bg-[#15215a] transition-colors">Usar portada</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div id="group-comment-modal" class="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-50 hidden px-3 py-4">
              <div class="post-comments-modal bg-white rounded-[28px] shadow-xl w-full overflow-hidden flex flex-col">
                <div class="post-comments-topbar">
                  <h3 class="post-comments-topbar-title">Publicacion</h3>
                  <button id="group-close-comment-top-btn" type="button" class="post-comments-topbar-close" aria-label="Cerrar comentarios de grupo">
                    <span class="material-symbols-outlined text-[20px]">close</span>
                  </button>
                </div>
                <div class="post-comments-body">
                  <div class="post-comments-scroll custom-scrollbar">
                    <div id="group-comment-post-preview" class="post-comments-preview"></div>
                    <div class="post-comments-side">
                      <div class="post-comments-section-head">
                        <span class="post-comments-section-title">Comentarios</span>
                        <select id="group-comment-sort" class="post-comments-sort">
                          <option value="newest">Mas recientes</option>
                          <option value="oldest">Mas antiguos</option>
                        </select>
                      </div>
                      <div id="group-comment-list" class="post-comments-list">
                        <p class="text-sm text-slate-400 text-center">Selecciona una publicacion para ver sus comentarios.</p>
                      </div>
                    </div>
                  </div>
                  <div class="post-comments-compose">
                    <div class="post-comments-compose-row">
                      <textarea id="group-comment-input" class="post-comments-compose-input" rows="1" placeholder="Escribe un comentario..."></textarea>
                      <button id="group-confirm-comment-btn" type="button" class="post-comments-compose-send" aria-label="Enviar comentario">
                        <span class="material-symbols-outlined text-[18px]">send</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        `;
      },
      mount({ container, user, params, router }) {
        const groupId = Number(params.id);
        const cover = container.querySelector('#group-cover-shell');
        const title = container.querySelector('#group-title');
        const description = container.querySelector('#group-description');
        const memberCount = container.querySelector('#group-member-count');
        const creatorLabel = container.querySelector('#group-creator-label');
        const privacyBadge = container.querySelector('#group-privacy-badge');
        const actionsWrap = container.querySelector('#group-actions');
        const infoTab = container.querySelector('#group-tab-info');
        const conversationTab = container.querySelector('#group-tab-conversation');
        const peopleTab = container.querySelector('#group-tab-people');
        const mediaTab = container.querySelector('#group-tab-media');
        const tabButtons = Array.from(container.querySelectorAll('[data-group-tab]'));
        const editModal = container.querySelector('#group-edit-modal');
        const editForm = container.querySelector('#edit-group-modal-form');
        const editNameInput = container.querySelector('#edit-group-name');
        const editPrivacyInput = container.querySelector('#edit-group-privacy');
        const editDescriptionInput = container.querySelector('#edit-group-description');
        const editCoverInput = container.querySelector('#edit-group-cover-input');
        const editCoverPreview = container.querySelector('#edit-group-cover-preview');
        const pickEditCoverButton = container.querySelector('#pick-edit-group-cover-btn');
        const clearEditCoverButton = container.querySelector('#clear-edit-group-cover-btn');
        const closeEditModalButton = container.querySelector('#close-group-edit-modal-btn');
        const cancelEditModalButton = container.querySelector('#cancel-group-edit-modal-btn');
        const saveEditModalButton = container.querySelector('#save-group-edit-modal-btn');
        const editCropModal = container.querySelector('#group-edit-crop-modal');
        const editCropStage = container.querySelector('#group-edit-crop-stage');
        const editCropImage = container.querySelector('#group-edit-crop-image');
        const editCropPreviewCanvas = container.querySelector('#group-edit-crop-preview');
        const editCropZoom = container.querySelector('#group-edit-crop-zoom');
        const editCropZoomLabel = container.querySelector('#group-edit-crop-zoom-label');
        const editCropSaveButton = container.querySelector('#group-edit-crop-save-btn');
        const editCropCancelButton = container.querySelector('#group-edit-crop-cancel-btn');
        const editCropCloseButton = container.querySelector('#group-edit-crop-close-btn');
        const commentModal = container.querySelector('#group-comment-modal');
        const commentPostPreview = container.querySelector('#group-comment-post-preview');
        const commentList = container.querySelector('#group-comment-list');
        const commentSort = container.querySelector('#group-comment-sort');
        const commentInput = container.querySelector('#group-comment-input');
        let groupData = null;
        let groupPosts = [];
        let currentTab = 'info';
        let selectedImageFile = null;
        let selectedEditCoverFile = null;
        let pendingCommentPostId = null;
        let currentCommentSort = 'newest';
        const editCropState = {
          file: null,
          objectUrl: '',
          image: null,
          naturalWidth: 0,
          naturalHeight: 0,
          viewportWidth: 0,
          viewportHeight: 0,
          minScale: 1,
          scale: 1,
          zoom: 1,
          maxZoom: 4,
          offsetX: 0,
          offsetY: 0,
          pointerId: null,
          dragStartX: 0,
          dragStartY: 0,
          dragOffsetX: 0,
          dragOffsetY: 0,
          saving: false,
        };

        function setTab(tab) {
          currentTab = tab;
          tabButtons.forEach((button) => {
            const isActive = button.dataset.groupTab === tab;
            button.classList.toggle('bg-white', isActive);
            button.classList.toggle('shadow-sm', isActive);
            button.classList.toggle('text-slate-900', isActive);
            button.classList.toggle('font-semibold', isActive);
            button.classList.toggle('text-slate-600', !isActive);
            button.classList.toggle('font-medium', !isActive);
          });
          infoTab.classList.toggle('hidden', tab !== 'info');
          conversationTab.classList.toggle('hidden', tab !== 'conversation');
          peopleTab.classList.toggle('hidden', tab !== 'people');
          mediaTab.classList.toggle('hidden', tab !== 'media');
        }

        function groupCanManage() {
          return !!groupData?.is_admin;
        }

        function updateEditCoverPreview(file = null) {
          if (file) {
            const previewUrl = URL.createObjectURL(file);
            editCoverPreview.style.backgroundImage = `url('${safeUrl(previewUrl)}')`;
            editCoverPreview.style.backgroundSize = 'cover';
            editCoverPreview.style.backgroundPosition = 'center';
            clearEditCoverButton.classList.remove('hidden');
            setTimeout(() => URL.revokeObjectURL(previewUrl), 0);
            return;
          }

          if (groupData?.cover_url) {
            editCoverPreview.style.backgroundImage = `url('${safeUrl(groupData.cover_url)}')`;
            editCoverPreview.style.backgroundSize = 'cover';
            editCoverPreview.style.backgroundPosition = 'center';
            clearEditCoverButton.classList.add('hidden');
            return;
          }

          editCoverPreview.style.backgroundImage = '';
          editCoverPreview.style.background = 'linear-gradient(135deg,#1B2A6B 0%,#3C4D91 100%)';
          clearEditCoverButton.classList.add('hidden');
        }

        function releaseEditCropObjectUrl() {
          if (!editCropState.objectUrl) return;
          URL.revokeObjectURL(editCropState.objectUrl);
          editCropState.objectUrl = '';
        }

        function resetEditCropState(clearInput = false) {
          releaseEditCropObjectUrl();
          editCropState.file = null;
          editCropState.image = null;
          editCropState.naturalWidth = 0;
          editCropState.naturalHeight = 0;
          editCropState.viewportWidth = 0;
          editCropState.viewportHeight = 0;
          editCropState.minScale = 1;
          editCropState.scale = 1;
          editCropState.zoom = 1;
          editCropState.maxZoom = 4;
          editCropState.offsetX = 0;
          editCropState.offsetY = 0;
          editCropState.pointerId = null;
          editCropState.saving = false;
          editCropImage.removeAttribute('src');
          editCropZoom.value = '100';
          editCropZoomLabel.textContent = '100%';
          if (clearInput) editCoverInput.value = '';
        }

        function closeEditCropModal(clearInput = false) {
          editCropModal.classList.add('hidden');
          editCropModal.classList.remove('flex');
          resetEditCropState(clearInput);
        }

        function drawEditCropPreview() {
          if (!editCropState.image) return;
          editCropPreviewCanvas.width = 640;
          editCropPreviewCanvas.height = 200;
          const context = editCropPreviewCanvas.getContext('2d');
          if (!context) return;
          const sourceX = Math.max(0, -editCropState.offsetX / editCropState.scale);
          const sourceY = Math.max(0, -editCropState.offsetY / editCropState.scale);
          const sourceWidth = Math.min(editCropState.naturalWidth, editCropState.viewportWidth / editCropState.scale);
          const sourceHeight = Math.min(editCropState.naturalHeight, editCropState.viewportHeight / editCropState.scale);
          context.clearRect(0, 0, editCropPreviewCanvas.width, editCropPreviewCanvas.height);
          context.drawImage(editCropState.image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, editCropPreviewCanvas.width, editCropPreviewCanvas.height);
        }

        function clampEditCropAxis(offset, viewportSize, scaledSize) {
          if (scaledSize <= viewportSize) return (viewportSize - scaledSize) / 2;
          const minOffset = viewportSize - scaledSize;
          return Math.min(0, Math.max(minOffset, offset));
        }

        function renderEditCropStage() {
          if (!editCropState.image) return;
          const scaledWidth = editCropState.naturalWidth * editCropState.scale;
          const scaledHeight = editCropState.naturalHeight * editCropState.scale;
          editCropState.offsetX = clampEditCropAxis(editCropState.offsetX, editCropState.viewportWidth, scaledWidth);
          editCropState.offsetY = clampEditCropAxis(editCropState.offsetY, editCropState.viewportHeight, scaledHeight);
          editCropImage.style.width = `${scaledWidth}px`;
          editCropImage.style.height = `${scaledHeight}px`;
          editCropImage.style.transform = `translate3d(${editCropState.offsetX}px, ${editCropState.offsetY}px, 0)`;
          editCropZoomLabel.textContent = `${Math.round(editCropState.zoom * 100)}%`;
          drawEditCropPreview();
        }

        function initializeEditCropViewport() {
          if (!editCropState.image) return false;
          const rect = editCropStage.getBoundingClientRect();
          if (!rect.width || !rect.height) return false;
          editCropState.viewportWidth = rect.width;
          editCropState.viewportHeight = rect.height;
          editCropState.minScale = Math.max(rect.width / editCropState.naturalWidth, rect.height / editCropState.naturalHeight);
          editCropState.zoom = 1;
          editCropState.maxZoom = 4;
          editCropState.scale = editCropState.minScale;
          editCropState.offsetX = (rect.width - editCropState.naturalWidth * editCropState.scale) / 2;
          editCropState.offsetY = (rect.height - editCropState.naturalHeight * editCropState.scale) / 2;
          editCropZoom.min = '100';
          editCropZoom.max = `${Math.round(editCropState.maxZoom * 100)}`;
          editCropZoom.value = '100';
          renderEditCropStage();
          return true;
        }

        function setEditCropZoom(nextZoom) {
          if (!editCropState.image) return;
          const boundedZoom = Math.min(editCropState.maxZoom, Math.max(1, nextZoom));
          const previousScale = editCropState.scale || editCropState.minScale;
          const focusX = editCropState.viewportWidth / 2;
          const focusY = editCropState.viewportHeight / 2;
          const imageFocusX = (focusX - editCropState.offsetX) / previousScale;
          const imageFocusY = (focusY - editCropState.offsetY) / previousScale;
          editCropState.zoom = boundedZoom;
          editCropState.scale = editCropState.minScale * editCropState.zoom;
          editCropState.offsetX = focusX - imageFocusX * editCropState.scale;
          editCropState.offsetY = focusY - imageFocusY * editCropState.scale;
          editCropZoom.value = `${Math.round(editCropState.zoom * 100)}`;
          renderEditCropStage();
        }

        async function openEditCropModal(file) {
          if (!file || !String(file.type || '').startsWith('image/')) {
            showToast('Selecciona un archivo de imagen valido', 'error');
            editCoverInput.value = '';
            return;
          }
          resetEditCropState();
          editCropState.file = file;
          editCropState.objectUrl = URL.createObjectURL(file);
          editCropState.image = await new Promise((resolve, reject) => {
            const image = new Image();
            image.onload = () => resolve(image);
            image.onerror = () => reject(new Error('No se pudo cargar la imagen seleccionada.'));
            image.src = editCropState.objectUrl;
          });
          editCropState.naturalWidth = editCropState.image.naturalWidth;
          editCropState.naturalHeight = editCropState.image.naturalHeight;
          editCropImage.src = editCropState.objectUrl;
          editCropModal.classList.remove('hidden');
          editCropModal.classList.add('flex');
          requestAnimationFrame(() => {
            if (!initializeEditCropViewport()) {
              setTimeout(() => initializeEditCropViewport(), 40);
            }
          });
        }

        function openEditModal() {
          if (!groupData) return;
          selectedEditCoverFile = null;
          editCoverInput.value = '';
          editNameInput.value = groupData.name || '';
          editPrivacyInput.value = groupData.privacy || 'public';
          editDescriptionInput.value = groupData.description || '';
          updateEditCoverPreview(null);
          editModal.classList.remove('hidden');
          editModal.classList.add('flex');
        }

        function closeEditModal() {
          editModal.classList.add('hidden');
          editModal.classList.remove('flex');
          selectedEditCoverFile = null;
          editCoverInput.value = '';
          updateEditCoverPreview(null);
        }

        function findGroupPost(postId) {
          return groupPosts.find((post) => Number(post.id) === Number(postId)) || null;
        }

        function renderHeader() {
          if (!groupData) return;
          title.textContent = groupData.name;
          description.textContent = groupData.description || 'Este grupo todavia no tiene una descripcion.';
          memberCount.textContent = `${groupData.member_count || 0} miembros`;
          creatorLabel.textContent = `Creador: ${displayName(groupData.creator || { full_name: 'Usuario' })}`;
          privacyBadge.innerHTML = `
            <span class="material-symbols-outlined text-[14px]">${groupData.privacy === 'private' ? 'lock' : 'public'}</span>
            ${groupData.privacy === 'private' ? 'Privado' : 'Publico'}
          `;
          privacyBadge.className = `inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold border ${groupData.privacy === 'private' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`;

          if (groupData.cover_url) {
            cover.style.backgroundImage = `url('${safeUrl(groupData.cover_url)}')`;
            cover.style.backgroundSize = 'cover';
            cover.style.backgroundPosition = 'center';
          }

          const actionButtons = [];
          if (groupData.is_member) {
            actionButtons.push(`<button type="button" data-leave-group class="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors">Salir del grupo</button>`);
          } else if (groupData.current_membership_status === 'pending') {
            actionButtons.push(`<span class="px-4 py-2 rounded-xl bg-amber-50 text-amber-700 text-sm font-semibold border border-amber-200">Solicitud pendiente</span>`);
          } else {
            actionButtons.push(`<button type="button" data-join-group class="px-4 py-2 rounded-xl bg-[#1B2A6B] text-white text-sm font-semibold hover:bg-[#15215a] transition-colors">${groupData.privacy === 'private' ? 'Solicitar ingreso' : 'Unirme al grupo'}</button>`);
          }

          if (groupCanManage()) {
            actionButtons.push(`<button type="button" data-edit-group class="px-4 py-2 rounded-xl border border-[#1B2A6B] text-[#1B2A6B] text-sm font-semibold hover:bg-[#1B2A6B] hover:text-white transition-colors">Editar grupo</button>`);
          }

          actionsWrap.innerHTML = actionButtons.join('');
        }

        function renderInfoTab() {
          if (!groupData) return;
          infoTab.innerHTML = `
            <div class="grid grid-cols-1 xl:grid-cols-3 gap-6">
              <div class="xl:col-span-2 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                <h2 class="text-lg font-bold text-slate-900 mb-3">Sobre este grupo</h2>
                <p class="text-sm text-slate-600 leading-7">${escapeHtml(groupData.description || 'Sin descripcion todavia.')}</p>
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
                  <div class="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Privacidad</p>
                    <p class="mt-2 text-sm font-semibold text-slate-800">${groupData.privacy === 'private' ? 'Privado' : 'Publico'}</p>
                  </div>
                  <div class="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Miembros</p>
                    <p class="mt-2 text-sm font-semibold text-slate-800">${groupData.member_count || 0}</p>
                  </div>
                  <div class="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Creador</p>
                    <p class="mt-2 text-sm font-semibold text-slate-800">${escapeHtml(displayName(groupData.creator || { full_name: 'Usuario' }))}</p>
                  </div>
                </div>
              </div>
              <div class="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                <h2 class="text-lg font-bold text-slate-900 mb-3">Estado</h2>
                <div class="space-y-3 text-sm text-slate-600">
                  <p>Rol actual: <span class="font-semibold text-slate-800">${escapeHtml(groupData.current_role || 'Visitante')}</span></p>
                  <p>Acceso a conversacion: <span class="font-semibold text-slate-800">${groupData.can_view_conversation ? 'Si' : 'No'}</span></p>
                </div>
              </div>
            </div>
            `;
          }

        function renderConversationTabSkeleton() {
          if (!groupData?.can_view_conversation) {
            conversationTab.innerHTML = `
              <div class="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm text-center">
                <p class="text-slate-600 text-sm">Debes pertenecer al grupo para ver y publicar en la conversacion.</p>
              </div>
            `;
            return;
          }

          conversationTab.innerHTML = `
            <div class="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
              <div class="flex items-start gap-4">
                <div class="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0 bg-cover bg-center" id="group-composer-avatar" style="background:#1B2A6B">U</div>
                <div class="flex-1">
                  <textarea id="group-post-content" rows="3" class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 focus:border-[#1B2A6B] focus:ring-1 focus:ring-[#1B2A6B] outline-none resize-none" placeholder="Comparte algo con tu grupo"></textarea>
                  <div id="group-image-preview-wrap" class="hidden mt-3 relative rounded-2xl overflow-hidden border border-slate-200">
                    <img id="group-image-preview" class="w-full max-h-64 object-cover" alt="Vista previa de imagen del grupo"/>
                    <button id="group-clear-image-btn" type="button" class="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/60 text-white hover:bg-black/75 transition-colors">x</button>
                  </div>
                </div>
              </div>
              <input type="file" id="group-file-input" accept="image/*" class="hidden"/>
              <div class="mt-4 flex flex-wrap justify-between gap-3">
                <button id="group-pick-image-btn" type="button" class="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
                  <span class="material-symbols-outlined text-[18px]">image</span>
                  Agregar imagen
                </button>
                <button id="group-publish-btn" type="button" class="px-5 py-2 rounded-xl bg-[#E5D59A] text-[#5A4A1A] text-sm font-bold hover:bg-[#d8c686] transition-colors">Publicar</button>
              </div>
            </div>
            <div id="group-posts-list" class="space-y-4">
              <div class="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm text-center text-sm text-slate-400">Cargando publicaciones...</div>
            </div>
          `;
        }

        function openCommentModal(postId) {
          pendingCommentPostId = Number(postId);
          commentInput.value = '';
          commentSort.value = currentCommentSort;
          commentModal.classList.remove('hidden');
          commentModal.classList.add('flex');
          commentPostPreview.innerHTML = renderPostModalPreview(findGroupPost(postId), user.id);
          loadComments(postId, currentCommentSort);
        }

        function closeCommentModal() {
          pendingCommentPostId = null;
          commentModal.classList.add('hidden');
          commentModal.classList.remove('flex');
          commentPostPreview.innerHTML = '';
          commentList.innerHTML = '<p class="text-sm text-slate-400 text-center">Selecciona una publicacion para ver sus comentarios.</p>';
        }

        async function loadComments(postId = pendingCommentPostId, sort = currentCommentSort) {
          if (!postId) return;
          currentCommentSort = sort;
          commentSort.value = sort;
          commentList.innerHTML = '<p class="text-sm text-slate-400 text-center">Cargando comentarios...</p>';
          const result = await PostsAPI.getComments(postId, sort);
          if (!result?.ok) {
            commentList.innerHTML = '<p class="text-sm text-slate-400 text-center">No se pudieron cargar los comentarios.</p>';
            return;
          }

          const comments = getList(result);
          if (!comments.length) {
            commentList.innerHTML = '<p class="text-sm text-slate-400 text-center">No hay comentarios todavia.</p>';
            return;
          }

          commentList.innerHTML = comments.map((comment) => {
            const canDelete = Number(comment.user_id) === Number(user.id) || groupCanManage();
            return renderCommentCard(comment, {
              footerActions: canDelete ? `
                <button type="button" data-group-delete-comment="${comment.id}" class="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-[11px] font-semibold text-red-600 transition-colors hover:bg-red-50">
                  <span class="material-symbols-outlined text-[15px]">delete</span>
                  Eliminar
                </button>
              ` : '',
            });
          }).join('');
        }

        async function loadConversation() {
          renderConversationTabSkeleton();
          if (!groupData?.can_view_conversation) return;

          const composerAvatar = conversationTab.querySelector('#group-composer-avatar');
          const fileInput = conversationTab.querySelector('#group-file-input');
          const previewWrap = conversationTab.querySelector('#group-image-preview-wrap');
          const previewImage = conversationTab.querySelector('#group-image-preview');
          const contentInput = conversationTab.querySelector('#group-post-content');
          const publishButton = conversationTab.querySelector('#group-publish-btn');
          const postsList = conversationTab.querySelector('#group-posts-list');

          setAvatarElement(composerAvatar, user);

          function clearImage() {
            selectedImageFile = null;
            fileInput.value = '';
            previewWrap.classList.add('hidden');
            previewImage.src = '';
          }

          function renderPosts() {
            if (!groupPosts.length) {
              postsList.innerHTML = '<div class="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm text-center text-sm text-slate-400">Aun no hay publicaciones en este grupo.</div>';
              return;
            }

            postsList.innerHTML = groupPosts.map((post) => renderPostCard(post, user.id, {
              canDelete: Number(post.user_id) === Number(user.id) || groupCanManage(),
            })).join('');
          }

          async function reloadPosts() {
            const result = await PostsAPI.getGroupPosts(groupId);
            if (!result?.ok) {
              postsList.innerHTML = '<div class="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm text-center text-sm text-slate-400">No se pudieron cargar las publicaciones del grupo.</div>';
              return;
            }

            groupPosts = getList(result);
            renderPosts();
            if (pendingCommentPostId) {
              commentPostPreview.innerHTML = renderPostModalPreview(findGroupPost(pendingCommentPostId), user.id);
            }
          }

          conversationTab.querySelector('#group-pick-image-btn').addEventListener('click', () => fileInput.click());
          conversationTab.querySelector('#group-clear-image-btn').addEventListener('click', clearImage);
          fileInput.addEventListener('change', (event) => {
            const [file] = event.target.files || [];
            if (!file) {
              clearImage();
              return;
            }

            selectedImageFile = file;
            previewImage.src = URL.createObjectURL(file);
            previewWrap.classList.remove('hidden');
          });

          publishButton.addEventListener('click', async () => {
            const content = contentInput.value.trim();
            if (!content && !selectedImageFile) {
              showToast('Escribe algo o adjunta una imagen', 'error');
              return;
            }

            publishButton.disabled = true;
            publishButton.textContent = 'Publicando...';
            const result = await PostsAPI.createGroupPost(groupId, { content, imageFile: selectedImageFile });
            publishButton.disabled = false;
            publishButton.textContent = 'Publicar';

            if (result?.ok) {
              contentInput.value = '';
              clearImage();
              showToast('Publicacion creada', 'success');
              await reloadPosts();
              return;
            }

            showToast(result?.data?.error || 'No se pudo publicar en el grupo', 'error');
          });

          postsList.addEventListener('click', async (event) => {
            const profileButton = event.target.closest('[data-action="open-profile"]');
            if (profileButton) {
              router.navigate('profile', { id: profileButton.dataset.userId });
              return;
            }

            const deleteButton = event.target.closest('[data-action="delete-post"]');
            if (deleteButton) {
              const confirmed = window.confirm('Deseas eliminar esta publicacion del grupo?');
              if (!confirmed) return;

              const result = await PostsAPI.deletePost(deleteButton.dataset.postId);
              if (result?.ok) {
                showToast('Publicacion eliminada', 'success');
                await reloadPosts();
                return;
              }

              showToast(result?.data?.error || 'No se pudo eliminar la publicacion', 'error');
              return;
            }

            const commentButton = event.target.closest('[data-action="comment-post"]');
            if (commentButton) {
              openCommentModal(commentButton.dataset.postId);
              return;
            }

            const liveButton = event.target.closest('[data-action="open-livestream"]');
            if (liveButton) {
              router.navigate('live', { id: liveButton.dataset.liveId });
              return;
            }

            const reportButton = event.target.closest('[data-action="report-post"]');
            if (reportButton) {
              const result = await PostsAPI.reportPost(reportButton.dataset.postId);
              showToast(result?.ok ? 'Publicacion reportada' : (result?.data?.error || 'No se pudo reportar'), result?.ok ? 'success' : 'error');
              return;
            }

            const reactionButton = event.target.closest('[data-action="react-post"]');
            if (reactionButton) {
              const result = await PostsAPI.reactPost(reactionButton.dataset.postId, reactionButton.dataset.reaction);
              if (result?.ok) {
                await reloadPosts();
              } else {
                showToast(result?.data?.error || 'No se pudo reaccionar', 'error');
              }
            }
          });

          await reloadPosts();
        }

        async function renderPeopleTab() {
          peopleTab.innerHTML = '<div class="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm text-center text-sm text-slate-400">Cargando miembros...</div>';
          const [membersResult, requestsResult] = await Promise.all([
            SocialAPI.getGroupMembers(groupId),
            groupCanManage() ? SocialAPI.getGroupRequests(groupId) : Promise.resolve({ ok: true, data: [] }),
          ]);

          if (!membersResult?.ok) {
            peopleTab.innerHTML = '<div class="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm text-center text-sm text-slate-400">No se pudo cargar la lista de miembros.</div>';
            return;
          }

          const members = getList(membersResult);
          const requests = getList(requestsResult);
          peopleTab.innerHTML = `
            ${groupCanManage() ? `
              <div class="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                <h2 class="text-lg font-bold text-slate-900 mb-4">Solicitudes pendientes</h2>
                <div id="group-requests-list" class="space-y-3">
                  ${requests.length ? requests.map((request) => `
                    <div class="flex flex-col md:flex-row md:items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div>
                        <p class="font-semibold text-slate-900">${escapeHtml(displayName(request.user || { full_name: 'Usuario' }))}</p>
                        <p class="text-sm text-slate-500">${escapeHtml(careerLabel(request.user || {}))}</p>
                      </div>
                      <div class="flex gap-2">
                        <button type="button" data-approve-group-request="${request.membership_id}" class="px-4 py-2 rounded-xl bg-[#1B2A6B] text-white text-sm font-semibold hover:bg-[#15215a] transition-colors">Aprobar</button>
                        <button type="button" data-reject-group-request="${request.membership_id}" class="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors">Rechazar</button>
                      </div>
                    </div>
                  `).join('') : '<p class="text-sm text-slate-400">No hay solicitudes pendientes.</p>'}
                </div>
              </div>
            ` : ''}
            <div class="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
              <h2 class="text-lg font-bold text-slate-900 mb-4">Miembros</h2>
              <div id="group-members-list" class="space-y-3">
                ${members.map((member) => {
                  const isSelf = Number(member.user_id) === Number(user.id);
                  const canManageMember = groupCanManage() && member.role !== 'creator' && !isSelf;
                  const canChangeRole = groupData.current_role === 'creator' && member.role !== 'creator' && !isSelf;
                  return `
                    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 rounded-2xl border border-slate-200 p-4">
                      <div class="flex items-center gap-3">
                        ${renderAvatar(member.user || {}, { sizeClass: 'w-11 h-11', textClass: 'text-white font-bold text-sm' })}
                        <div>
                          <p class="font-semibold text-slate-900">${escapeHtml(displayName(member.user || { full_name: 'Usuario' }))}</p>
                          <p class="text-sm text-slate-500">${escapeHtml(careerLabel(member.user || {}))}</p>
                        </div>
                      </div>
                      <div class="flex flex-wrap items-center gap-2">
                        <span class="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${member.role === 'creator' ? 'bg-sky-50 text-sky-700 border border-sky-200' : member.role === 'admin' ? 'bg-violet-50 text-violet-700 border border-violet-200' : 'bg-slate-100 text-slate-600 border border-slate-200'}">${escapeHtml(member.role)}</span>
                        ${canChangeRole ? `
                          <select data-group-role-user="${member.user_id}" class="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700">
                            <option value="member" ${member.role === 'member' ? 'selected' : ''}>Miembro</option>
                            <option value="admin" ${member.role === 'admin' ? 'selected' : ''}>Admin</option>
                          </select>
                        ` : ''}
                        ${canManageMember ? `
                          <button type="button" data-remove-group-member="${member.user_id}" class="px-4 py-2 rounded-xl border border-red-200 text-red-600 text-sm font-medium hover:bg-red-50 transition-colors">Expulsar</button>
                        ` : ''}
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>
          `;

          peopleTab.addEventListener('click', async (event) => {
            const approveButton = event.target.closest('[data-approve-group-request]');
            if (approveButton) {
              const result = await SocialAPI.approveGroupRequest(groupId, approveButton.dataset.approveGroupRequest);
              if (result?.ok) {
                showToast('Solicitud aprobada', 'success');
                await loadGroup();
                await renderPeopleTab();
                return;
              }
              showToast(result?.data?.error || 'No se pudo aprobar la solicitud', 'error');
              return;
            }

            const rejectButton = event.target.closest('[data-reject-group-request]');
            if (rejectButton) {
              const result = await SocialAPI.rejectGroupRequest(groupId, rejectButton.dataset.rejectGroupRequest);
              if (result?.ok) {
                showToast('Solicitud rechazada', 'success');
                await renderPeopleTab();
                return;
              }
              showToast(result?.data?.error || 'No se pudo rechazar la solicitud', 'error');
              return;
            }

            const removeButton = event.target.closest('[data-remove-group-member]');
            if (removeButton) {
              const confirmed = window.confirm('Deseas expulsar a este miembro del grupo?');
              if (!confirmed) return;
              const result = await SocialAPI.removeGroupMember(groupId, removeButton.dataset.removeGroupMember);
              if (result?.ok) {
                showToast('Miembro expulsado', 'success');
                await loadGroup();
                await renderPeopleTab();
                return;
              }
              showToast(result?.data?.error || 'No se pudo expulsar al miembro', 'error');
            }
          }, { once: true });

          peopleTab.querySelectorAll('[data-group-role-user]').forEach((select) => {
            select.addEventListener('change', async () => {
              const result = await SocialAPI.updateGroupMemberRole(groupId, select.dataset.groupRoleUser, select.value);
              if (result?.ok) {
                showToast('Rol actualizado', 'success');
                await loadGroup();
                await renderPeopleTab();
                return;
              }
              showToast(result?.data?.error || 'No se pudo actualizar el rol', 'error');
            });
          });
        }

        async function renderMediaTab() {
          mediaTab.innerHTML = '<div class="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm text-center text-sm text-slate-400">Cargando imagenes...</div>';
          if (!groupData?.can_view_conversation) {
            mediaTab.innerHTML = '<div class="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm text-center text-sm text-slate-400">Debes pertenecer al grupo para ver su multimedia.</div>';
            return;
          }

          const result = await PostsAPI.getGroupMedia(groupId);
          if (!result?.ok) {
            mediaTab.innerHTML = '<div class="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm text-center text-sm text-slate-400">No se pudo cargar la multimedia.</div>';
            return;
          }

          const posts = getList(result);
          if (!posts.length) {
            mediaTab.innerHTML = '<div class="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm text-center text-sm text-slate-400">Todavia no hay imagenes en este grupo.</div>';
            return;
          }

          mediaTab.innerHTML = `
            <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
              ${posts.map((post) => `
                <article class="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div class="h-52 bg-slate-100">
                    <img src="${safeUrl(post.image_url)}" alt="Imagen publicada en el grupo" class="w-full h-full object-cover"/>
                  </div>
                  <div class="p-4">
                    <p class="font-semibold text-slate-900 text-sm">${escapeHtml(displayName(resolveProfileData({
                      id: post.user_id,
                      user_name: post.user_name,
                      user_faculty: post.user_faculty,
                      user_school: post.user_school,
                      user_avatar: post.user_avatar,
                    })))}</p>
                    <p class="text-xs text-slate-500 mt-1">${escapeHtml(timeAgo(post.created_at))}</p>
                    ${post.content ? `<p class="text-sm text-slate-600 mt-3 leading-6">${escapeHtml(post.content.slice(0, 120))}</p>` : ''}
                  </div>
                </article>
              `).join('')}
            </div>
          `;
        }

        async function loadGroup() {
          const result = await SocialAPI.getGroup(groupId);
          if (!result?.ok) {
            container.innerHTML = `
              <div class="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm">
                <p class="text-slate-500 text-sm">No se pudo cargar el grupo.</p>
              </div>
            `;
            return false;
          }

          groupData = result.data;
          renderHeader();
          renderInfoTab();
          return true;
        }

        actionsWrap.addEventListener('click', async (event) => {
          const joinButton = event.target.closest('[data-join-group]');
          if (joinButton) {
            const result = await SocialAPI.joinGroup(groupId);
            if (result?.ok) {
              showToast(result.data?.message || 'Operacion completada', 'success');
              await loadGroup();
              if (currentTab === 'conversation') await loadConversation();
              if (currentTab === 'people') await renderPeopleTab();
              if (currentTab === 'media') await renderMediaTab();
              return;
            }
            showToast(result?.data?.error || 'No se pudo procesar la solicitud', 'error');
            return;
          }

          const leaveButton = event.target.closest('[data-leave-group]');
          if (leaveButton) {
            const confirmed = window.confirm('Deseas salir de este grupo?');
            if (!confirmed) return;
            const result = await SocialAPI.leaveGroup(groupId);
            if (result?.ok) {
              showToast('Saliste del grupo', 'success');
              await loadGroup();
              setTab('info');
              return;
            }
            showToast(result?.data?.error || 'No se pudo salir del grupo', 'error');
            return;
          }

          const editButton = event.target.closest('[data-edit-group]');
          if (editButton) {
            openEditModal();
          }
        });

        tabButtons.forEach((button) => {
          button.addEventListener('click', async () => {
            setTab(button.dataset.groupTab);
            if (currentTab === 'conversation') await loadConversation();
            if (currentTab === 'people') await renderPeopleTab();
            if (currentTab === 'media') await renderMediaTab();
          });
        });

        pickEditCoverButton.addEventListener('click', () => editCoverInput.click());
        clearEditCoverButton.addEventListener('click', () => {
          selectedEditCoverFile = null;
          editCoverInput.value = '';
          updateEditCoverPreview(null);
        });
        editCoverInput.addEventListener('change', async (event) => {
          const [file] = event.target.files || [];
          if (!file) return;
          try {
            await openEditCropModal(file);
          } catch (error) {
            showToast(error.message || 'No se pudo preparar la portada', 'error');
            closeEditCropModal(true);
          }
        });
        editCropZoom.addEventListener('input', (event) => {
          setEditCropZoom(Number(event.target.value) / 100);
        });
        editCropCancelButton.addEventListener('click', () => closeEditCropModal(true));
        editCropCloseButton.addEventListener('click', () => closeEditCropModal(true));
        editCropModal.addEventListener('click', (event) => {
          if (event.target === editCropModal) closeEditCropModal(true);
        });
        editCropStage.addEventListener('pointerdown', (event) => {
          if (!editCropState.image || editCropState.saving) return;
          editCropState.pointerId = event.pointerId;
          editCropState.dragStartX = event.clientX;
          editCropState.dragStartY = event.clientY;
          editCropState.dragOffsetX = editCropState.offsetX;
          editCropState.dragOffsetY = editCropState.offsetY;
          editCropStage.setPointerCapture(event.pointerId);
          event.preventDefault();
        });
        editCropStage.addEventListener('pointermove', (event) => {
          if (editCropState.pointerId !== event.pointerId) return;
          editCropState.offsetX = editCropState.dragOffsetX + (event.clientX - editCropState.dragStartX);
          editCropState.offsetY = editCropState.dragOffsetY + (event.clientY - editCropState.dragStartY);
          renderEditCropStage();
          event.preventDefault();
        });
        const stopEditCropDrag = (event) => {
          if (editCropState.pointerId === null) return;
          if (event && editCropState.pointerId !== event.pointerId) return;
          if (event && editCropStage.hasPointerCapture(event.pointerId)) {
            editCropStage.releasePointerCapture(event.pointerId);
          }
          editCropState.pointerId = null;
        };
        editCropStage.addEventListener('pointerup', stopEditCropDrag);
        editCropStage.addEventListener('pointercancel', stopEditCropDrag);
        editCropStage.addEventListener('lostpointercapture', () => {
          editCropState.pointerId = null;
        });
        editCropSaveButton.addEventListener('click', async () => {
          if (!editCropState.image || editCropState.saving) return;
          editCropState.saving = true;
          editCropSaveButton.disabled = true;
          editCropSaveButton.textContent = 'Preparando...';
          try {
            const canvas = document.createElement('canvas');
            canvas.width = 1600;
            canvas.height = 500;
            const context = canvas.getContext('2d');
            const sourceX = Math.max(0, -editCropState.offsetX / editCropState.scale);
            const sourceY = Math.max(0, -editCropState.offsetY / editCropState.scale);
            const sourceWidth = Math.min(editCropState.naturalWidth, editCropState.viewportWidth / editCropState.scale);
            const sourceHeight = Math.min(editCropState.naturalHeight, editCropState.viewportHeight / editCropState.scale);
            context.drawImage(editCropState.image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);
            const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
            if (!blob) throw new Error('No se pudo preparar la portada');
            selectedEditCoverFile = new File([blob], `group-cover-${Date.now()}.jpg`, { type: 'image/jpeg' });
            updateEditCoverPreview(selectedEditCoverFile);
            closeEditCropModal(false);
          } catch (error) {
            showToast(error.message || 'No se pudo preparar la portada', 'error');
          } finally {
            editCropState.saving = false;
            editCropSaveButton.disabled = false;
            editCropSaveButton.textContent = 'Usar portada';
          }
        });

        const closeEditModalIfBackdrop = (event) => {
          if (event.target === editModal) closeEditModal();
        };
        editModal.addEventListener('click', closeEditModalIfBackdrop);
        closeEditModalButton.addEventListener('click', closeEditModal);
        cancelEditModalButton.addEventListener('click', closeEditModal);
        editForm.addEventListener('submit', async (submitEvent) => {
          submitEvent.preventDefault();
          saveEditModalButton.disabled = true;
          saveEditModalButton.textContent = 'Guardando...';
          const result = await SocialAPI.updateGroup(groupId, {
            name: editNameInput.value.trim(),
            description: editDescriptionInput.value.trim(),
            privacy: editPrivacyInput.value,
            coverFile: selectedEditCoverFile,
          });
          saveEditModalButton.disabled = false;
          saveEditModalButton.textContent = 'Guardar cambios';
          if (result?.ok) {
            showToast('Grupo actualizado', 'success');
            await loadGroup();
            if (currentTab === 'people') await renderPeopleTab();
            if (currentTab === 'media') await renderMediaTab();
            closeEditModal();
            return;
          }
          showToast(result?.data?.error || 'No se pudo actualizar el grupo', 'error');
        });

        commentModal.addEventListener('click', (event) => {
          if (event.target === commentModal) closeCommentModal();
        });
        container.querySelector('#group-close-comment-top-btn').addEventListener('click', closeCommentModal);
        commentSort.addEventListener('change', () => loadComments(pendingCommentPostId, commentSort.value));
        container.querySelector('#group-confirm-comment-btn').addEventListener('click', async () => {
          const content = commentInput.value.trim();
          if (!pendingCommentPostId || !content) return;

          const result = await PostsAPI.addComment(pendingCommentPostId, content);
          if (result?.ok) {
            commentInput.value = '';
            await loadComments(pendingCommentPostId, currentCommentSort);
            await loadConversation();
            return;
          }
          showToast(result?.data?.error || 'No se pudo comentar', 'error');
        });

        commentList.addEventListener('click', async (event) => {
          const deleteButton = event.target.closest('[data-group-delete-comment]');
          if (deleteButton) {
            const result = await PostsAPI.deleteComment(null, deleteButton.dataset.groupDeleteComment);
            if (result?.ok) {
              showToast('Comentario eliminado', 'success');
              await loadComments(pendingCommentPostId, currentCommentSort);
              await loadConversation();
              return;
            }
            showToast(result?.data?.error || 'No se pudo eliminar el comentario', 'error');
            return;
          }

          const reportButton = event.target.closest('[data-action="report-comment"]');
          if (reportButton) {
            const result = await PostsAPI.reportComment(reportButton.dataset.commentId);
            showToast(result?.ok ? 'Comentario reportado' : (result?.data?.error || 'No se pudo reportar'), result?.ok ? 'success' : 'error');
            return;
          }

          const reactionButton = event.target.closest('[data-action="react-comment"]');
          if (reactionButton) {
            const result = await PostsAPI.reactComment(reactionButton.dataset.commentId, reactionButton.dataset.reaction);
            if (result?.ok) {
              await loadComments(pendingCommentPostId, currentCommentSort);
              await loadConversation();
            } else {
              showToast(result?.data?.error || 'No se pudo reaccionar', 'error');
            }
          }
        });

        return (async () => {
          const ok = await loadGroup();
          if (!ok) return null;
          setTab('info');
          renderInfoTab();
          return () => {};
        })();
      },
    },
    profile: {
      title: 'Perfil',
      activeNav: 'profile',
      render() {
        const cycleOptions = Array.from({ length: 10 }, (_, index) => index + 1).map((value) => `
          <option value="${value}">${value}vo ciclo</option>
        `).join('');

        return `
          <div class="profile-view max-w-4xl mx-auto w-full space-y-6">
            <div class="profile-card">
              <div class="profile-banner" id="profile-banner-view" style="background:#6B1B1B">
                <button id="change-banner-btn" type="button" class="hidden bg-black/20 hover:bg-black/30 text-white rounded-lg px-4 py-2 items-center gap-2 font-medium text-sm transition-colors border border-white/20 backdrop-blur-sm">
                  <span class="material-symbols-outlined text-[18px]">photo_camera</span>
                  Cambiar portada
                </button>
                <input id="banner-input" class="hidden" type="file" accept="image/*"/>
              </div>
              <div class="px-8 pb-6 relative">
                <div class="flex flex-col md:flex-row justify-between items-start gap-6">
                  <div class="-mt-16 flex flex-col">
                    <div class="profile-avatar-frame">
                      <div class="profile-avatar" id="profile-avatar-view">U</div>
                      <button id="change-avatar-btn" type="button" class="camera-btn absolute bottom-1 right-1 hidden">
                        <span class="material-symbols-outlined text-[18px]">photo_camera</span>
                      </button>
                      <input id="avatar-input" class="hidden" type="file" accept="image/*"/>
                    </div>
                    <div class="flex flex-col">
                      <h1 class="text-2xl font-bold text-gray-900 flex items-center gap-2" id="profile-name">Cargando...</h1>
                      <p class="text-gray-600 mt-1" id="profile-career"></p>
                      <div class="flex items-center gap-3 mt-3 flex-wrap" id="profile-badges"></div>
                    </div>
                  </div>
                  <div class="mt-4 md:mt-16 flex flex-wrap gap-3" id="profile-actions"></div>
                </div>
              </div>
              <div class="profile-data-row">
                <div class="profile-data-grid">
                  <div class="profile-data-item">
                    <span class="material-symbols-outlined text-gray-500 text-[24px]">badge</span>
                    <div class="flex flex-col">
                      <span class="label">CODIGO</span>
                      <span class="value" id="profile-code">-</span>
                    </div>
                  </div>
                  <div class="profile-data-item">
                    <span class="material-symbols-outlined text-gray-500 text-[24px]">mail</span>
                    <div class="flex flex-col">
                      <span class="label">CORREO</span>
                      <span class="value" id="profile-email">-</span>
                    </div>
                  </div>
                  <div class="profile-data-item">
                    <span class="material-symbols-outlined text-gray-500 text-[24px]">calendar_month</span>
                    <div class="flex flex-col">
                      <span class="label">SEMESTRE</span>
                      <span class="value" id="profile-cycle">-</span>
                    </div>
                  </div>
                </div>
              </div>
              <div class="profile-about">
                <div class="flex justify-between items-center mb-4 gap-3">
                  <h2 class="text-sm font-bold text-gray-600 tracking-wide">SOBRE MI</h2>
                  <div class="flex items-center gap-2">
                    <button id="profile-bio-cancel-btn" type="button" class="hidden text-slate-500 hover:text-slate-700 font-medium text-sm items-center gap-1.5 transition-colors">
                      Cancelar
                    </button>
                    <button id="profile-bio-action-btn" type="button" class="hidden text-[#1B2A6B] hover:text-blue-800 font-semibold text-sm items-center gap-1.5 transition-colors">
                      <span id="profile-bio-action-icon" class="material-symbols-outlined text-[18px]">edit</span>
                      <span id="profile-bio-action-label">Editar</span>
                    </button>
                  </div>
                </div>
                <div class="profile-bio text-sm text-gray-900" id="profile-bio" data-empty="false" data-placeholder="Cuentanos algo de ti"></div>
              </div>
            </div>
            <div>
              <h2 class="text-xl font-bold text-black mb-4">Publicaciones recientes</h2>
              <div id="profile-posts-list" class="space-y-4">
                <div class="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 profile-posts-empty flex items-center justify-center">
                  <p class="text-gray-500 text-sm">Cargando publicaciones...</p>
                </div>
              </div>
            </div>
          </div>
          <div id="profile-comment-modal" class="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-50 hidden px-3 py-4">
            <div class="post-comments-modal bg-white rounded-[28px] shadow-xl w-full overflow-hidden flex flex-col">
              <div class="post-comments-topbar">
                <h3 class="post-comments-topbar-title">Publicacion</h3>
                <button id="profile-close-comment-top-btn" type="button" class="post-comments-topbar-close" aria-label="Cerrar modal de comentarios del perfil">
                  <span class="material-symbols-outlined text-[20px]">close</span>
                </button>
              </div>
              <div class="post-comments-body">
                <div class="post-comments-scroll custom-scrollbar">
                  <div id="profile-comment-post-preview" class="post-comments-preview"></div>
                  <div class="post-comments-side">
                    <div class="post-comments-section-head">
                      <span class="post-comments-section-title">Comentarios</span>
                      <select id="profile-comment-sort" class="post-comments-sort">
                        <option value="newest">Mas recientes</option>
                        <option value="oldest">Mas antiguos</option>
                      </select>
                    </div>
                    <div id="profile-comment-list" class="post-comments-list">
                      <p class="text-sm text-slate-400 text-center">Selecciona una publicacion para ver sus comentarios.</p>
                    </div>
                  </div>
                </div>
                <div class="post-comments-compose">
                  <div class="post-comments-compose-row">
                    <textarea id="profile-comment-input" class="post-comments-compose-input" rows="1" placeholder="Escribe un comentario..."></textarea>
                    <button id="profile-confirm-comment-btn" type="button" class="post-comments-compose-send" aria-label="Enviar comentario del perfil">
                      <span class="material-symbols-outlined text-[18px]">send</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div id="media-crop-modal" class="fixed inset-0 z-[120] hidden items-center justify-center bg-slate-950/70 backdrop-blur-sm px-3 py-4">
            <div class="bg-white rounded-[28px] shadow-2xl w-full max-w-5xl mx-4 overflow-hidden max-h-[92vh] flex flex-col">
              <div class="flex items-center justify-between gap-4 px-5 py-4 border-b border-slate-200">
                <div>
                  <p class="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400">Ajustar imagen</p>
                  <h3 id="media-crop-title" class="text-lg md:text-xl font-bold text-slate-900 mt-1">Recorta tu imagen</h3>
                </div>
                <button id="media-crop-close-btn" type="button" class="w-10 h-10 rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors inline-flex items-center justify-center">
                  <span class="material-symbols-outlined">close</span>
                </button>
              </div>
              <div class="media-crop-layout">
                <div class="media-crop-workbench">
                  <div id="media-crop-stage" class="media-crop-stage is-avatar">
                    <img id="media-crop-image" alt="Vista previa de recorte" draggable="false"/>
                  </div>
                </div>
                <div class="media-crop-sidebar">
                  <div class="space-y-3">
                    <div>
                      <p class="text-sm font-semibold text-slate-900">Vista previa</p>
                      <p class="text-xs text-slate-500 mt-1">Asi se vera la imagen despues de guardarla.</p>
                    </div>
                    <div class="space-y-3">
                      <canvas id="media-crop-preview-avatar" class="media-crop-preview media-crop-preview-avatar"></canvas>
                      <canvas id="media-crop-preview-banner" class="media-crop-preview media-crop-preview-banner hidden"></canvas>
                    </div>
                  </div>
                  <div class="space-y-3">
                    <div class="flex items-center justify-between gap-3">
                      <label for="media-crop-zoom" class="text-sm font-semibold text-slate-900">Zoom</label>
                      <span id="media-crop-zoom-label" class="text-xs font-semibold text-slate-500">100%</span>
                    </div>
                    <input id="media-crop-zoom" type="range" min="100" max="400" value="100" class="w-full accent-[#1B2A6B]"/>
                  </div>
                  <div class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p id="media-crop-help" class="text-sm text-slate-600 leading-6">Arrastra la imagen para elegir la zona visible y usa el zoom si necesitas acercarte.</p>
                  </div>
                  <div class="mt-auto flex flex-wrap justify-end gap-3 pt-2">
                    <button id="media-crop-reset-btn" type="button" class="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">Restablecer</button>
                    <button id="media-crop-cancel-btn" type="button" class="px-4 py-2 text-sm font-medium text-slate-600 border border-slate-200 hover:bg-slate-50 rounded-xl transition-colors">Cancelar</button>
                    <button id="media-crop-save-btn" type="button" class="px-5 py-2 text-sm font-medium text-white bg-[#1B2A6B] hover:bg-[#152259] rounded-xl transition-colors shadow-sm">Guardar</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div id="edit-profile-modal" class="fixed inset-0 z-[100] hidden items-center justify-center bg-black/40 backdrop-blur-sm">
            <div class="bg-white rounded-3xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
              <div class="flex justify-between items-center p-6 border-b border-slate-200">
                <h2 class="text-lg font-bold text-slate-900">Editar perfil</h2>
                <button id="close-edit-profile-btn" type="button" class="p-1 rounded-full hover:bg-slate-100 transition-colors">
                  <span class="material-symbols-outlined">close</span>
                </button>
              </div>
              <form id="edit-profile-form" class="p-6 space-y-5">
                <div class="flex flex-col gap-1.5">
                  <label class="text-sm font-semibold text-gray-700" for="edit-bio">Biografia</label>
                  <textarea id="edit-bio" class="w-full bg-white border border-slate-200 rounded-xl p-3 text-sm focus:border-[#1B2A6B] focus:ring-1 focus:ring-[#1B2A6B] outline-none resize-none" rows="4" placeholder="Cuéntanos algo de ti"></textarea>
                </div>
                <div class="flex flex-col gap-1.5">
                  <label class="text-sm font-semibold text-gray-700" for="edit-cycle">Ciclo academico</label>
                  <select id="edit-cycle" class="w-full bg-white border border-slate-200 rounded-xl p-3 text-sm focus:border-[#1B2A6B] focus:ring-1 focus:ring-[#1B2A6B] outline-none">
                    <option value="">Selecciona...</option>
                    ${cycleOptions}
                  </select>
                </div>
                <div class="flex justify-end gap-3 pt-2">
                  <button id="cancel-edit-profile-btn" type="button" class="px-6 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors">Cancelar</button>
                  <button type="submit" class="px-6 py-2.5 rounded-xl bg-[#1B2A6B] text-white text-sm font-semibold hover:bg-[#15215a] transition-colors">Guardar cambios</button>
                </div>
              </form>
            </div>
          </div>
        `;
      },
      mount({ container, user, params, router }) {
        const bannerView = container.querySelector('#profile-banner-view');
        const avatarView = container.querySelector('#profile-avatar-view');
        const profileName = container.querySelector('#profile-name');
        const profileCareer = container.querySelector('#profile-career');
        const profileBadges = container.querySelector('#profile-badges');
        const profileActions = container.querySelector('#profile-actions');
        const profileCode = container.querySelector('#profile-code');
        const profileEmail = container.querySelector('#profile-email');
        const profileCycle = container.querySelector('#profile-cycle');
        const profileBio = container.querySelector('#profile-bio');
        const postsList = container.querySelector('#profile-posts-list');
        const profileCommentModal = container.querySelector('#profile-comment-modal');
        const profileCommentPostPreview = container.querySelector('#profile-comment-post-preview');
        const profileCommentList = container.querySelector('#profile-comment-list');
        const profileCommentSort = container.querySelector('#profile-comment-sort');
        const profileCommentInput = container.querySelector('#profile-comment-input');
        const profileBioActionButton = container.querySelector('#profile-bio-action-btn');
        const profileBioActionIcon = container.querySelector('#profile-bio-action-icon');
        const profileBioActionLabel = container.querySelector('#profile-bio-action-label');
        const profileBioCancelButton = container.querySelector('#profile-bio-cancel-btn');
        const changeAvatarButton = container.querySelector('#change-avatar-btn');
        const changeBannerButton = container.querySelector('#change-banner-btn');
        const avatarInput = container.querySelector('#avatar-input');
        const bannerInput = container.querySelector('#banner-input');
        const mediaCropModal = container.querySelector('#media-crop-modal');
        const mediaCropTitle = container.querySelector('#media-crop-title');
        const mediaCropImage = container.querySelector('#media-crop-image');
        const mediaCropStage = container.querySelector('#media-crop-stage');
        const mediaCropHelp = container.querySelector('#media-crop-help');
        const mediaCropZoom = container.querySelector('#media-crop-zoom');
        const mediaCropZoomLabel = container.querySelector('#media-crop-zoom-label');
        const mediaCropPreviewAvatar = container.querySelector('#media-crop-preview-avatar');
        const mediaCropPreviewBanner = container.querySelector('#media-crop-preview-banner');
        const mediaCropSaveButton = container.querySelector('#media-crop-save-btn');
        const mediaCropResetButton = container.querySelector('#media-crop-reset-btn');
        const mediaCropCancelButton = container.querySelector('#media-crop-cancel-btn');
        const mediaCropCloseButton = container.querySelector('#media-crop-close-btn');

        let profileData = null;
        let incomingRequestId = null;
        let isOwnProfile = false;
        let originalBio = '';
        let profilePosts = [];
        let pendingProfileCommentId = null;
        let currentProfileCommentSort = 'newest';
        const cropConfigs = {
          avatar: {
            field: 'avatar',
            title: 'Ajustar foto de perfil',
            help: 'Arrastra la imagen para elegir la zona visible. La vista previa circular muestra como se vera tu foto.',
            previewCanvas: mediaCropPreviewAvatar,
            outputWidth: 640,
            outputHeight: 640,
            previewWidth: 240,
            previewHeight: 240,
            mimeType: 'image/png',
          },
          banner: {
            field: 'banner',
            title: 'Ajustar portada',
            help: 'Mueve la imagen para centrar el encuadre y usa el zoom para destacar la parte rectangular que quieras mostrar.',
            previewCanvas: mediaCropPreviewBanner,
            outputWidth: 1600,
            outputHeight: 500,
            previewWidth: 640,
            previewHeight: 200,
            mimeType: 'image/jpeg',
          },
        };
        const cropState = {
          mode: null,
          file: null,
          objectUrl: '',
          image: null,
          naturalWidth: 0,
          naturalHeight: 0,
          viewportWidth: 0,
          viewportHeight: 0,
          minScale: 1,
          scale: 1,
          zoom: 1,
          maxZoom: 4,
          offsetX: 0,
          offsetY: 0,
          dragStartX: 0,
          dragStartY: 0,
          dragOffsetX: 0,
          dragOffsetY: 0,
          pointerId: null,
          saving: false,
        };

        function placeCaretAtEnd(element) {
          const selection = window.getSelection();
          const range = document.createRange();
          range.selectNodeContents(element);
          range.collapse(false);
          selection.removeAllRanges();
          selection.addRange(range);
        }

        function getBioDraft() {
          return profileBio.textContent.replace(/\u00A0/g, ' ').trim();
        }

        function setBioContent(value) {
          const text = String(value || '');
          profileBio.textContent = text;
          profileBio.dataset.empty = text.trim() ? 'false' : 'true';
        }

        function bioChanged() {
          return getBioDraft() !== originalBio;
        }

        function updateBioEditorState() {
          profileBio.dataset.empty = getBioDraft() ? 'false' : 'true';
          profileBio.classList.toggle('is-own', isOwnProfile);
          profileBio.setAttribute('contenteditable', isOwnProfile ? 'true' : 'false');

          profileBioActionButton.classList.toggle('hidden', !isOwnProfile);
          profileBioActionButton.classList.toggle('inline-flex', isOwnProfile);

          const changed = isOwnProfile && bioChanged();
          profileBioCancelButton.classList.toggle('hidden', !changed);
          profileBioCancelButton.classList.toggle('inline-flex', changed);
          profileBioActionIcon.textContent = changed ? 'save' : 'edit';
          profileBioActionLabel.textContent = changed ? 'Guardar' : 'Editar';
        }

        async function saveBio() {
          if (!profileData || !isOwnProfile || !bioChanged()) {
            profileBio.focus();
            placeCaretAtEnd(profileBio);
            return;
          }

          const result = await AuthAPI.updateProfile({ bio: getBioDraft() });
          if (result?.ok) {
            syncCurrentUser(result.data);
            showToast('Biografia actualizada', 'success');
            await loadProfile();
            return;
          }

          showToast(result?.data?.error || 'No se pudo guardar la biografia', 'error');
        }

        function getCropConfig(mode = cropState.mode) {
          return mode ? cropConfigs[mode] : null;
        }

        function clearCropInput(mode = cropState.mode) {
          if (mode === 'avatar') avatarInput.value = '';
          if (mode === 'banner') bannerInput.value = '';
        }

        function releaseCropObjectUrl() {
          if (!cropState.objectUrl) return;
          URL.revokeObjectURL(cropState.objectUrl);
          cropState.objectUrl = '';
        }

        function resetCropTransientState() {
          cropState.pointerId = null;
          cropState.saving = false;
          mediaCropStage.classList.remove('is-dragging');
        }

        function closeCropModal(options = {}) {
          const clearInput = options.clearInput !== false;
          const modeToClear = options.mode || cropState.mode;

          mediaCropModal.classList.add('hidden');
          mediaCropModal.classList.remove('flex');
          mediaCropPreviewAvatar.classList.toggle('hidden', false);
          mediaCropPreviewBanner.classList.toggle('hidden', true);
          mediaCropStage.classList.remove('is-avatar', 'is-banner', 'is-dragging');
          mediaCropImage.removeAttribute('src');
          mediaCropZoom.value = '100';
          mediaCropZoomLabel.textContent = '100%';
          mediaCropSaveButton.disabled = false;
          mediaCropSaveButton.textContent = 'Guardar';

          releaseCropObjectUrl();
          resetCropTransientState();

          cropState.mode = null;
          cropState.file = null;
          cropState.image = null;
          cropState.naturalWidth = 0;
          cropState.naturalHeight = 0;
          cropState.viewportWidth = 0;
          cropState.viewportHeight = 0;
          cropState.minScale = 1;
          cropState.scale = 1;
          cropState.zoom = 1;
          cropState.maxZoom = 4;
          cropState.offsetX = 0;
          cropState.offsetY = 0;

          if (clearInput) clearCropInput(modeToClear);
        }

        function clampCropAxis(offset, viewportSize, scaledSize) {
          if (scaledSize <= viewportSize) {
            return (viewportSize - scaledSize) / 2;
          }

          const minOffset = viewportSize - scaledSize;
          const maxOffset = 0;
          return Math.min(maxOffset, Math.max(minOffset, offset));
        }

        function clampCropOffsets() {
          const scaledWidth = cropState.naturalWidth * cropState.scale;
          const scaledHeight = cropState.naturalHeight * cropState.scale;
          cropState.offsetX = clampCropAxis(cropState.offsetX, cropState.viewportWidth, scaledWidth);
          cropState.offsetY = clampCropAxis(cropState.offsetY, cropState.viewportHeight, scaledHeight);
        }

        function getCropSourceRect() {
          const scale = cropState.scale || 1;
          const sourceX = Math.max(0, -cropState.offsetX / scale);
          const sourceY = Math.max(0, -cropState.offsetY / scale);
          const sourceWidth = Math.min(cropState.naturalWidth, cropState.viewportWidth / scale);
          const sourceHeight = Math.min(cropState.naturalHeight, cropState.viewportHeight / scale);

          return { sourceX, sourceY, sourceWidth, sourceHeight };
        }

        function drawCropToCanvas(canvas) {
          const context = canvas.getContext('2d');
          if (!context || !cropState.image) return;

          const { sourceX, sourceY, sourceWidth, sourceHeight } = getCropSourceRect();
          context.clearRect(0, 0, canvas.width, canvas.height);
          context.drawImage(
            cropState.image,
            sourceX,
            sourceY,
            sourceWidth,
            sourceHeight,
            0,
            0,
            canvas.width,
            canvas.height
          );
        }

        function drawCropPreview() {
          const config = getCropConfig();
          if (!config?.previewCanvas || !cropState.image) return;

          config.previewCanvas.width = config.previewWidth;
          config.previewCanvas.height = config.previewHeight;
          drawCropToCanvas(config.previewCanvas);
        }

        function renderCropStage() {
          if (!cropState.image) return;

          clampCropOffsets();
          mediaCropImage.style.width = `${cropState.naturalWidth * cropState.scale}px`;
          mediaCropImage.style.height = `${cropState.naturalHeight * cropState.scale}px`;
          mediaCropImage.style.transform = `translate3d(${cropState.offsetX}px, ${cropState.offsetY}px, 0)`;
          mediaCropZoomLabel.textContent = `${Math.round(cropState.zoom * 100)}%`;
          drawCropPreview();
        }

        function centerCropImage() {
          cropState.scale = cropState.minScale * cropState.zoom;
          cropState.offsetX = (cropState.viewportWidth - cropState.naturalWidth * cropState.scale) / 2;
          cropState.offsetY = (cropState.viewportHeight - cropState.naturalHeight * cropState.scale) / 2;
        }

        function initializeCropViewport() {
          if (!cropState.image) return false;

          const rect = mediaCropStage.getBoundingClientRect();
          if (!rect.width || !rect.height) return false;

          cropState.viewportWidth = rect.width;
          cropState.viewportHeight = rect.height;
          cropState.minScale = Math.max(
            cropState.viewportWidth / cropState.naturalWidth,
            cropState.viewportHeight / cropState.naturalHeight
          );
          cropState.zoom = 1;
          cropState.maxZoom = 4;
          centerCropImage();
          mediaCropZoom.min = '100';
          mediaCropZoom.max = `${Math.round(cropState.maxZoom * 100)}`;
          mediaCropZoom.value = '100';
          renderCropStage();
          return true;
        }

        function setCropZoom(nextZoom) {
          if (!cropState.image) return;

          const boundedZoom = Math.min(cropState.maxZoom, Math.max(1, nextZoom));
          const previousScale = cropState.scale || cropState.minScale;
          const focusX = cropState.viewportWidth / 2;
          const focusY = cropState.viewportHeight / 2;
          const imageFocusX = (focusX - cropState.offsetX) / previousScale;
          const imageFocusY = (focusY - cropState.offsetY) / previousScale;

          cropState.zoom = boundedZoom;
          cropState.scale = cropState.minScale * cropState.zoom;
          cropState.offsetX = focusX - imageFocusX * cropState.scale;
          cropState.offsetY = focusY - imageFocusY * cropState.scale;
          mediaCropZoom.value = `${Math.round(cropState.zoom * 100)}`;
          renderCropStage();
        }

        async function loadImageForCrop() {
          return await new Promise((resolve, reject) => {
            const image = new Image();
            image.onload = () => resolve(image);
            image.onerror = () => reject(new Error('No se pudo cargar la imagen seleccionada.'));
            image.src = cropState.objectUrl;
          });
        }

        async function openCropModal(mode, file) {
          if (!file) return;
          if (!String(file.type || '').startsWith('image/')) {
            showToast('Selecciona un archivo de imagen valido', 'error');
            clearCropInput(mode);
            return;
          }

          const config = getCropConfig(mode);
          if (!config) return;

          closeCropModal({ clearInput: false, mode });

          cropState.mode = mode;
          cropState.file = file;
          cropState.objectUrl = URL.createObjectURL(file);

          try {
            cropState.image = await loadImageForCrop();
          } catch (error) {
            releaseCropObjectUrl();
            showToast(error.message || 'No se pudo preparar la imagen', 'error');
            clearCropInput(mode);
            return;
          }

          cropState.naturalWidth = cropState.image.naturalWidth;
          cropState.naturalHeight = cropState.image.naturalHeight;
          mediaCropTitle.textContent = config.title;
          mediaCropHelp.textContent = config.help;
          mediaCropStage.classList.toggle('is-avatar', mode === 'avatar');
          mediaCropStage.classList.toggle('is-banner', mode === 'banner');
          mediaCropPreviewAvatar.classList.toggle('hidden', mode !== 'avatar');
          mediaCropPreviewBanner.classList.toggle('hidden', mode !== 'banner');
          mediaCropImage.src = cropState.objectUrl;
          mediaCropModal.classList.remove('hidden');
          mediaCropModal.classList.add('flex');

          requestAnimationFrame(() => {
            if (!initializeCropViewport()) {
              setTimeout(() => initializeCropViewport(), 40);
            }
          });
        }

        async function uploadMedia(field, file) {
          if (!file) return false;
          const formData = new FormData();
          formData.append(field, file);

          const result = await AuthAPI.updateProfile(formData);
          if (result?.ok) {
            syncCurrentUser(result.data);
            await ensurePublicUsersLoaded(true);
            showToast(field === 'avatar' ? 'Avatar actualizado' : 'Portada actualizada', 'success');
            await loadProfile();
            if (field === 'avatar') avatarInput.value = '';
            if (field === 'banner') bannerInput.value = '';
            return true;
          }

          showToast(result?.data?.error || 'No se pudo actualizar el perfil', 'error');
          return false;
        }

        async function saveCroppedMedia() {
          const config = getCropConfig();
          if (!config || !cropState.image || cropState.saving) return;

          cropState.saving = true;
          mediaCropSaveButton.disabled = true;
          mediaCropSaveButton.textContent = 'Guardando...';

          try {
            const canvas = document.createElement('canvas');
            canvas.width = config.outputWidth;
            canvas.height = config.outputHeight;
            drawCropToCanvas(canvas);

            const mimeType = config.mimeType;
            const extension = mimeType === 'image/png' ? 'png' : 'jpg';
            const blob = await new Promise((resolve, reject) => {
              canvas.toBlob((fileBlob) => {
                if (fileBlob) {
                  resolve(fileBlob);
                  return;
                }
                reject(new Error('No se pudo generar la imagen recortada.'));
              }, mimeType, 0.92);
            });

            const croppedFile = new File([blob], `${config.field}-${Date.now()}.${extension}`, { type: mimeType });
            const uploaded = await uploadMedia(config.field, croppedFile);
            if (uploaded) {
              closeCropModal({ mode: cropState.mode });
            }
          } catch (error) {
            showToast(error.message || 'No se pudo preparar la imagen', 'error');
          } finally {
            cropState.saving = false;
            mediaCropSaveButton.disabled = false;
            mediaCropSaveButton.textContent = 'Guardar';
          }
        }

        function findProfilePost(postId) {
          return profilePosts.find((post) => Number(post.id) === Number(postId)) || null;
        }

        function renderProfileCommentModalPost(postId = pendingProfileCommentId) {
          profileCommentPostPreview.innerHTML = renderPostModalPreview(findProfilePost(postId), user.id);
        }

        function openProfileCommentModal(postId) {
          pendingProfileCommentId = Number(postId);
          profileCommentInput.value = '';
          profileCommentInput.style.height = '';
          profileCommentSort.value = currentProfileCommentSort;
          profileCommentModal.classList.remove('hidden');
          profileCommentModal.classList.add('flex');
          renderProfileCommentModalPost(pendingProfileCommentId);
          loadProfileComments(pendingProfileCommentId, currentProfileCommentSort);
          setTimeout(() => profileCommentInput.focus(), 60);
        }

        function closeProfileCommentModal() {
          pendingProfileCommentId = null;
          profileCommentPostPreview.innerHTML = '';
          profileCommentList.innerHTML = '<p class="text-sm text-slate-400 text-center">Selecciona una publicacion para ver sus comentarios.</p>';
          profileCommentModal.classList.add('hidden');
          profileCommentModal.classList.remove('flex');
        }

        async function loadProfileComments(postId = pendingProfileCommentId, sort = currentProfileCommentSort) {
          if (!postId) return;

          currentProfileCommentSort = sort;
          profileCommentSort.value = sort;
          profileCommentList.innerHTML = '<p class="text-sm text-slate-400 text-center">Cargando comentarios...</p>';

          await ensurePublicUsersLoaded();
          const result = await PostsAPI.getComments(postId, sort);
          const comments = getList(result);

          if (!result?.ok) {
            profileCommentList.innerHTML = '<p class="text-sm text-slate-400 text-center">No se pudieron cargar los comentarios.</p>';
            return;
          }

          if (!comments.length) {
            profileCommentList.innerHTML = '<p class="text-sm text-slate-400 text-center">Todavia no hay comentarios en esta publicacion.</p>';
            return;
          }

          profileCommentList.innerHTML = comments.map((comment) => renderCommentCard(comment)).join('');
        }

        async function confirmProfileComment() {
          const content = profileCommentInput.value.trim();
          if (!pendingProfileCommentId || !content) return;

          const result = await PostsAPI.addComment(pendingProfileCommentId, content);
          if (result?.ok) {
            showToast('Comentario anadido', 'success');
            profileCommentInput.value = '';
            await loadPosts(profileData.id);
            await loadProfileComments(pendingProfileCommentId, currentProfileCommentSort);
            return;
          }

          showToast(result?.data?.error || 'Error al comentar', 'error');
        }

        async function loadPosts(targetUserId) {
          await ensurePublicUsersLoaded();
          const result = await PostsAPI.getFeed();
          if (!result?.ok) {
            postsList.innerHTML = `
              <div class="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 profile-posts-empty flex items-center justify-center">
                <p class="text-gray-500 text-sm">No se pudieron cargar las publicaciones.</p>
              </div>
            `;
            return;
          }

          const posts = getList(result).filter((post) => Number(post.user_id) === Number(targetUserId));
          profilePosts = posts;

          if (!posts.length) {
            postsList.innerHTML = `
              <div class="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 profile-posts-empty flex items-center justify-center">
                <p class="text-gray-500 text-sm">No hay publicaciones todavia.</p>
              </div>
            `;
            return;
          }

          postsList.innerHTML = posts.map((post) => renderPostCard(post, user.id, { canDelete: false })).join('');
          if (pendingProfileCommentId) {
            renderProfileCommentModalPost(pendingProfileCommentId);
          }
        }

        async function loadProfile() {
          const targetUserId = params.id ? Number(params.id) : Number(user.id);
          const result = await AuthAPI.getProfile(targetUserId);

          if (!result?.ok) {
            appView.innerHTML = `
              <div class="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm">
                <p class="text-slate-500 text-sm">No se pudo cargar el perfil.</p>
              </div>
            `;
            return;
          }

          await ensurePublicUsersLoaded();
          profileData = resolveProfileData(result.data);
          if (profileData.id !== null) {
            publicUsersState.map.set(Number(profileData.id), profileData);
          }
          isOwnProfile = Number(profileData.id) === Number(appState.user.id);
          incomingRequestId = null;

          const [friendsResult, pendingResult, blockContextResult] = isOwnProfile
            ? [null, null, null]
            : await Promise.all([SocialAPI.getFriends(), SocialAPI.getPendingRequests(), SocialAPI.getBlockContext()]);

          const friends = friendsResult ? normalizeFriendEntries(getList(friendsResult)) : [];
          const pending = pendingResult ? getList(pendingResult) : [];
          const isFriend = friends.some((friend) => Number(friend.id) === Number(profileData.id));
          const blockedIds = blockContextResult?.ok && Array.isArray(blockContextResult.data?.blocked_ids)
            ? blockContextResult.data.blocked_ids.map((id) => Number(id)).filter((id) => Number.isFinite(id))
            : [];
          const hiddenIds = blockContextResult?.ok && Array.isArray(blockContextResult.data?.hidden_user_ids)
            ? blockContextResult.data.hidden_user_ids.map((id) => Number(id)).filter((id) => Number.isFinite(id))
            : [];
          const isBlockedByMe = blockedIds.includes(Number(profileData.id));
          const isBlockedByOther = hiddenIds.includes(Number(profileData.id)) && !isBlockedByMe;
          const incoming = findIncomingRequest(pending, profileData.id);
          if (incoming) incomingRequestId = incoming.id;

          const color = userColor(profileData);
          setBackgroundMedia(bannerView, profileData.banner_url, color);
          setAvatarElement(avatarView, profileData);
          avatarView.style.backgroundColor = color;
          profileName.textContent = displayName(profileData);
          profileCareer.textContent = careerLabel(profileData) || 'Sin informacion academica registrada';
          profileCode.textContent = profileData.student_code || 'No registrado';
          profileEmail.textContent = profileData.email || 'No registrado';
          profileCycle.textContent = cycleLabel(profileData.academic_cycle, true) || 'No registrado';
          setDocumentTitle(isOwnProfile ? 'Mi perfil' : displayName(profileData));

          originalBio = String(profileData.bio || '').trim();
          if (isOwnProfile) {
            setBioContent(profileData.bio || '');
            profileBio.dataset.placeholder = 'Cuentanos algo de ti';
          } else {
            setBioContent(profileData.bio || 'Este usuario aun no agrego una biografia.');
            profileBio.dataset.placeholder = 'Este usuario aun no agrego una biografia.';
          }

          profileBadges.innerHTML = `
            <span class="text-white text-xs font-semibold px-3 py-1.5 rounded-full" style="background:${color}">
              ${escapeHtml(profileData.faculty || 'UPT')}
            </span>
            ${profileData.academic_cycle ? `
              <span class="bg-white text-gray-600 text-xs font-medium px-3 py-1.5 rounded-full border border-gray-300 flex items-center gap-1.5">
                <span class="material-symbols-outlined text-[14px]">calendar_month</span>
                ${escapeHtml(cycleLabel(profileData.academic_cycle, true))}
              </span>
            ` : ''}
            ${profileData.user_type ? `
              <span class="bg-white text-gray-600 text-xs font-medium px-3 py-1.5 rounded-full border border-gray-300 flex items-center gap-1.5">
                ${escapeHtml(getUserTypeLabel(profileData.user_type))}
              </span>
            ` : ''}
          `;

          changeAvatarButton.classList.toggle('hidden', !isOwnProfile);
          changeAvatarButton.classList.toggle('inline-flex', isOwnProfile);
          changeBannerButton.classList.toggle('hidden', !isOwnProfile);
          changeBannerButton.classList.toggle('inline-flex', isOwnProfile);
          updateBioEditorState();

          if (isOwnProfile) {
            profileActions.innerHTML = '';
          } else if (isBlockedByOther) {
            profileActions.innerHTML = `
              <div class="bg-slate-100 text-slate-600 font-medium text-sm px-5 py-2.5 rounded-lg border border-slate-200">
                Este usuario no esta disponible
              </div>
            `;
          } else if (isBlockedByMe) {
            profileActions.innerHTML = `
              <button type="button" data-profile-action="unblock-user" class="bg-white border border-slate-200 text-slate-700 font-semibold text-sm px-6 py-2.5 rounded-lg transition-colors shadow-sm flex items-center gap-2 hover:bg-slate-50">
                <span class="material-symbols-outlined text-[20px]">undo</span>
                Desbloquear
              </button>
            `;
          } else if (isFriend) {
            profileActions.innerHTML = `
                <button type="button" disabled class="bg-[#1B2A6B] text-white font-semibold text-sm px-6 py-2.5 rounded-lg shadow-sm flex items-center gap-2 cursor-not-allowed opacity-95">
                <span class="material-symbols-outlined text-[20px]">group</span>
                Ya son amigos
              </button>
                <button type="button" data-profile-action="message" class="bg-white border border-slate-200 text-slate-700 font-semibold text-sm px-6 py-2.5 rounded-lg transition-colors shadow-sm flex items-center gap-2 hover:bg-slate-50">
                  <span class="material-symbols-outlined text-[20px]">chat</span>
                  Mensaje
                </button>
                <button type="button" data-profile-action="block-user" class="bg-white border border-red-200 text-red-600 font-semibold text-sm px-6 py-2.5 rounded-lg transition-colors shadow-sm flex items-center gap-2 hover:bg-red-50">
                  <span class="material-symbols-outlined text-[20px]">block</span>
                  Bloquear
                </button>
              `;
            } else if (incomingRequestId) {
              profileActions.innerHTML = `
                <button type="button" data-profile-action="accept-request" class="bg-[#1B2A6B] hover:bg-[#152259] text-white font-semibold text-sm px-6 py-2.5 rounded-lg transition-colors shadow-sm flex items-center gap-2">
                  <span class="material-symbols-outlined text-[20px]">how_to_reg</span>
                  Aceptar solicitud
                </button>
                <button type="button" data-profile-action="block-user" class="bg-white border border-red-200 text-red-600 font-semibold text-sm px-6 py-2.5 rounded-lg transition-colors shadow-sm flex items-center gap-2 hover:bg-red-50">
                  <span class="material-symbols-outlined text-[20px]">block</span>
                  Bloquear
                </button>
              `;
            } else {
              profileActions.innerHTML = `
                <button type="button" data-profile-action="send-request" class="bg-[#D4A017] hover:bg-[#C19015] text-black font-semibold text-sm px-6 py-2.5 rounded-lg transition-colors shadow-sm flex items-center gap-2">
                  <span class="material-symbols-outlined text-[20px]">person_add</span>
                  Enviar solicitud
                </button>
                <button type="button" data-profile-action="block-user" class="bg-white border border-red-200 text-red-600 font-semibold text-sm px-6 py-2.5 rounded-lg transition-colors shadow-sm flex items-center gap-2 hover:bg-red-50">
                  <span class="material-symbols-outlined text-[20px]">block</span>
                  Bloquear
                </button>
              `;
            }

          await loadPosts(profileData.id);
        }

        profileActions.addEventListener('click', async (event) => {
          const button = event.target.closest('[data-profile-action]');
          if (!button || !profileData) return;

            if (button.dataset.profileAction === 'message') {
              router.navigate('messages', { user: profileData.id });
              return;
            }

            if (button.dataset.profileAction === 'block-user') {
              const confirmed = window.confirm('Quieres bloquear a este usuario? Se cortara la amistad, el chat y las interacciones sociales entre ambos.');
              if (!confirmed) return;

              const result = await SocialAPI.blockUser(profileData.id);
              if (result?.ok) {
                showToast('Usuario bloqueado', 'success');
                window.dispatchEvent(new CustomEvent('friendship:changed'));
                window.dispatchEvent(new CustomEvent('blocks:changed'));
                if (window.loadNotifications) window.loadNotifications();
                loadProfile();
                return;
              }

              showToast(result?.data?.error || 'No se pudo bloquear al usuario', 'error');
              return;
            }

            if (button.dataset.profileAction === 'unblock-user') {
              const result = await SocialAPI.unblockUser(profileData.id);
              if (result?.ok) {
                showToast('Usuario desbloqueado', 'success');
                window.dispatchEvent(new CustomEvent('blocks:changed'));
                loadProfile();
                return;
              }

              showToast(result?.data?.error || 'No se pudo desbloquear al usuario', 'error');
              return;
            }

            if (button.dataset.profileAction === 'send-request') {
              const result = await SocialAPI.sendRequest(profileData.id);
              if (result?.ok) {
              showToast('Solicitud enviada', 'success');
              window.dispatchEvent(new CustomEvent('friendship:changed'));
              button.disabled = true;
              button.className = 'bg-[#D4A017] text-black/80 font-semibold text-sm px-6 py-2.5 rounded-lg shadow-sm flex items-center gap-2 cursor-not-allowed opacity-80';
              button.innerHTML = '<span class="material-symbols-outlined text-[20px]">hourglass_empty</span>Solicitud enviada';
              return;
            }
            showToast(result?.data?.error || 'No se pudo enviar la solicitud', 'error');
            return;
          }

          if (button.dataset.profileAction === 'accept-request' && incomingRequestId) {
            const result = await SocialAPI.acceptRequest(incomingRequestId);
            if (result?.ok) {
              showToast('Solicitud aceptada', 'success');
              window.dispatchEvent(new CustomEvent('friendship:changed'));
              if (window.loadNotifications) window.loadNotifications();
              loadProfile();
              return;
            }
            showToast(result?.data?.error || 'No se pudo aceptar la solicitud', 'error');
            return;
          }

        });

        postsList.addEventListener('click', async (event) => {
          const button = event.target.closest('[data-action]');
          if (button) {
            if (button.dataset.action === 'open-profile') {
              router.navigate('profile', { id: button.dataset.userId });
              return;
            }
            if (button.dataset.action === 'react-post') {
              await PostsAPI.reactPost(Number(button.dataset.postId), button.dataset.reaction);
              await loadPosts(profileData.id);
              return;
            }
            if (button.dataset.action === 'comment-post') {
              openProfileCommentModal(button.dataset.postId);
              return;
            }
            if (button.dataset.action === 'open-livestream') {
              router.navigate('live', { id: button.dataset.liveId });
              return;
            }
            if (button.dataset.action === 'report-post') {
              await reportContent('publicacion', Number(button.dataset.postId));
              return;
            }
          }

          const postCard = event.target.closest('[data-post-card]');
          if (postCard) {
            openProfileCommentModal(postCard.dataset.postId);
          }
        });

        profileCommentList.addEventListener('click', async (event) => {
          const button = event.target.closest('[data-action]');
          if (!button || !pendingProfileCommentId) return;

          if (button.dataset.action === 'react-comment') {
            const result = await PostsAPI.reactComment(button.dataset.commentId, button.dataset.reaction);
            if (result?.ok) {
              await loadProfileComments(pendingProfileCommentId, currentProfileCommentSort);
              return;
            }

            showToast(result?.data?.error || 'No se pudo reaccionar al comentario', 'error');
            return;
          }

          if (button.dataset.action === 'report-comment') {
            await reportContent('comentario', Number(button.dataset.commentId));
          }
        });

        profileCommentPostPreview.addEventListener('click', (event) => {
          const button = event.target.closest('[data-action="open-profile"]');
          if (!button) return;
          router.navigate('profile', { id: button.dataset.userId });
        });

        changeAvatarButton.addEventListener('click', () => avatarInput.click());
        changeBannerButton.addEventListener('click', () => bannerInput.click());
        avatarInput.addEventListener('change', (event) => openCropModal('avatar', event.target.files?.[0]));
        bannerInput.addEventListener('change', (event) => openCropModal('banner', event.target.files?.[0]));
        mediaCropZoom.addEventListener('input', (event) => {
          setCropZoom(Number(event.target.value) / 100);
        });
        mediaCropResetButton.addEventListener('click', () => {
          if (!cropState.image) return;
          initializeCropViewport();
        });
        mediaCropSaveButton.addEventListener('click', saveCroppedMedia);
        mediaCropCancelButton.addEventListener('click', () => closeCropModal({ mode: cropState.mode }));
        mediaCropCloseButton.addEventListener('click', () => closeCropModal({ mode: cropState.mode }));
        mediaCropModal.addEventListener('click', (event) => {
          if (event.target === mediaCropModal) {
            closeCropModal({ mode: cropState.mode });
          }
        });
        mediaCropStage.addEventListener('pointerdown', (event) => {
          if (!cropState.image || cropState.saving) return;
          cropState.pointerId = event.pointerId;
          cropState.dragStartX = event.clientX;
          cropState.dragStartY = event.clientY;
          cropState.dragOffsetX = cropState.offsetX;
          cropState.dragOffsetY = cropState.offsetY;
          mediaCropStage.classList.add('is-dragging');
          mediaCropStage.setPointerCapture(event.pointerId);
          event.preventDefault();
        });
        mediaCropStage.addEventListener('pointermove', (event) => {
          if (cropState.pointerId !== event.pointerId) return;
          cropState.offsetX = cropState.dragOffsetX + (event.clientX - cropState.dragStartX);
          cropState.offsetY = cropState.dragOffsetY + (event.clientY - cropState.dragStartY);
          renderCropStage();
          event.preventDefault();
        });
        const stopCropDrag = (event) => {
          if (cropState.pointerId === null) return;
          if (event && cropState.pointerId !== event.pointerId) return;

          if (event && mediaCropStage.hasPointerCapture(event.pointerId)) {
            mediaCropStage.releasePointerCapture(event.pointerId);
          }
          cropState.pointerId = null;
          mediaCropStage.classList.remove('is-dragging');
        };
        mediaCropStage.addEventListener('pointerup', stopCropDrag);
        mediaCropStage.addEventListener('pointercancel', stopCropDrag);
        mediaCropStage.addEventListener('lostpointercapture', () => {
          cropState.pointerId = null;
          mediaCropStage.classList.remove('is-dragging');
        });
        container.querySelector('#profile-close-comment-top-btn').addEventListener('click', closeProfileCommentModal);
        container.querySelector('#profile-confirm-comment-btn').addEventListener('click', confirmProfileComment);
        profileCommentSort.addEventListener('change', () => {
          if (!pendingProfileCommentId) return;
          loadProfileComments(pendingProfileCommentId, profileCommentSort.value);
        });
        profileCommentModal.addEventListener('click', (event) => {
          if (event.target === profileCommentModal) closeProfileCommentModal();
        });
        profileCommentInput.addEventListener('keydown', async (event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            await confirmProfileComment();
          }
        });
        profileCommentInput.addEventListener('input', () => {
          profileCommentInput.style.height = 'auto';
          profileCommentInput.style.height = `${Math.min(profileCommentInput.scrollHeight, 96)}px`;
        });
        profileBioActionButton.addEventListener('click', async () => {
          if (!isOwnProfile) return;
          if (bioChanged()) {
            await saveBio();
            return;
          }

          profileBio.focus();
          placeCaretAtEnd(profileBio);
        });
        profileBioCancelButton.addEventListener('click', () => {
          setBioContent(originalBio);
          updateBioEditorState();
          profileBio.blur();
        });
        profileBio.addEventListener('input', updateBioEditorState);
        profileBio.addEventListener('keydown', async (event) => {
          if (!isOwnProfile) return;
          if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && bioChanged()) {
            event.preventDefault();
            await saveBio();
            return;
          }

          if (event.key === 'Escape') {
            event.preventDefault();
            setBioContent(originalBio);
            updateBioEditorState();
            profileBio.blur();
          }
        });

        loadProfile();
      },
    },
    admin: {
      title: 'Admin',
      activeNav: 'admin',
      adminOnly: true,
      render() {
        return `
          <div class="flex flex-col w-full">
            <div class="flex justify-between items-start mb-6 gap-4 flex-wrap">
              <div>
                <h1 class="text-[28px] font-bold text-slate-900 tracking-tight leading-tight mb-1">Panel de administracion</h1>
                <p class="text-[15px] text-slate-500">Gestiona usuarios de UPT Connect desde un layout compartido.</p>
              </div>
              <button type="button" class="bg-[#D4A017] text-[#332200] font-bold text-[13px] px-4 py-2 rounded-full transition-colors flex items-center shadow-sm">
                ACCESO ADMIN
              </button>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6" id="admin-user-stats"></div>
            <div class="flex items-center bg-[#E5E7EB] rounded-full p-1 w-max mb-6">
              <button type="button" class="px-5 py-1.5 bg-white rounded-full text-sm font-semibold text-slate-900 shadow-sm">Usuarios</button>
              <button id="go-admin-posts-btn" type="button" class="px-5 py-1.5 rounded-full text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">Publicaciones</button>
              <button id="go-admin-reports-btn" type="button" class="px-5 py-1.5 rounded-full text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">Reportes</button>
            </div>
            <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div class="p-4 border-b border-slate-200">
                <div class="relative max-w-md">
                  <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[20px]">search</span>
                  <input id="admin-user-search" class="w-full bg-slate-50 border border-slate-200 rounded-full py-2 pl-10 pr-4 text-sm focus:ring-1 focus:ring-[#1B2A6B] outline-none" placeholder="Buscar usuario..." type="text"/>
                </div>
              </div>
              <div class="overflow-x-auto">
                <table class="w-full text-left border-collapse min-w-[900px]">
                  <thead>
                    <tr class="bg-slate-100/50 border-b border-slate-200">
                      <th class="py-3 px-5 text-[12px] font-bold text-slate-500 uppercase tracking-wider">Usuario</th>
                      <th class="py-3 px-5 text-[12px] font-bold text-slate-500 uppercase tracking-wider">Carrera</th>
                      <th class="py-3 px-5 text-[12px] font-bold text-slate-500 uppercase tracking-wider">Facultad</th>
                      <th class="py-3 px-5 text-[12px] font-bold text-slate-500 uppercase tracking-wider">Estado</th>
                      <th class="py-3 px-5 text-[12px] font-bold text-slate-500 uppercase tracking-wider">Rol</th>
                      <th class="py-3 px-5 text-[12px] font-bold text-slate-500 uppercase tracking-wider text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody id="users-tbody" class="divide-y divide-slate-100">
                    <tr><td colspan="6" class="py-8 text-center text-slate-400">Cargando usuarios...</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <div id="edit-user-modal" class="fixed inset-0 z-[100] hidden items-center justify-center bg-black/40 backdrop-blur-sm">
            <div class="bg-white rounded-3xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
              <div class="flex justify-between items-center p-6 border-b border-slate-200">
                <h2 class="text-lg font-bold text-slate-900">Editar usuario</h2>
                <button id="close-edit-user-modal-btn" type="button" class="p-1 rounded-full hover:bg-slate-100 transition-colors"><span class="material-symbols-outlined">close</span></button>
              </div>
              <form id="edit-user-form" class="p-6 space-y-5">
                <input id="edit-user-id" type="hidden"/>
                <div class="flex flex-col gap-1.5">
                  <label class="text-sm font-semibold text-gray-700">Nombre</label>
                  <input id="edit-user-name" class="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm outline-none" type="text" readonly/>
                </div>
                <div class="grid grid-cols-2 gap-4">
                  <div class="flex flex-col gap-1.5">
                    <label class="text-sm font-semibold text-gray-700">Tipo</label>
                    <select id="edit-user-type" class="w-full bg-white border border-slate-200 rounded-xl p-3 text-sm focus:border-[#1B2A6B] focus:ring-1 focus:ring-[#1B2A6B] outline-none">
                      <option value="student">Estudiante</option>
                      <option value="teacher">Docente</option>
                      <option value="administrativo">Administrativo</option>
                    </select>
                  </div>
                  <div class="flex flex-col gap-1.5">
                    <label id="edit-user-faculty-label" class="text-sm font-semibold text-gray-700">Facultad</label>
                    <select id="edit-user-faculty" class="w-full bg-white border border-slate-200 rounded-xl p-3 text-sm focus:border-[#1B2A6B] focus:ring-1 focus:ring-[#1B2A6B] outline-none">
                      <option value="FAING">FAING</option>
                      <option value="FACEM">FACEM</option>
                      <option value="FAEDCOH">FAEDCOH</option>
                      <option value="FADE">FADE</option>
                      <option value="FACSA">FACSA</option>
                      <option value="FAU">FAU</option>
                    </select>
                  </div>
                </div>
                <div class="flex flex-col gap-1.5" id="edit-user-career-group">
                  <label class="text-sm font-semibold text-gray-700">Carrera</label>
                  <input id="edit-user-career" class="w-full bg-white border border-slate-200 rounded-xl p-3 text-sm focus:border-[#1B2A6B] focus:ring-1 focus:ring-[#1B2A6B] outline-none" type="text"/>
                </div>
                <div class="grid grid-cols-2 gap-4">
                  <div class="flex flex-col gap-1.5" id="edit-user-cycle-group">
                    <label class="text-sm font-semibold text-gray-700">Ciclo</label>
                    <input id="edit-user-cycle" class="w-full bg-white border border-slate-200 rounded-xl p-3 text-sm focus:border-[#1B2A6B] focus:ring-1 focus:ring-[#1B2A6B] outline-none" type="text" placeholder="Ej. 8"/>
                  </div>
                  <div class="flex flex-col gap-1.5" id="edit-user-code-group">
                    <label class="text-sm font-semibold text-gray-700">Codigo</label>
                    <input id="edit-user-code" class="w-full bg-white border border-slate-200 rounded-xl p-3 text-sm focus:border-[#1B2A6B] focus:ring-1 focus:ring-[#1B2A6B] outline-none" type="text"/>
                  </div>
                </div>
                <div class="grid grid-cols-2 gap-4">
                  <div class="flex flex-col gap-1.5" id="edit-user-area-group">
                    <label class="text-sm font-semibold text-gray-700">Area</label>
                    <input id="edit-user-area" class="w-full bg-white border border-slate-200 rounded-xl p-3 text-sm focus:border-[#1B2A6B] focus:ring-1 focus:ring-[#1B2A6B] outline-none" type="text"/>
                  </div>
                  <div class="flex flex-col gap-1.5" id="edit-user-position-group">
                    <label class="text-sm font-semibold text-gray-700">Cargo</label>
                    <input id="edit-user-position" class="w-full bg-white border border-slate-200 rounded-xl p-3 text-sm focus:border-[#1B2A6B] focus:ring-1 focus:ring-[#1B2A6B] outline-none" type="text"/>
                  </div>
                </div>
                <div class="flex justify-end gap-3 pt-2">
                  <button id="cancel-edit-user-btn" type="button" class="px-6 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors">Cancelar</button>
                  <button type="submit" class="px-6 py-2.5 rounded-xl bg-[#1B2A6B] text-white text-sm font-semibold hover:bg-[#15215a] transition-colors">Guardar cambios</button>
                </div>
              </form>
            </div>
          </div>
          <div id="block-user-modal" class="fixed inset-0 z-[110] hidden items-center justify-center bg-black/40 backdrop-blur-sm">
            <div class="bg-white rounded-3xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
              <div class="flex justify-between items-center p-6 border-b border-slate-200">
                <div>
                  <h2 class="text-lg font-bold text-slate-900">Bloquear usuario</h2>
                  <p class="text-sm text-slate-500 mt-1">Define la duración del bloqueo y una razón opcional visible para el usuario.</p>
                </div>
                <button id="close-block-user-modal-btn" type="button" class="p-1 rounded-full hover:bg-slate-100 transition-colors"><span class="material-symbols-outlined">close</span></button>
              </div>
              <form id="block-user-form" class="p-6 space-y-5">
                <input id="block-user-id" type="hidden"/>
                <div class="rounded-2xl bg-slate-50 border border-slate-200 p-4">
                  <p class="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500 mb-2">Usuario</p>
                  <p id="block-user-name" class="text-sm font-semibold text-slate-900"></p>
                  <p id="block-user-email" class="text-xs text-slate-500 mt-1"></p>
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div class="flex flex-col gap-1.5">
                    <label class="text-sm font-semibold text-gray-700" for="block-user-duration">Duracion</label>
                    <select id="block-user-duration" class="w-full bg-white border border-slate-200 rounded-xl p-3 text-sm focus:border-[#1B2A6B] focus:ring-1 focus:ring-[#1B2A6B] outline-none">
                      <option value="24h">24 horas</option>
                      <option value="48h">48 horas</option>
                      <option value="1w">1 semana</option>
                      <option value="custom">Manual</option>
                      <option value="indefinite">Indefinido</option>
                    </select>
                  </div>
                  <div id="block-user-custom-group" class="hidden grid grid-cols-[1fr_120px] gap-2 items-end">
                    <div class="flex flex-col gap-1.5">
                      <label class="text-sm font-semibold text-gray-700" for="block-user-custom-value">Tiempo</label>
                      <input id="block-user-custom-value" min="1" class="w-full bg-white border border-slate-200 rounded-xl p-3 text-sm focus:border-[#1B2A6B] focus:ring-1 focus:ring-[#1B2A6B] outline-none" type="number" value="1"/>
                    </div>
                    <div class="flex flex-col gap-1.5">
                      <label class="text-sm font-semibold text-gray-700" for="block-user-custom-unit">Unidad</label>
                      <select id="block-user-custom-unit" class="w-full bg-white border border-slate-200 rounded-xl p-3 text-sm focus:border-[#1B2A6B] focus:ring-1 focus:ring-[#1B2A6B] outline-none">
                        <option value="hours">Horas</option>
                        <option value="days">Dias</option>
                        <option value="weeks">Semanas</option>
                      </select>
                    </div>
                  </div>
                </div>
                <div class="flex flex-col gap-1.5">
                  <label class="text-sm font-semibold text-gray-700" for="block-user-reason">Razon del bloqueo</label>
                  <textarea id="block-user-reason" class="w-full min-h-[120px] bg-white border border-slate-200 rounded-2xl p-4 text-sm focus:border-[#1B2A6B] focus:ring-1 focus:ring-[#1B2A6B] outline-none resize-none" placeholder="Opcional. Ej.: Incumplimiento de normas de la comunidad."></textarea>
                </div>
                <div class="flex justify-end gap-3 pt-2">
                  <button id="cancel-block-user-btn" type="button" class="px-6 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors">Cancelar</button>
                  <button type="submit" class="px-6 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition-colors">Bloquear cuenta</button>
                </div>
              </form>
            </div>
          </div>
        `;
      },
      mount({ container, router, user }) {
        const stats = container.querySelector('#admin-user-stats');
        const tbody = container.querySelector('#users-tbody');
        const searchInput = container.querySelector('#admin-user-search');
        const editModal = container.querySelector('#edit-user-modal');
        const editForm = container.querySelector('#edit-user-form');
        const blockModal = container.querySelector('#block-user-modal');
        const blockForm = container.querySelector('#block-user-form');

        let allUsers = [];

        function toggleCustomBlockFields(durationValue) {
          const customGroup = container.querySelector('#block-user-custom-group');
          customGroup.classList.toggle('hidden', durationValue !== 'custom');
        }

        function buildBlockedUntilIso(durationValue, customValue, customUnit) {
          if (durationValue === 'indefinite') {
            return { blockedUntil: null, isIndefinite: true };
          }

          const future = new Date();

          if (durationValue === '24h') future.setHours(future.getHours() + 24);
          if (durationValue === '48h') future.setHours(future.getHours() + 48);
          if (durationValue === '1w') future.setDate(future.getDate() + 7);

          if (durationValue === 'custom') {
            const amount = Number(customValue);
            if (!Number.isFinite(amount) || amount <= 0) {
              throw new Error('Ingresa una duracion manual valida');
            }

            if (customUnit === 'hours') future.setHours(future.getHours() + amount);
            if (customUnit === 'days') future.setDate(future.getDate() + amount);
            if (customUnit === 'weeks') future.setDate(future.getDate() + (amount * 7));
          }

          return { blockedUntil: future.toISOString(), isIndefinite: false };
        }

        function syncAdminEditFields(userType) {
          const isStudent = userType === 'student';
          const isAdministrative = userType === 'administrativo';
          container.querySelector('#edit-user-career-group').style.display = isStudent ? 'flex' : 'none';
          container.querySelector('#edit-user-cycle-group').style.display = isStudent ? 'flex' : 'none';
          container.querySelector('#edit-user-code-group').style.display = isStudent ? 'flex' : 'none';
          container.querySelector('#edit-user-area-group').style.display = isStudent ? 'none' : 'flex';
          container.querySelector('#edit-user-position-group').style.display = isStudent ? 'none' : 'flex';
          container.querySelector('#edit-user-faculty-label').textContent = isAdministrative ? 'Dependencia / facultad' : 'Facultad';
        }

        function openModal() {
          editModal.classList.remove('hidden');
          editModal.classList.add('flex');
        }

        function closeModal() {
          editModal.classList.add('hidden');
          editModal.classList.remove('flex');
        }

        function openBlockModal(listedUser) {
          container.querySelector('#block-user-id').value = listedUser.id;
          container.querySelector('#block-user-name').textContent = displayName(listedUser);
          container.querySelector('#block-user-email').textContent = listedUser.email || '-';
          container.querySelector('#block-user-reason').value = '';
          container.querySelector('#block-user-duration').value = '24h';
          container.querySelector('#block-user-custom-value').value = '1';
          container.querySelector('#block-user-custom-unit').value = 'hours';
          toggleCustomBlockFields('24h');
          blockModal.classList.remove('hidden');
          blockModal.classList.add('flex');
        }

        function closeBlockModal() {
          blockModal.classList.add('hidden');
          blockModal.classList.remove('flex');
          blockForm.reset();
        }

        function renderStats(users) {
          const total = users.length;
          const active = users.filter((item) => item.is_active !== false).length;
          const admins = users.filter((item) => item.role === 'admin').length;
          const completed = users.filter((item) => item.is_profile_complete).length;

          const cards = [
            { value: total, label: 'Usuarios totales', color: '#4A6BFF', bg: '#EBF0FF', icon: 'group' },
            { value: active, label: 'Usuarios activos', color: '#ffffff', bg: '#D4A017', icon: 'show_chart' },
            { value: admins, label: 'Administradores', color: '#4A55A2', bg: '#F0F2FB', icon: 'admin_panel_settings' },
            { value: completed, label: 'Perfiles completos', color: '#6B7280', bg: '#F3F4F6', icon: 'person' },
          ];

          stats.innerHTML = cards.map((card) => `
            <div class="bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex items-center gap-4">
              <div class="w-12 h-12 rounded-lg flex items-center justify-center shrink-0" style="background:${card.bg}; color:${card.color}">
                <span class="material-symbols-outlined text-[24px]">${card.icon}</span>
              </div>
              <div>
                <p class="text-[28px] font-bold text-slate-900 leading-none mb-1">${card.value}</p>
                <p class="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">${card.label}</p>
              </div>
            </div>
          `).join('');
        }

        function renderUsers(users) {
          if (!users.length) {
            tbody.innerHTML = '<tr><td colspan="6" class="py-8 text-center text-slate-400">No se encontraron usuarios.</td></tr>';
            return;
          }

          tbody.innerHTML = users.map((listedUser) => {
            const active = listedUser.is_active !== false;
            const isAdmin = listedUser.role === 'admin';
            const isSelf = Number(listedUser.id) === Number(user.id);
            return `
              <tr class="hover:bg-slate-50 transition-colors">
                <td class="py-3 px-5">
                  <div class="flex items-center gap-3">
                    ${renderAvatar(listedUser, { sizeClass: 'w-10 h-10', textClass: 'text-white font-bold text-sm' })}
                    <div>
                      <div class="font-bold text-sm text-slate-900">${escapeHtml(displayName(listedUser))}</div>
                      <div class="text-xs text-slate-500">${escapeHtml(listedUser.email || '-')}</div>
                    </div>
                  </div>
                </td>
                <td class="py-3 px-5 text-sm text-slate-700">${escapeHtml(careerLabel(listedUser) || '-')}</td>
                <td class="py-3 px-5"><span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold text-white tracking-wide" style="background:${userColor(listedUser)}">${escapeHtml(listedUser.faculty || 'UPT')}</span></td>
                <td class="py-3 px-5">
                  ${active
                    ? '<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] font-semibold text-[#16A34A] bg-[#DCFCE7]"><span class="w-1.5 h-1.5 rounded-full bg-[#16A34A]"></span> Activo</span>'
                    : `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] font-semibold text-[#DC2626] bg-[#FEE2E2]"><span class="w-1.5 h-1.5 rounded-full bg-[#DC2626]"></span> ${escapeHtml(formatBlockedUntilLabel(listedUser.blocked_until, listedUser.is_blocked_indefinitely))}</span>`
                  }
                </td>
                <td class="py-3 px-5">
                  ${isAdmin
                    ? '<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] font-semibold text-[#1B2A6B] bg-[#E8EDFF]"><span class="w-1.5 h-1.5 rounded-full bg-[#1B2A6B]"></span> Admin</span>'
                    : '<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] font-semibold text-slate-600 bg-slate-100"><span class="w-1.5 h-1.5 rounded-full bg-slate-400"></span> Usuario</span>'
                  }
                </td>
                <td class="py-3 px-5">
                  <div class="flex justify-end gap-2 flex-wrap">
                    <button type="button" data-edit-user="${listedUser.id}" class="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors shadow-sm">
                      <span class="material-symbols-outlined text-[16px]">edit</span> Editar
                    </button>
                    <button type="button" data-role-user="${listedUser.id}" data-next-role="${isAdmin ? 'user' : 'admin'}" ${isSelf && isAdmin ? 'disabled' : ''} class="flex items-center gap-1.5 px-3 py-1.5 ${isAdmin ? 'bg-[#EEF2FF] text-[#1B2A6B] border border-[#C7D2FE]' : 'bg-[#1B2A6B] text-white border border-[#1B2A6B]'} rounded-lg text-xs font-medium ${isSelf && isAdmin ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-90'} transition-colors shadow-sm">
                      <span class="material-symbols-outlined text-[16px]">admin_panel_settings</span> ${isAdmin ? 'Quitar admin' : 'Hacer admin'}
                    </button>
                    <button type="button" data-toggle-user="${listedUser.id}" data-active="${active ? '1' : '0'}" ${isSelf ? 'disabled' : ''} class="flex items-center gap-1.5 px-3 py-1.5 ${active ? 'bg-white text-slate-700 border border-slate-200' : 'bg-[#1B2A6B] text-white'} rounded-lg text-xs font-medium ${isSelf ? 'opacity-50 cursor-not-allowed' : 'hover:bg-slate-50'} transition-colors shadow-sm">
                      <span class="material-symbols-outlined text-[16px]">power_settings_new</span> ${active ? 'Bloquear' : 'Desbloquear'}
                    </button>
                  </div>
                </td>
              </tr>
            `;
          }).join('');
        }

        async function loadUsers() {
          const result = await AuthAPI.listAdminUsers();
          if (!result?.ok) {
            tbody.innerHTML = '<tr><td colspan="6" class="py-8 text-center text-slate-400">No se pudieron cargar los usuarios.</td></tr>';
            return;
          }
          allUsers = getList(result);
          renderStats(allUsers);
          renderUsers(allUsers);
        }

        searchInput.addEventListener('input', () => {
          const query = searchInput.value.trim().toLowerCase();
          const filtered = allUsers.filter((listedUser) => {
            const name = displayName(listedUser).toLowerCase();
            const email = String(listedUser.email || '').toLowerCase();
            return name.includes(query) || email.includes(query);
          });
          renderUsers(filtered);
        });

        tbody.addEventListener('click', async (event) => {
          const editButton = event.target.closest('[data-edit-user]');
          if (editButton) {
            const listedUser = allUsers.find((item) => Number(item.id) === Number(editButton.dataset.editUser));
            if (!listedUser) return;
            container.querySelector('#edit-user-id').value = listedUser.id;
            container.querySelector('#edit-user-name').value = displayName(listedUser);
            container.querySelector('#edit-user-type').value = listedUser.user_type || 'student';
            container.querySelector('#edit-user-faculty').value = listedUser.faculty || 'FAING';
            container.querySelector('#edit-user-career').value = careerLabel(listedUser);
            container.querySelector('#edit-user-cycle').value = listedUser.academic_cycle || '';
            container.querySelector('#edit-user-code').value = listedUser.student_code || '';
            container.querySelector('#edit-user-area').value = listedUser.area || '';
            container.querySelector('#edit-user-position').value = listedUser.position_title || '';
            syncAdminEditFields(container.querySelector('#edit-user-type').value);
            openModal();
            return;
          }

          const toggleButton = event.target.closest('[data-toggle-user]');
          const roleButton = event.target.closest('[data-role-user]');

          if (roleButton) {
            const result = await AuthAPI.updateUserRole(roleButton.dataset.roleUser, roleButton.dataset.nextRole);
            if (result?.ok) {
              showToast(result.data?.message || 'Rol actualizado', 'success');
              loadUsers();
              return;
            }
            showToast(result?.data?.error || 'No se pudo actualizar el rol', 'error');
            return;
          }

          if (!toggleButton) return;
          if (toggleButton.dataset.active === '1') {
            const listedUser = allUsers.find((item) => Number(item.id) === Number(toggleButton.dataset.toggleUser));
            if (!listedUser) return;
            openBlockModal(listedUser);
            return;
          }

          const result = await AuthAPI.toggleUser(toggleButton.dataset.toggleUser);
          if (result?.ok) {
            showToast(result.data?.message || 'Estado actualizado', 'success');
            loadUsers();
            return;
          }
          showToast(result?.data?.error || 'No se pudo actualizar el estado', 'error');
        });

        container.querySelector('#go-admin-posts-btn').addEventListener('click', () => router.navigate('admin-posts'));
        container.querySelector('#go-admin-reports-btn').addEventListener('click', () => router.navigate('admin-reports'));
        container.querySelector('#close-edit-user-modal-btn').addEventListener('click', closeModal);
        container.querySelector('#cancel-edit-user-btn').addEventListener('click', closeModal);
        container.querySelector('#close-block-user-modal-btn').addEventListener('click', closeBlockModal);
        container.querySelector('#cancel-block-user-btn').addEventListener('click', closeBlockModal);
        container.querySelector('#block-user-duration').addEventListener('change', (event) => {
          toggleCustomBlockFields(event.target.value);
        });
        container.querySelector('#edit-user-type').addEventListener('change', (event) => {
          syncAdminEditFields(event.target.value);
        });
        editModal.addEventListener('click', (event) => {
          if (event.target === editModal) closeModal();
        });
        blockModal.addEventListener('click', (event) => {
          if (event.target === blockModal) closeBlockModal();
        });

        editForm.addEventListener('submit', async (event) => {
          event.preventDefault();
          const userId = container.querySelector('#edit-user-id').value;
          const result = await AuthAPI.updateAcademic(userId, {
            user_type: container.querySelector('#edit-user-type').value,
            faculty: container.querySelector('#edit-user-faculty').value,
            career: container.querySelector('#edit-user-career').value,
            area: container.querySelector('#edit-user-area').value,
            position_title: container.querySelector('#edit-user-position').value,
            academic_cycle: container.querySelector('#edit-user-cycle').value,
            student_code: container.querySelector('#edit-user-code').value,
          });

          if (result?.ok) {
            showToast('Usuario actualizado', 'success');
            closeModal();
            loadUsers();
            return;
          }

          showToast(result?.data?.error || 'No se pudo guardar el usuario', 'error');
        });

        blockForm.addEventListener('submit', async (event) => {
          event.preventDefault();
          const userId = container.querySelector('#block-user-id').value;
          const blockedReason = container.querySelector('#block-user-reason').value.trim();
          const durationValue = container.querySelector('#block-user-duration').value;
          const customValue = container.querySelector('#block-user-custom-value').value;
          const customUnit = container.querySelector('#block-user-custom-unit').value;

          let blockWindow;
          try {
            blockWindow = buildBlockedUntilIso(durationValue, customValue, customUnit);
          } catch (error) {
            showToast(error.message || 'No se pudo calcular la duracion del bloqueo', 'error');
            return;
          }

          const result = await AuthAPI.toggleUser(userId, {
            blocked_reason: blockedReason || null,
            blocked_until: blockWindow.blockedUntil,
            is_indefinite: blockWindow.isIndefinite,
          });

          if (result?.ok) {
            showToast(result.data?.message || 'Usuario bloqueado', 'success');
            closeBlockModal();
            loadUsers();
            return;
          }

          showToast(result?.data?.error || 'No se pudo bloquear la cuenta', 'error');
        });

        loadUsers();
      },
    },
    'admin-reports': {
      title: 'Admin reportes',
      activeNav: 'admin',
      adminOnly: true,
      render() {
        return `
          <div class="flex flex-col w-full">
            <div class="flex justify-between items-start mb-6 gap-4 flex-wrap">
              <div>
                <h1 class="text-[28px] font-bold text-slate-900 tracking-tight leading-tight mb-1">Reportes pendientes</h1>
                <p class="text-[15px] text-slate-500">Resuelve casos pendientes de publicaciones, comentarios y mensajes.</p>
              </div>
              <button type="button" class="bg-[#D4A017] text-[#332200] font-bold text-[13px] px-4 py-2 rounded-full transition-colors flex items-center shadow-sm">
                ACCESO ADMIN
              </button>
            </div>
            <div class="flex items-center bg-[#E5E7EB] rounded-full p-1 w-max mb-6">
              <button id="go-admin-users-btn" type="button" class="px-5 py-1.5 rounded-full text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">Usuarios</button>
              <button id="go-admin-posts-btn" type="button" class="px-5 py-1.5 rounded-full text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">Publicaciones</button>
              <button type="button" class="px-5 py-1.5 bg-white rounded-full text-sm font-semibold text-slate-900 shadow-sm">Reportes</button>
            </div>
            <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div class="p-4 border-b border-slate-200">
                <h2 class="text-sm font-bold text-slate-900">Bandeja de reportes</h2>
                <p class="text-xs text-slate-500 mt-1">Los casos se retiran de esta lista cuando se descartan o se sancionan.</p>
              </div>
              <div class="overflow-x-auto">
                <table class="w-full text-left border-collapse min-w-[980px]">
                  <thead>
                    <tr class="bg-slate-100/50 border-b border-slate-200">
                      <th class="py-3 px-5 text-[12px] font-bold text-slate-500 uppercase tracking-wider">Usuario</th>
                      <th class="py-3 px-5 text-[12px] font-bold text-slate-500 uppercase tracking-wider">Tipo</th>
                      <th class="py-3 px-5 text-[12px] font-bold text-slate-500 uppercase tracking-wider">Contenido</th>
                      <th class="py-3 px-5 text-[12px] font-bold text-slate-500 uppercase tracking-wider">Fecha</th>
                      <th class="py-3 px-5 text-[12px] font-bold text-slate-500 uppercase tracking-wider text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody id="admin-reports-tbody" class="divide-y divide-slate-100">
                    <tr><td colspan="5" class="py-8 text-center text-slate-400">Cargando reportes...</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <div id="review-report-modal" class="fixed inset-0 z-[120] hidden items-center justify-center bg-black/40 backdrop-blur-sm px-4 py-6">
            <div class="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden">
              <div class="flex justify-between items-center p-6 border-b border-slate-200">
                <div>
                  <h2 class="text-lg font-bold text-slate-900">Revisar reporte</h2>
                  <p class="text-sm text-slate-500 mt-1">Visualiza el contenido denunciado antes de decidir.</p>
                </div>
                <button id="close-review-report-modal-btn" type="button" class="p-1 rounded-full hover:bg-slate-100 transition-colors"><span class="material-symbols-outlined">close</span></button>
              </div>
              <div class="p-6 space-y-5">
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div class="rounded-2xl bg-slate-50 border border-slate-200 p-4">
                    <p class="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500 mb-2">Usuario</p>
                    <p id="review-report-user" class="text-sm font-semibold text-slate-900"></p>
                  </div>
                  <div class="rounded-2xl bg-slate-50 border border-slate-200 p-4">
                    <p class="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500 mb-2">Tipo</p>
                    <p id="review-report-type" class="text-sm font-semibold text-slate-900"></p>
                  </div>
                  <div class="rounded-2xl bg-slate-50 border border-slate-200 p-4">
                    <p class="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500 mb-2">Fecha</p>
                    <p id="review-report-date" class="text-sm font-semibold text-slate-900"></p>
                  </div>
                </div>
                <div class="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                  <p class="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500 mb-3">Contenido denunciado</p>
                  <p id="review-report-content" class="text-sm text-slate-700 leading-6 whitespace-pre-wrap"></p>
                  <img id="review-report-image" class="hidden mt-4 w-full max-h-[320px] rounded-2xl object-cover border border-slate-200" alt="Contenido adjunto"/>
                </div>
                <div class="flex justify-end">
                  <button id="close-review-report-footer-btn" type="button" class="px-6 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors">Cerrar</button>
                </div>
              </div>
            </div>
          </div>
          <div id="sanction-report-modal" class="fixed inset-0 z-[130] hidden items-center justify-center bg-black/40 backdrop-blur-sm px-4 py-6">
            <div class="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden">
              <div class="flex justify-between items-center p-6 border-b border-slate-200">
                <div>
                  <h2 class="text-lg font-bold text-slate-900">Sancionar reporte</h2>
                  <p class="text-sm text-slate-500 mt-1">Aplica bloqueo y acciones adicionales según el contenido denunciado.</p>
                </div>
                <button id="close-sanction-report-modal-btn" type="button" class="p-1 rounded-full hover:bg-slate-100 transition-colors"><span class="material-symbols-outlined">close</span></button>
              </div>
              <form id="sanction-report-form" class="p-6 space-y-5">
                <input id="sanction-report-id" type="hidden"/>
                <input id="sanction-report-service" type="hidden"/>
                <input id="sanction-report-target-type" type="hidden"/>
                <input id="sanction-report-target-id" type="hidden"/>
                <input id="sanction-report-user-id" type="hidden"/>
                <div class="rounded-2xl bg-slate-50 border border-slate-200 p-4">
                  <p class="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500 mb-2">Usuario denunciado</p>
                  <p id="sanction-report-user" class="text-sm font-semibold text-slate-900"></p>
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div class="flex flex-col gap-1.5">
                    <label class="text-sm font-semibold text-gray-700" for="sanction-duration">Duracion del bloqueo</label>
                    <select id="sanction-duration" class="w-full bg-white border border-slate-200 rounded-xl p-3 text-sm focus:border-[#1B2A6B] focus:ring-1 focus:ring-[#1B2A6B] outline-none">
                      <option value="24h">24 horas</option>
                      <option value="48h">48 horas</option>
                      <option value="1w">1 semana</option>
                      <option value="custom">Manual</option>
                      <option value="indefinite">Indefinido</option>
                    </select>
                  </div>
                  <div id="sanction-custom-group" class="hidden grid grid-cols-[1fr_120px] gap-2 items-end">
                    <div class="flex flex-col gap-1.5">
                      <label class="text-sm font-semibold text-gray-700" for="sanction-custom-value">Tiempo</label>
                      <input id="sanction-custom-value" min="1" class="w-full bg-white border border-slate-200 rounded-xl p-3 text-sm focus:border-[#1B2A6B] focus:ring-1 focus:ring-[#1B2A6B] outline-none" type="number" value="1"/>
                    </div>
                    <div class="flex flex-col gap-1.5">
                      <label class="text-sm font-semibold text-gray-700" for="sanction-custom-unit">Unidad</label>
                      <select id="sanction-custom-unit" class="w-full bg-white border border-slate-200 rounded-xl p-3 text-sm focus:border-[#1B2A6B] focus:ring-1 focus:ring-[#1B2A6B] outline-none">
                        <option value="hours">Horas</option>
                        <option value="days">Dias</option>
                        <option value="weeks">Semanas</option>
                      </select>
                    </div>
                  </div>
                </div>
                <div class="flex flex-col gap-1.5">
                  <label class="text-sm font-semibold text-gray-700" for="sanction-reason">Razon de la sancion</label>
                  <textarea id="sanction-reason" class="w-full min-h-[120px] bg-white border border-slate-200 rounded-2xl p-4 text-sm focus:border-[#1B2A6B] focus:ring-1 focus:ring-[#1B2A6B] outline-none resize-none" placeholder="Opcional. Esta razón se mostrará cuando el usuario bloqueado intente volver a entrar."></textarea>
                </div>
                <div class="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                  <p class="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500 mb-3">Acciones adicionales</p>
                  <div id="sanction-actions" class="space-y-3"></div>
                </div>
                <div class="flex justify-end gap-3 pt-2">
                  <button id="cancel-sanction-report-btn" type="button" class="px-6 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors">Cancelar</button>
                  <button type="submit" class="px-6 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition-colors">Aplicar sancion</button>
                </div>
              </form>
            </div>
          </div>
        `;
      },
      mount({ container, router }) {
        const tbody = container.querySelector('#admin-reports-tbody');
        const reviewModal = container.querySelector('#review-report-modal');
        const sanctionModal = container.querySelector('#sanction-report-modal');
        const sanctionForm = container.querySelector('#sanction-report-form');
        let reportRows = [];

        function toggleSanctionCustomFields(durationValue) {
          const customGroup = container.querySelector('#sanction-custom-group');
          customGroup.classList.toggle('hidden', durationValue !== 'custom');
        }

        function formatReportType(report) {
          if (report.service === 'chat') return 'Mensaje';
          return report.target_type === 'comment' ? 'Comentario' : 'Publicacion';
        }

        function closeReviewModal() {
          reviewModal.classList.add('hidden');
          reviewModal.classList.remove('flex');
        }

        function closeSanctionModal() {
          sanctionModal.classList.add('hidden');
          sanctionModal.classList.remove('flex');
          sanctionForm.reset();
        }

        async function fetchReportDetails(report) {
          const api = report.service === 'chat' ? ChatAPI : PostsAPI;
          const result = await api.getReportDetails(report.id);
          if (!result?.ok) {
            throw new Error(result?.data?.error || 'No se pudo cargar el reporte');
          }

          return { ...report, ...result.data };
        }

        function renderSanctionActions(report) {
          const actions = [`
            <label class="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <input id="sanction-action-block" type="checkbox" class="mt-1 rounded border-slate-300 text-[#1B2A6B] focus:ring-[#1B2A6B]" checked/>
              <span>
                <span class="block text-sm font-semibold text-slate-900">Bloquear usuario</span>
                <span class="block text-xs text-slate-500 mt-1">Aplica bloqueo con la duración y razón definidas en este formulario.</span>
              </span>
            </label>
          `];

          if (report.service === 'posts' && report.target_type === 'post') {
            actions.push(`
              <label class="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <input id="sanction-action-delete-post" type="checkbox" class="mt-1 rounded border-slate-300 text-[#1B2A6B] focus:ring-[#1B2A6B]"/>
                <span>
                  <span class="block text-sm font-semibold text-slate-900">Eliminar publicacion</span>
                  <span class="block text-xs text-slate-500 mt-1">Quita la publicación denunciada del feed.</span>
                </span>
              </label>
            `);
          }

          if (report.service === 'posts' && report.target_type === 'comment') {
            actions.push(`
              <label class="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <input id="sanction-action-delete-comment" type="checkbox" class="mt-1 rounded border-slate-300 text-[#1B2A6B] focus:ring-[#1B2A6B]"/>
                <span>
                  <span class="block text-sm font-semibold text-slate-900">Eliminar comentario</span>
                  <span class="block text-xs text-slate-500 mt-1">Quita el comentario denunciado de la publicación.</span>
                </span>
              </label>
            `);
          }

          container.querySelector('#sanction-actions').innerHTML = actions.join('');
        }

        async function openReviewModal(report) {
          try {
            const details = await fetchReportDetails(report);
            container.querySelector('#review-report-user').textContent = details.reported_user_name || `Usuario #${details.reported_user_id ?? '-'}`;
            container.querySelector('#review-report-type').textContent = formatReportType(details);
            container.querySelector('#review-report-date').textContent = details.created_at
              ? new Date(details.created_at).toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' })
              : '-';
            container.querySelector('#review-report-content').textContent = details.content || details.content_preview || 'Sin contenido disponible';
            const reviewImage = container.querySelector('#review-report-image');
            if (details.image_url) {
              reviewImage.src = details.image_url;
              reviewImage.classList.remove('hidden');
            } else {
              reviewImage.src = '';
              reviewImage.classList.add('hidden');
            }
            reviewModal.classList.remove('hidden');
            reviewModal.classList.add('flex');
          } catch (error) {
            showToast(error.message || 'No se pudo cargar el contenido denunciado', 'error');
          }
        }

        async function openSanctionModal(report) {
          try {
            const details = await fetchReportDetails(report);
            container.querySelector('#sanction-report-id').value = details.id;
            container.querySelector('#sanction-report-service').value = details.service;
            container.querySelector('#sanction-report-target-type').value = details.target_type || 'message';
            container.querySelector('#sanction-report-target-id').value = details.target_id || details.message_id || '';
            container.querySelector('#sanction-report-user-id').value = details.reported_user_id || '';
            container.querySelector('#sanction-report-user').textContent = details.reported_user_name || `Usuario #${details.reported_user_id ?? '-'}`;
            container.querySelector('#sanction-duration').value = '24h';
            container.querySelector('#sanction-custom-value').value = '1';
            container.querySelector('#sanction-custom-unit').value = 'hours';
            container.querySelector('#sanction-reason').value = '';
            toggleSanctionCustomFields('24h');
            renderSanctionActions(details);
            sanctionModal.classList.remove('hidden');
            sanctionModal.classList.add('flex');
          } catch (error) {
            showToast(error.message || 'No se pudo preparar la sancion', 'error');
          }
        }

        function formatReportRows(reports) {
          if (!reports.length) {
            tbody.innerHTML = '<tr><td colspan="5" class="py-8 text-center text-slate-400">No hay reportes pendientes.</td></tr>';
            return;
          }

          tbody.innerHTML = reports.map((report) => `
            <tr class="hover:bg-slate-50 transition-colors">
              <td class="py-4 px-5">
                <div class="font-semibold text-sm text-slate-900">${escapeHtml(report.reported_user_name || `Usuario #${report.reported_user_id ?? '-'}`)}</div>
                <div class="text-xs text-slate-500">${escapeHtml(report.service === 'chat' ? 'Mensajes' : 'Publicaciones')}</div>
              </td>
              <td class="py-4 px-5 text-sm text-slate-600">${escapeHtml(formatReportType(report))}</td>
              <td class="py-4 px-5 text-sm text-slate-700">${escapeHtml(report.content_preview || 'Sin contenido')}</td>
              <td class="py-4 px-5 text-sm text-slate-500">${escapeHtml(timeAgo(report.created_at))}</td>
              <td class="py-4 px-5">
                <div class="flex justify-end gap-2 flex-wrap">
                  <button type="button" data-report-review="${report.id}" class="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50">Revisar</button>
                  <button type="button" data-report-dismiss="${report.id}" class="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50">Descartar</button>
                  <button type="button" data-report-sanction="${report.id}" class="px-3 py-1.5 rounded-lg bg-[#1B2A6B] text-xs font-semibold text-white hover:bg-[#15215a]">Sancionar</button>
                </div>
              </td>
            </tr>
          `).join('');
        }

        async function loadReports() {
          await ensurePublicUsersLoaded();
          const [postReports, chatReports] = await Promise.all([
            PostsAPI.listReports('pending'),
            ChatAPI.listReports('pending'),
          ]);

          const reports = [];
          if (postReports?.ok) reports.push(...getList(postReports).map((item) => ({ ...item, service: 'posts' })));
          if (chatReports?.ok) {
            reports.push(...getList(chatReports).map((item) => {
              const relatedUser = publicUsersState.map.get(Number(item.reported_user_id));
              return {
                ...item,
                service: 'chat',
                target_type: 'message',
                target_id: item.message_id,
                reported_user_name: relatedUser ? displayName(relatedUser) : (item.reported_user_name || `Usuario #${item.reported_user_id ?? '-'}`),
              };
            }));
          }

          reports.sort((left, right) => new Date(right.created_at || 0).getTime() - new Date(left.created_at || 0).getTime());
          reportRows = reports;
          formatReportRows(reports);
        }

        container.querySelector('#go-admin-users-btn').addEventListener('click', () => router.navigate('admin'));
        container.querySelector('#go-admin-posts-btn').addEventListener('click', () => router.navigate('admin-posts'));
        container.querySelector('#close-review-report-modal-btn').addEventListener('click', closeReviewModal);
        container.querySelector('#close-review-report-footer-btn').addEventListener('click', closeReviewModal);
        container.querySelector('#close-sanction-report-modal-btn').addEventListener('click', closeSanctionModal);
        container.querySelector('#cancel-sanction-report-btn').addEventListener('click', closeSanctionModal);
        container.querySelector('#sanction-duration').addEventListener('change', (event) => {
          toggleSanctionCustomFields(event.target.value);
        });
        reviewModal.addEventListener('click', (event) => {
          if (event.target === reviewModal) closeReviewModal();
        });
        sanctionModal.addEventListener('click', (event) => {
          if (event.target === sanctionModal) closeSanctionModal();
        });
        tbody.addEventListener('click', async (event) => {
          const reviewButton = event.target.closest('[data-report-review]');
          if (reviewButton) {
            const report = reportRows.find((item) => Number(item.id) === Number(reviewButton.dataset.reportReview));
            if (report) await openReviewModal(report);
            return;
          }

          const dismissButton = event.target.closest('[data-report-dismiss]');
          if (dismissButton) {
            const report = reportRows.find((item) => Number(item.id) === Number(dismissButton.dataset.reportDismiss));
            if (!report) return;
            const api = report.service === 'chat' ? ChatAPI : PostsAPI;
            const result = await api.updateReportStatus(report.id, {
              status: 'dismissed',
              resolution_notes: null,
            });

            if (result?.ok) {
              showToast('Reporte descartado', 'success');
              await loadReports();
              return;
            }

            showToast(result?.data?.error || 'No se pudo descartar el reporte', 'error');
            return;
          }

          const sanctionButton = event.target.closest('[data-report-sanction]');
          if (sanctionButton) {
            const report = reportRows.find((item) => Number(item.id) === Number(sanctionButton.dataset.reportSanction));
            if (report) await openSanctionModal(report);
          }
        });

        sanctionForm.addEventListener('submit', async (event) => {
          event.preventDefault();

          const reportId = container.querySelector('#sanction-report-id').value;
          const service = container.querySelector('#sanction-report-service').value;
          const targetId = container.querySelector('#sanction-report-target-id').value;
          const reportedUserId = container.querySelector('#sanction-report-user-id').value;
          const durationValue = container.querySelector('#sanction-duration').value;
          const customValue = container.querySelector('#sanction-custom-value').value;
          const customUnit = container.querySelector('#sanction-custom-unit').value;
          const sanctionReason = container.querySelector('#sanction-reason').value.trim();
          const shouldBlock = container.querySelector('#sanction-action-block')?.checked ?? false;
          const shouldDeletePost = container.querySelector('#sanction-action-delete-post')?.checked ?? false;
          const shouldDeleteComment = container.querySelector('#sanction-action-delete-comment')?.checked ?? false;

          if (!shouldBlock && !shouldDeletePost && !shouldDeleteComment) {
            showToast('Selecciona al menos una accion para sancionar', 'error');
            return;
          }

          let blockWindow = { blockedUntil: null, isIndefinite: false };
          if (shouldBlock) {
            try {
              blockWindow = buildBlockedUntilIso(durationValue, customValue, customUnit);
            } catch (error) {
              showToast(error.message || 'No se pudo calcular la duracion del bloqueo', 'error');
              return;
            }
          }

          if (shouldDeletePost) {
            const deletePostResult = await PostsAPI.adminDeletePost(targetId);
            if (!deletePostResult?.ok) {
              showToast(deletePostResult?.data?.error || 'No se pudo eliminar la publicacion', 'error');
              return;
            }
          }

          if (shouldDeleteComment) {
            const deleteCommentResult = await PostsAPI.adminDeleteComment(targetId);
            if (!deleteCommentResult?.ok) {
              showToast(deleteCommentResult?.data?.error || 'No se pudo eliminar el comentario', 'error');
              return;
            }
          }

          if (shouldBlock) {
            const blockResult = await AuthAPI.toggleUser(reportedUserId, {
              blocked_reason: sanctionReason || null,
              blocked_until: blockWindow.blockedUntil,
              is_indefinite: blockWindow.isIndefinite,
            });

            if (!blockResult?.ok) {
              showToast(blockResult?.data?.error || 'No se pudo bloquear al usuario', 'error');
              return;
            }
          }

          const api = service === 'chat' ? ChatAPI : PostsAPI;
          const resolveResult = await api.updateReportStatus(reportId, {
            status: 'sanctioned',
            resolution_notes: sanctionReason || null,
          });

          if (resolveResult?.ok) {
            showToast('Sancion aplicada correctamente', 'success');
            closeSanctionModal();
            await loadReports();
            return;
          }

          showToast(resolveResult?.data?.error || 'No se pudo cerrar el reporte como sancionado', 'error');
        });

        loadReports();
      },
    },
    'admin-posts': {
      title: 'Admin publicaciones',
      activeNav: 'admin',
      adminOnly: true,
      render() {
        return `
          <div class="flex flex-col w-full">
            <div class="flex justify-between items-start mb-6 gap-4 flex-wrap">
              <div>
                <h1 class="text-[28px] font-bold text-slate-900 tracking-tight leading-tight mb-1">Moderacion de publicaciones</h1>
                <p class="text-[15px] text-slate-500">Revisa publicaciones y comentarios desde el mismo layout compartido.</p>
              </div>
              <button type="button" class="bg-[#D4A017] text-[#332200] font-bold text-[13px] px-4 py-2 rounded-full transition-colors flex items-center shadow-sm">
                ACCESO ADMIN
              </button>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6" id="admin-post-stats"></div>
            <div class="flex items-center bg-[#E5E7EB] rounded-full p-1 w-max mb-6">
              <button id="go-admin-users-btn" type="button" class="px-5 py-1.5 rounded-full text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">Usuarios</button>
              <button type="button" class="px-5 py-1.5 bg-white rounded-full text-sm font-semibold text-slate-900 shadow-sm">Publicaciones</button>
              <button id="go-admin-reports-btn" type="button" class="px-5 py-1.5 rounded-full text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">Reportes</button>
            </div>
            <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div class="overflow-x-auto">
                <table class="w-full text-left border-collapse min-w-[900px]">
                  <thead>
                    <tr class="bg-slate-100/50 border-b border-slate-200">
                      <th class="py-3 px-5 text-[12px] font-bold text-slate-500 uppercase tracking-wider">Autor</th>
                      <th class="py-3 px-5 text-[12px] font-bold text-slate-500 uppercase tracking-wider">Contenido</th>
                      <th class="py-3 px-5 text-[12px] font-bold text-slate-500 uppercase tracking-wider">Publicado</th>
                      <th class="py-3 px-5 text-[12px] font-bold text-slate-500 uppercase tracking-wider text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody id="admin-posts-tbody" class="divide-y divide-slate-100">
                    <tr><td colspan="4" class="py-8 text-center text-slate-400">Cargando publicaciones...</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <div id="admin-comments-modal" class="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-50 hidden px-3 py-4">
            <div class="post-comments-modal bg-white rounded-[28px] shadow-xl w-full overflow-hidden flex flex-col">
              <div class="post-comments-topbar">
                <h3 class="post-comments-topbar-title">Publicacion</h3>
                <button id="close-comments-modal-btn" type="button" class="post-comments-topbar-close" aria-label="Cerrar modal de publicacion">
                  <span class="material-symbols-outlined text-[20px]">close</span>
                </button>
              </div>
              <div class="post-comments-body">
                <div class="post-comments-scroll custom-scrollbar">
                  <div id="admin-comment-post-preview" class="post-comments-preview"></div>
                  <div class="post-comments-side">
                    <div class="post-comments-section-head">
                      <span class="post-comments-section-title">Comentarios</span>
                      <select id="admin-comments-sort" class="post-comments-sort">
                        <option value="newest">Mas recientes</option>
                        <option value="oldest">Mas antiguos</option>
                      </select>
                    </div>
                    <div id="admin-comments-list" class="post-comments-list">
                      <p class="text-sm text-slate-400 text-center">Selecciona una publicacion para ver sus comentarios.</p>
                    </div>
                  </div>
                </div>
                <div class="post-comments-compose">
                  <div class="flex justify-end">
                    <button id="close-comments-modal-footer-btn" type="button" class="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors">Cerrar</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        `;
      },
      mount({ container, router }) {
        const stats = container.querySelector('#admin-post-stats');
        const tbody = container.querySelector('#admin-posts-tbody');
        const commentsModal = container.querySelector('#admin-comments-modal');
        const commentPostPreview = container.querySelector('#admin-comment-post-preview');
        const commentsList = container.querySelector('#admin-comments-list');
        const commentsSort = container.querySelector('#admin-comments-sort');

        let allPosts = [];
        let currentCommentsPostId = null;

        function closeCommentsModal() {
          currentCommentsPostId = null;
          commentsModal.classList.add('hidden');
          commentsModal.classList.remove('flex');
        }

        function openCommentsModal() {
          commentsModal.classList.remove('hidden');
          commentsModal.classList.add('flex');
        }

        function renderStats(posts) {
          const total = posts.length;
          const withImages = posts.filter((item) => !!item.image_url).length;
          const comments = posts.reduce((sum, item) => sum + Number(item.comments_count || 0), 0);
          const reactions = posts.reduce((sum, item) => sum + Number(item.reactions_total || 0), 0);

          const cards = [
            { value: total, label: 'Publicaciones', color: '#4A6BFF', bg: '#EBF0FF', icon: 'article' },
            { value: withImages, label: 'Con imagen', color: '#ffffff', bg: '#D4A017', icon: 'image' },
            { value: comments, label: 'Comentarios', color: '#4A55A2', bg: '#F0F2FB', icon: 'chat_bubble' },
            { value: reactions, label: 'Reacciones', color: '#6B7280', bg: '#F3F4F6', icon: 'favorite' },
          ];

          stats.innerHTML = cards.map((card) => `
            <div class="bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex items-center gap-4">
              <div class="w-12 h-12 rounded-lg flex items-center justify-center shrink-0" style="background:${card.bg}; color:${card.color}">
                <span class="material-symbols-outlined text-[24px]">${card.icon}</span>
              </div>
              <div>
                <p class="text-[28px] font-bold text-slate-900 leading-none mb-1">${card.value}</p>
                <p class="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">${card.label}</p>
              </div>
            </div>
          `).join('');
        }

        function renderPosts(posts) {
          if (!posts.length) {
            tbody.innerHTML = '<tr><td colspan="4" class="py-8 text-center text-slate-400">No hay publicaciones para mostrar.</td></tr>';
            return;
          }

          tbody.innerHTML = posts.map((post) => {
            const author = resolveProfileData({
              id: post.user_id,
              user_name: post.user_name,
              user_faculty: post.user_faculty,
              user_school: post.user_school,
              user_avatar: post.user_avatar,
            });

            return `
              <tr class="hover:bg-slate-50 transition-colors">
                <td class="py-4 px-5">
                  <div class="flex items-center gap-3">
                    ${renderAvatar(author, { sizeClass: 'w-10 h-10', textClass: 'text-white font-bold text-sm' })}
                    <div>
                      <div class="font-bold text-sm text-slate-900">${escapeHtml(displayName(author))}</div>
                      <span class="inline-flex items-center px-2.5 py-0.5 mt-0.5 rounded-full text-[10px] font-bold text-white tracking-wide" style="background:${userColor(author)}">${escapeHtml(author.faculty || 'UPT')}</span>
                    </div>
                  </div>
                </td>
                <td class="py-4 px-5">
                  <div class="flex gap-3 items-start">
                      ${post.image_url ? `<img alt="Miniatura" class="w-12 h-12 rounded-lg object-cover" src="${safeUrl(post.image_url)}" onerror="this.style.display='none'"/>` : ''}
                    <div class="min-w-0">
                      <p class="content-break text-sm text-slate-700 mb-1.5">${escapeHtml((post.content || '').slice(0, 140) || 'Sin contenido')}</p>
                      ${post.image_url ? '<span class="inline-flex items-center gap-1 px-2 py-0.5 bg-[#EEF2FF] text-[#4F46E5] rounded text-[10px] font-medium border border-[#E0E7FF]"><span class="material-symbols-outlined text-[12px]">image</span>Con imagen</span>' : ''}
                    </div>
                  </div>
                </td>
                <td class="py-4 px-5 text-sm text-slate-500">${escapeHtml(timeAgo(post.created_at))}</td>
                <td class="py-4 px-5">
                  <div class="flex justify-end gap-2">
                    <button type="button" data-view-comments="${post.id}" class="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors shadow-sm">
                      <span class="material-symbols-outlined text-[16px]">visibility</span> Ver Publicacion <span class="font-semibold ml-1">${post.comments_count || 0}</span>
                    </button>
                    <button type="button" data-delete-post="${post.id}" class="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-[#DC2626] hover:bg-slate-50 transition-colors shadow-sm">
                      <span class="material-symbols-outlined text-[16px]">delete</span> Eliminar
                    </button>
                  </div>
                </td>
              </tr>
            `;
          }).join('');
        }

        async function loadPosts() {
          await ensurePublicUsersLoaded();
          const result = await PostsAPI.getFeed();
          if (!result?.ok) {
            tbody.innerHTML = '<tr><td colspan="4" class="py-8 text-center text-slate-400">No se pudieron cargar las publicaciones.</td></tr>';
            return;
          }

          allPosts = getList(result);
          renderStats(allPosts);
          renderPosts(allPosts);
        }

        async function showComments(postId, sort = commentsSort.value || 'newest') {
          currentCommentsPostId = Number(postId);
          commentsSort.value = sort;
          openCommentsModal();
          const selectedPost = allPosts.find((post) => Number(post.id) === currentCommentsPostId);
          commentPostPreview.innerHTML = renderPostModalPreview(selectedPost, appState.user?.id);
          commentsList.innerHTML = '<p class="text-slate-400 text-sm text-center">Cargando comentarios...</p>';

          await ensurePublicUsersLoaded();
          const result = await PostsAPI.getComments(postId, sort);
          const comments = getList(result);

          if (!result?.ok) {
            commentsList.innerHTML = '<p class="text-slate-400 text-sm text-center">No se pudieron cargar los comentarios.</p>';
            return;
          }

          if (!comments.length) {
            commentsList.innerHTML = '<p class="text-slate-400 text-sm text-center">No hay comentarios para esta publicacion.</p>';
            return;
          }

          commentsList.innerHTML = comments.map((comment) => renderCommentCard(comment, {
            interactive: false,
            footerActions: `
              <button
                type="button"
                data-delete-admin-comment="${comment.id}"
                class="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-[11px] font-semibold text-red-600 transition-colors hover:bg-red-50"
              >
                <span class="material-symbols-outlined text-[15px]">delete</span>
                Eliminar comentario
              </button>
            `,
          })).join('');
        }

        container.querySelector('#go-admin-users-btn').addEventListener('click', () => router.navigate('admin'));
        container.querySelector('#go-admin-reports-btn').addEventListener('click', () => router.navigate('admin-reports'));
        container.querySelector('#close-comments-modal-btn').addEventListener('click', closeCommentsModal);
        container.querySelector('#close-comments-modal-footer-btn').addEventListener('click', closeCommentsModal);
        commentsSort.addEventListener('change', () => {
          if (!currentCommentsPostId) return;
          showComments(currentCommentsPostId, commentsSort.value);
        });
        commentsModal.addEventListener('click', (event) => {
          if (event.target === commentsModal) closeCommentsModal();
        });

        tbody.addEventListener('click', async (event) => {
          const commentsButton = event.target.closest('[data-view-comments]');
          if (commentsButton) {
            showComments(commentsButton.dataset.viewComments);
            return;
          }

          const deleteButton = event.target.closest('[data-delete-post]');
          if (!deleteButton) return;
          const confirmed = window.confirm('Deseas eliminar esta publicacion?');
          if (!confirmed) return;

          const result = await PostsAPI.adminDeletePost(deleteButton.dataset.deletePost);
          if (result?.ok) {
            showToast('Publicacion eliminada', 'success');
            loadPosts();
            return;
          }
          showToast(result?.data?.error || 'No se pudo eliminar la publicacion', 'error');
        });

        commentsList.addEventListener('click', async (event) => {
          const deleteCommentButton = event.target.closest('[data-delete-admin-comment]');
          if (!deleteCommentButton || !currentCommentsPostId) return;

          const result = await PostsAPI.adminDeleteComment(deleteCommentButton.dataset.deleteAdminComment);
          if (result?.ok) {
            showToast('Comentario eliminado', 'success');
            await loadPosts();
            await showComments(currentCommentsPostId, commentsSort.value);
            return;
          }

          showToast(result?.data?.error || 'No se pudo eliminar el comentario', 'error');
        });

        loadPosts();
      },
    },
  };

  views.messages.mount = initMessagesView;

  const AppRouter = {
    currentRoute: null,
    navigate(route, params = {}, options = {}) {
      const targetHash = buildHash(route, params);
      const targetUrl = `${window.location.pathname}${targetHash}`;

      if (options.replace) {
        window.history.replaceState(null, '', targetUrl);
      } else {
        window.history.pushState(null, '', targetUrl);
      }

      this.render();
    },
    async render() {
      const parsed = parseRoute();
      const view = views[parsed.route] || views.feed;

      if (view.adminOnly && appState.user.role !== 'admin') {
        showToast('No tienes acceso a esa seccion', 'error');
        this.navigate('feed', {}, { replace: true });
        return;
      }

      if (appState.cleanup) {
        try {
          appState.cleanup();
        } catch (error) {
          console.error('Cleanup error:', error);
        }
        appState.cleanup = null;
      }

      this.currentRoute = parsed;
      appView.innerHTML = view.render({ user: appState.user, params: parsed.params, router: this });
      if (sidebar) sidebar.setAttribute('active-nav', view.activeNav || parsed.route);
      if (window.setupLayoutData) window.setupLayoutData(appState.user);
      setDocumentTitle(view.title || parsed.route);

      if (view.mount) {
        const cleanup = await view.mount({
          container: appView,
          user: appState.user,
          params: parsed.params,
          router: this,
        });
        appState.cleanup = typeof cleanup === 'function' ? cleanup : null;
      }
    },
  };

  function bootstrapGlobalCallManager() {
    if (window.__uptCallManager?.id) {
      return;
    }

    const host = document.createElement('div');
    host.id = 'global-call-runtime-host';
    host.style.display = 'none';
    host.setAttribute('aria-hidden', 'true');
    host.innerHTML = views.messages.render();
    document.body.appendChild(host);

    const cleanup = initMessagesView({
      container: host,
      user: appState.user,
      params: {},
      callManagerOnly: true,
    });

    if (typeof cleanup === 'function') {
      window.__uptCallManagerCleanup = cleanup;
    }
  }

  function startGlobalIncomingCallWatcher() {
    if (globalIncomingCallPollTimer) {
      return;
    }

    globalIncomingCallPollTimer = window.setInterval(async () => {
      if (document.hidden || globalIncomingCallPollInFlight) {
        return;
      }

      if (window.__uptGlobalCallRuntime?.isActive?.()) {
        return;
      }

      globalIncomingCallPollInFlight = true;
      try {
        await window.__uptCallManager?.pollPendingCallsOnce?.();
      } finally {
        globalIncomingCallPollInFlight = false;
      }
    }, GLOBAL_INCOMING_CALL_POLL_INTERVAL_MS);
  }

  window.AppRouter = AppRouter;

  window.addEventListener('hashchange', () => {
    AppRouter.render();
  });

  if (!window.location.hash) {
    window.history.replaceState(null, '', `${window.location.pathname}${buildHash('feed')}`);
  }

  if (window.setupLayoutData) window.setupLayoutData(appState.user);
  bootstrapGlobalCallManager();
  startGlobalIncomingCallWatcher();
  AppRouter.render();
})().catch((error) => {
  console.error('App bootstrap error:', error);
  const appView = document.getElementById('app-view');
  if (appView) {
    appView.innerHTML = `
      <div class="bg-white rounded-2xl border border-red-200 p-6 shadow-sm">
        <h2 class="text-base font-bold text-red-600 mb-2">No se pudo iniciar la aplicacion</h2>
        <p class="text-sm text-slate-600">Recarga la pagina. Si el problema continua, vuelve a iniciar sesion.</p>
      </div>
    `;
  }
});
