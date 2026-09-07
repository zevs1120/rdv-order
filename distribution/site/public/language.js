const toggle = document.getElementById('language');
const tabs = [...document.querySelectorAll('[role="tab"]')];
const tablist = document.querySelector('[role="tablist"]');

function setLanguage(lang) {
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  document.title = lang === 'zh' ? '团队应用 · Resort Déjà Vu' : 'Team Apps · Resort Déjà Vu';
  document.querySelectorAll('[data-en]').forEach(node => { node.textContent = node.dataset[lang]; });
  document.querySelectorAll('[data-label-en]').forEach(node => { node.setAttribute('aria-label', node.dataset[lang === 'zh' ? 'labelZh' : 'labelEn']); });
  toggle.textContent = lang === 'zh' ? 'EN' : '中';
  toggle.setAttribute('aria-label', lang === 'zh' ? 'Switch to English' : '切换到中文');
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
