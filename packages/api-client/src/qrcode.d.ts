declare module "qrcode" {
  export function toDataURL(text: string, options: { width: number; margin: number; errorCorrectionLevel: "M"; color: { dark: string; light: string } }): Promise<string>;
}
