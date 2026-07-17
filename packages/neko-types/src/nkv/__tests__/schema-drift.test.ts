/**
 * NKV Format SDK — Schema Drift Tests
 *
 * Compile-time consistency checks between the JSON Schema (nkv-v2.schema.json)
 * and the TypeScript type definitions. Catches drift where one is updated
 * but the other is forgotten.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { ProjectData } from '../../types/project';
import type { TimelineTrack } from '../../types/timelineTrack';
import type { Transform } from '../../types/transform';

// =============================================================================
// Load schema via fs (avoids resolveJsonModule requirement)
// =============================================================================

const __dirname = dirname(fileURLToPath(import.meta.url));
const schemaPath = resolve(__dirname, '../schema/nkv-v2.schema.json');
const schema = JSON.parse(readFileSync(schemaPath, 'utf-8')) as Record<string, unknown>;

// =============================================================================
// Helpers
// =============================================================================

/**
 * Extract property names from a JSON Schema definition.
 */
function getSchemaPropertyKeys(def: Record<string, unknown>): string[] {
  if (typeof def === 'object' && def !== null && 'properties' in def) {
    return Object.keys(def['properties'] as Record<string, unknown>);
  }
  return [];
}

// =============================================================================
// ProjectData vs Schema root
// =============================================================================

describe('Schema ↔ TypeScript drift detection', () => {
  describe('ProjectData', () => {
    const tsKeys: Array<keyof ProjectData> = [
      'version',
      'name',
      'resolution',
      'fps',
      'tracks',
      'defaults',
    ];

    it('should have matching property names in schema and TS type', () => {
      const schemaKeys = getSchemaPropertyKeys(schema);

      for (const key of tsKeys) {
        expect(
          schemaKeys.includes(key as string),
          `TS key "${String(key)}" missing from JSON Schema root`,
        ).toBe(true);
      }

      for (const key of schemaKeys) {
        expect(
          tsKeys.includes(key as keyof ProjectData),
          `Schema key "${key}" missing from ProjectData TS type`,
        ).toBe(true);
      }
    });
  });

  describe('TimelineTrack', () => {
    const tsKeys: Array<keyof TimelineTrack> = [
      'id',
      'name',
      'type',
      'elements',
      'muted',
      'locked',
      'hidden',
      'isMain',
    ];

    it('should have matching property names in schema $defs/TimelineTrack and TS type', () => {
      const defs = schema['$defs'] as Record<string, Record<string, unknown>> | undefined;
      expect(defs).toBeDefined();
      const trackDef = defs!['TimelineTrack'];
      expect(trackDef).toBeDefined();
      const schemaKeys = getSchemaPropertyKeys(trackDef);

      for (const key of tsKeys) {
        expect(
          schemaKeys.includes(key as string),
          `TS key "${String(key)}" missing from TimelineTrack schema`,
        ).toBe(true);
      }

      for (const key of schemaKeys) {
        expect(
          tsKeys.includes(key as keyof TimelineTrack),
          `Schema key "${key}" missing from TimelineTrack TS type`,
        ).toBe(true);
      }
    });
  });

  describe('Transform', () => {
    const tsKeys: Array<keyof Transform> = [
      'x',
      'y',
      'scaleX',
      'scaleY',
      'rotation',
      'anchorX',
      'anchorY',
    ];

    it('should have matching property names in schema $defs/Transform and TS type', () => {
      const defs = schema['$defs'] as Record<string, Record<string, unknown>> | undefined;
      expect(defs).toBeDefined();
      const transformDef = defs!['Transform'];
      expect(transformDef).toBeDefined();
      const schemaKeys = getSchemaPropertyKeys(transformDef);

      for (const key of tsKeys) {
        expect(
          schemaKeys.includes(key as string),
          `TS key "${String(key)}" missing from Transform schema`,
        ).toBe(true);
      }

      for (const key of schemaKeys) {
        expect(
          tsKeys.includes(key as keyof Transform),
          `Schema key "${key}" missing from Transform TS type`,
        ).toBe(true);
      }
    });
  });

  describe('Element type discriminators', () => {
    it('should have matching element type values between schema and TS union', () => {
      const defs = schema['$defs'] as Record<string, Record<string, unknown>> | undefined;
      expect(defs).toBeDefined();
      const timelineElement = defs!['TimelineElement'] as Record<string, unknown> | undefined;
      expect(timelineElement).toBeDefined();
      const oneOf = timelineElement!['oneOf'] as Array<Record<string, string>> | undefined;
      expect(oneOf).toBeDefined();

      // Extract the $ref names to get element type definitions
      const refNames = oneOf!.map((entry) => {
        const ref = entry['$ref'];
        expect(ref).toBeDefined();
        return ref!.replace('#/$defs/', '');
      });

      // Extract const type values from each element definition
      const schemaTypes: string[] = [];
      for (const refName of refNames) {
        const elementDef = defs![refName] as Record<string, unknown> | undefined;
        expect(elementDef).toBeDefined();
        // Element defs use allOf — second entry has the type-specific properties
        const allOf = elementDef!['allOf'] as Array<Record<string, unknown>> | undefined;
        if (allOf && allOf.length > 1) {
          const specificDef = allOf[1] as Record<string, unknown>;
          const properties = specificDef['properties'] as
            | Record<string, Record<string, unknown>>
            | undefined;
          const typeConst = properties?.['type']?.['const'] as string | undefined;
          if (typeConst) {
            schemaTypes.push(typeConst);
          }
        }
      }

      // TS union discriminator values (from TimelineElement union members)
      const tsTypes = ['media', 'audio', 'text', 'shape', 'subtitle', 'scene3d', 'puppet'];

      expect(schemaTypes.sort()).toEqual(tsTypes.sort());
    });
  });
});
