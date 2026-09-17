// Pre-paint theme resolution for documents rendered outside the provider
// (global-error). Mirrors next-themes: stored choice, else the OS scheme.
export const THEME_STORAGE_KEY = "tt.theme";
export const THEME_BOOT_SCRIPT = `(function(){try{var k="${THEME_STORAGE_KEY}";var t=localStorage.getItem(k);var d=window.matchMedia("(prefers-color-scheme: dark)").matches;var r=t==="light"||t==="dark"?t:(d?"dark":"light");document.documentElement.setAttribute("data-theme",r);document.documentElement.style.colorScheme=r;}catch(e){}})();`;
