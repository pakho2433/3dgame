import "./styles.css";
import { Game } from "./core/Game";

const root = document.querySelector<HTMLElement>("#app");

if (!root) {
  throw new Error("Missing #app root element.");
}

const game = new Game(root);

game.init().catch((error) => {
  console.error(error);
  root.innerHTML = `
    <main class="fatal-error">
      <h1>遊戲啟動失敗</h1>
      <p>${String(error)}</p>
    </main>
  `;
});
