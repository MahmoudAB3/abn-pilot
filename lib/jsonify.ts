/** Type d'un objet après JSON.stringify/parse (dates → chaînes, BigInt → chaînes). */
export type Jsonify<T> = T extends Date
  ? string
  : T extends bigint
    ? string
    : T extends (infer U)[]
      ? Jsonify<U>[]
      : T extends object
        ? { [K in keyof T]: Jsonify<T[K]> }
        : T;
