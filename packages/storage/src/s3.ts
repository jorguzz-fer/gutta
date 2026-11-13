import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  contentDisposition,
  type GetUrlOptions,
  type ObjectInfo,
  type ObjectStorage,
  type PutUrlOptions,
} from './types';

export type S3Config = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
};

/** Cloudflare R2 (ou outro serviço compatível com S3), sempre com bucket privado. */
export class S3Storage implements ObjectStorage {
  private client: S3Client;
  private bucket: string;

  constructor(cfg: S3Config) {
    this.bucket = cfg.bucket;
    this.client = new S3Client({
      endpoint: cfg.endpoint,
      region: cfg.region,
      credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
      // R2 e MinIO usam o bucket no caminho, não no subdomínio.
      forcePathStyle: true,
    });
  }

  async putUrl(key: string, opts: PutUrlOptions) {
    const cmd = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: opts.contentType,
      ContentLength: opts.contentLength,
    });
    const url = await getSignedUrl(this.client, cmd, {
      expiresIn: opts.expiresIn,
      // O tipo e o tamanho entram na assinatura: o navegador não troca nenhum dos dois.
      signableHeaders: new Set(['content-type', 'content-length']),
    });
    return { url, headers: { 'content-type': opts.contentType } };
  }

  async getUrl(key: string, opts: GetUrlOptions) {
    const cmd = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ResponseContentDisposition: contentDisposition(opts.disposition ?? 'inline', opts.filename),
      ResponseContentType: opts.contentType,
    });
    return getSignedUrl(this.client, cmd, { expiresIn: opts.expiresIn });
  }

  async head(key: string): Promise<ObjectInfo | null> {
    try {
      const r = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return { size: Number(r.ContentLength ?? 0), contentType: r.ContentType };
    } catch (err) {
      const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
      if (status === 404) return null;
      throw err;
    }
  }

  async get(key: string) {
    const r = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    const bytes = await r.Body!.transformToByteArray();
    return Buffer.from(bytes);
  }

  async put(key: string, body: Buffer, contentType: string) {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }),
    );
  }

  async delete(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async deletePrefix(prefix: string) {
    let total = 0;
    let token: string | undefined;
    do {
      const list = await this.client.send(
        new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix, ContinuationToken: token }),
      );
      const objects = (list.Contents ?? []).map((o) => ({ Key: o.Key! }));
      if (objects.length) {
        await this.client.send(
          new DeleteObjectsCommand({
            Bucket: this.bucket,
            Delete: { Objects: objects, Quiet: true },
          }),
        );
        total += objects.length;
      }
      token = list.IsTruncated ? list.NextContinuationToken : undefined;
    } while (token);
    return total;
  }
}
