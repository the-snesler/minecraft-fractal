// Minecraft Fractal Viewer Configuration
// All configurable constants in one place

export const CONFIG = {
    // Zoom threshold: when to start crossfade transition (0.0 - 1.0)
    // 0.7 means start transition when 70% zoomed into current level
    zoomThreshold: 0.7,

    // Zoom smoothness (lower = smoother but slower response)
    zoomSmoothness: 0.12,

    // Pan smoothness for momentum
    panSmoothness: 0.15,

    // Maximum pan distance in blocks at current zoom level
    // Set to Infinity for unlimited panning (but may cause precision issues at deep zooms)
    maxPanDistance: 512,

    // Starting block for the fractal
    rootBlock: 'obsidian',

    // Visible grid buffer (extra blocks beyond screen edge)
    gridBuffer: 16,

    // Minimum zoom level (negative = can zoom out from start)
    minZoom: -0.2,

    // Base block size in pixels on screen
    blockSize: 16,

    // Zoom speed multiplier for wheel events
    zoomSpeed: 0.002,

    // Background color (hex)
    backgroundColor: 0x888888,

    // Enable debug logging
    debug: false,
};
