A proof of concept project that allows one to infinitely zoom in to a Minecraft block grid, inspired by [this reddit post](https://www.reddit.com/r/Minecraft/comments/142i5h8/i_programmed_this_infinite_block_recursion_now/?utm_source=share&utm_medium=web3x&utm_name=web3xcss&utm_term=1&utm_content=share_button).
It is, in theory, possible to zoom in indefinitely! It gets slower the more you zoom in, but that's the price of allowing you to zoom out too.

![fractalexample](https://github.com/TetraTsunami/minecraft-fractal/assets/78718829/eb76bac9-ed27-4feb-a016-66fd3f5d4e87)

## Block Hunt
Every block you see gets added to your collection. Starting from obsidian, 469 different blocks can show up in the fractal; the meter at the top tracks how many you've found.

- A block counts as found once its center is on screen. Turn on **Outline finds** in the collection to have new blocks outlined in their rarity color.
- Rarity is how many zooms deep a block first appears (Common 0–2, Uncommon 3–4, Rare 5–6, Epic 7–8, Legendary 9+).
- The collection (<kbd>C</kbd>) lists every findable block. Stuck on one? A hint shows which blocks it hides inside (with the exact pixels highlighted); a second hint shows the quickest route from obsidian.
- Progress is saved locally. Your total time (first find to last) is only shown once the collection is complete.

### Daily Block
Once a day, everyone gets the same Rare-or-better block to find against the clock. After a 3-2-1 countdown the view resets to obsidian and the block is revealed; the clock stops when it's on screen. Each step of the quickest route you reveal adds 30 seconds.

The schedule comes from `scripts/build-daily.js`, which writes a seeded shuffle of the eligible blocks to `dist/daily.json`; the app indexes into it by calendar day, so every device picks the same block.

### The block graph
The list of findable blocks is derived from the LUT at runtime: block A contains block B if any pixel of A maps to B, and a breadth-first search from the root block gives each block's depth. Run `npm run graph` after a build to print the same graph (or `npm run graph -- --json` for machine-readable output), including the blocks that can never appear.

## Setup
- You'll need to provide the textures yourself. They can any set of 16x16 square PNG images, and should be placed in a directory named ./block/. We ignore .json files and transparent PNGs, so you can just drop in a resource pack's blocks texture folder if you want.
- Run `npm i && node run build` to build the project and generate the necessary files (block data, atlases) in the `dist` directory.
- `npm run dev` to start the development server, and open `http://localhost:8000` in your browser to see the result.
