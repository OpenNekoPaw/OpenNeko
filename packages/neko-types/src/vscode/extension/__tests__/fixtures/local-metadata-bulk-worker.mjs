import { parentPort, workerData } from 'node:worker_threads';

if (!parentPort) throw new Error('Bulk worker fixture requires a parent port');
const startedAt = Date.now();
while (Date.now() - startedAt < 50) {
  Math.sqrt(144);
}
const documentCount = workerData?.payload?.documentCount;
if (typeof documentCount !== 'number') throw new Error('documentCount is required');
parentPort.postMessage({
  kind: 'result',
  result: { operation: workerData.operation, processedCount: documentCount },
});
