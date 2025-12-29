/**
 * Main Build Script
 * 1. Generate block average color LUT (dist/blockData.json) if needed
 * 2. Generate block-to-block pixel LUT (dist/blockLUT.bin) if needed
 * 3. Build texture atlas if needed
 * 4. Bundle JavaScript
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function runScript(scriptPath) {
    return new Promise((resolve, reject) => {
        console.log(`Running: ${path.basename(scriptPath)}`);

        const proc = spawn('node', [scriptPath], {
            stdio: 'inherit',
            cwd: path.join(__dirname, '..'),
        });

        proc.on('close', (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`Script exited with code ${code}`));
            }
        });

        proc.on('error', reject);
    });
}

async function main() {
    const startTime = Date.now();

    // Ensure dist directory exists
    fs.mkdirSync('dist', { recursive: true });

    try {
        console.log(`Generating block average color LUT...`);
        if (!fs.existsSync('dist/blockData.json')) {
            await runScript(path.join(__dirname, 'process-textures.js'));
            console.log('\tDone.');
        } else {
            console.log('\tSkipped (already exists).');
        }

        console.log(`Generating block pixel LUT...`);
        if (!fs.existsSync('dist/blockLUT.bin')) {
            await runScript(path.join(__dirname, 'generate-lut.js'));
            console.log('\tDone.');
        } else {
            console.log('\tSkipped (already exists).');
        }

        console.log(`Building texture atlas...`);
        if (!fs.existsSync('dist/atlas.png')) {
            await runScript(path.join(__dirname, 'build-atlas.js'));
            console.log('\tDone.');
        } else {
            console.log('\tSkipped (already exists).');
        }

        // Step 4: Bundle JavaScript (using esbuild)
        console.log(`Bundling JavaScript...`);
        await new Promise((resolve, reject) => {
            const proc = spawn('npx', ['esbuild', 'src/app.js', '--bundle', '--outfile=dist/app.js', '--format=esm', '--sourcemap'], {
                stdio: 'inherit',
                cwd: path.join(__dirname, '..'),
                shell: true,
            });

            proc.on('close', (code) => {
                if (code === 0) resolve();
                else reject(new Error(`esbuild exited with code ${code}`));
            });

            proc.on('error', reject);
        });

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`\nBuild complete in ${elapsed}s!`);
    } catch (error) {
        console.error('\nBuild failed:', error.message);
        process.exit(1);
    }
}

main();
