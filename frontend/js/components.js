class AppHeader extends HTMLElement {
  connectedCallback() {
    this.render();
  }

  render() {
    this.innerHTML = `
      <header class="fixed top-0 left-0 w-full z-50 flex justify-between items-center px-6 h-16 bg-white border-b border-slate-200">
        <div class="flex items-center gap-4">
          <button id="mobile-sidebar-toggle" type="button" class="md:hidden inline-flex items-center justify-center w-10 h-10 rounded-full border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors" aria-label="Abrir menu">
            <span class="material-symbols-outlined text-[20px]">menu</span>
          </button>
          <a href="#feed" class="text-lg font-bold text-[#1B2A6B] uppercase tracking-wider">UPT Connect</a>
        </div>
        <div class="flex-1 max-w-xl mx-8 hidden md:block">
          <div class="relative">
            <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline">search</span>
            <input id="header-search-input" class="w-full bg-slate-100 border-none rounded-full py-2.5 pl-10 pr-4 text-sm focus:ring-1 focus:ring-[#1B2A6B] outline-none" placeholder="Buscar estudiantes..." type="text" autocomplete="off"/>
            <div id="header-search-dropdown" class="absolute left-0 right-0 mt-2 bg-white rounded-2xl shadow-lg border border-slate-200 hidden z-50 overflow-hidden">
              <div id="header-search-results" class="max-h-80 overflow-y-auto custom-scrollbar">
                <div class="px-4 py-4 text-sm text-slate-500 text-center">Escribe al menos 1 letra para buscar.</div>
              </div>
            </div>
          </div>
        </div>
        <div class="flex items-center gap-4">
          <div class="relative" id="notif-container">
            <button id="notif-toggle-btn" class="p-2 text-slate-600 hover:bg-slate-50 rounded-full transition-colors relative cursor-pointer" type="button" aria-haspopup="menu" aria-expanded="false">
              <span class="material-symbols-outlined">notifications</span>
              <span id="notif-badge" class="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-red-500 rounded-full border-2 border-white text-[10px] leading-[14px] font-bold text-white hidden items-center justify-center"></span>
            </button>
            <div class="absolute right-0 mt-2 w-[360px] max-w-[calc(100vw-1.5rem)] bg-white rounded-[24px] shadow-2xl border border-slate-200 py-2 hidden z-50 overflow-hidden" id="notifications-dropdown">
              <div class="px-4 py-3 border-b border-slate-100 bg-slate-50/80">
                <div class="flex items-center justify-between gap-3">
                  <div>
                    <p class="text-[11px] uppercase tracking-[0.18em] font-black text-slate-400">Centro social</p>
                    <div class="font-bold text-sm text-slate-800">Notificaciones</div>
                  </div>
                  <div class="flex items-center gap-2">
                    <button id="notif-mark-seen-btn" type="button" class="hidden px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 text-[11px] font-bold hover:bg-slate-200 transition-colors">Marcar vistas</button>
                    <span id="notif-summary-pill" class="hidden px-2.5 py-1 rounded-full bg-red-50 text-red-600 text-[11px] font-bold">0 pendientes</span>
                  </div>
                </div>
              </div>
              <div id="notifications-list" class="max-h-[420px] overflow-y-auto custom-scrollbar">
                <div class="px-4 py-6 text-sm text-slate-500 text-center">No tienes notificaciones pendientes</div>
              </div>
            </div>
          </div>
          <div class="relative" id="profile-menu-container">
            <button type="button" class="w-9 h-9 rounded-full bg-[#1B2A6B] flex items-center justify-center text-white font-bold cursor-pointer bg-cover bg-center" id="header-initials" tabindex="0" aria-haspopup="menu" aria-expanded="false">U</button>
            <div class="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white"></div>
            <div class="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-lg border border-slate-100 py-2 hidden z-50" id="profile-menu-dropdown">
              <a href="#profile" class="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-[#1B2A6B]">
                <span class="material-symbols-outlined align-middle mr-2 text-[18px]">person</span>Mi Perfil
              </a>
              <button type="button" onclick="if (window.logout) window.logout()" class="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50">
                <span class="material-symbols-outlined align-middle mr-2 text-[18px]">logout</span>Cerrar sesion
              </button>
            </div>
          </div>
        </div>
      </header>
    `;
  }
}

