import { createRoot } from "react-dom/client";
import App from "./App";
import "./i18n"; // Import the new i18n configuration

const container = document.getElementById("app");
const root = createRoot(container!);
root.render(<App />);
