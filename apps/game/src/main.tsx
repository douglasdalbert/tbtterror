import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import "./style.css";

const root = document.getElementById("root");
if (!root) throw new Error("Elemento raiz do jogo não encontrado.");
createRoot(root).render(<React.StrictMode><App /></React.StrictMode>);
