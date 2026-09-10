const jpeg = require('jpeg-js');
declare var Buffer: any;
import { analyzeSprintKinematics } from './sprintEngine';

function createJpeg(w: number, h: number, paintFn: (buf: Uint8Array, w: number, h: number) => void): string {
  const buf = new Uint8Array(w * h * 4);
  paintFn(buf, w, h);
  return jpeg.encode({ data: buf, width: w, height: h }, 60).data.toString('base64');
}

// Case A: Face Only
function makeFaceFrame(w = 120, h = 160) {
  return createJpeg(w, h, (buf) => {
    const cx = w / 2, cy = h * 0.35, r = w * 0.3;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        const d = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
        if (d < r) {
          buf[idx] = 210; buf[idx + 1] = 160; buf[idx + 2] = 130;
        } else {
          buf[idx] = 45; buf[idx + 1] = 45; buf[idx + 2] = 45;
        }
        buf[idx + 3] = 255;
      }
    }
  });
}

// Case B: Blank Wall
function makeWallFrame(w = 120, h = 160) {
  return createJpeg(w, h, (buf) => {
    for (let i = 0; i < buf.length; i += 4) {
      buf[i] = 128; buf[i + 1] = 128; buf[i + 2] = 128; buf[i + 3] = 255;
    }
  });
}

// Case C & D: Full Body Runner
function makeRunnerFrame(w = 120, h = 160, shiftX = 0) {
  return createJpeg(w, h, (buf) => {
    const cx = w / 2 + shiftX;
    for (let y = 0; y < h; y++) {
      const ny = y / h;
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        let isBody = false;
        if (ny >= 0.10 && ny <= 0.22 && Math.abs(x - cx) < 10) isBody = true;
        else if (ny > 0.22 && ny <= 0.50 && Math.abs(x - cx) < 20) isBody = true;
        else if (ny > 0.50 && ny <= 0.65 && Math.abs(x - cx) < 16) isBody = true;
        else if (ny > 0.65 && ny <= 0.95 && (Math.abs(x - (cx - 8)) < 6 || Math.abs(x - (cx + 8)) < 6)) isBody = true;

        if (isBody) {
          buf[idx] = 200; buf[idx + 1] = 180; buf[idx + 2] = 160;
        } else {
          buf[idx] = 35; buf[idx + 1] = 35; buf[idx + 2] = 35;
        }
        buf[idx + 3] = 255;
      }
    }
  });
}

// Static IMU: 1.0G baseline, no movement
function makeAccelStatic(count = 40) {
  const samples = [];
  const now = Date.now();
  for (let i = 0; i < count; i++) {
    samples.push({ x: 0.02, y: 0.98, z: 0.12, t: now + i * 50 });
  }
  return samples;
}

// Genuine Sprint IMU: 160 SPM running cadence (ready stance -> explosive sprint strides)
function makeAccelSprint(count = 60) {
  const samples = [];
  const now = Date.now();
  // 60 samples * 50ms = 3.0s duration
  for (let i = 0; i < count; i++) {
    let y = 0.98, x = 0.02, z = 0.12;
    if (i >= 15) {
      const isFootstrike = (i - 15) % 7 === 0;
      y = isFootstrike ? 2.15 : 0.70 + Math.sin(i * 0.9) * 0.35;
      x = 0.15 * Math.cos(i * 0.8);
      z = 0.20 + 0.1 * Math.sin(i * 0.5);
    }
    samples.push({ x, y, z, t: now + i * 50 });
  }
  return samples;
}

// Case E IMU: Random phone shaking without sprint
function makeAccelShaking(count = 40) {
  const samples = [];
  const now = Date.now();
  for (let i = 0; i < count; i++) {
    const shake = Math.sin(i * 0.9) * 0.85;
    samples.push({ x: 0.2 + shake, y: 1.0 + shake * 0.7, z: 0.3 + shake * 0.5, t: now + i * 50 });
  }
  return samples;
}

