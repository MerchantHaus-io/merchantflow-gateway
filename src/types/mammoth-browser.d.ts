// mammoth ships an untyped, self-contained browser bundle. We only use
// convertToHtml for in-app DOCX preview, so declare just that surface.
declare module "mammoth/mammoth.browser" {
  export interface MammothMessage {
    type: string;
    message: string;
  }
  export interface MammothResult {
    value: string;
    messages: MammothMessage[];
  }
  export function convertToHtml(
    input: { arrayBuffer: ArrayBuffer },
    options?: Record<string, unknown>,
  ): Promise<MammothResult>;
  const _default: { convertToHtml: typeof convertToHtml };
  export default _default;
}
