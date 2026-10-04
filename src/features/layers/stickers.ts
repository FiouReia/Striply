export const stickers = [
 { id: "heart", name: "Heart", category: "Hearts" }, { id: "star", name: "Star", category: "Stars" },
 { id: "party", name: "Party popper", category: "Party" }, { id: "wedding", name: "Wedding rings", category: "Wedding" },
 { id: "birthday", name: "Birthday cake", category: "Birthday" }, { id: "graduation", name: "Graduation cap", category: "Graduation" },
 { id: "flower", name: "Flower", category: "Flowers" },
];
let assetsPromise: Promise<Map<string, HTMLImageElement>> | null = null;
export function loadStickerAssets(): Promise<Map<string, HTMLImageElement>> {
 if (!assetsPromise) assetsPromise = Promise.all(stickers.map(async sticker => {
  const image = new Image(); image.src = `/stickers/${sticker.id}.svg`; await image.decode(); return [sticker.id, image] as const;
 })).then(entries => new Map(entries)).catch(error => { assetsPromise = null; throw error; });
 return assetsPromise;
}
