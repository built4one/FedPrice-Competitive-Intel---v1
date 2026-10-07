export class BodySizeError extends Error {
  constructor(public readonly sizeBytes: number) {
    super('Document exceeds the automatic retrieval size budget.');
  }
}

// Content-Length can be missing or inaccurate. Bound the decoded stream before
// retaining an attachment, and cancel it immediately when its budget is spent.
export async function readBoundedBody(response: Response, maxBytes: number): Promise<Buffer> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) throw new Error('Invalid response byte budget.');
  const declaredSize = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredSize) && declaredSize > maxBytes) {
    await response.body?.cancel();
    throw new BodySizeError(declaredSize);
  }
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return Buffer.concat(chunks, size);
      size += value.byteLength;
      if (size > maxBytes) throw new BodySizeError(size);
      chunks.push(Buffer.from(value));
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
}
