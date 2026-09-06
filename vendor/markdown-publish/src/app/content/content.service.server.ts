import { Injectable } from '@angular/core';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ContentService } from './content.service';

/**
 * Server-side ContentService used during prerender and getPrerenderParams.
 * Reads the content bundle directly from the filesystem (src/content).
 */
@Injectable()
export class ServerContentService extends ContentService {
  protected override async read<T>(relative: string): Promise<T> {
    const path = join(process.cwd(), 'src', 'content', relative);
    return JSON.parse(await readFile(path, 'utf-8')) as T;
  }
}
