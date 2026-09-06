import { Injectable, signal } from '@angular/core';

/** Shared board zoom level (screen px per local px). CanvasView writes it on
 *  every pan/zoom; FileNode reads it to pick a level-of-detail (title only ->
 *  light preview -> full note), so a big board stays cheap to pan when zoomed
 *  out and only renders full note bodies for cards you've zoomed in on. */
@Injectable({ providedIn: 'root' })
export class CanvasZoom {
  /** Start far so the board defaults to light previews until the first fit. */
  readonly scale = signal(0.2);
}
