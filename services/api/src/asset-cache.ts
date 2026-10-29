import { createReadStream, mkdirSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { stat, statfs, rm } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { join, resolve } from "node:path";
import { requireValue } from "../../domain/src/errors";
const cacheRoots = new Set<string>();
process.once("exit", () => { for (const root of cacheRoots) { try { rmSync(root,{recursive:true,force:true}); } catch {} } });
type Entry = { path: string; size: number; refs: number; used: number };
/** Verified immutable objects, shared by concurrent Range requests. No public URLs. */
export class AssetCache {
  readonly root: string;
  private entries = new Map<string, Entry>();
  private pending = new Map<string, Promise<Entry>>();
  private reserved = 0;
  private timer: ReturnType<typeof setInterval>;
  private stopped = false;
  constructor(readonly maxBytes = 2 * 1024 * 1024 * 1024, readonly ttlMs = 2 * 60 * 1000) {
    const root = resolve("work/mock-assets"); mkdirSync(root,{recursive:true,mode:0o700}); this.root=mkdtempSync(join(root,"private-cache-"));cacheRoots.add(this.root);
    this.timer=setInterval(()=>{void this.sweep().catch(()=>{});},Math.min(ttlMs,60000));this.timer.unref();
  }
  async sweep(force = false) {
    for (const [key,entry] of this.entries) if(entry.refs===0 && (force || Date.now()-entry.used >= this.ttlMs)) {
      this.entries.delete(key);this.reserved-=entry.size;await rm(entry.path,{force:true});
    }
  }
  async acquire(key:string,size:number,checksum:string,download:(path:string)=>Promise<void>){
    requireValue(!this.stopped,503,"ASSET_UNAVAILABLE","服务正在关闭，请稍后重试");
    let entry=this.entries.get(key);
    if(entry && (() => { try { return statSync(entry.path).size; } catch { return -1; } })() !== size) {
      requireValue(entry.refs===0,503,"ASSET_UNAVAILABLE","缓存完整性异常，请稍后重试");
      this.entries.delete(key);this.reserved-=entry.size;await rm(entry.path,{force:true});entry=undefined;
    }
    if(!entry) {
      let task=this.pending.get(key);
      if(!task){
        requireValue(this.pending.size < 4,429,"ASSET_BUSY","私有对象读取繁忙，请稍后重试");
        task=(async()=>{
          await this.sweep();
          if(this.reserved+size>this.maxBytes) await this.sweep(true);
          requireValue(this.reserved+size<=this.maxBytes,429,"ASSET_BUSY","私有文件缓存繁忙，请稍后重试");
          this.reserved+=size;
          const path=join(this.root,randomUUID());
          try{
            const disk=await statfs(this.root);requireValue(disk.bavail*disk.bsize>size+256*1024*1024,507,"STORAGE_FULL","临时文件空间不足");
            await download(path);requireValue((await stat(path)).size===size,422,"VALIDATION_FAILED","私有对象字节不完整");
            const hash=createHash("sha256");for await(const chunk of createReadStream(path))hash.update(chunk);
            requireValue(hash.digest("hex")===checksum,422,"VALIDATION_FAILED","私有对象校验失败");
            const value={path,size,refs:0,used:Date.now()};this.entries.set(key,value);return value;
          }catch(error){this.reserved-=size;await rm(path,{force:true});throw error;}
        })();
        this.pending.set(key,task);void task.finally(()=>this.pending.delete(key)).catch(()=>{});
      }
      entry=await task;
    }
    requireValue(!this.stopped,503,"ASSET_UNAVAILABLE","服务正在关闭，请稍后重试");
    entry.refs++;entry.used=Date.now();let released=false;const current=entry;
    return {path:entry.path,size,cleanup:async()=>{if(!released){released=true;current.refs--;current.used=Date.now();if(this.stopped && current.refs===0)await rm(current.path,{force:true});}}};
  }
  async close(){this.stopped=true;clearInterval(this.timer);await Promise.allSettled([...this.pending.values()]);await rm(this.root,{recursive:true,force:true});this.entries.clear();this.reserved=0;cacheRoots.delete(this.root);}
}
