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
  let presencePingTimer = null;
  let presencePingInFlight = false;

  if (!appState.user) {
    logout();
    return;
  }

  if (appState.user.is_profile_complete === false) {
    window.location.href = '/pages/onboarding.html';
    return;
  }

  if (isLoggedIn() && (!localStorage.getItem('upt_user') || !appState.user.id || appState.user.is_profile_complete == null)) {
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
        window.AppRouter.render();
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
    return window.getCareerLabel ? window.getCareerLabel(user) : (user?.school || user?.career || '');
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
            <div class="mt-2 flex items-center gap-3 text-[11px] text-slate-500">
              ${interactive ? `
                <button type="button" data-action="toggle-comment-like" data-comment-id="${comment.id}" class="flex items-center gap-1.5 transition-colors ${comment.is_liked ? 'text-red-500 hover:text-red-600' : 'hover:text-slate-700'}">
                  <span class="material-symbols-outlined text-[14px] ${comment.is_liked ? 'fill' : ''}">favorite</span>
                  <span>${comment.likes_count || 0} Me gusta</span>
                </button>
              ` : `
                <div class="flex items-center gap-1.5">
                  <span class="material-symbols-outlined text-[14px]">favorite</span>
                  <span>${comment.likes_count || 0} Me gusta</span>
                </div>
              `}
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

  function renderPostCard(post, currentUserId, options = {}) {
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
            <span class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${visibilityMeta.tone}">
              <span class="material-symbols-outlined text-[14px]">${visibilityMeta.icon}</span>
              ${escapeHtml(visibilityMeta.label)}
            </span>
          </div>
          <div class="text-sm text-slate-800 mb-4"><p class="content-break">${nl2br(post.content || '')}</p></div>
          ${post.image_url ? `<div class="w-full ${mediaHeightClass} bg-slate-100 overflow-hidden rounded-xl mb-3"><img alt="Imagen de la publicacion" class="w-full h-full object-cover" src="${safeUrl(post.image_url)}" onerror="this.parentElement.style.display='none'"/></div>` : ''}
        ${interactive ? `
          <div class="pt-3 border-t border-slate-100 flex justify-start gap-6 items-center text-slate-500">
            <button type="button" data-action="like-post" data-post-id="${post.id}" class="flex items-center gap-1.5 transition-colors ${post.is_liked ? 'text-red-500 hover:text-red-600' : 'hover:text-slate-700'}">
              <span class="material-symbols-outlined text-[18px] ${post.is_liked ? 'fill' : ''}">favorite</span>
              <span class="text-sm">${post.likes_count || 0} Me gusta</span>
            </button>
            <button type="button" data-action="comment-post" data-post-id="${post.id}" class="flex items-center gap-1.5 hover:text-slate-700 transition-colors">
              <span class="material-symbols-outlined text-[18px]">chat_bubble_outline</span>
              <span class="text-sm">${post.comments_count || 0} Comentarios</span>
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
              <span class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${visibilityMeta.tone}">
                <span class="material-symbols-outlined text-[14px]">${visibilityMeta.icon}</span>
                ${escapeHtml(visibilityMeta.label)}
              </span>
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
            <span>${post.likes_count || 0} Me gusta</span>
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

  function initMessagesView({ container, user, params }) {
    const inboxList = container.querySelector('#inbox-list');
    const chatPanel = container.querySelector('#chat-panel');
    const messagesSummary = container.querySelector('#messages-summary');
    const messagesCount = container.querySelector('#messages-count');

    let friends = [];
    let conversations = [];
    let activeChat = params.user ? Number(params.user) : null;
    let activeUser = null;
    let selectedImageFile = null;
    let selectedImagePreviewUrl = '';

    function clearSelectedImage() {
      if (selectedImagePreviewUrl) {
        URL.revokeObjectURL(selectedImagePreviewUrl);
      }

      selectedImageFile = null;
      selectedImagePreviewUrl = '';
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

    function renderMessages(messages) {
      const area = chatPanel.querySelector('#messages-area');
      if (!area) return;

      if (!messages.length) {
        area.innerHTML = '<p class="text-center text-slate-400 text-sm">Todavia no hay mensajes. Escribe el primero.</p>';
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
              <span class="text-[11px] text-slate-500 mt-1 px-1">${escapeHtml(formatClock(message.created_at))}</span>
            </div>
          </div>
        `;
      }).join('');

      area.scrollTop = area.scrollHeight;
    }

    async function loadConversation(userId, otherUser = findConversationUser(userId)) {
      const numericUserId = Number(userId);
      if (!numericUserId) return;

      const friendProfile = otherUser ? resolveProfileData(otherUser) : findConversationUser(numericUserId);
      if (!friendProfile?.id) {
        activeChat = null;
        activeUser = null;
        updateUrlForChat(null);
        renderInbox();
        renderEmptyChatPanel('Solo puedes enviar mensajes a tus amigos.');
        showToast('Solo puedes chatear con tus amigos', 'error');
        return;
      }

      activeChat = numericUserId;
      activeUser = friendProfile;
      clearSelectedImage();
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
        </div>
        <div class="flex-1 overflow-y-auto p-4 md:p-5 flex flex-col gap-3 custom-scrollbar" id="messages-area">
          <p class="text-center text-slate-400 text-sm">Cargando mensajes...</p>
        </div>
        <div class="p-4 bg-white border-t border-slate-200 shrink-0">
          <div id="msg-image-preview-wrap" class="hidden mb-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <div class="flex items-start gap-3">
              <img id="msg-image-preview" alt="Vista previa del mensaje" class="w-20 h-20 rounded-xl object-cover border border-slate-200"/>
              <div class="min-w-0 flex-1">
                <p class="text-xs font-semibold text-slate-700 uppercase tracking-wide">Imagen adjunta</p>
                <p id="msg-image-name" class="text-sm text-slate-500 truncate mt-1"></p>
              </div>
              <button id="clear-msg-image-btn" type="button" class="w-8 h-8 rounded-full border border-slate-200 text-slate-500 hover:bg-white transition-colors inline-flex items-center justify-center">
                <span class="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
          </div>
          <div class="flex items-end gap-3">
            <input id="msg-image-input" type="file" class="hidden" accept="image/*"/>
            <button id="pick-msg-image-btn" type="button" class="w-11 h-11 rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors inline-flex items-center justify-center shrink-0">
              <span class="material-symbols-outlined text-[20px]">image</span>
            </button>
            <textarea id="msg-input" class="flex-1 bg-slate-100 border border-slate-200 rounded-[1.4rem] px-4 py-3 text-sm focus:ring-1 focus:ring-[#1B2A6B] outline-none resize-none min-h-[50px] max-h-36" placeholder="Escribe un mensaje para ${escapeHtml(displayName(friendProfile))}..." rows="1"></textarea>
            <button id="send-msg-btn" type="button" class="w-11 h-11 rounded-full bg-[#D4A017] flex items-center justify-center text-white hover:bg-[#b88a14] transition-colors shrink-0 shadow-sm">
              <span class="material-symbols-outlined text-[20px] ml-0.5">send</span>
            </button>
          </div>
        </div>
      `;

      const area = chatPanel.querySelector('#messages-area');
      const input = chatPanel.querySelector('#msg-input');
      const imageInput = chatPanel.querySelector('#msg-image-input');
      const pickImageButton = chatPanel.querySelector('#pick-msg-image-btn');
      const sendButton = chatPanel.querySelector('#send-msg-btn');
      const imagePreviewWrap = chatPanel.querySelector('#msg-image-preview-wrap');
      const imagePreview = chatPanel.querySelector('#msg-image-preview');
      const imageName = chatPanel.querySelector('#msg-image-name');
      const clearImageButton = chatPanel.querySelector('#clear-msg-image-btn');

      function syncImagePreview() {
        const hasPreview = Boolean(selectedImageFile && selectedImagePreviewUrl);
        imagePreviewWrap.classList.toggle('hidden', !hasPreview);
        if (!hasPreview) {
          imagePreview.removeAttribute('src');
          imageName.textContent = '';
          imageInput.value = '';
          return;
        }

        imagePreview.src = selectedImagePreviewUrl;
        imageName.textContent = selectedImageFile.name || 'Imagen seleccionada';
      }

      async function sendMessage() {
        const content = input.value.trim();
        if (!activeChat || (!content && !selectedImageFile)) return;

        sendButton.disabled = true;
        pickImageButton.disabled = true;

        const result = await ChatAPI.sendMessage({
          receiverId: activeChat,
          content,
          imageFile: selectedImageFile,
        });

        sendButton.disabled = false;
        pickImageButton.disabled = false;

        if (!result?.ok) {
          showToast(result?.data?.error || 'Error al enviar el mensaje', 'error');
          return;
        }

        input.value = '';
        clearSelectedImage();
        syncImagePreview();
        await Promise.all([
          loadConversation(activeChat, friendProfile),
          loadInbox(false),
        ]);
      }

      imageInput.addEventListener('change', (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        if (!String(file.type || '').startsWith('image/')) {
          showToast('Selecciona una imagen valida', 'error');
          imageInput.value = '';
          return;
        }

        clearSelectedImage();
        selectedImageFile = file;
        selectedImagePreviewUrl = URL.createObjectURL(file);
        syncImagePreview();
      });

      clearImageButton.addEventListener('click', () => {
        clearSelectedImage();
        syncImagePreview();
      });

      pickImageButton.addEventListener('click', () => imageInput.click());
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

      syncImagePreview();

      const result = await ChatAPI.getConversation(numericUserId);
      if (!result?.ok) {
        if (result?.status === 403) {
          activeChat = null;
          activeUser = null;
          updateUrlForChat(null);
          renderInbox();
          renderEmptyChatPanel('Solo puedes enviar mensajes a tus amigos.');
        } else {
          area.innerHTML = '<p class="text-center text-slate-400 text-sm">No se pudo cargar la conversacion.</p>';
        }
        return;
      }

      renderMessages(getList(result));
    }

    async function openChatByUserId(userId) {
      const numericUserId = Number(userId);
      if (!numericUserId) return;

      const otherUser = findConversationUser(numericUserId);
      if (!otherUser) {
        showToast('Solo puedes chatear con tus amigos', 'error');
        activeChat = null;
        activeUser = null;
        updateUrlForChat(null);
        renderInbox();
        renderEmptyChatPanel('Solo puedes enviar mensajes a tus amigos.');
        return;
      }

      await loadConversation(numericUserId, otherUser);
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
          return;
        }

        activeChat = null;
        activeUser = null;
        updateUrlForChat(null);
        showToast('Ese chat solo esta disponible para amigos aceptados', 'error');
      }

      renderEmptyChatPanel('Selecciona un amigo para empezar a conversar.');
    }

    async function handleFriendshipChanged() {
      await loadInbox(Boolean(activeChat || activeUser));
    }

    async function handlePresenceUpdated() {
      await loadInbox(Boolean(activeChat || activeUser));
    }

    inboxList.addEventListener('click', (event) => {
      const button = event.target.closest('[data-open-chat]');
      if (!button) return;
      openChatByUserId(button.dataset.openChat);
    });

    window.addEventListener('friendship:changed', handleFriendshipChanged);
    window.addEventListener('presence:updated', handlePresenceUpdated);
    loadInbox(Boolean(activeChat));

    return () => {
      clearSelectedImage();
      window.removeEventListener('friendship:changed', handleFriendshipChanged);
      window.removeEventListener('presence:updated', handlePresenceUpdated);
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
        const commentPostPreview = container.querySelector('#comment-post-preview');
        const commentList = container.querySelector('#comment-list');
        const commentSort = container.querySelector('#comment-sort');
        const commentInput = container.querySelector('#comment-input');
        const publishButton = container.querySelector('#btn-publish');
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
            if (actionTarget.dataset.action === 'like-post') {
              await PostsAPI.likePost(postId);
              loadFeed();
              return;
            }
            if (actionTarget.dataset.action === 'comment-post') {
              openCommentModal(postId);
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
          const button = event.target.closest('[data-action="toggle-comment-like"]');
          if (!button || !pendingCommentId) return;

          const result = await PostsAPI.likeComment(button.dataset.commentId);
          if (result?.ok) {
            await loadComments(pendingCommentId, currentCommentSort);
            return;
          }

          showToast(result?.data?.error || 'No se pudo reaccionar al comentario', 'error');
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
        window.addEventListener('presence:updated', loadFriends);

        loadFeed();
        loadFriends();

        return () => {
          document.removeEventListener('click', onDocumentClick);
          window.removeEventListener('presence:updated', loadFriends);
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
                  <p class="text-slate-500 text-[16px]">Directorio de estudiantes y comunidad academica.</p>
                </div>
                <div class="flex flex-col sm:flex-row gap-4 w-full md:w-auto">
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

        async function loadDirectory() {
          const faculty = filterFaculty.value;
          const params = faculty ? `faculty=${faculty}` : '';
          const result = await SocialAPI.getDirectory(params);
          const users = getList(result).filter((directoryUser) => Number(directoryUser.id) !== Number(user.id));

          if (!result?.ok) {
            grid.innerHTML = '<p class="text-slate-400 text-sm col-span-3 text-center py-8">No se pudieron cargar los companeros.</p>';
            return;
          }

          if (!users.length) {
            grid.innerHTML = '<p class="text-slate-400 text-sm col-span-3 text-center py-8">No se encontraron companeros.</p>';
            return;
          }

          grid.innerHTML = users.map((directoryUser) => `
            <div class="bg-white rounded-xl border border-slate-200 p-5 flex flex-col items-center text-center hover:shadow-md transition-shadow relative">
              <div class="absolute top-3 right-3">
                <span class="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold text-white" style="background:${userColor(directoryUser)}">${escapeHtml(directoryUser.faculty || 'UPT')}</span>
              </div>
              ${renderAvatar(directoryUser, { sizeClass: 'w-20 h-20', textClass: 'text-white font-bold text-2xl', extraClass: 'mb-3 border-2 border-slate-100' })}
              <h3 class="font-bold text-[16px] leading-tight text-slate-900 mb-1">${escapeHtml(displayName(directoryUser))}</h3>
              <p class="text-[13px] text-slate-500 mb-4">${escapeHtml(careerLabel(directoryUser))}</p>
              <button type="button" data-view-profile="${directoryUser.id}" class="w-full py-1.5 px-4 rounded-lg border border-[#1B2A6B] text-[#1B2A6B] font-medium text-sm hover:bg-[#1B2A6B] hover:text-white transition-colors mt-auto">Ver perfil</button>
            </div>
          `).join('');
        }

        filterFaculty.addEventListener('change', loadDirectory);
        grid.addEventListener('click', (event) => {
          const button = event.target.closest('[data-view-profile]');
          if (!button) return;
          router.navigate('profile', { id: button.dataset.viewProfile });
        });

        loadDirectory();
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

          const [friendsResult, pendingResult] = isOwnProfile
            ? [null, null]
            : await Promise.all([SocialAPI.getFriends(), SocialAPI.getPendingRequests()]);

          const friends = friendsResult ? normalizeFriendEntries(getList(friendsResult)) : [];
          const pending = pendingResult ? getList(pendingResult) : [];
          const isFriend = friends.some((friend) => Number(friend.id) === Number(profileData.id));
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
                ${escapeHtml(profileData.user_type === 'teacher' ? 'Docente' : 'Estudiante')}
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
            `;
          } else if (incomingRequestId) {
            profileActions.innerHTML = `
              <button type="button" data-profile-action="accept-request" class="bg-[#1B2A6B] hover:bg-[#152259] text-white font-semibold text-sm px-6 py-2.5 rounded-lg transition-colors shadow-sm flex items-center gap-2">
                <span class="material-symbols-outlined text-[20px]">how_to_reg</span>
                Aceptar solicitud
              </button>
            `;
          } else {
            profileActions.innerHTML = `
              <button type="button" data-profile-action="send-request" class="bg-[#D4A017] hover:bg-[#C19015] text-black font-semibold text-sm px-6 py-2.5 rounded-lg transition-colors shadow-sm flex items-center gap-2">
                <span class="material-symbols-outlined text-[20px]">person_add</span>
                Enviar solicitud
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
            if (button.dataset.action === 'like-post') {
              await PostsAPI.likePost(Number(button.dataset.postId));
              await loadPosts(profileData.id);
              return;
            }
            if (button.dataset.action === 'comment-post') {
              openProfileCommentModal(button.dataset.postId);
              return;
            }
          }

          const postCard = event.target.closest('[data-post-card]');
          if (postCard) {
            openProfileCommentModal(postCard.dataset.postId);
          }
        });

        profileCommentList.addEventListener('click', async (event) => {
          const button = event.target.closest('[data-action="toggle-comment-like"]');
          if (!button || !pendingProfileCommentId) return;

          const result = await PostsAPI.likeComment(button.dataset.commentId);
          if (result?.ok) {
            await loadProfileComments(pendingProfileCommentId, currentProfileCommentSort);
            return;
          }

          showToast(result?.data?.error || 'No se pudo reaccionar al comentario', 'error');
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
                    </select>
                  </div>
                  <div class="flex flex-col gap-1.5">
                    <label class="text-sm font-semibold text-gray-700">Facultad</label>
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
                <div class="flex flex-col gap-1.5">
                  <label class="text-sm font-semibold text-gray-700">Carrera</label>
                  <input id="edit-user-career" class="w-full bg-white border border-slate-200 rounded-xl p-3 text-sm focus:border-[#1B2A6B] focus:ring-1 focus:ring-[#1B2A6B] outline-none" type="text"/>
                </div>
                <div class="grid grid-cols-2 gap-4">
                  <div class="flex flex-col gap-1.5">
                    <label class="text-sm font-semibold text-gray-700">Ciclo</label>
                    <input id="edit-user-cycle" class="w-full bg-white border border-slate-200 rounded-xl p-3 text-sm focus:border-[#1B2A6B] focus:ring-1 focus:ring-[#1B2A6B] outline-none" type="text" placeholder="Ej. 8"/>
                  </div>
                  <div class="flex flex-col gap-1.5">
                    <label class="text-sm font-semibold text-gray-700">Codigo</label>
                    <input id="edit-user-code" class="w-full bg-white border border-slate-200 rounded-xl p-3 text-sm focus:border-[#1B2A6B] focus:ring-1 focus:ring-[#1B2A6B] outline-none" type="text"/>
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
                  <p class="text-sm text-slate-500 mt-1">Puedes registrar un motivo opcional para el bloqueo.</p>
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
                <div class="flex flex-col gap-1.5">
                  <label class="text-sm font-semibold text-gray-700" for="block-user-reason">Motivo del bloqueo</label>
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
                    : '<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] font-semibold text-[#DC2626] bg-[#FEE2E2]"><span class="w-1.5 h-1.5 rounded-full bg-[#DC2626]"></span> Inactivo</span>'
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
                      <span class="material-symbols-outlined text-[16px]">power_settings_new</span> ${active ? 'Desactivar' : 'Activar'}
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
        container.querySelector('#close-edit-user-modal-btn').addEventListener('click', closeModal);
        container.querySelector('#cancel-edit-user-btn').addEventListener('click', closeModal);
        container.querySelector('#close-block-user-modal-btn').addEventListener('click', closeBlockModal);
        container.querySelector('#cancel-block-user-btn').addEventListener('click', closeBlockModal);
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
          const result = await AuthAPI.toggleUser(userId, { blocked_reason: blockedReason || null });

          if (result?.ok) {
            showToast(result.data?.message || 'Usuario desactivado', 'success');
            closeBlockModal();
            loadUsers();
            return;
          }

          showToast(result?.data?.error || 'No se pudo desactivar la cuenta', 'error');
        });

        loadUsers();
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
          const likes = posts.reduce((sum, item) => sum + Number(item.likes_count || 0), 0);

          const cards = [
            { value: total, label: 'Publicaciones', color: '#4A6BFF', bg: '#EBF0FF', icon: 'article' },
            { value: withImages, label: 'Con imagen', color: '#ffffff', bg: '#D4A017', icon: 'image' },
            { value: comments, label: 'Comentarios', color: '#4A55A2', bg: '#F0F2FB', icon: 'chat_bubble' },
            { value: likes, label: 'Likes', color: '#6B7280', bg: '#F3F4F6', icon: 'favorite' },
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

  window.AppRouter = AppRouter;

  window.addEventListener('hashchange', () => {
    AppRouter.render();
  });

  if (!window.location.hash) {
    window.history.replaceState(null, '', `${window.location.pathname}${buildHash('feed')}`);
  }

  if (window.setupLayoutData) window.setupLayoutData(appState.user);
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
