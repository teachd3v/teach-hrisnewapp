/**
 * Wallpaper bawaan. Berkas ada di `web/public/wallpapers/<kategori>/<id>.webp` (1080 px lebar) dan `<id>.thumb.webp` (200 px, untuk pratinjau).
 * Menambah pilihan: taruh dua berkas itu lalu tambahkan satu baris di bawah. Tidak perlu perubahan lain.
 */
export type WallpaperCategory = 'illustration' | 'minimalist' | 'nature';
export interface WallpaperPreset { id: string; category: WallpaperCategory; title: string }

export const CATEGORY_LABEL: Record<WallpaperCategory, string> = { illustration: 'Ilustrasi', minimalist: 'Minimalis', nature: 'Alam' };
export const CATEGORY_ORDER: WallpaperCategory[] = ['illustration', 'minimalist', 'nature'];

export const PRESETS: WallpaperPreset[] = [
  { id: 'colorful_doodle_monsters', category: 'illustration', title: 'Monster doodle warna-warni' },
  { id: 'countryside_river_windmills', category: 'illustration', title: 'Sungai dan kincir angin' },
  { id: 'crayon_starlight_boy', category: 'illustration', title: 'Anak krayon di bawah bintang' },
  { id: 'santorini_coastal_town', category: 'illustration', title: 'Kota pantai Santorini' },
  { id: 'beige_abstract_cute_bears', category: 'minimalist', title: 'Beruang lucu krem' },
  { id: 'calm_coast_twilight_minimalist', category: 'minimalist', title: 'Senja pantai tenang' },
  { id: 'pastel_sky_white_clouds', category: 'minimalist', title: 'Langit pastel berawan' },
  { id: 'spiderman_mask_minimalist', category: 'minimalist', title: 'Topeng superhero minimalis' },
  { id: 'green_hills_sunny_sky', category: 'nature', title: 'Bukit hijau cerah' },
  { id: 'hyperos_green_hills_clouds', category: 'nature', title: 'Bukit hijau berawan' },
  { id: 'lone_tree_ocean_view', category: 'nature', title: 'Pohon sendiri menghadap laut' },
  { id: 'sheep_coastal_cliffs', category: 'nature', title: 'Domba di tebing pantai' },
];

export const findPreset = (id: string) => PRESETS.find((p) => p.id === id) ?? null;
export const presetUrl = (p: WallpaperPreset) => `/wallpapers/${p.category}/${p.id}.webp`;
export const presetThumbUrl = (p: WallpaperPreset) => `/wallpapers/${p.category}/${p.id}.thumb.webp`;
