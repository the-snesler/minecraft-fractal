const keyIndexMap = new Map(); // key -> list index
const indexKeyMap = new Map(); // list index -> key
const cacheList = []; // list index -> value
const usedList = []; // list index -> usage bool
let clockHand = 0; // Simple LRU cache with fixed size
const MAX_CACHE_SIZE = 100000;

export function getBlockFromCache(cacheKey) {
  const index = keyIndexMap.get(cacheKey);
  if (index === undefined) {
    return null; // Cache miss
  }
  usedList[index] = true;
  return cacheList[index];
}

export function setBlockInCache(cacheKey, blockId) {
  // advance clock hand
  clockHand = (clockHand + 1) % MAX_CACHE_SIZE;
  while (usedList[clockHand]) {
    usedList[clockHand] = false; // Give a second chance
    clockHand = (clockHand + 1) % MAX_CACHE_SIZE;
  }
  // evict the current entry at clock hand if it exists
  const evictedKey = indexKeyMap.get(clockHand);
  if (evictedKey !== undefined) {
    keyIndexMap.delete(evictedKey);
    indexKeyMap.delete(clockHand);
  }
  // insert new entry
  keyIndexMap.set(cacheKey, clockHand);
  indexKeyMap.set(clockHand, cacheKey);
  cacheList[clockHand] = blockId;
  usedList[clockHand] = true;
}
