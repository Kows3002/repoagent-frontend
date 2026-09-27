// Apply the saved preference before the first paint. New visitors start in light mode.
(function () {
  var theme = "light";
  try {
    if (localStorage.getItem("repoagent:theme:v1") === "dark") theme = "dark";
  } catch (_) {
    // Private browsing or storage restrictions should never block the workspace.
  }
  document.documentElement.dataset.theme = theme;
  var color = document.querySelector('meta[name="theme-color"]');
  if (color) color.setAttribute("content", theme === "dark" ? "#11151b" : "#f6f7f9");
})();
