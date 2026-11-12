import { useWallpaper } from '../lib/wallpaper';

/** Lapisan wallpaper di belakang isi layar. Induknya harus `relative isolate` supaya lapisan ini berada di atas latar tetapi di bawah isi. */
export default function WallpaperLayer() {
  const { url, transparency } = useWallpaper();
  if (!url) return null;
  return <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-cover bg-center" style={{ backgroundImage: `url(${url})`, opacity: 1 - transparency / 100 }} />;
}
