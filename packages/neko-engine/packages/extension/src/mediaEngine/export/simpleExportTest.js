#!/usr/bin/env node
/**
 * Simple Export Test — NativeEngine API
 *
 * Tests the NativeEngine export pipeline via timelines:export.
 * Run with: node packages/extension/src/mediaEngine/export/simpleExportTest.js
 */

const path = require('path');
const fs = require('fs');

// Paths
const PROJECT_DIR = path.resolve(__dirname, '../../../../../test');
const TEST_VIDEO = path.join(PROJECT_DIR, 'test.mp4');
const OUTPUT_VIDEO = path.join(PROJECT_DIR, 'output_simple_test.mp4');

async function main() {
	console.log('='.repeat(60));
	console.log('Simple Export Test — NativeEngine API');
	console.log('='.repeat(60));
	console.log();

	// Check if test video exists
	if (!fs.existsSync(TEST_VIDEO)) {
		console.error(`❌ Test video not found: ${TEST_VIDEO}`);
		process.exit(1);
	}

	console.log(`📁 Input: ${TEST_VIDEO}`);
	console.log(`📤 Output: ${OUTPUT_VIDEO}`);
	console.log();

	try {
		// Load native module
		console.log('Step 1: Loading native module...');
		const nativeModule = require('@neko-engine/host-napi');
		console.log('  ✓ Module loaded');

		// Create NativeEngine
		console.log('Step 2: Creating NativeEngine...');
		const engine = await nativeModule.NativeEngine.create();
		console.log(`  ✓ NativeEngine created (GPU: ${engine.hasGpu() ? 'enabled' : 'disabled'})`);

		// Probe video
		console.log('Step 3: Probing video...');
		const probeJson = await engine.probeVideo(TEST_VIDEO);
		const probeResult = JSON.parse(probeJson);
		if (probeResult.success && probeResult.data) {
			const info = probeResult.data;
			console.log(`  Duration: ${info.duration}s`);
			console.log(`  Resolution: ${info.width}x${info.height}`);
			console.log(`  FPS: ${info.fps}`);
			console.log(`  Codec: ${info.codec}`);
		}

		// Test parameters
		const width = 1920;
		const height = 1080;
		const fps = 30;
		const duration = 2.0; // Just export 2 seconds for testing
		const totalFrames = Math.ceil(duration * fps);

		console.log();
		console.log(`Export config:`);
		console.log(`  Resolution: ${width}x${height}`);
		console.log(`  FPS: ${fps}`);
		console.log(`  Duration: ${duration}s`);
		console.log(`  Total frames: ${totalFrames}`);
		console.log();

		// Build export job config
		console.log('Step 4: Dispatching timelines:export...');
		const jobId = `test_export_${Date.now()}`;
		const exportConfig = {
			jobId,
			outputPath: OUTPUT_VIDEO,
			settings: {
				width,
				height,
				fps,
				videoCodec: 'h264',
				videoBitrate: 5000000,
				preset: 'fast',
				profile: 'high',
				container: 'mp4',
				includeAudio: false,
				backgroundColor: [0, 0, 0, 1],
			},
			timeline: {
				duration,
				tracks: [
					{
						id: 'track_1',
						type: 'video',
						startTime: 0,
						duration,
						source: TEST_VIDEO,
						zIndex: 0,
						opacity: 1.0,
					},
				],
			},
		};

		const startTime = Date.now();
		const responseJson = await engine.dispatchAction(
			'timelines', 'export', null,
			JSON.stringify(exportConfig)
		);
		const response = JSON.parse(responseJson);
		console.log(`  Response: ${response.status === 'ok' ? '✓ Job started' : '✗ Failed: ' + (response.error?.message ?? response.error)}`);

		if (response.status !== 'ok') {
			console.error('❌ Export dispatch failed');
			process.exit(1);
		}

		const actualJobId = response.data?.jobId || response.data?.job_id || jobId;

		// Poll progress
		console.log();
		console.log('Step 5: Polling progress...');
		let completed = false;
		while (!completed) {
			await new Promise(resolve => setTimeout(resolve, 500));

			const progressJson = await engine.getTaskProgress(actualJobId);
			const progressResult = JSON.parse(progressJson);

			if (!progressResult.success) {
				console.error(`  ✗ Progress query failed: ${progressResult.error}`);
				break;
			}

			const taskData = progressResult.data;
			const status = taskData?.status || taskData?.state;
			const progress = taskData?.progress || 0;

			process.stdout.write(`\r  Progress: ${progress.toFixed(1)}% [${status}]`);

			if (status === 'completed' || status === 'done' || progress >= 100) {
				completed = true;
				console.log();
			} else if (status === 'failed' || status === 'error') {
				console.log();
				console.error(`  ✗ Export failed: ${taskData?.error}`);
				process.exit(1);
			}
		}

		// Report results
		const totalTime = Date.now() - startTime;

		console.log();
		console.log('='.repeat(60));
		console.log('Export Results');
		console.log('='.repeat(60));
		console.log(`✅ Export successful!`);
		console.log(`   Output: ${OUTPUT_VIDEO}`);
		console.log(`   Total time: ${(totalTime / 1000).toFixed(2)}s`);

		// Verify output
		if (fs.existsSync(OUTPUT_VIDEO)) {
			const stats = fs.statSync(OUTPUT_VIDEO);
			console.log(`   File size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
		}

		console.log();
		console.log('Test completed successfully!');

	} catch (error) {
		console.error();
		console.error('❌ Test failed:');
		console.error(error);
		process.exit(1);
	}
}

main();
