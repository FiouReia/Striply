import type { PrintFormat } from "../collage/layout";
export function openPrintWindow(format: PrintFormat): Window {
 const win = window.open("", "_blank"); if (!win) throw new Error("Allow pop-ups to open the print preview.");
 win.document.title = "Preparing photo print"; win.document.body.textContent = "Preparing your print…";
 const width = format === "sheet" ? 4 : 2;
 const style = win.document.createElement("style"); style.textContent = `@page { size: ${width}in 6in; margin: 0; } * { box-sizing: border-box; } html, body { margin: 0; padding: 0; } img { display: block; width: ${width}in; height: 6in; } @media screen { body { background: #eee; display: grid; justify-content: center; padding: 24px; } }`; win.document.head.append(style);
 return win;
}
export async function printBlob(win: Window, blob: Blob) {
 const url = URL.createObjectURL(blob);
 try {
  const img = win.document.createElement("img"); img.alt = "Photo strip print"; img.src = url; await img.decode(); if (win.closed) throw new Error("The print window was closed."); win.document.body.replaceChildren(img); win.document.title = "Photo strip print";
  win.addEventListener("afterprint", () => { URL.revokeObjectURL(url); win.close(); }, { once: true });
  win.addEventListener("beforeunload", () => URL.revokeObjectURL(url), { once: true }); win.focus(); win.print();
 } catch (error) { URL.revokeObjectURL(url); win.close(); throw error; }
}
