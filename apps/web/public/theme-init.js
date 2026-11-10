try {
  var t = localStorage.getItem("tema") || "";
  if (t.indexOf("oscuro") >= 0 || (!t && matchMedia("(prefers-color-scheme: dark)").matches)) {
    document.documentElement.classList.add("dark");
  }
} catch (e) {}
