import { createReadStream, createWriteStream } from "node:fs";
import { stat, unlink } from "node:fs/promises";
import { request as httpsRequest } from "node:https";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type CloudBase from "@cloudbase/node-sdk";
import type { PrivateStorage } from "./cloud-assets";
import { MAX_ASSET_BYTES, UPLOAD_TIMEOUT_MS } from "../../mock-api/src/asset-limits";
import { requireValue } from "../../domain/src/errors";
type StorageApp = Pick<ReturnType<typeof CloudBase.init>, "getUploadMetadata" | "getTempFileURL" | "deleteFile">;
/** SDK metadata only; its downloadFile implementation resolves before the file writer finishes. */
export class CloudBasePrivateStorage implements PrivateStorage {
  constructor(private app: StorageApp) {}
  private url(value: string) {
    const url = new URL(value);
    requireValue(url.protocol === "https:" && !url.username && !url.password && (!url.port || url.port === "443") && /\.(?:myqcloud\.com|tcb\.qcloud\.la|tcloudbaseapp\.com)$/.test(url.hostname), 502, "STORAGE_URL_UNAVAILABLE", "私有存储未返回受信任的 HTTPS 地址");
    return url;
  }
  async upload(cloudPath: string, filePath: string) {
    const { size } = await stat(filePath);
    requireValue(size > 0 && size <= MAX_ASSET_BYTES, 413, "FILE_TOO_LARGE", "私有对象超过 500 MiB");
    const metadata = await this.app.getUploadMetadata({cloudPath});
    const data = metadata.data;
    requireValue(data?.fileId && data.authorization && data.token, 502, "STORAGE_UNAVAILABLE", "私有存储授权失败");
    try {
      const url = this.url(data.url);
      let transferred: Promise<void> = Promise.resolve();
      await new Promise<void>((resolve,reject) => {
        const req = httpsRequest(url, {method:"PUT",headers:{"Content-Length":String(size),Signature:data.authorization,"x-cos-security-token":data.token,"x-cos-meta-fileid":data.cosFileId,authorization:data.authorization,key:encodeURIComponent(cloudPath)}}, res => {
          let bytes=0;
          res.on("data", chunk => { bytes += chunk.length; if (bytes > 65536) res.destroy(new Error("STORAGE_RESPONSE_TOO_LARGE")); });
          res.on("error",reject);
          res.on("end",()=>res.statusCode && res.statusCode >= 200 && res.statusCode < 300 ? resolve() : (req.destroy(), reject(new Error("PRIVATE_UPLOAD_FAILED"))));
        });
        const timer=setTimeout(()=>req.destroy(new Error("PRIVATE_UPLOAD_TIMEOUT")),UPLOAD_TIMEOUT_MS);timer.unref();
        req.setTimeout(30000,()=>req.destroy(new Error("PRIVATE_UPLOAD_IDLE_TIMEOUT")));
        req.once("error",reject);req.once("close",()=>clearTimeout(timer));
        transferred = pipeline(createReadStream(filePath),req);
        void transferred.catch(reject);
      });
      await transferred;
      return data.fileId;
    } catch(error) { await this.remove([data.fileId]).catch(()=>{}); throw error; }
  }
  async download(fileId: string, path: string) {
    const signed = await this.app.getTempFileURL({fileList:[{fileID:fileId,maxAge:900}]});
    const item = signed.fileList?.[0];
    requireValue(item?.code === "SUCCESS",404,"RESOURCE_UNAVAILABLE","私有对象不可用");
    const url = this.url(item.tempFileURL);
    try {
      await new Promise<void>((resolve,reject) => {
        const req=httpsRequest(url,{method:"GET"},res=>{
          if(res.statusCode !== 200){res.resume();reject(new Error("PRIVATE_DOWNLOAD_FAILED"));return;}
          const length=res.headers["content-length"] ? Number(res.headers["content-length"]) : undefined;
          if(length !== undefined && (!Number.isSafeInteger(length)||length < 1||length>MAX_ASSET_BYTES)){res.destroy();reject(new Error("PRIVATE_OBJECT_SIZE_INVALID"));return;}
          let received=0;
          const bounded=new Transform({transform(chunk,_encoding,callback){received+=chunk.length;callback(received>MAX_ASSET_BYTES?new Error("PRIVATE_OBJECT_TOO_LARGE"):null,chunk);}});
          void pipeline(res,bounded,createWriteStream(path,{flags:"wx",mode:0o600})).then(()=>{
            if(length!==undefined&&received!==length)throw new Error("PRIVATE_OBJECT_INCOMPLETE");resolve();
          }).catch(reject);
        });
        const timer=setTimeout(()=>req.destroy(new Error("PRIVATE_DOWNLOAD_TIMEOUT")),UPLOAD_TIMEOUT_MS);timer.unref();
        req.setTimeout(30000,()=>req.destroy(new Error("PRIVATE_DOWNLOAD_IDLE_TIMEOUT")));req.once("error",reject);req.once("close",()=>clearTimeout(timer));req.end();
      });
    } catch(error){await unlink(path).catch(()=>{});throw error;}
  }
  async remove(fileIds: string[]) {
    const result = await this.app.deleteFile({fileList:fileIds});
    requireValue(result.fileList.every(file=>file.code === "SUCCESS"),502,"STORAGE_CLEANUP_FAILED","私有对象清理未完成");
  }
}
