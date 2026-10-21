document.addEventListener("wheel", function (e) {
  if (e.ctrlKey) {
    e.preventDefault();
  }
}, { passive: false });

// Bloqueia Ctrl + tecla "+" / "-"
document.addEventListener("keydown", function (e) {
  if (e.ctrlKey && (e.key === "+" || e.key === "-" || e.key === "=" || e.key === "_")) {
    e.preventDefault();
  }
});