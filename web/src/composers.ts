import data from './composer-data.json';
export type Composer = {
  fullName: string;
  label: string;
  portrait?: { url: string; sourceUrl: string; assetUrl: string; artist: string; rights: string; sha256: string; bytes: number };
};
export const COMPOSERS: Record<string, Composer> = data;
export const composerInfo = (name: string): Composer => COMPOSERS[name] ?? { fullName: name, label: name };
