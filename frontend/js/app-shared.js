(function () {
  const PRESENCE_ONLINE_WINDOW_MS = 2 * 60 * 1000;

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

  function buildHash(route, params = {}) {
    const shortHashParam = getShortHashRouteParam(route, params);
    if (shortHashParam) {
      const restParams = { ...params };
      delete restParams[shortHashParam.key];
      const searchParams = new URLSearchParams();
      Object.entries(restParams).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          searchParams.set(key, value);
        }
      });
      const query = searchParams.toString();
      return `#${route}/${encodeResourceHash(shortHashParam.value)}${query ? `?${query}` : ''}`;
    }

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
    const [routePart, hashPart = ''] = normalized.split('/');
    const route = ROUTE_ALIASES[routePart] || routePart || 'feed';
    const params = Object.fromEntries(new URLSearchParams(queryString));
    const hashParamKey = getShortHashParamKey(route);
    if (hashParamKey && hashPart && !params[hashParamKey]) {
      const decodedId = decodeResourceHash(hashPart);
      if (decodedId) params[hashParamKey] = String(decodedId);
    }
    return { route, params };
  }

  function getShortHashParamKey(route) {
    if (route === 'profile' || route === 'group') return 'id';
    if (route === 'messages') return 'user';
    return '';
  }

  function getShortHashRouteParam(route, params = {}) {
    const key = getShortHashParamKey(route);
    if (!key || params[key] === undefined || params[key] === null || params[key] === '') return null;
    return { key, value: params[key] };
  }

  function encodeResourceHash(value) {
    const id = Number(value);
    if (!Number.isFinite(id) || id <= 0) return encodeURIComponent(String(value || ''));
    const mixed = Math.trunc(id) * 7919 + 104729;
    return mixed.toString(36);
  }

  function decodeResourceHash(hash) {
    const mixed = Number.parseInt(String(hash || ''), 36);
    if (!Number.isFinite(mixed)) return null;
    const id = (mixed - 104729) / 7919;
    return Number.isInteger(id) && id > 0 ? id : null;
  }

  function setDocumentTitle(title) {
    document.title = title ? `${title} - UPT Connect` : 'UPT Connect';
  }

  const LIVESTREAM_IS_LOCAL_ENGINE = ['localhost', '127.0.0.1'].includes(window.location.hostname || '');
  const LIVESTREAM_PRIMARY_TRANSPORT = LIVESTREAM_IS_LOCAL_ENGINE ? 'tcp' : '';
  const LIVESTREAM_FALLBACK_TRANSPORT = LIVESTREAM_IS_LOCAL_ENGINE ? '' : 'tcp';

  function appendLivestreamTransport(url, transport = '') {
    if (!transport) {
      return url;
    }

    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}transport=${encodeURIComponent(transport)}`;
  }

  function resolveDefaultLivestreamViewerTransport() {
    return LIVESTREAM_PRIMARY_TRANSPORT;
  }

  function getLivestreamEngineHost() {
    return window.location.hostname || 'localhost';
  }

  function buildLivestreamHlsUrl(streamKey, revision = '') {
    const baseUrl = `${window.location.origin}/ome/app/${encodeURIComponent(streamKey)}/master.m3u8`;
    if (!revision) {
      return baseUrl;
    }
    return `${baseUrl}?v=${encodeURIComponent(revision)}`;
  }

  function buildLivestreamWebRtcUrl(streamKey, _revision = '', transport = LIVESTREAM_PRIMARY_TRANSPORT) {
    const hostname = window.location.hostname;
    const encodedKey = encodeURIComponent(streamKey);
    const playbackPath = `app/${encodedKey}/master`;
    const resolvedTransport = (typeof transport === 'string' && transport.length)
      ? transport
      : resolveDefaultLivestreamViewerTransport();
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return appendLivestreamTransport(`ws://${hostname}:3333/${playbackPath}`, resolvedTransport);
    }
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return appendLivestreamTransport(`${protocol}//${window.location.host}/ome-ws/${playbackPath}`, resolvedTransport);
  }

  function buildLivestreamProbeUrl(streamKey, revision = '') {
    const baseUrl = `${window.location.origin}/ome-ready/app/${encodeURIComponent(streamKey)}/master.m3u8`;
    if (!revision) {
      return baseUrl;
    }
    return `${baseUrl}?v=${encodeURIComponent(revision)}`;
  }

  function normalizeLivestreamPlaybackUrl(streamKey, _playbackUrl, revision = '') {
    // Always rebuild from stream_key to ensure the viewer uses the frontend proxy.
    return buildLivestreamWebRtcUrl(streamKey, revision);
  }

  function buildLivestreamPublishUrl(streamKey, transport = LIVESTREAM_PRIMARY_TRANSPORT) {
    return appendLivestreamTransport(`${window.location.origin}/ome/app/${encodeURIComponent(streamKey)}?direction=whip`, transport);
  }

  function buildLivestreamStreamKey(userId) {
    const clientTag = isDesktopClient() ? 'pc' : 'mob';
    return `upt-live-${userId}-${clientTag}-${Date.now().toString(36)}`;
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
    await loadExternalScript('https://cdn.jsdelivr.net/npm/ovenplayer@0.10.14/dist/ovenplayer.js', 'OvenPlayer');
    await loadExternalScript('https://cdn.jsdelivr.net/npm/ovenlivekit@latest/dist/OvenLiveKit.min.js', 'OvenLiveKit');
  }

  window.UPTAppShared = {
    ROUTE_ALIASES,
    EMOJI_DATA,
    REACTION_META,
    escapeHtml,
    nl2br,
    safeUrl,
    getVisibilityMeta,
    displayName,
    careerLabel,
    cycleLabel,
    userColor,
    timeAgo,
    formatBlockedUntilLabel,
    formatClock,
    isUserOnline,
    presenceLabel,
    setBackgroundMedia,
    setAvatarElement,
    renderAvatar,
    numericId,
    getUserTypeLabel,
    reactionCountSummary,
    buildHash,
    parseRoute,
    setDocumentTitle,
    getLivestreamEngineHost,
    buildLivestreamHlsUrl,
    buildLivestreamWebRtcUrl,
    buildLivestreamProbeUrl,
    normalizeLivestreamPlaybackUrl,
    buildLivestreamPublishUrl,
    buildLivestreamStreamKey,
    isDesktopClient,
    isMobileDevice,
    loadExternalScript,
    loadExternalStyle,
    ensureLivestreamLibraries,
    LIVESTREAM_FALLBACK_TRANSPORT,
  };
})();
