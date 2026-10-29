import { execFileSync } from "node:child_process";
import { open, mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
/** Fictional blue one-second test clip; requires FFmpeg only in verification environments. */
export async function prepareVideoFixtures() {
  const root=await mkdtemp(join(tmpdir(),"zj-video-fixtures-"));
  execFileSync("ffmpeg",["-v","error","-f","lavfi","-i","color=c=blue:s=32x32:d=1","-c:v","libx264","-pix_fmt","yuv420p","-an","-movflags","+faststart","-y",join(root,"video-sample.mp4")]);
  execFileSync("ffmpeg",["-v","error","-i",join(root,"video-sample.mp4"),"-c","copy","-y",join(root,"video-sample.mov")]);
  execFileSync("ffmpeg",["-v","error","-f","lavfi","-i","color=c=blue:s=32x32:d=1","-c:v","libvpx-vp9","-pix_fmt","yuv420p","-an","-y",join(root,"video-sample.webm")]);
  return root;
}
export async function sparsePdf(path:string,size:number){
  const f=await open(path,"wx",0o600);
  const objectStrings=["1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n","2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n","3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] /Resources << >> >>\nendobj\n"];
  let content="%PDF-1.7\n",offsets=[0];for(const obj of objectStrings){offsets.push(Buffer.byteLength(content));content+=obj;}
  const xrefOffset=size-240;
  let footer="xref\n0 4\n0000000000 65535 f \n"+offsets.slice(1).map(n=>String(n).padStart(10,"0")+" 00000 n \n").join("")+"trailer\n<< /Root 1 0 R /Size 4 >>\nstartxref\n"+xrefOffset+"\n%%EOF\n";
  // The sparse gap is inside an unused stream, avoiding scan-all recovery mode.
  content+="4 0 obj\n<< /Length "+(xrefOffset-Buffer.byteLength(content)-70)+" >>\nstream\n";
  await f.write(Buffer.from(content),0,Buffer.byteLength(content),0);
  await f.write(Buffer.from("\nendstream\nendobj\n"),0,18,xrefOffset-18);
  footer=footer.padEnd(240," ");await f.write(Buffer.from(footer),0,240,xrefOffset);await f.truncate(size);await f.close();
}
