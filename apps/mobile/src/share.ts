import { onLoad, onShareAppMessage, onShareTimeline } from "@dcloudio/uni-app";
export type ShareCard = { title: string; path: string; imageUrl?: string };
/**
 * 小程序分享入口：同时启用右上角「转发」与「分享到朋友圈」。
 * H5 构建下整段被条件编译移除，不影响网页分享面板。
 */
export function useMiniProgramShare(card: () => ShareCard) {
  // #ifndef H5
  onShareAppMessage(() => {
    const value = card();
    return { title: value.title, path: value.path, imageUrl: value.imageUrl };
  });
  onShareTimeline(() => {
    const value = card();
    const query = value.path.includes("?") ? value.path.slice(value.path.indexOf("?") + 1) : "";
    return { title: value.title, query, imageUrl: value.imageUrl };
  });
  onLoad(() => {
    uni.showShareMenu({ menus: ["shareAppMessage", "shareTimeline"] });
  });
  // #endif
}
