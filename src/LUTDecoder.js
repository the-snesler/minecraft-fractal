/**
 * LUT Decoder
 *
 * Loads and decodes the binary LUT file for fast block lookups.
 */

export class LUTDecoder {
    constructor() {
        this.blocks = [];        // Block names indexed by ID
        this.blockToId = null;   // Map<string, number>
        this.lut = null;         // Uint16Array
        this.blockCount = 0;
    }

    /**
     * Load LUT from binary file
     * @param {string} url - URL to blockLUT.bin
     */
    async load(url) {
        const response = await fetch(url);
        const buffer = await response.arrayBuffer();
        const data = new DataView(buffer);
        const bytes = new Uint8Array(buffer);

        // Read header
        const magic = String.fromCharCode(...bytes.slice(0, 5));
        if (magic !== 'MCLUT') {
            throw new Error('Invalid LUT file: bad magic');
        }

        const version = data.getUint8(5);
        if (version !== 1) {
            throw new Error(`Unsupported LUT version: ${version}`);
        }

        this.blockCount = data.getUint16(6, true);
        let offset = 8;

        // Read block names
        this.blocks = [];
        this.blockToId = new Map();

        for (let i = 0; i < this.blockCount; i++) {
            const nameLen = bytes[offset++];
            const nameBytes = bytes.slice(offset, offset + nameLen);
            const name = new TextDecoder().decode(nameBytes);
            offset += nameLen;

            this.blocks.push(name);
            this.blockToId.set(name, i);
        }

        // Read LUT data
        // Copy to aligned buffer since offset may not be 2-byte aligned
        const lutSize = this.blockCount * 256;
        const lutBytes = bytes.slice(offset, offset + lutSize * 2);
        this.lut = new Uint16Array(lutBytes.buffer);

        console.log(`LUT loaded: ${this.blockCount} blocks, ${(buffer.byteLength / 1024).toFixed(1)} KB`);
    }

    /**
     * Get the block ID that a pixel of a block maps to
     * @param {number} blockId - Source block ID
     * @param {number} x - Pixel X (0-15)
     * @param {number} y - Pixel Y (0-15)
     * @returns {number} Target block ID
     */
    getPixelBlock(blockId, x, y) {
        const pixelIndex = y * 16 + x;
        return this.lut[blockId * 256 + pixelIndex];
    }

    /**
     * Get block ID by name
     * @param {string} name
     * @returns {number}
     */
    getBlockId(name) {
        return this.blockToId.get(name) ?? 0;
    }

    /**
     * Get block name by ID
     * @param {number} id
     * @returns {string}
     */
    getBlockName(id) {
        return this.blocks[id] ?? this.blocks[0];
    }
}
