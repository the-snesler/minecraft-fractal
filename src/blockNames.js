/**
 * Block Names
 *
 * Turns Bedrock texture file names into readable block names,
 * e.g. "hardened_clay_stained_silver" -> "Light Gray Terracotta".
 */

// Trailing tokens describing a face or state; shown in parentheses
const QUALIFIERS = new Set([
    'top', 'bottom', 'side', 'front', 'back', 'inside', 'outside', 'other',
    'north', 'south', 'east', 'west', 'horizontal', 'vertical',
    'on', 'off', 'lit', 'powered', 'crafting', 'triggered', 'conditional',
    'active', 'inactive', 'dormant', 'inverted', 'open', 'honey', 'a', 'b',
    'base', 'inner', 'empty', 'occupied',
]);

// Trailing tokens that carry no meaning for players
const DROPPED = new Set(['mipmap', 'opaque', 'normal', 'inventory', 'placeholder', 'undyed']);

const CORAL_TYPES = { blue: 'tube', pink: 'brain', purple: 'bubble', red: 'fire', yellow: 'horn' };

const OVERRIDES = {
    brick: 'Bricks',
    nether_brick: 'Nether Bricks',
    red_nether_brick: 'Red Nether Bricks',
    end_bricks: 'End Stone Bricks',
    noteblock: 'Note Block',
    ice_packed: 'Packed Ice',
    honeycomb: 'Honeycomb Block',
    sponge_wet: 'Wet Sponge',
    hardened_clay: 'Terracotta',
    cobblestone_mossy: 'Mossy Cobblestone',
    prismarine_dark: 'Dark Prismarine',
    dirt_with_roots: 'Rooted Dirt',
    dirt_podzol: 'Podzol',
    grass: 'Grass Block',
    grass_carried: 'Grass Block',
    grass_side_carried: 'Grass Block (Side)',
    grass_side_snowed: 'Snowy Grass Block (Side)',
    grass_block_snow: 'Snowy Grass Block',
    grass_path: 'Dirt Path',
    farmland_wet: 'Moist Farmland',
    farmland_dry: 'Farmland',
    mushroom_block_inside: 'Mushroom Block (Inside)',
    mushroom_block_skin_stem: 'Mushroom Stem',
    piston_top_sticky: 'Sticky Piston (Top)',
    chorus_flower_dead: 'Dead Chorus Flower',
    pumpkin_face_off: 'Carved Pumpkin',
    pumpkin_face_on: "Jack o'Lantern",
    tnt: 'TNT',
    itemframe_background: 'Item Frame',
    endframe: 'End Portal Frame',
    fletcher_table: 'Fletching Table',
    stonecutter2: 'Stonecutter',
    stonecutter: 'Old Stonecutter',
    reactor_core_stage_0: 'Nether Reactor Core',
    reactor_core_stage_1: 'Nether Reactor Core (Active)',
    reactor_core_stage_2: 'Nether Reactor Core (Used)',
    quartz_block_lines: 'Quartz Pillar',
    quartz_block_chiseled: 'Chiseled Quartz Block',
    sandstone_carved: 'Chiseled Sandstone',
    sandstone_smooth: 'Cut Sandstone',
    red_sandstone_carved: 'Chiseled Red Sandstone',
    red_sandstone_smooth: 'Cut Red Sandstone',
    stonebrick: 'Stone Bricks',
    stonebrick_mossy: 'Mossy Stone Bricks',
    stonebrick_cracked: 'Cracked Stone Bricks',
    stonebrick_carved: 'Chiseled Stone Bricks',
    azalea_leaves_flowers: 'Flowering Azalea Leaves',
    build_allow: 'Allow',
    build_deny: 'Deny',
    glass_pane_top: 'Glass Pane (Edge)',
    shulker_top_undyed: 'Shulker Box',
    sculk_shrieker: 'Sculk Shrieker',
    hay_block: 'Hay Bale',
    melon: 'Melon',
    smooth_basalt: 'Smooth Basalt',
    camera: 'Camera',
};

// Pattern rules applied to the base name (qualifiers already removed)
const RULES = [
    [/^wool_colored_(.+)$/, '$1 wool'],
    [/^concrete_powder_(.+)$/, '$1 concrete powder'],
    [/^concrete_(.+)$/, '$1 concrete'],
    [/^hardened_clay_stained_(.+)$/, '$1 terracotta'],
    [/^glazed_terracotta_(.+)$/, '$1 glazed terracotta'],
    [/^shulker_top(_(.+))?$/, '$2 shulker box'],
    [/^planks_(.+)$/, '$1 planks'],
    [/^log_(.+)$/, '$1 log'],
    [/^leaves_(.+)$/, '$1 leaves'],
    [/^mushroom_block_skin_(.+)$/, '$1 mushroom block'],
    [/^stone_(granite|diorite|andesite)_smooth$/, 'polished $1'],
    [/^stone_(granite|diorite|andesite)$/, '$1'],
    [/^coral_(\w+?)_dead$/, (_, c) => `dead ${CORAL_TYPES[c] ?? c} coral block`],
    [/^coral_(\w+)$/, (_, c) => `${CORAL_TYPES[c] ?? c} coral block`],
];

function titleCase(text) {
    return text
        .replace(/_/g, ' ')
        .replace(/\bsilver\b/g, 'light gray')
        .replace(/\bbig oak\b/g, 'dark oak')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/\b([a-z])/g, (c) => c.toUpperCase());
}

const cache = new Map();

export function displayName(textureName) {
    if (cache.has(textureName)) return cache.get(textureName);

    let result;
    if (OVERRIDES[textureName]) {
        result = OVERRIDES[textureName];
    } else {
        const tokens = textureName.split('_');
        const qualifiers = [];
        while (tokens.length > 1) {
            const last = tokens[tokens.length - 1];
            const numbered = last.match(/^(side)(\d)$/);
            if (DROPPED.has(last)) {
                tokens.pop();
            } else if (QUALIFIERS.has(last)) {
                qualifiers.unshift(last);
                tokens.pop();
            } else if (numbered) {
                qualifiers.unshift(`${numbered[1]} ${numbered[2]}`);
                tokens.pop();
            } else {
                break;
            }
        }

        const base = tokens.join('_');
        let name = OVERRIDES[base];
        if (!name) {
            const rule = RULES.find(([pattern]) => pattern.test(base));
            name = titleCase(rule ? base.replace(rule[0], rule[1]) : base);
        }
        result = qualifiers.length ? `${name} (${titleCase(qualifiers.join(', '))})` : name;
    }

    cache.set(textureName, result);
    return result;
}