async function runSprintTests() {
  console.log('================================================================');
  console.log('SPORTLENS SPRINT / SPEED ASSESSMENT ACCEPTANCE SUITE');
  console.log('================================================================\n');

  // TEST CASE A: FACE ONLY
  console.log('>>> TEST CASE A: FACE ONLY RECORDING');
  const faceSnaps = [{ base64: makeFaceFrame() }, { base64: makeFaceFrame() }];
  const resA = analyzeSprintKinematics(2.0, 68, makeAccelStatic(), null, faceSnaps);
  console.log('Status: isValid =', resA.isValid, '| Score =', resA.score, '| Cadence =', resA.stepCadenceSpm);
  console.log('Gate 2 (Full-Body Framing):', resA.gates[1].passed ? 'PASS' : 'FAIL', '-', resA.gates[1].telemetry);
  console.log('Gate 10 (Metric Calculated):', resA.gates[9].passed ? 'PASS' : 'FAIL', '-', resA.gates[9].telemetry);

  // TEST CASE B: BLANK WALL
  console.log('\n>>> TEST CASE B: BLANK WALL / EMPTY ROOM');
  const wallSnaps = [{ base64: makeWallFrame() }, { base64: makeWallFrame() }];
  const resB = analyzeSprintKinematics(2.0, 68, makeAccelStatic(), null, wallSnaps);
  console.log('Status: isValid =', resB.isValid, '| Score =', resB.score, '| Cadence =', resB.stepCadenceSpm);
  console.log('Gate 1 (Single Athlete):', resB.gates[0].passed ? 'PASS' : 'FAIL', '-', resB.gates[0].telemetry);
  console.log('Gate 10 (Metric Calculated):', resB.gates[9].passed ? 'PASS' : 'FAIL', '-', resB.gates[9].telemetry);

  // TEST CASE C: FULL-BODY STANDING STILL (0 SPRINT MOVEMENT)
  console.log('\n>>> TEST CASE C: FULL-BODY STANDING STILL (0 MOVEMENT)');
  const stillSnaps = [
    { base64: makeRunnerFrame(120, 160, 0) },
    { base64: makeRunnerFrame(120, 160, 0) },
    { base64: makeRunnerFrame(120, 160, 0) },
  ];
  const resC = analyzeSprintKinematics(2.0, 68, makeAccelStatic(), null, stillSnaps);
  console.log('Status: isValid =', resC.isValid, '| Score =', resC.score, '| Cadence =', resC.stepCadenceSpm);
  console.log('Gate 6 (Movement Detected):', resC.gates[5].passed ? 'PASS' : 'FAIL', '-', resC.gates[5].telemetry);
  console.log('Gate 7 (Sprint Events):', resC.gates[6].passed ? 'PASS' : 'FAIL', '-', resC.gates[6].telemetry);
  console.log('Gate 10 (Metric Calculated):', resC.gates[9].passed ? 'PASS' : 'FAIL', '-', resC.gates[9].telemetry);

  // TEST CASE D: GENUINE SPRINT (WEARABLE PERIODIC FOOTSTRIKES)
  console.log('\n>>> TEST CASE D: GENUINE SPRINT CADENCE (160 SPM)');
  const sprintSnaps = [
    { base64: makeRunnerFrame(120, 160, -15) },
    { base64: makeRunnerFrame(120, 160, -5) },
    { base64: makeRunnerFrame(120, 160, 5) },
    { base64: makeRunnerFrame(120, 160, 15) },
  ];
  const resD = analyzeSprintKinematics(3.0, 68, makeAccelSprint(60), null, sprintSnaps);
  console.log('Status: isValid =', resD.isValid, '| Score =', resD.score);
  console.log('Measured Step Cadence:', resD.stepCadenceSpm, 'SPM');
  console.log('Top Speed (m/s):', resD.topSpeedMps === null ? 'UNAVAILABLE (Requires Calibrated Track)' : resD.topSpeedMps);
  console.log('30m Split (s):', resD.split30mSec === null ? 'UNAVAILABLE (Requires Calibrated Track)' : resD.split30mSec);
  console.log('\nAll 10 Verification Gates for Genuine Sprint:');
  resD.gates.forEach((g) => {
    console.log('  Gate ' + g.gateNumber + ' [' + (g.passed ? 'PASS' : 'FAIL') + '] ' + g.title + ': ' + g.telemetry);
  });

  // TEST CASE E: MOVE PHONE AROUND WITHOUT SPRINTING
  console.log('\n>>> TEST CASE E: MOVE PHONE AROUND WITHOUT SPRINTING (SHAKING)');
  const resE = analyzeSprintKinematics(2.0, 68, makeAccelShaking(), null, stillSnaps);
  console.log('Status: isValid =', resE.isValid, '| Score =', resE.score);
  console.log('Gate 4 (Camera/Wearable Stable):', resE.gates[3].passed ? 'PASS' : 'FAIL', '-', resE.gates[3].telemetry);
  console.log('Gate 8 (IMU Agreement):', resE.gates[7].passed ? 'PASS' : 'FAIL', '-', resE.gates[7].telemetry);
  console.log('Gate 10 (Metric Calculated):', resE.gates[9].passed ? 'PASS' : 'FAIL', '-', resE.gates[9].telemetry);

  const allPassed =
    resA.isValid === false && resA.score === 0 &&
    resB.isValid === false && resB.score === 0 &&
    resC.isValid === false && resC.score === 0 &&
    resD.isValid === true && resD.score > 0 && resD.stepCadenceSpm !== null && resD.stepCadenceSpm >= 120 &&
    resD.topSpeedMps === null && resD.split30mSec === null &&
    resE.isValid === false && resE.score === 0;

  console.log('\n================================================================');
  console.log('SPRINT AUDIT VERIFICATION RESULT:', allPassed ? 'ALL 5 ACCEPTANCE CRITERIA PASSED 100%' : 'FAILURES DETECTED');
  console.log('================================================================');
}

runSprintTests();