class AppSidebar extends HTMLElement {
  static get observedAttributes() {
    return ['active-nav'];
  }

  connectedCallback() {
    this.render();
  }

  attributeChangedCallback() {
    this.render();
  }

  render() {
    const activeNav = this.getAttribute('active-nav') || 'feed';
    const navClass = (navId) => (
      navId === activeNav
        ? 'flex items-center gap-3 p-3 bg-slate-100 text-[#1B2A6B] font-medium rounded-xl transition-all duration-200'
        : 'flex items-center gap-3 p-3 text-slate-700 hover:bg-slate-50 rounded-xl transition-all duration-200'
    );

    document.body.querySelectorAll('#mobile-sidebar-backdrop, #mobile-sidebar-drawer').forEach((node) => {
      node.remove();
    });

    this.className = 'hidden md:flex md:col-span-3 flex-col gap-6 self-start';
    this.innerHTML = `
      <div id="mobile-sidebar-backdrop" class="mobile-sidebar-backdrop hidden md:hidden"></div>
      <div id="mobile-sidebar-drawer" class="mobile-sidebar-drawer md:hidden">
        <div class="mobile-sidebar-drawer-inner">
          <div class="flex items-center justify-between px-5 py-4 border-b border-slate-200">
            <a href="#feed" class="text-base font-bold text-[#1B2A6B] uppercase tracking-wider">UPT Connect</a>
            <button id="mobile-sidebar-close" type="button" class="w-10 h-10 rounded-full border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors" aria-label="Cerrar menu">
              <span class="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>
          <div class="p-4 flex flex-col gap-4 overflow-y-auto custom-scrollbar">
            <div class="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
              <div class="h-16 bg-cover bg-center" id="profile-banner-mobile" style="background:#1B2A6B"></div>
              <div class="px-4 pb-4 relative">
                <div class="w-16 h-16 rounded-full flex items-center justify-center text-white font-bold text-xl border-4 border-white absolute -top-8 bg-cover bg-center" id="sidebar-avatar-mobile" style="background:#1B2A6B">U</div>
                <div class="pt-10">
                  <div class="flex items-center gap-2 mb-1">
                    <h2 class="font-bold text-lg text-slate-900" id="sidebar-name-mobile">Cargando...</h2>
                    <span class="text-white text-[10px] font-bold px-2 py-0.5 rounded-full ml-auto" id="sidebar-faculty-badge-mobile" style="background:#1B2A6B">UPT</span>
                  </div>
                  <p class="text-slate-500 text-sm" id="sidebar-career-mobile">-</p>
                </div>
              </div>
            </div>
            <nav class="bg-white rounded-2xl border border-slate-200 p-2 flex flex-col gap-1 shadow-sm">
              <a class="${navClass('feed')}" href="#feed" data-mobile-nav-link="true">
                <span class="material-symbols-outlined text-[20px]">home</span><span class="text-sm">Inicio</span>
              </a>
              <a class="${navClass('profile')}" href="#profile" data-mobile-nav-link="true">
                <span class="material-symbols-outlined text-[20px]">person</span><span class="text-sm">Mi Perfil</span>
              </a>
              <a class="${navClass('messages')}" href="#messages" data-mobile-nav-link="true">
                <span class="material-symbols-outlined text-[20px]">chat</span><span class="text-sm">Mensajes</span>
              </a>
              <a class="${navClass('companions')}" href="#companions" data-mobile-nav-link="true">
                <span class="material-symbols-outlined text-[20px]">groups</span><span class="text-sm">Compañeros</span>
              </a>
              <a class="${navClass('groups')}" href="#groups" data-mobile-nav-link="true">
                <span class="material-symbols-outlined text-[20px]">diversity_3</span><span class="text-sm">Grupos</span>
              </a>
              <a class="${navClass('admin')}" href="#admin" id="nav-admin-mobile" data-mobile-nav-link="true" style="display:none">
                <span class="material-symbols-outlined text-[20px]">admin_panel_settings</span><span class="text-sm">Admin</span>
              </a>
              <button type="button" class="flex items-center gap-3 p-3 text-red-500 hover:bg-red-50 rounded-xl transition-all duration-200 mt-2 cursor-pointer text-left" onclick="if (window.logout) window.logout()">
                <span class="material-symbols-outlined text-[20px]">logout</span><span class="text-sm">Cerrar sesion</span>
              </button>
            </nav>
          </div>
        </div>
      </div>
      <div class="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        <div class="h-16 bg-cover bg-center" id="profile-banner" style="background:#1B2A6B"></div>
        <div class="px-4 pb-4 relative">
          <div class="w-16 h-16 rounded-full flex items-center justify-center text-white font-bold text-xl border-4 border-white absolute -top-8 bg-cover bg-center" id="sidebar-avatar" style="background:#1B2A6B">U</div>
          <div class="pt-10">
            <div class="flex items-center gap-2 mb-1">
              <h2 class="font-bold text-lg text-slate-900" id="sidebar-name">Cargando...</h2>
              <span class="text-white text-[10px] font-bold px-2 py-0.5 rounded-full ml-auto" id="sidebar-faculty-badge" style="background:#1B2A6B">UPT</span>
            </div>
            <p class="text-slate-500 text-sm" id="sidebar-career">-</p>
          </div>
        </div>
      </div>
      <nav class="bg-white rounded-2xl border border-slate-200 p-2 flex flex-col gap-1 shadow-sm">
        <a class="${navClass('feed')}" href="#feed" id="nav-feed">
          <span class="material-symbols-outlined text-[20px]">home</span><span class="text-sm">Inicio</span>
        </a>
        <a class="${navClass('profile')}" href="#profile" id="nav-profile">
          <span class="material-symbols-outlined text-[20px]">person</span><span class="text-sm">Mi Perfil</span>
        </a>
        <a class="${navClass('messages')}" href="#messages" id="nav-messages">
          <span class="material-symbols-outlined text-[20px]">chat</span><span class="text-sm">Mensajes</span>
        </a>
        <a class="${navClass('companions')}" href="#companions" id="nav-companions">
          <span class="material-symbols-outlined text-[20px]">groups</span><span class="text-sm">Compañeros</span>
        </a>
        <a class="${navClass('groups')}" href="#groups" id="nav-groups">
          <span class="material-symbols-outlined text-[20px]">diversity_3</span><span class="text-sm">Grupos</span>
        </a>
        <a class="${navClass('admin')}" href="#admin" id="nav-admin" style="display:none">
          <span class="material-symbols-outlined text-[20px]">admin_panel_settings</span><span class="text-sm">Admin</span>
        </a>
        <button type="button" class="flex items-center gap-3 p-3 text-red-500 hover:bg-red-50 rounded-xl transition-all duration-200 mt-2 cursor-pointer text-left" onclick="if (window.logout) window.logout()">
          <span class="material-symbols-outlined text-[20px]">logout</span><span class="text-sm">Cerrar sesion</span>
        </button>
      </nav>
    `;

    const drawer = this.querySelector('#mobile-sidebar-drawer');
    const backdrop = this.querySelector('#mobile-sidebar-backdrop');
    if (backdrop) {
      document.body.appendChild(backdrop);
    }
    if (drawer) {
      document.body.appendChild(drawer);
    }
    if (drawer) {
      drawer.style.display = '';
    }
    if (backdrop) {
      backdrop.style.display = '';
    }
  }
}

