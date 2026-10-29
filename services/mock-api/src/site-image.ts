import sharp from "sharp";
/** Parse image metadata with a bounded decoder; no file is written. */
export async function siteImageMetadata(bytes: Buffer) {
  const image = sharp(bytes, { limitInputPixels: 20_000_000, failOn: "error" }).timeout({ seconds: 5 });
  const metadata = await image.metadata();
  await image.stats();
  return metadata;
}
