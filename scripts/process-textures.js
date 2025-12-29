import { getAverageColor } from "fast-average-color-node";
import fs from "fs";
import PImage from "pureimage";

let validBlockData = {};
const blacklist = [
    "debug",
    "debug2",
    "piston_inner",
    "repeater",
    "repeater_on",
    "dragon_egg",
    "structure_block.*",
    "jigsaw.*",
    ".*door.*",
    "respawn_anchor.*",
]

fs.readdir("./block", async (err, files) => {
    if (err) {
        console.log(err);
        return;
    }

    await Promise.all(files.map(async (file) => {
        if (!file.endsWith(".png")) return Promise.resolve();
        if (blacklist.some((regex) => file.match(regex))) {
            console.log(`Skipping ${file}`);
            return Promise.resolve();
        }
        return PImage.decodePNGFromStream(
            fs.createReadStream("./block/" + file)
        ).then((img) => {
            if (img.width !== img.height) return;

            for (let x = 0; x < img.width; x++) {
                for (let y = 0; y < img.height; y++) {
                    if ((img.getPixelRGBA(x, y) & 0xff) !== 255) return;
                }
            }

            return getAverageColor("./block/" + file).then((color) => {
                validBlockData[file.replace(".png", "")] = {color: color.value.slice(
                    0,
                    3
                )}
            });
        });
    }));
    
    fs.writeFile(
        "./dist/blockData.json",
        JSON.stringify(validBlockData),
        (err) => {
            if (err) {
                return console.log(err);
            }
            console.log(`${Object.entries(validBlockData).length} blocks saved to dist/blockData.json`);
        }
    );
});
