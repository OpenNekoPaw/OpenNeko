/**
 * Export Integration Test
 *
 * Tests the complete export pipeline by exporting test.nkv to a video file.
 *
 * Run with: npx ts-node --esm packages/extension/src/mediaEngine/export/ExportIntegrationTest.ts
 */

import * as path from 'path';
import * as fs from 'fs';
import { JviProjectLoader } from './JviProjectLoader';
import { VideoFrameProvider } from './VideoFrameProvider';
import { createExportService, type ExportConfig, type ExportProgress } from './ExportService';

// Test configuration
const TEST_PROJECT_PATH = path.resolve(__dirname, '../../../../../test/test.nkv');
const OUTPUT_PATH = path.resolve(__dirname, '../../../../../test/output_test.mp4');

/**
 * Progress callback for logging export progress
 */
function onProgress(progress: ExportProgress): void {
  const bar =
    '█'.repeat(Math.floor(progress.percentage / 5)) +
    '░'.repeat(20 - Math.floor(progress.percentage / 5));
  const eta =
    progress.estimatedRemainingMs > 0
      ? `ETA: ${(progress.estimatedRemainingMs / 1000).toFixed(1)}s`
      : '';

  process.stdout.write(
    `\r[${bar}] ${progress.percentage.toFixed(1)}% | Frame ${progress.currentFrame}/${progress.totalFrames} | ${progress.phase} ${eta}    `,
  );
}

/**
 * Main test function
 */
async function runExportTest(): Promise<void> {
  console.log('='.repeat(60));
  console.log('Export Integration Test');
  console.log('='.repeat(60));
  console.log();

  // Check if test project exists
  if (!fs.existsSync(TEST_PROJECT_PATH)) {
    console.error(`❌ Test project not found: ${TEST_PROJECT_PATH}`);
    process.exit(1);
  }

  console.log(`📁 Project: ${TEST_PROJECT_PATH}`);
  console.log(`📤 Output: ${OUTPUT_PATH}`);
  console.log();

  try {
    // Step 1: Load JVI project
    console.log('Step 1: Loading JVI project...');
    const loader = new JviProjectLoader(TEST_PROJECT_PATH);
    const project = await loader.load();

    console.log(`  ✓ Project: ${project.name}`);
    console.log(`  ✓ Resolution: ${project.resolution.width}x${project.resolution.height}`);
    console.log(`  ✓ FPS: ${project.fps}`);
    console.log(`  ✓ Tracks: ${project.tracks.length}`);

    // Get track layers
    const layers = loader.toTrackLayers();
    console.log(`  ✓ Export layers: ${layers.length}`);

    if (layers.length === 0) {
      console.error('❌ No exportable layers found in project');
      process.exit(1);
    }

    // Log layer details
    for (const layer of layers) {
      console.log(
        `    - Layer: ${layer.id} (${layer.type}) ${layer.source ? path.basename(layer.source) : ''}`,
      );
      console.log(`      Time: ${layer.startTime}s - ${layer.startTime + layer.duration}s`);
    }
    console.log();

    // Step 2: Initialize frame provider
    console.log('Step 2: Initializing frame provider...');
    const frameProvider = new VideoFrameProvider();
    await frameProvider.initialize();
    console.log('  ✓ Frame provider ready');
    console.log();

    // Step 3: Initialize export service
    console.log('Step 3: Initializing export service...');
    const exportService = await createExportService();
    console.log('  ✓ Export service ready');
    console.log();

    // Step 4: Configure export
    const duration = loader.getProjectDuration();
    console.log(`Step 4: Configuring export (duration: ${duration.toFixed(2)}s)...`);

    const exportConfig: ExportConfig = {
      outputPath: OUTPUT_PATH,
      width: project.resolution.width,
      height: project.resolution.height,
      fps: project.fps,
      duration: duration,
      videoCodec: 'h264',
      videoBitrate: 15_000_000, // 15 Mbps for better quality (1080P needs higher bitrate)
      preset: 'medium',
      profile: 'high', // Use high profile for better compression efficiency
      container: 'mp4',
      includeAudio: true, // Enable audio export
      audioCodec: 'aac',
      audioBitrate: 192_000, // 192 kbps
      audioSampleRate: 48000,
      audioChannels: 2,
      audioSources: loader.getAudioSources(), // Get audio sources from project
      backgroundColor: [0, 0, 0, 1], // Black background
    };

    console.log(`  ✓ Codec: ${exportConfig.videoCodec}`);
    console.log(`  ✓ Bitrate: ${(exportConfig.videoBitrate! / 1_000_000).toFixed(1)} Mbps`);
    console.log(`  ✓ Preset: ${exportConfig.preset}`);
    console.log();

    // Step 5: Run export
    console.log('Step 5: Running export...');
    console.log();

    const result = await exportService.export(exportConfig, layers, frameProvider, onProgress);
    console.log(); // New line after progress bar

    // Step 6: Report results
    console.log();
    console.log('='.repeat(60));
    console.log('Export Results');
    console.log('='.repeat(60));

    if (result.success) {
      console.log(`✅ Export successful!`);
      console.log(`   Output: ${result.outputPath}`);
      console.log(`   Frames: ${result.framesRendered}`);
      console.log(`   Total time: ${(result.totalTimeMs! / 1000).toFixed(2)}s`);
      console.log(`   Avg frame time: ${result.avgFrameTimeMs?.toFixed(2)}ms`);

      // Verify output file exists
      if (fs.existsSync(OUTPUT_PATH)) {
        const stats = fs.statSync(OUTPUT_PATH);
        console.log(`   File size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
      }
    } else {
      console.log(`❌ Export failed!`);
      console.log(`   Error: ${result.error}`);
      console.log(`   Frames rendered: ${result.framesRendered}`);
    }

    // Cleanup
    frameProvider.dispose();
    exportService.dispose();

    console.log();
    console.log('Test completed.');
  } catch (error) {
    console.error();
    console.error('❌ Test failed with error:');
    console.error(error);
    process.exit(1);
  }
}

// Run the test
runExportTest();
