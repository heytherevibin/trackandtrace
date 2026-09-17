export type Leaf = string | ((...args: never[]) => string);
export type MessageTree = { readonly [key: string]: Leaf | MessageTree | readonly MessageTree[] };
