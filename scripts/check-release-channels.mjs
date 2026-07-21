#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const releaseChannelsPath = 'quality/release-channels.json';
const packageGroupsPath = 'scripts/package-groups.json';
const knownChannels = new Set(['local', 'canary', 'beta', 'stable', 'disabled']);
const publishableChannels = new Set(['stable']);
const requiredRootFields = ['schemaVersion', 'updatedAt', 'owner', 'channels', 'promotionRules'];

const releaseChannels = readJson(releaseChannelsPath);
const packageGroups = readJson(packageGroupsPath);
const errors = [];
const warnings = [];

validateRoot(releaseChannels);
validateChannels(releaseChannels.channels ?? {});
validatePromotionRules(releaseChannels.promotionRules ?? []);
validatePackageGroupAlignment(releaseChannels, packageGroups);

if (errors.length > 0) {
  console.error('Release channel validation: failed');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  if (warnings.length > 0) {
    console.error('Warnings:');
    for (const warning of warnings) {
      console.error(`- ${warning}`);
    }
  }
  process.exit(1);
}

console.log('Release channel validation: passed');
console.log(`Config: ${releaseChannelsPath}`);
console.log(`Channels checked: ${Object.keys(releaseChannels.channels ?? {}).length}`);
if (warnings.length > 0) {
  console.log('Warnings:');
  for (const warning of warnings) {
    console.log(`- ${warning}`);
  }
}

function readJson(path) {
  const absolutePath = resolve(process.cwd(), path);
  if (!existsSync(absolutePath)) {
    throw new Error(`Missing required file: ${path}`);
  }
  return JSON.parse(readFileSync(absolutePath, 'utf8'));
}

function validateRoot(config) {
  for (const field of requiredRootFields) {
    if (!hasValue(config[field])) {
      errors.push(`Missing required root field: ${field}`);
    }
  }
  if (config.schemaVersion !== 1) {
    errors.push('schemaVersion must be 1.');
  }
  if (!isRecord(config.channels)) {
    errors.push('channels must be an object.');
  }
  if (!Array.isArray(config.promotionRules)) {
    errors.push('promotionRules must be an array.');
  }
}

function validateChannels(channels) {
  for (const channel of knownChannels) {
    if (!isRecord(channels[channel])) {
      errors.push(`Missing required channel: ${channel}`);
    }
  }

  for (const [channelName, channel] of Object.entries(channels)) {
    if (!knownChannels.has(channelName)) {
      errors.push(`Unknown channel: ${channelName}`);
      continue;
    }
    if (typeof channel.description !== 'string' || channel.description.trim() === '') {
      errors.push(`${channelName}: description must be a non-empty string.`);
    }
    if (typeof channel.allowPublish !== 'boolean') {
      errors.push(`${channelName}: allowPublish must be a boolean.`);
    }
    if (channel.allowPublish && !publishableChannels.has(channelName)) {
      errors.push(`${channelName}: only stable may set allowPublish=true.`);
    }
    if (!Array.isArray(channel.requires) || channel.requires.length === 0) {
      errors.push(`${channelName}: requires must be a non-empty array.`);
    }
    validatePackageList(`${channelName}.packages`, channel.packages);
  }
}

function validatePromotionRules(rules) {
  for (const [index, rule] of rules.entries()) {
    const label = `promotionRules[${index}]`;
    if (!knownChannels.has(rule?.from)) {
      errors.push(`${label}: from must be a known channel.`);
    }
    if (!knownChannels.has(rule?.to)) {
      errors.push(`${label}: to must be a known channel.`);
    }
    if (!Array.isArray(rule?.requires) || rule.requires.length === 0) {
      errors.push(`${label}: requires must be a non-empty array.`);
    }
  }
}

function validatePackageGroupAlignment(config, groups) {
  const packages = groups?.packages ?? {};
  const releasePackages = new Set(asArray(packages.buildRelease));
  const devOnlyPackages = new Set(asArray(packages.devOnly));
  const tsPackages = new Set(asArray(packages.tsExtensions));
  const productApplication = groups?.productApplication;
  if (typeof productApplication !== 'string' || productApplication.length === 0) {
    errors.push('package-groups.json must define productApplication.');
  }

  const stablePackages = new Set(asArray(config.channels?.stable?.packages));
  const disabledPackages = new Set(asArray(config.channels?.disabled?.packages));
  const localPackages = new Set(asArray(config.channels?.local?.packages));
  const disabledRationale = config.disabledRationale ?? {};

  for (const pkg of releasePackages) {
    if (!stablePackages.has(pkg)) {
      errors.push(`stable.packages must include buildRelease package: ${pkg}`);
    }
  }

  for (const pkg of stablePackages) {
    if (!releasePackages.has(pkg)) {
      errors.push(`stable.packages contains package outside buildRelease: ${pkg}`);
    }
    if (devOnlyPackages.has(pkg)) {
      errors.push(`stable.packages must not include devOnly package: ${pkg}`);
    }
  }

  for (const pkg of devOnlyPackages) {
    if (!disabledPackages.has(pkg)) {
      errors.push(`disabled.packages must include devOnly package: ${pkg}`);
    }
    if (!localPackages.has(pkg)) {
      errors.push(`local.packages must include devOnly package: ${pkg}`);
    }
    if (typeof disabledRationale[pkg] !== 'string' || disabledRationale[pkg].trim() === '') {
      errors.push(`disabledRationale must explain devOnly package: ${pkg}`);
    }
  }

  for (const pkg of tsPackages) {
    if (disabledPackages.has(pkg)) {
      errors.push(
        `TS extension package must not be disabled without removing it from tsExtensions: ${pkg}`,
      );
    }
  }

  const allKnownPackages = new Set([...releasePackages, ...devOnlyPackages, ...tsPackages]);
  for (const [channelName, channel] of Object.entries(config.channels ?? {})) {
    for (const pkg of asArray(channel.packages)) {
      if (!allKnownPackages.has(pkg)) {
        warnings.push(
          `${channelName}.packages contains package not listed in package-groups.json: ${pkg}`,
        );
      }
    }
  }
}

function validatePackageList(label, packages) {
  if (!Array.isArray(packages)) {
    errors.push(`${label} must be an array.`);
    return;
  }
  const seen = new Set();
  for (const pkg of packages) {
    if (typeof pkg !== 'string' || pkg.trim() === '') {
      errors.push(`${label} contains a non-string or empty package name.`);
      continue;
    }
    if (seen.has(pkg)) {
      errors.push(`${label} contains duplicate package: ${pkg}`);
    }
    seen.add(pkg);
  }
}

function hasValue(value) {
  return value !== undefined && value !== null && value !== '';
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}
