const fs = require("node:fs/promises");
const path = require("node:path");
const Jimp = require("jimp");

const root = path.join(__dirname, "..");
const sourcePath = path.join(root, "media", "applogo.png");
const pngPath = path.join(root, "media", "app-icon.png");
const outputPath = path.join(root, "media", "applogo.ico");
const iconSize = 256;

async function createIcon() {
  const image = await Jimp.read(sourcePath);
  let left = image.bitmap.width;
  let top = image.bitmap.height;
  let right = -1;
  let bottom = -1;

  image.scan(0, 0, image.bitmap.width, image.bitmap.height, (x, y, index) => {
    if (image.bitmap.data[index + 3] === 0) return;
    left = Math.min(left, x);
    top = Math.min(top, y);
    right = Math.max(right, x);
    bottom = Math.max(bottom, y);
  });

  if (right < left || bottom < top) throw new Error("The source logo is fully transparent.");

  const cropped = image.crop(left, top, right - left + 1, bottom - top + 1);
  const scale = Math.min((iconSize - 24) / cropped.bitmap.width, (iconSize - 24) / cropped.bitmap.height);
  const width = Math.max(1, Math.round(cropped.bitmap.width * scale));
  const height = Math.max(1, Math.round(cropped.bitmap.height * scale));
  cropped.resize(width, height, Jimp.RESIZE_BILINEAR);

  const canvas = new Jimp(iconSize, iconSize, 0x00000000);
  canvas.composite(cropped, Math.round((iconSize - width) / 2), Math.round((iconSize - height) / 2));
  const png = await canvas.getBufferAsync(Jimp.MIME_PNG);

  // Windows Vista and later support PNG-encoded images inside ICO files.
  const header = Buffer.alloc(22);
  header.writeUInt16LE(0, 0); // Reserved.
  header.writeUInt16LE(1, 2); // ICO image type.
  header.writeUInt16LE(1, 4); // Image count.
  header.writeUInt8(0, 6); // 0 represents a 256px width.
  header.writeUInt8(0, 7); // 0 represents a 256px height.
  header.writeUInt8(0, 8); // No palette.
  header.writeUInt8(0, 9); // Reserved.
  header.writeUInt16LE(1, 10); // Color planes.
  header.writeUInt16LE(32, 12); // Bits per pixel.
  header.writeUInt32LE(png.length, 14);
  header.writeUInt32LE(header.length, 18);

  await Promise.all([
    fs.writeFile(pngPath, png),
    fs.writeFile(outputPath, Buffer.concat([header, png]))
  ]);
  console.log(`Created ${path.relative(root, pngPath)}`);
  console.log(`Created ${path.relative(root, outputPath)}`);
}

createIcon().catch((error) => {
  console.error("Could not create the Windows app icon:", error);
  process.exitCode = 1;
});
