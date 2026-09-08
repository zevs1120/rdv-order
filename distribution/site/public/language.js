const toggle = document.getElementById('language');
const tabs = [...document.querySelectorAll('[role="tab"]')];
const tablist = document.querySelector('[role="tablist"]');
const staffReleaseSlot = document.getElementById('staff-release-slot');
let staffRelease = null;

function formatBytes(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function isPublishedStaffRelease(value) {
  return value && value.name === 'RDV Team' && value.status === 'available'
    && /^\d+\.\d+\.\d+$/.test(value.version) && Number.isSafeInteger(value.versionCode) && value.versionCode > 0
    && typeof value.minAndroid === 'string' && /^\d+\.\d+$/.test(value.minAndroid)
    && value.packageName === 'com.rdv.staff'
    && value.file === `/releases/rdv-team-${value.version}.apk`
    && Number.isSafeInteger(value.bytes) && value.bytes > 0 && value.bytes <= 50 * 1024 * 1024
    && typeof value.sha256 === 'string' && /^[a-f0-9]{64}$/.test(value.sha256);
}

function renderStaffRelease() {
  if (!staffReleaseSlot || !isPublishedStaffRelease(staffRelease)) return;
  const chinese = document.documentElement.lang === 'zh-CN';
  const download = document.createElement('a');
  download.className = 'download';
  download.href = staffRelease.file;
  download.download = staffRelease.file.slice(staffRelease.file.lastIndexOf('/') + 1);
  download.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" stroke-linecap="round" stroke-linejoin="round"/></svg><span></span><svg class="button-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M5 19 19 5M9 5h10v10" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  download.querySelector('span').textContent = chinese ? '下载安卓安装包' : 'Download for Android';
  const details = document.createElement('p');
  details.className = 'release';
  details.textContent = `v${staffRelease.version} · ${formatBytes(staffRelease.bytes)} · Android ${staffRelease.minAndroid}+`;
  staffReleaseSlot.replaceChildren(download, details);
}

function setLanguage(lang) {
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  document.title = lang === 'zh' ? '团队应用 · RESORT DEJA VU' : 'Team Apps · RESORT DEJA VU';
  document.querySelectorAll('[data-en]').forEach(node => { node.textContent = node.dataset[lang]; });
  document.querySelectorAll('[data-label-en]').forEach(node => { node.setAttribute('aria-label', node.dataset[lang === 'zh' ? 'labelZh' : 'labelEn']); });
  toggle.textContent = lang === 'zh' ? 'EN' : '中';
  toggle.setAttribute('aria-label', lang === 'zh' ? 'Switch to English' : '切换到中文');
  renderStaffRelease();
}

function selectApp(selected, moveFocus = false) {
  tabs.forEach(tab => {
    const active = tab === selected;
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
    document.getElementById(tab.getAttribute('aria-controls')).hidden = !active;
  });
  if (moveFocus) selected.focus();
}

toggle.hidden = false;
setLanguage(navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en');
toggle.addEventListener('click', () => setLanguage(document.documentElement.lang === 'en' ? 'zh' : 'en'));
tabs.forEach(tab => tab.addEventListener('click', () => selectApp(tab)));
tablist.addEventListener('keydown', event => {
  const index = tabs.indexOf(event.target);
  if (index < 0) return;
  let next;
  if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
  if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
  if (event.key === 'Home') next = 0;
  if (event.key === 'End') next = tabs.length - 1;
  if (next === undefined) return;
  event.preventDefault();
  selectApp(tabs[next], true);
});

fetch('/staff-release.json', { cache: 'no-store' })
  .then(response => response.ok ? response.json() : null)
  .then(release => { if (isPublishedStaffRelease(release)) { staffRelease = release; renderStaffRelease(); } })
  .catch(() => {});
