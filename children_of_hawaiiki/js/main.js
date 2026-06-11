"use strict";

window.addEventListener("DOMContentLoaded", () => {
  const canvas = document.getElementById("scene");
  bindUI();

  const hasSave = loadGame();
  if (!hasSave) newGame();
  renderAll();
  showTitle(hasSave);

  initRender(canvas);
});
