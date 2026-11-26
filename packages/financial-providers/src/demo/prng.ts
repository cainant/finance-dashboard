/**
 * PRNG determinístico (mulberry32). Mesma seed → mesma sequência, em qualquer
 * runtime. Não é criptográfico; serve só para gerar dados fictícios do demo.
 */
export interface Prng {
  next(): number;
  int(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
  chance(probability: number): boolean;
}

export function createPrng(seed: number): Prng {
  let state = seed >>> 0;

  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    int(min, max) {
      if (max < min) throw new RangeError("max must be >= min");
      return min + Math.floor(next() * (max - min + 1));
    },
    pick(items) {
      if (items.length === 0) throw new RangeError("cannot pick from an empty list");
      const item = items[Math.floor(next() * items.length)];
      if (item === undefined) throw new RangeError("cannot pick from an empty list");
      return item;
    },
    chance(probability) {
      return next() < probability;
    },
  };
}
