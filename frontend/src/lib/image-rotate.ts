// Canvas image rotation, shared between the rubber-stamp/signature editor and
// the patient-photo upload path (#71).
//
// Both callers rotate, but they want different things back: the editor works in
// data URLs and re-encodes to PNG anyway once it crops, while the upload path
// must hand the API a File whose type the backend already accepts.

// Matches the quality the stamp editor uses when it emits JPEG.
const JPEG_QUALITY = 0.92;

async function loadImage(src: string): Promise<HTMLImageElement> {
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("rotate_load_failed"));
    img.src = src;
  });
  return img;
}

// The rotated image needs a bigger box than the original unless the angle is a
// multiple of 180: a w×h rectangle turned by θ spans w·cos+h·sin across and
// w·sin+h·cos down. Drawing from the centre keeps the whole image inside it.
function rotateOntoCanvas(img: HTMLImageElement, degrees: number): HTMLCanvasElement {
  const rad = (degrees * Math.PI) / 180;
  const sin = Math.abs(Math.sin(rad));
  const cos = Math.abs(Math.cos(rad));
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const cv = document.createElement("canvas");
  cv.width = Math.round(w * cos + h * sin);
  cv.height = Math.round(w * sin + h * cos);
  const ctx = cv.getContext("2d");
  if (!ctx) throw new Error("rotate_no_context");
  ctx.translate(cv.width / 2, cv.height / 2);
  ctx.rotate(rad);
  ctx.drawImage(img, -w / 2, -h / 2);
  return cv;
}

// Any angle — the editor's buttons snap to 90°, its fine slider supplies the
// rest. Callers always re-rotate from their ORIGINAL source rather than from
// the previous result, so successive nudges don't compound encoding artefacts.
export async function rotateDataUrl(
  src: string,
  degrees: number,
  mime: string = "image/png",
): Promise<string> {
  const img = await loadImage(src);
  let cv: HTMLCanvasElement;
  try {
    cv = rotateOntoCanvas(img, degrees);
  } catch {
    return src; // no 2d context — leave the caller's image untouched
  }
  return cv.toDataURL(mime, mime === "image/jpeg" ? JPEG_QUALITY : undefined);
}

// Rotate an upload in place, preserving its type and filename.
//
// Preserving the mime is the whole point: a phone JPEG re-encoded as PNG
// commonly triples in size and can cross the API's 10 MB per-attachment limit,
// so a rotation would turn a working upload into a rejected one. JPEG in, JPEG
// out. A zero rotation returns the original File untouched rather than
// round-tripping it through the encoder and losing quality for nothing.
export async function rotateFile(file: File, degrees: number): Promise<File> {
  const turn = ((degrees % 360) + 360) % 360;
  if (turn === 0) return file;

  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const cv = rotateOntoCanvas(img, turn);
    const type = file.type || "image/jpeg";
    const blob = await new Promise<Blob | null>((resolve) =>
      cv.toBlob(resolve, type, type === "image/jpeg" ? JPEG_QUALITY : undefined),
    );
    if (!blob) throw new Error("rotate_encode_failed");
    return new File([blob], file.name, { type: blob.type || type });
  } finally {
    URL.revokeObjectURL(url);
  }
}
