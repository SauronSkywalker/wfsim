// ---- page feedback -------------------------------------------------------

// Account callbacks can report an outcome while 17-account.js is evaluating,
// so this state must be initialized before that part can call presetToast().
let toastTimer = null;
function presetToast(msg) {
  let el = $("toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add("on");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("on"), 2200);
}
