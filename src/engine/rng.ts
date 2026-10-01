/** MT19937 with CPython's seeding, getrandbits and shuffle. */
export class MT19937 {
  private mt = new Uint32Array(624);
  private idx = 625;

  constructor(seed: number | bigint) {
    this.initByArray(seedKey(seed));
  }

  private initGenrand(s: number): void {
    const mt = this.mt;
    mt[0] = s >>> 0;
    for (let i = 1; i < 624; i++) {
      const prev = mt[i - 1]! ^ (mt[i - 1]! >>> 30);
      mt[i] = (Math.imul(1812433253, prev) + i) >>> 0;
    }
    this.idx = 624;
  }

  private initByArray(key: number[]): void {
    this.initGenrand(19650218);
    const mt = this.mt;
    let i = 1;
    let j = 0;
    for (let k = Math.max(624, key.length); k > 0; k--) {
      const prev = mt[i - 1]! ^ (mt[i - 1]! >>> 30);
      mt[i] = ((mt[i]! ^ Math.imul(prev, 1664525)) + key[j]! + j) >>> 0;
      i++;
      j++;
      if (i >= 624) {
        mt[0] = mt[623]!;
        i = 1;
      }
      if (j >= key.length) j = 0;
    }
    for (let k = 623; k > 0; k--) {
      const prev = mt[i - 1]! ^ (mt[i - 1]! >>> 30);
      mt[i] = ((mt[i]! ^ Math.imul(prev, 1566083941)) - i) >>> 0;
      i++;
      if (i >= 624) {
        mt[0] = mt[623]!;
        i = 1;
      }
    }
    mt[0] = 0x80000000;
    this.idx = 624;
  }

  private next(): number {
    const mt = this.mt;
    if (this.idx >= 624) {
      let kk = 0;
      const mix = (a: number, b: number) => (((a & 0x80000000) | (b & 0x7fffffff)) >>> 0);
      for (; kk < 624 - 397; kk++) {
        const y = mix(mt[kk]!, mt[kk + 1]!);
        mt[kk] = mt[kk + 397]! ^ (y >>> 1) ^ (y & 1 ? 0x9908b0df : 0);
      }
      for (; kk < 623; kk++) {
        const y = mix(mt[kk]!, mt[kk + 1]!);
        mt[kk] = mt[kk + (397 - 624)]! ^ (y >>> 1) ^ (y & 1 ? 0x9908b0df : 0);
      }
      const y = mix(mt[623]!, mt[0]!);
      mt[623] = mt[396]! ^ (y >>> 1) ^ (y & 1 ? 0x9908b0df : 0);
      this.idx = 0;
    }
    let y = mt[this.idx++]!;
    y ^= y >>> 11;
    y ^= (y << 7) & 0x9d2c5680;
    y ^= (y << 15) & 0xefc60000;
    y ^= y >>> 18;
    return y >>> 0;
  }

  getrandbits(k: number): number {
    if (k < 1 || k > 32) throw new RangeError("k must be 1..32");
    return this.next() >>> (32 - k);
  }

  randbelow(n: number): number {
    if (n <= 0) throw new RangeError("n must be > 0");
    const k = 32 - Math.clz32(n);
    let r = this.getrandbits(k);
    while (r >= n) r = this.getrandbits(k);
    return r;
  }

  shuffle<T>(list: T[]): void {
    for (let i = list.length - 1; i >= 1; i--) {
      const j = this.randbelow(i + 1);
      const tmp = list[i]!;
      list[i] = list[j]!;
      list[j] = tmp;
    }
  }
}

/** abs(seed) as little-endian 32-bit chunks; 0 -> [0] */
export function seedKey(seed: number | bigint): number[] {
  let n = BigInt(seed);
  if (n < 0n) n = -n;
  if (n === 0n) return [0];
  const key: number[] = [];
  while (n > 0n) {
    key.push(Number(n & 0xffffffffn));
    n >>= 32n;
  }
  return key;
}
