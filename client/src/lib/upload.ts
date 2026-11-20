import { apiRequest } from "@/lib/queryClient";

const MAX_W = 1200;      // page width after resizing
const SLICE_H = 6000;    // tall webtoon strips are split into pages of this height

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`${file.name} isn't a readable image`)); };
    img.src = url;
  });
}

/** Resize to WebP in the browser. Very tall strips (manhwa) are cut into several pages. */
export async function prepareImage(file: File, opts: { maxW?: number; split?: boolean } = {}): Promise<string[]> {
  // Phones often send an empty or unusual type (e.g. image/jpg, image/heic). Try to read anything that looks like an image.
  const looksImage = !file.type || file.type.startsWith("image/") || /\.(png|jpe?g|webp|heic|heif|gif|bmp|avif)$/i.test(file.name);
  if (!looksImage) throw new Error(`${file.name} isn't an image. Use PNG, JPEG or WebP.`);
  let img: HTMLImageElement;
  try { img = await loadImage(file); }
  catch {
    if (/heic|heif/i.test(file.type + file.name)) throw new Error(`${file.name} is a HEIC photo this browser can't open. Change your camera to "Most compatible" (JPEG) or share it as JPEG.`);
    throw new Error(`${file.name} couldn't be opened. Try saving it as JPEG or PNG.`);
  }
  const scale = Math.min(1, (opts.maxW ?? MAX_W) / img.naturalWidth);
  const w = Math.round(img.naturalWidth * scale), h = Math.round(img.naturalHeight * scale);
  const slices = opts.split === false ? 1 : Math.max(1, Math.ceil(h / SLICE_H));
  const out: string[] = [];
  for (let i = 0; i < slices; i++) {
    const sh = slices === 1 ? h : Math.min(SLICE_H, h - i * SLICE_H);
    const c = document.createElement("canvas");
    c.width = w; c.height = sh;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(img, 0, (i * SLICE_H) / scale, img.naturalWidth, sh / scale, 0, 0, w, sh);
    let data = c.toDataURL("image/webp", 0.86);
    if (!data.startsWith("data:image/webp")) data = c.toDataURL("image/jpeg", 0.88);
    // keep each page well under the 6 MB server limit
    for (const qy of [0.75, 0.6, 0.45]) { if (data.length < 7_500_000) break; data = c.toDataURL("image/jpeg", qy); }
    if (data.length < 100) throw new Error(`${file.name} is too large for this phone to process. Try a smaller image.`);
    out.push(data);
  }
  return out;
}

export async function uploadData(data: string): Promise<string> {
  let last: any;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await apiRequest("POST", "/api/studio/upload", { data });
      return (await r.json()).path as string;
    } catch (e: any) {
      last = e;
      if (e?.status && e.status < 500 && e.status !== 408 && e.status !== 429) break; // real problem, don't retry
      await new Promise((ok) => setTimeout(ok, 800 * (attempt + 1)));
    }
  }
  if (last?.status === 401) throw new Error("You were signed out. Sign in again, then upload.");
  if (!last?.status) throw new Error("Upload failed. Check your internet connection and try again.");
  throw last;
}
