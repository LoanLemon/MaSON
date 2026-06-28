import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { parseMaSON } from '../'; 

const testsDir = path.resolve(__dirname, '.');

const scenarios = fs.readdirSync(testsDir).filter(file => {
  const fullPath = path.join(testsDir, file);
  return fs.statSync(fullPath).isDirectory();
});

describe('MaSON Conformance Suite', () => {
  for (const scenario of scenarios) {
    const scenarioDir = path.join(testsDir, scenario);
    const subFiles = fs.readdirSync(scenarioDir);

    const msonFile = subFiles.find(f => f.endsWith('.mson'));
    const jsonFile = subFiles.find(f => f.endsWith('.json'));

    if (msonFile && jsonFile) {
      const msonPath = path.join(scenarioDir, msonFile);
      const jsonPath = path.join(scenarioDir, jsonFile);

      it(`should correctly conform to spec for scenario: ${scenario}`, () => {
        const msonInput = fs.readFileSync(msonPath, 'utf-8');
        const expectedJsonInput = fs.readFileSync(jsonPath, 'utf-8');

        // Execute your native playground parsing engine
        const parseResultEnvelope = parseMaSON(msonInput);
        const parsedResult = parseResultEnvelope.data; // Extract the raw data payload
        const expectedResult = JSON.parse(expectedJsonInput);

        // Assert character-for-character structural profile identity
        expect(parsedResult).toEqual(expectedResult);
      });
    }
  }
});