if (!customElements.get('app-header')) {
  customElements.define('app-header', AppHeader);
}

if (!customElements.get('app-sidebar')) {
  customElements.define('app-sidebar', AppSidebar);
}

window.setupLayoutData = function setupLayoutData(user) {
  if (!user) return;

  const name = window.getDisplayName ? window.getDisplayName(user) : (user.full_name || user.name || 'Usuario');
  const color = window.getFacultyColor ? window.getFacultyColor(user.faculty || user.school || user.career || '') : '#1B2A6B';
  const badgeText = user.faculty || 'UPT';
  const career = window.getCareerLabel ? window.getCareerLabel(user) : (user.school || user.career || '-');
  const avatarText = window.initials ? window.initials(name) : 'U';

  const headerInitials = document.getElementById('header-initials');
  if (headerInitials) {
    if (user.avatar_url) {
      headerInitials.textContent = '';
      headerInitials.style.backgroundImage = `url('${user.avatar_url}')`;
      headerInitials.style.backgroundSize = 'cover';
      headerInitials.style.backgroundPosition = 'center';
      headerInitials.style.backgroundColor = color;
    } else {
      headerInitials.textContent = avatarText;
      headerInitials.style.backgroundImage = '';
      headerInitials.style.backgroundColor = color;
    }
  }

  const sidebarAvatar = document.getElementById('sidebar-avatar');
  if (sidebarAvatar) {
    if (user.avatar_url) {
      sidebarAvatar.textContent = '';
      sidebarAvatar.style.backgroundImage = `url('${user.avatar_url}')`;
      sidebarAvatar.style.backgroundSize = 'cover';
      sidebarAvatar.style.backgroundPosition = 'center';
      sidebarAvatar.style.backgroundColor = color;
    } else {
      sidebarAvatar.textContent = avatarText;
      sidebarAvatar.style.backgroundImage = '';
      sidebarAvatar.style.backgroundColor = color;
    }
  }

  const profileBanner = document.getElementById('profile-banner');
  if (profileBanner) {
    if (user.banner_url) {
      profileBanner.style.backgroundImage = `url('${user.banner_url}')`;
      profileBanner.style.backgroundSize = 'cover';
      profileBanner.style.backgroundPosition = 'center';
      profileBanner.style.backgroundColor = color;
    } else {
      profileBanner.style.backgroundImage = '';
      profileBanner.style.backgroundColor = color;
    }
  }

  const profileBannerMobile = document.getElementById('profile-banner-mobile');
  if (profileBannerMobile) {
    if (user.banner_url) {
      profileBannerMobile.style.backgroundImage = `url('${user.banner_url}')`;
      profileBannerMobile.style.backgroundSize = 'cover';
      profileBannerMobile.style.backgroundPosition = 'center';
      profileBannerMobile.style.backgroundColor = color;
    } else {
      profileBannerMobile.style.backgroundImage = '';
      profileBannerMobile.style.backgroundColor = color;
    }
  }

  const sidebarName = document.getElementById('sidebar-name');
  if (sidebarName) sidebarName.textContent = name;
  const sidebarNameMobile = document.getElementById('sidebar-name-mobile');
  if (sidebarNameMobile) sidebarNameMobile.textContent = name;

  const sidebarCareer = document.getElementById('sidebar-career');
  if (sidebarCareer) sidebarCareer.textContent = career || '-';
  const sidebarCareerMobile = document.getElementById('sidebar-career-mobile');
  if (sidebarCareerMobile) sidebarCareerMobile.textContent = career || '-';

  const badge = document.getElementById('sidebar-faculty-badge');
  if (badge) {
    badge.textContent = badgeText;
    badge.style.backgroundColor = color;
  }
  const badgeMobile = document.getElementById('sidebar-faculty-badge-mobile');
  if (badgeMobile) {
    badgeMobile.textContent = badgeText;
    badgeMobile.style.backgroundColor = color;
  }

  const navAdmin = document.getElementById('nav-admin');
  if (navAdmin) {
    navAdmin.style.display = user.role === 'admin' ? 'flex' : 'none';
  }
  const navAdminMobile = document.getElementById('nav-admin-mobile');
  if (navAdminMobile) {
    navAdminMobile.style.display = user.role === 'admin' ? 'flex' : 'none';
  }

  const sidebarAvatarMobile = document.getElementById('sidebar-avatar-mobile');
  if (sidebarAvatarMobile) {
    if (user.avatar_url) {
      sidebarAvatarMobile.textContent = '';
      sidebarAvatarMobile.style.backgroundImage = `url('${user.avatar_url}')`;
      sidebarAvatarMobile.style.backgroundSize = 'cover';
      sidebarAvatarMobile.style.backgroundPosition = 'center';
      sidebarAvatarMobile.style.backgroundColor = color;
    } else {
      sidebarAvatarMobile.textContent = avatarText;
      sidebarAvatarMobile.style.backgroundImage = '';
      sidebarAvatarMobile.style.backgroundColor = color;
    }
  }

  if (window.setupHeaderSearch) {
    window.setupHeaderSearch();
  }

  if (window.setupHeaderMenus) {
    window.setupHeaderMenus();
  }

  if (window.setupMobileSidebar) {
    window.setupMobileSidebar();
  }
};
