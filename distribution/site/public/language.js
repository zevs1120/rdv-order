const toggle = document.getElementById("language");
function setLanguage(lang) {
  document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
  document.querySelectorAll("[data-en]").forEach(node => { node.textContent = node.dataset[lang]; });
  toggle.textContent = lang === "zh" ? "English" : "中文";
  toggle.setAttribute("aria-label", lang === "zh" ? "Switch to English" : "切换到中文");
}
toggle.hidden = false;
setLanguage(navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en");
toggle.addEventListener("click", () => setLanguage(document.documentElement.lang === "en" ? "zh" : "en"));
