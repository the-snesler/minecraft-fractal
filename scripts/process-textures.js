import { getAverageColor } from "fast-average-color-node";
import fs from "fs";
import path from "path";
import PImage from "pureimage";

let validBlockData = {};

// textures that look out of place imo
const blacklist = [
    "debug",
    "debug2",
    "piston_inner",
    "repeater.*",
    "comparator.*",
    "dragon_egg",
    "structure_block.*",
    "jigsaw.*",
    ".*door.*",
    "respawn_anchor.*",
    "trial_spawner.*",
    "vault_.*",
    "lectern.*",
    "bed.*",
    "missing_tile",
    "suspicious_.*",
    "dried_ghast.*",
    "calibrated_sculk.*"
]

function findPngs(dir) {
    const results = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            results.push(...findPngs(fullPath));
        } else if (entry.name.endsWith(".png")) {
            results.push(fullPath);
        }
    }
    return results;
}

async function main() {
    const files = findPngs("./block");

    await Promise.all(files.map(async (filePath) => {
        const name = path.basename(filePath, ".png");
        if (blacklist.some((regex) => name.match(regex))) {
            console.log(`Skipping ${name}`);
            return;
        }
        const img = await PImage.decodePNGFromStream(fs.createReadStream(filePath));
        if (img.width !== img.height) return;

        for (let x = 0; x < img.width; x++) {
            for (let y = 0; y < img.height; y++) {
                if ((img.getPixelRGBA(x, y) & 0xff) !== 255) return;
            }
        }

        const color = await getAverageColor(filePath);
        // Use filename as block name, store relative path for atlas builder
        const relPath = path.relative(".", filePath).split(path.sep).join("/");
        validBlockData[name] = {
            color: color.value.slice(0, 3),
            path: relPath,
        };
    }));

    fs.mkdirSync("./dist", { recursive: true });
    fs.writeFileSync("./dist/blockData.json", JSON.stringify(validBlockData));
    console.log(`${Object.keys(validBlockData).length} blocks saved to dist/blockData.json`);
}

main().catch(console.error);
