/** Public Host API 1.0.0. No dependency on Hiviewer's private UI. */
export type PluginMediaType = "image" | "video";
export interface PluginContribution {
  id: string;
  kind: "image-analysis" | "image-viewer" | "video-viewer" | "exif-provider" | "details-panel";
  title: string;
  command: string;
  /** Only for details-panel; omitted means both images and videos. */
  mediaTypes?: PluginMediaType[];
}
export interface MediaFile { path: string; filename: string; sizeBytes: number; width: number | null; height: number | null }
export interface Report { title: string; text?: string; columns?: string[]; rows?: (string | number | boolean | null)[][] }
export interface MediaResource { resourceId: string; url: string; mime: string; mediaVersion: 1 }
export interface ImagePreview extends MediaResource { width: number; height: number; sourceWidth: number; sourceHeight: number; colorSpace: "srgb"; orientation: 1 }
export interface VideoResource extends MediaResource { timeBase: "seconds" }
export interface HostApi {
  readonly version: 1;
  readonly locale: string;
  readonly configuration: Readonly<Record<string, string | number | boolean>>;
  selection: { get(): Promise<MediaFile[]> };
  metadata: { read(path: string): Promise<Record<string, string>> };
  media: { preview(path: string): Promise<ImagePreview>; video(path: string): Promise<VideoResource>; readBytes(resourceId: string): Promise<ArrayBuffer>; release(resourceId: string): Promise<void> };
  backend: { invoke<T = unknown>(method: string, params?: unknown): Promise<T>; readBinary(channel: string): Promise<ArrayBuffer>; logs(): Promise<string[]> };
  assets: { read(relativePath: string): Promise<ArrayBuffer> };
  exports: { save(filename: string, data: ArrayBuffer): Promise<string | null> };
  viewer: { compare(paths: string[]): Promise<void> };
  storage: { get<T = unknown>(key: string): Promise<T | null>; set(key: string, value: unknown): Promise<void>; remove(key: string): Promise<void> };
  notifications: { show(message: string): Promise<void> };
}
export interface CommandApi extends HostApi { progress(fraction: number, message?: string): void }
export interface ViewApi extends HostApi {
  readonly ready: Promise<void>;
  readonly capabilities: Readonly<Record<string, boolean>>;
  events: { on(name: "environment.changed", callback: (value: { locale: string; theme: Record<string, string>; configuration: HostApi["configuration"] }) => void): () => void };
}
export interface Plugin {
  activate?(api: CommandApi): void | Promise<void>;
  commands: Record<string, (api: CommandApi) => Report | void | Promise<Report | void>>;
  deactivate?(): void | Promise<void>;
}
export function definePlugin(plugin: Plugin): Plugin { return plugin; }
declare global { interface Window { readonly hiviewer: ViewApi } }
