const MAX_DIMENSION = 1920;
const JPEG_QUALITY = 0.82;

/**
 * Mobilne kamera-slike (osobito portret snimke preko <input capture> na
 * dosta Android uređaja) mogu biti dovoljno velike da preko više fajlova u
 * jednom signing submitu (2 dokumenta + 4+ slike vozila) probiju Vercel-ov
 * ~4.5MB limit za tijelo zahtjeva na Serverless Functions - tvrdi platform
 * limit, nema Next.js config koji ga zaobiđe za Route Handlere. To je bio
 * uzrok "Greška prilikom slanja" koji je djelovao orijentacijski-specifično
 * (neki uređaji/orijentacije daju veće fajlove od drugih). Canvas-based
 * downscale + re-encode prije uploada rješava to neovisno o točnom
 * mehanizmu, i usput normalizira EXIF rotaciju - canvas snima sliku
 * uspravno onako kako je browser već prikazao <img> element, pa se ta
 * orijentacija "peče" u izlazni canvas bez EXIF metapodataka koji bi mogli
 * biti krivo protumačeni dalje niz tok (npr. u PDF renderiranju).
 */
export async function compressImageFile(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;

  try {
    const img = await loadImage(file);
    const { naturalWidth: width, naturalHeight: height } = img;
    const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height));
    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY)
    );
    if (!blob) return file;

    const newName = file.name.replace(/\.\w+$/, "") + ".jpg";
    return new File([blob], newName, { type: "image/jpeg" });
  } catch {
    // Bilo koji neuspjeh (npr. neuobičajen format koji canvas ne može
    // dekodirati) - šalji original umjesto da blokiraš cijeli flow.
    return file;
  }
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image_load_failed"));
    };
    img.src = url;
  });
}
