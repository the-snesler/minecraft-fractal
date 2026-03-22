A proof of concept project that allows one to infinitely zoom in to a Minecraft block grid, inspired by [this reddit post](https://www.reddit.com/r/Minecraft/comments/142i5h8/i_programmed_this_infinite_block_recursion_now/?utm_source=share&utm_medium=web3x&utm_name=web3xcss&utm_term=1&utm_content=share_button).
It is, in theory, possible to zoom in indefinitely! It gets slower the more you zoom in, but that's the price of allowing you to zoom out too.

![fractalexample](https://github.com/TetraTsunami/minecraft-fractal/assets/78718829/eb76bac9-ed27-4feb-a016-66fd3f5d4e87)

## Setup
- You'll need to provide the textures yourself. They can any set of 16x16 square PNG images, and should be placed in a directory named ./block/. We ignore .json files and transparent PNGs, so you can just drop in a resource pack's blocks texture folder if you want.
- Run `npm i && node run build` to build the project and generate the necessary files (block data, atlases) in the `dist` directory.
- `npm run dev` to start the development server, and open `http://localhost:8000` in your browser to see the result.
