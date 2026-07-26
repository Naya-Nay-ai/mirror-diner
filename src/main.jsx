import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import MirrorDinerGame from "./components/MirrorDinerGame.tsx";
import "./styles.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <MirrorDinerGame />
  </StrictMode>,
);
